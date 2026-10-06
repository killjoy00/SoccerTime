const BASE = "https://fantasy.premierleague.com/api";
const DEFAULT_DELAYS_MS = [0, 250, 900];

function retryable(status) {
  return status === 403 || status === 408 || status === 425 || status === 429 || status >= 500;
}

async function defaultSleep(ms) {
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
}

export function createFplApi({
  fetcher = fetch,
  sleep = defaultSleep,
  delaysMs = DEFAULT_DELAYS_MS,
} = {}) {
  return async function api(path) {
    let lastError = null;
    let lastStatus;

    for (let attempt = 0; attempt < delaysMs.length; attempt += 1) {
      await sleep(delaysMs[attempt] || 0);
      try {
        const response = await fetcher(`${BASE}${path}`, {
          headers: {
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
            "accept": "application/json,text/plain,*/*",
            "accept-language": "en-US,en;q=0.9",
          },
        });

        lastStatus = response.status;
        if (response.ok) return response.json();

        lastError = new Error(`${path}: ${response.status}`);
        if (attempt + 1 < delaysMs.length && retryable(response.status)) {
          console.warn("SoccerTime static FPL sync retry", {
            dependency: "fpl",
            path,
            attempt: attempt + 1,
            status: response.status,
          });
          continue;
        }
        throw lastError;
      } catch (error) {
        lastError = error;
        const status = Number(error?.status || lastStatus || 0) || undefined;
        if (attempt + 1 < delaysMs.length && (status == null || retryable(status))) {
          console.warn("SoccerTime static FPL sync retry", {
            dependency: "fpl",
            path,
            attempt: attempt + 1,
            status: status || "network",
          });
          continue;
        }
        break;
      }
    }

    if (lastError instanceof Error) throw lastError;
    throw new Error(`${path}: FPL request failed`);
  };
}

export const fplApi = createFplApi();
