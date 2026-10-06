import { getVercelOidcToken } from "@vercel/oidc";

const API = "https://ep-icy-resonance-aw87iron.apirest.c-12.us-east-1.aws.neon.tech/neondb/rest/v1";
const PROJECT_ID = "prj_kaof4nw5rxqolfH9FQAN7dRDVXoa";
const TEAM_ID = "team_Ayjs9f3ahL8cNptN9huz7G12";
const AUTH_RETRY_DELAYS_MS = [0, 180, 650];

export async function getSoccerTimeOidcToken() {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") return null;
  try {
    return await getVercelOidcToken({
      project: PROJECT_ID,
      team: TEAM_ID,
      expirationBufferMs: 60_000,
    });
  } catch (error) {
    console.error("Could not acquire SoccerTime workload identity", error);
    return null;
  }
}

export async function neonRpc(oidcToken: string, name: string, body: Record<string, unknown>) {
  const response = await fetch(`${API}/rpc/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Profile": "api",
      "Accept-Profile": "api",
      "Authorization": `Bearer ${oidcToken}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    text,
    payload,
    contentType: response.headers.get("content-type") || "application/json",
  };
}

function authRejected(result: Awaited<ReturnType<typeof neonRpc>>) {
  return result.status === 401 ||
    result.status === 403 ||
    String(result.payload?.error || "").toLowerCase() === "unauthorized";
}

async function sleep(ms: number) {
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function soccerTimeRpc(
  name: string,
  body: Record<string, unknown>,
  options: { attempts?: number; source?: string } = {},
) {
  const attempts = Math.max(1, Math.min(options.attempts ?? AUTH_RETRY_DELAYS_MS.length, AUTH_RETRY_DELAYS_MS.length));
  let lastResult: Awaited<ReturnType<typeof neonRpc>> | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await sleep(AUTH_RETRY_DELAYS_MS[attempt] ?? AUTH_RETRY_DELAYS_MS[AUTH_RETRY_DELAYS_MS.length - 1]);

    const oidcToken = await getSoccerTimeOidcToken();
    if (!oidcToken) {
      console.warn("SoccerTime workload identity retry", {
        dependency: "neon",
        source: options.source || "app",
        rpc: name,
        attempt: attempt + 1,
        reason: "token-unavailable",
      });
      continue;
    }

    try {
      const result = await neonRpc(oidcToken, name, body);
      lastResult = result;

      if (!authRejected(result)) {
        return { ...result, attempts: attempt + 1 };
      }

      console.warn("SoccerTime workload auth retry", {
        dependency: "neon",
        source: options.source || "app",
        rpc: name,
        attempt: attempt + 1,
        status: result.status,
        error: result.payload?.error || "Unauthorized",
      });
    } catch (error) {
      console.warn("SoccerTime workload network retry", {
        dependency: "neon",
        source: options.source || "app",
        rpc: name,
        attempt: attempt + 1,
        error,
      });
    }
  }

  if (lastResult) return { ...lastResult, attempts };
  return {
    ok: false,
    status: 503,
    text: JSON.stringify({ ok: false, error: "Missing workload identity" }),
    payload: { ok: false, error: "Missing workload identity" },
    contentType: "application/json",
    attempts,
  };
}
