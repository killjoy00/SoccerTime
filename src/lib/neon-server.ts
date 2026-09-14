import { getVercelOidcToken } from "@vercel/oidc";

const API = "https://ep-icy-resonance-aw87iron.apirest.c-12.us-east-1.aws.neon.tech/neondb/rest/v1";
const PROJECT_ID = "prj_kaof4nw5rxqolfH9FQAN7dRDVXoa";
const TEAM_ID = "team_Ayjs9f3ahL8cNptN9huz7G12";

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
