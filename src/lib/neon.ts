const ALLOWED = new Set([
  "league_state",
  "draft_pick",
  "set_captain",
  "pickup_player",
  "save_manager",
  "finalize_gameweek",
]);

export async function rpc(name: string, body: Record<string, unknown>) {
  if (!ALLOWED.has(name)) throw new Error("Unsupported database action");

  const response = await fetch(`/api/db/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

  if (!response.ok) {
    const detail = payload?.message || payload?.error || text || "Database request failed";
    throw new Error(`Database ${response.status}: ${detail}`);
  }

  return payload;
}
