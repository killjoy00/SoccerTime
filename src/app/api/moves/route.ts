import { NextRequest, NextResponse } from "next/server";
import { soccerTimeRpc } from "@/lib/neon-server";
import { normalizeLeagueCode } from "@/lib/league-code";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return NextResponse.json({ error: "Move history is production-only" }, { status: 403 });
  }

  const rawCode = request.nextUrl.searchParams.get("code")?.trim();
  if (!rawCode) return NextResponse.json({ error: "League code required" }, { status: 400 });
  const code = normalizeLeagueCode(rawCode);

  try {
    const result = await soccerTimeRpc("roster_moves_state", { p_code: code }, { source: "api:moves" });
    if (!result.ok) {
      console.error("Roster move history RPC failed", { status: result.status, error: result.payload?.error });
      return NextResponse.json({ error: result.payload?.error || "Move history unavailable" }, { status: result.status });
    }
    return NextResponse.json(result.payload);
  } catch (error) {
    console.error("Roster move history failed", error);
    return NextResponse.json({ error: "Move history unavailable" }, { status: 502 });
  }
}
