import { getCache } from "@vercel/functions";

const FPL = "https://fantasy.premierleague.com/api";
const RETRY_DELAYS_MS = [0, 250, 900];
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 2;

type CacheEnvelope<T> = {
  data: T;
  updatedAt: string;
};

type CacheLike = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, options?: Record<string, unknown>): Promise<unknown>;
};

export type FplFetchMeta = {
  source: "network" | "cache";
  updatedAt: string;
  stale: boolean;
  attempts: number;
  ageSeconds: number;
  warning?: string;
};

export type FplFetchResult<T> = {
  data: T;
  meta: FplFetchMeta;
};

export type FplFetcherDependencies = {
  fetcher?: typeof fetch;
  cache?: CacheLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  delaysMs?: number[];
};

export class FplUpstreamError extends Error {
  status?: number;
  path: string;
  attempts: number;

  constructor(message: string, path: string, attempts: number, status?: number) {
    super(message);
    this.name = "FplUpstreamError";
    this.path = path;
    this.attempts = attempts;
    this.status = status;
  }
}

function cacheKey(path: string) {
  return `fpl:${Buffer.from(path).toString("base64url")}`;
}

function isRetryableStatus(status: number) {
  return status === 403 || status === 408 || status === 425 || status === 429 || status >= 500;
}

async function defaultSleep(ms: number) {
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
}

function ageSeconds(updatedAt: string, now: number) {
  const value = Date.parse(updatedAt);
  return Number.isFinite(value) ? Math.max(0, Math.round((now - value) / 1000)) : 0;
}

export function createFplFetcher(dependencies: FplFetcherDependencies = {}) {
  const fetcher = dependencies.fetcher ?? fetch;
  const cache = dependencies.cache ?? getCache({ namespace: "soccertime-fpl" });
  const sleep = dependencies.sleep ?? defaultSleep;
  const now = dependencies.now ?? Date.now;
  const delaysMs = dependencies.delaysMs?.length ? dependencies.delaysMs : RETRY_DELAYS_MS;

  async function readCached<T>(path: string): Promise<CacheEnvelope<T> | undefined> {
    try {
      const value = await cache.get(cacheKey(path));
      if (!value || typeof value !== "object") return undefined;
      const envelope = value as CacheEnvelope<T>;
      if (!envelope.updatedAt || !("data" in envelope)) return undefined;
      return envelope;
    } catch (error) {
      console.warn("SoccerTime runtime-cache read failed", { dependency: "fpl", path, error });
      return undefined;
    }
  }

  async function writeCached<T>(path: string, envelope: CacheEnvelope<T>) {
    try {
      await cache.set(cacheKey(path), envelope, {
        ttl: CACHE_TTL_SECONDS,
        tags: ["soccertime-fpl"],
        name: "SoccerTime FPL last-known-good",
      });
    } catch (error) {
      console.warn("SoccerTime runtime-cache write failed", { dependency: "fpl", path, error });
    }
  }

  return async function fetchFplJson<T>(
    path: string,
    options: {
      staleIfError?: boolean;
      attempts?: number;
      timeoutMs?: number;
    } = {},
  ): Promise<FplFetchResult<T>> {
    const attempts = Math.max(1, Math.min(options.attempts ?? delaysMs.length, delaysMs.length));
    const timeoutMs = options.timeoutMs ?? 8_000;
    let lastError: unknown = null;
    let lastStatus: number | undefined;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await sleep(delaysMs[attempt] ?? delaysMs[delaysMs.length - 1] ?? 0);

      try {
        const response = await fetcher(`${FPL}${path}`, {
          headers: {
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
            "accept": "application/json,text/plain,*/*",
            "accept-language": "en-US,en;q=0.9",
          },
          cache: "no-store",
          signal: AbortSignal.timeout(timeoutMs),
        });

        lastStatus = response.status;
        if (!response.ok) {
          const error = new FplUpstreamError(`FPL ${path}: ${response.status}`, path, attempt + 1, response.status);
          lastError = error;

          if (attempt + 1 < attempts && isRetryableStatus(response.status)) {
            console.warn("SoccerTime FPL retry", {
              dependency: "fpl",
              path,
              attempt: attempt + 1,
              status: response.status,
            });
            continue;
          }
          throw error;
        }

        const data = await response.json() as T;
        const updatedAt = new Date(now()).toISOString();
        await writeCached(path, { data, updatedAt });

        return {
          data,
          meta: {
            source: "network",
            updatedAt,
            stale: false,
            attempts: attempt + 1,
            ageSeconds: 0,
          },
        };
      } catch (error) {
        lastError = error;
        const status = error instanceof FplUpstreamError ? error.status : undefined;
        if (status != null) lastStatus = status;

        const retryable = status == null || isRetryableStatus(status);
        if (attempt + 1 < attempts && retryable) {
          console.warn("SoccerTime FPL retry", {
            dependency: "fpl",
            path,
            attempt: attempt + 1,
            status: status ?? "network",
          });
          continue;
        }
        break;
      }
    }

    if (options.staleIfError) {
      const cached = await readCached<T>(path);
      if (cached) {
        const warning = lastStatus
          ? `FPL returned ${lastStatus}; using last-known-good data`
          : "FPL request failed; using last-known-good data";
        console.warn("SoccerTime FPL stale fallback", {
          dependency: "fpl",
          path,
          ageSeconds: ageSeconds(cached.updatedAt, now()),
          status: lastStatus ?? "network",
        });
        return {
          data: cached.data,
          meta: {
            source: "cache",
            updatedAt: cached.updatedAt,
            stale: true,
            attempts,
            ageSeconds: ageSeconds(cached.updatedAt, now()),
            warning,
          },
        };
      }
    }

    if (lastError instanceof Error) throw lastError;
    throw new FplUpstreamError("FPL request failed", path, attempts, lastStatus);
  };
}

export const fetchFplJson = createFplFetcher();
