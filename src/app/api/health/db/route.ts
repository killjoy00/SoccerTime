import { NextResponse } from "next/server";
import { getSoccerTimeOidcToken, neonRpc } from "@/lib/neon-server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return NextResponse.json({ ok: false, stage: "environment" }, { status: 403 });
  }

  const oidcToken = await getSoccerTimeOidcToken();
  if (!oidcToken) return NextResponse.json({ ok: false, stage: "identity" }, { status: 503 });

  try {
    const result = await neonRpc(oidcToken, "soccertime_state", {});
    if (!result.ok || !result.payload?.ok) {
      console.error("SoccerTime DB health RPC failed", {
        status: result.status,
        error: result.payload?.error || "unknown",
      });
      return NextResponse.json({ ok: false, stage: "state", rpcStatus: result.status }, { status: 503 });
    }
    return NextResponse.json({
      ok: true,
      activeGameweek: Number(result.payload.league?.active_gameweek || 0),
      draftStatus: String(result.payload.draft?.status || "unknown"),
      picks: Number((result.payload.picks || []).length),
    });
  } catch (error) {
    console.error("SoccerTime DB health check failed", error);
    return NextResponse.json({ ok: false, stage: "network" }, { status: 502 });
  }
}
