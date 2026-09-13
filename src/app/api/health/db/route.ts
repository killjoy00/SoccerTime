import { NextRequest, NextResponse } from "next/server";
import { neonRpc } from "@/lib/neon-server";

export async function GET(request: NextRequest) {
  const oidcToken = request.headers.get("x-vercel-oidc-token");
  if (!oidcToken) return NextResponse.json({ ok: false }, { status: 503 });
  try {
    const result = await neonRpc(oidcToken, "soccertime_state", {});
    if (!result.ok || !result.payload?.ok) return NextResponse.json({ ok: false }, { status: 503 });
    return NextResponse.json({ ok: true, activeGameweek: Number(result.payload.league?.active_gameweek || 0) });
  } catch {
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
