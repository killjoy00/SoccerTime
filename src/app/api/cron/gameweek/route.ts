import { NextRequest, NextResponse } from "next/server";
import { progressSoccerTimeGameweeks } from "@/lib/gameweek-progress";

const EXPECTED_SCHEDULE = "0 1 * * *";

export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "production") {
    return NextResponse.json({ error: "Production only" }, { status: 403 });
  }
  if (request.headers.get("x-vercel-cron-schedule") !== EXPECTED_SCHEDULE) {
    return NextResponse.json({ error: "Cron only" }, { status: 401 });
  }

  console.info("SoccerTime Gameweek cron started", { schedule: EXPECTED_SCHEDULE });
  const result = await progressSoccerTimeGameweeks("cron");
  if (!result.ok) {
    console.error("SoccerTime Gameweek cron failed", { error: result.error });
    return NextResponse.json({ error: result.error || "Gameweek sync failed" }, { status: 500 });
  }

  console.info("SoccerTime Gameweek cron completed", result);
  return NextResponse.json(result);
}
