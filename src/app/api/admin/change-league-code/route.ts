import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSoccerTimeOidcToken, neonRpc } from "@/lib/neon-server";

const API = "https://ep-icy-resonance-aw87iron.apirest.c-12.us-east-1.aws.neon.tech/neondb/rest/v1";
const LEAGUE_ID = "a96ae9f9-cd1a-4079-af67-1a8edc3ce331";
const OLD_CODE = "pitch-ember-7421";
const NEW_CODE = "mindell";

function authorized(request: NextRequest) {
  const expected = process.env.SOCCERTIME_MIGRATION_TOKEN || "";
  const presented = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!expected || expected.length !== presented.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(presented));
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const oidcToken = await getSoccerTimeOidcToken();
  if (!oidcToken) {
    return NextResponse.json({ ok: false, error: "Missing workload identity" }, { status: 503 });
  }

  const current = await neonRpc(oidcToken, "league_state_by_id", { p_league_id: LEAGUE_ID });
  const currentCode = String(current.payload?.league?.join_code || "");
  if (!current.ok || !current.payload?.ok) {
    return NextResponse.json({ ok: false, error: current.payload?.error || "League state unavailable" }, { status: 503 });
  }

  if (currentCode === NEW_CODE) {
    return NextResponse.json({ ok: true, changed: false, code: NEW_CODE });
  }
  if (currentCode !== OLD_CODE) {
    return NextResponse.json({ ok: false, error: "Unexpected current league code" }, { status: 409 });
  }

  const conflict = await neonRpc(oidcToken, "league_state", { p_code: NEW_CODE });
  if (conflict.payload?.ok && String(conflict.payload?.league?.id || "") !== LEAGUE_ID) {
    return NextResponse.json({ ok: false, error: "Requested league code is already in use" }, { status: 409 });
  }

  const response = await fetch(`${API}/leagues?id=eq.${LEAGUE_ID}&join_code=eq.${encodeURIComponent(OLD_CODE)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Content-Profile": "api",
      "Accept-Profile": "api",
      "Authorization": `Bearer ${oidcToken}`,
      "Prefer": "return=representation",
    },
    body: JSON.stringify({ join_code: NEW_CODE }),
    cache: "no-store",
  });

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    console.error("League code migration PATCH failed", { status: response.status, payload });
    return NextResponse.json({ ok: false, error: "Database update rejected", status: response.status }, { status: 503 });
  }

  const verify = await neonRpc(oidcToken, "league_state", { p_code: NEW_CODE });
  if (!verify.ok || !verify.payload?.ok || String(verify.payload?.league?.id || "") !== LEAGUE_ID) {
    console.error("League code migration verification failed", { status: verify.status, payload: verify.payload });
    return NextResponse.json({ ok: false, error: "Migration verification failed" }, { status: 503 });
  }

  return NextResponse.json({ ok: true, changed: true, code: NEW_CODE });
}
