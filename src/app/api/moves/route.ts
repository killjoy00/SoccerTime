import { NextRequest, NextResponse } from "next/server";
import { getSoccerTimeOidcToken, neonRpc } from "@/lib/neon-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return NextResponse.json({ error: "Move history is production-only" }, { status: 403 });
  }

  const code = request.nextUrl.searchParams.get("code")?.trim();
  if (!code) return NextResponse.json({ error: "League code required" }, { status: 400 });

  const oidcToken = await getSoccerTimeOidcToken();
  if (!oidcToken) return NextResponse.json({ error: "Missing workload identity" }, { status: 503 });

  try {
    const result = await neonRpc(oidcToken, "roster_moves_state", { p_code: code });
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
