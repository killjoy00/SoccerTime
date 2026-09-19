import { NextRequest, NextResponse } from "next/server";
import { soccerTimeScore, type FplExplain, type FplScoreStats } from "@/lib/scoring";

export const dynamic = "force-dynamic";

const FPL = "https://fantasy.premierleague.com/api";

async function fplJson(path: string) {
  const response = await fetch(`${FPL}${path}`, {
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
      "accept": "application/json,text/plain,*/*",
      "accept-language": "en-US,en;q=0.9",
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`FPL ${path}: ${response.status}`);
  return response.json();
}

export async function GET(request: NextRequest) {
  const raw = Number(request.nextUrl.searchParams.get("gw"));
  const gw = Number.isInteger(raw) && raw >= 1 && raw <= 38 ? raw : null;
  if (!gw) return NextResponse.json({ error: "Invalid gameweek" }, { status: 400 });

  try {
    const [live, rawFixtures] = await Promise.all([
      fplJson(`/event/${gw}/live/`) as Promise<{
        elements: Array<{ id: number; stats?: FplScoreStats; explain?: FplExplain[] }>;
      }>,
      fplJson(`/fixtures/?event=${gw}`) as Promise<Array<any>>,
    ]);

    const scores = Object.fromEntries(
      (live.elements || []).map((element) => [
        String(element.id),
        soccerTimeScore(element.stats, element.explain),
      ]),
    );

    const fixtures = rawFixtures.map((fixture) => ({
      id: Number(fixture.id),
      event: fixture.event == null ? null : Number(fixture.event),
      started: Boolean(fixture.started),
      finished: Boolean(fixture.finished || fixture.finished_provisional),
      homeGoals: fixture.team_h_score == null ? null : Number(fixture.team_h_score),
      awayGoals: fixture.team_a_score == null ? null : Number(fixture.team_a_score),
    }));

    return NextResponse.json({ gw, scores, fixtures, updatedAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "FPL live feed unavailable" },
      { status: 502 },
    );
  }
}
