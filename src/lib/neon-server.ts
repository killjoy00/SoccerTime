const API = "https://ep-icy-resonance-aw87iron.apirest.c-12.us-east-1.aws.neon.tech/neondb/rest/v1";

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
