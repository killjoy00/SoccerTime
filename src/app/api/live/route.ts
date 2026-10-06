import { NextRequest, NextResponse } from "next/server";
import { fetchFplJson } from "@/lib/fpl-server";
import { soccerTimeScore, type FplExplain, type FplScoreStats } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const raw = Number(request.nextUrl.searchParams.get("gw"));
  const gw = Number.isInteger(raw) && raw >= 1 && raw <= 38 ? raw : null;
  if (!gw) return NextResponse.json({ error: "Invalid gameweek" }, { status: 400 });

  try {
    const [liveResult, fixturesResult] = await Promise.all([
      fetchFplJson<{
        elements: Array<{ id: number; stats?: FplScoreStats; explain?: FplExplain[] }>;
      }>(`/event/${gw}/live/`, { staleIfError: true }),
      fetchFplJson<Array<any>>(`/fixtures/?event=${gw}`, { staleIfError: true }),
    ]);
    const live = liveResult.data;
    const rawFixtures = fixturesResult.data;

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

    const stale = liveResult.meta.stale || fixturesResult.meta.stale;
    const updatedAt = liveResult.meta.updatedAt;
    const warnings = [liveResult.meta.warning, fixturesResult.meta.warning].filter(Boolean);

    return NextResponse.json({
      gw,
      scores,
      fixtures,
      updatedAt,
      freshness: {
        state: stale ? "stale" : "fresh",
        source: stale ? "last-known-good" : "fpl",
        ageSeconds: liveResult.meta.ageSeconds,
        attempts: Math.max(liveResult.meta.attempts, fixturesResult.meta.attempts),
        warning: warnings[0] || null,
      },
    }, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("SoccerTime live scoring unavailable", { dependency: "fpl", gameweek: gw, error });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "FPL live feed unavailable",
        freshness: { state: "unavailable", source: "none" },
      },
      { status: 502 },
    );
  }
}
