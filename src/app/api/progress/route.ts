import { NextResponse } from "next/server";
import { progressSoccerTimeGameweeks } from "@/lib/gameweek-progress";

export const dynamic = "force-dynamic";

export async function POST() {
  if (process.env.VERCEL_ENV !== "production") {
    return NextResponse.json({ error: "Production only" }, { status: 403 });
  }

  const result = await progressSoccerTimeGameweeks("app");
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
