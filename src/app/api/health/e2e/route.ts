import { NextResponse } from "next/server";
import { soccerTimeRpc } from "@/lib/neon-server";
import { fetchFplJson } from "@/lib/fpl-server";
import { soccerTimeScore, type FplExplain, type FplScoreStats } from "@/lib/scoring";

export const dynamic = "force-dynamic";

const LEAGUE_ID = "a96ae9f9-cd1a-4079-af67-1a8edc3ce331";
const QUOTAS: Record<string, number> = { GK: 1, DEF: 2, MID: 3, FWD: 2 };

function rosterIsValid(picks: any[]) {
  if (picks.length !== 8) return false;
  const counts = picks.reduce<Record<string, number>>((acc, pick) => {
    const position = String(pick.position || "");
    acc[position] = (acc[position] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(QUOTAS).every(([position, expected]) => counts[position] === expected);
}

function scoreForManager(state: any, scores: Record<string, number>, managerId: string) {
  const captainId = (state.captains || []).find((captain: any) => captain.manager_id === managerId)?.player_id;
  return (state.picks || [])
    .filter((pick: any) => pick.manager_id === managerId)
    .reduce((sum: number, pick: any) => {
      const base = Number(scores[String(pick.player_id)] || 0);
      return sum + base * (pick.player_id === captainId ? 2 : 1);
    }, 0);
}

export async function GET() {
  if (process.env.VERCEL_ENV !== "production") {
    return NextResponse.json({ ok: false, stage: "environment" }, { status: 403 });
  }

  try {
    const stateResult = await soccerTimeRpc(
      "league_state_by_id",
      { p_league_id: LEAGUE_ID },
      { source: "health:e2e" },
    );
    if (!stateResult.ok || !stateResult.payload?.ok) {
      return NextResponse.json({
        ok: false,
        stage: "state",
        rpcStatus: stateResult.status,
        rpcAttempts: stateResult.attempts,
      }, { status: 503 });
    }

    const state = stateResult.payload;
    const managers = state.managers || [];
    const picks = state.picks || [];
    const gameweek = Number(state.league?.active_gameweek || 0);
    const draftedIds = picks.map((pick: any) => Number(pick.player_id));
    const exclusiveOwnership = new Set(draftedIds).size === draftedIds.length;
    const rosterShape = managers.length === 2 && managers.every((manager: any) =>
      rosterIsValid(picks.filter((pick: any) => pick.manager_id === manager.id)),
    );
    const captainsOnRoster = (state.captains || []).every((captain: any) =>
      picks.some((pick: any) => pick.manager_id === captain.manager_id && pick.player_id === captain.player_id),
    );

    const [bootstrapResult, fixturesResult, liveResult] = await Promise.all([
      fetchFplJson<{ events: Array<{ id: number; finished: boolean; data_checked: boolean }> }>(
        "/bootstrap-static/",
        { staleIfError: true },
      ),
      fetchFplJson<Array<{ event: number | null; started: boolean; kickoff_time: string | null }>>(
        "/fixtures/",
        { staleIfError: true },
      ),
      fetchFplJson<{ elements: Array<{ id: number; stats?: FplScoreStats; explain?: FplExplain[] }> }>(
        `/event/${gameweek}/live/`,
        { staleIfError: true },
      ),
    ]);

    const bootstrap = bootstrapResult.data;
    const fixtures = fixturesResult.data;
    const live = liveResult.data;
    const gwFixtures = fixtures.filter((fixture) => Number(fixture.event) === gameweek);
    const gameweekStarted = gwFixtures.some((fixture) => fixture.started || Boolean(
      fixture.kickoff_time && Date.parse(fixture.kickoff_time) <= Date.now(),
    ));
    const captainCountOk = !gameweekStarted || (state.captains || []).length === managers.length;
    const eventExists = bootstrap.events.some((event) => event.id === gameweek);
    const liveScores = Object.fromEntries(
      (live.elements || []).map((element) => [String(element.id), soccerTimeScore(element.stats, element.explain)]),
    );
    const scoresFinite = managers.every((manager: any) => Number.isFinite(scoreForManager(state, liveScores, manager.id)));

    const movesResult = await soccerTimeRpc(
      "roster_moves_state",
      { p_code: String(state.league?.join_code || "") },
      { source: "health:e2e" },
    );
    const movesReadable = movesResult.ok && Boolean(movesResult.payload?.ok);

    const checks = {
      database: true,
      draftComplete: state.draft?.status === "complete" && picks.length === 16,
      exclusiveOwnership,
      rosterShape,
      captainsOnRoster,
      captainCountOk,
      fplEvent: eventExists,
      fixtures: gwFixtures.length > 0,
      liveScoring: !gameweekStarted || ((live.elements || []).length > 0 && scoresFinite),
      moveHistory: movesReadable,
    };
    const criticalChecks = { ...checks, captainCountOk: true };
    const ok = Object.values(criticalChecks).every(Boolean);

    const fplFallbacks = [
      ["bootstrap", bootstrapResult.meta],
      ["fixtures", fixturesResult.meta],
      ["live", liveResult.meta],
    ].filter(([, meta]) => (meta as typeof bootstrapResult.meta).stale);
    const warnings: string[] = [];
    if (!captainCountOk) warnings.push(`${managers.length - (state.captains || []).length} manager(s) have no Gameweek ${gameweek} captain`);
    for (const [name, metaRaw] of fplFallbacks) {
      const meta = metaRaw as typeof bootstrapResult.meta;
      warnings.push(`FPL ${name} feed is using last-known-good data from ${meta.updatedAt}`);
    }

    return NextResponse.json({
      ok,
      activeGameweek: gameweek,
      checks,
      gameweekStarted,
      managerCount: managers.length,
      pickCount: picks.length,
      transactionCount: movesReadable ? Number((movesResult.payload.moves || []).length) : null,
      dependencies: {
        neon: { attempts: Math.max(stateResult.attempts, movesResult.attempts) },
        fpl: {
          fresh: fplFallbacks.length === 0,
          bootstrap: bootstrapResult.meta,
          fixtures: fixturesResult.meta,
          live: liveResult.meta,
        },
      },
      warnings,
    }, { status: ok ? 200 : 503 });
  } catch (error) {
    console.error("SoccerTime end-to-end health check failed", { stage: "external-feed", error });
    return NextResponse.json({ ok: false, stage: "external-feed" }, { status: 502 });
  }
}
