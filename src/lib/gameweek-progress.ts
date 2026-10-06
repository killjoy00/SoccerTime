import { soccerTimeRpc } from "@/lib/neon-server";
import { fetchFplJson } from "@/lib/fpl-server";
import { soccerTimeScore, type FplExplain, type FplScoreStats } from "@/lib/scoring";

const LEAGUE_ID = "a96ae9f9-cd1a-4079-af67-1a8edc3ce331";

function scoreBySlot(state: any, scores: Record<string, number>, slot: number) {
  const manager = (state.managers || []).find((item: any) => Number(item.slot) === slot);
  if (!manager) return 0;
  const captainId = (state.captains || []).find((item: any) => item.manager_id === manager.id)?.player_id;
  return (state.picks || [])
    .filter((pick: any) => pick.manager_id === manager.id)
    .reduce((sum: number, pick: any) => {
      const base = Number(scores[String(pick.player_id)] || 0);
      return sum + base * (pick.player_id === captainId ? 2 : 1);
    }, 0);
}

export type ProgressResult = {
  ok: boolean;
  finalized: Array<{ gameweek: number; manager1: number; manager2: number }>;
  activeGameweek?: number;
  waitingFor?: "fpl-final" | "draft" | "already-final";
  error?: string;
};

export async function progressSoccerTimeGameweeks(source: "cron" | "app"): Promise<ProgressResult> {
  try {
    // Finalization deliberately requires fresh FPL data. Last-known-good cache is only
    // for display/health resilience and is never trusted to close a Gameweek.
    const bootstrapResult = await fetchFplJson<{
      events: Array<{ id: number; finished: boolean; data_checked: boolean }>;
    }>("/bootstrap-static/", { staleIfError: false });
    const confirmed = new Set(
      bootstrapResult.data.events.filter((event) => event.finished && event.data_checked).map((event) => event.id),
    );
    const finalized: Array<{ gameweek: number; manager1: number; manager2: number }> = [];

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const stateResult = await soccerTimeRpc(
        "league_state_by_id",
        { p_league_id: LEAGUE_ID },
        { source: `progress:${source}` },
      );
      if (!stateResult.ok || !stateResult.payload?.ok) {
        console.error("SoccerTime progression state RPC failed", {
          dependency: "neon",
          source,
          status: stateResult.status,
          attempts: stateResult.attempts,
          error: stateResult.payload?.error || "unknown",
        });
        return { ok: false, finalized, error: stateResult.payload?.error || "League state unavailable" };
      }

      const state = stateResult.payload;
      const gameweek = Number(state.league?.active_gameweek);
      if (!confirmed.has(gameweek)) {
        console.info("SoccerTime progression waiting", { source, gameweek, reason: "FPL not data-checked" });
        return { ok: true, finalized, activeGameweek: gameweek, waitingFor: "fpl-final" };
      }
      if (state.draft?.status !== "complete" || (state.picks || []).length !== 16) {
        console.info("SoccerTime progression waiting", { source, gameweek, reason: "draft incomplete" });
        return { ok: true, finalized, activeGameweek: gameweek, waitingFor: "draft" };
      }
      if (state.matchup?.status === "final") {
        console.info("SoccerTime progression waiting", { source, gameweek, reason: "already final" });
        return { ok: true, finalized, activeGameweek: gameweek, waitingFor: "already-final" };
      }

      const liveResult = await fetchFplJson<{
        elements: Array<{ id: number; stats?: FplScoreStats; explain?: FplExplain[] }>;
      }>(`/event/${gameweek}/live/`, { staleIfError: false });
      const scores = Object.fromEntries(
        (liveResult.data.elements || []).map((element) => [
          String(element.id),
          soccerTimeScore(element.stats, element.explain),
        ]),
      );
      const manager1 = scoreBySlot(state, scores, 1);
      const manager2 = scoreBySlot(state, scores, 2);

      const finalize = await soccerTimeRpc(
        "finalize_gameweek_by_id",
        {
          p_league_id: LEAGUE_ID,
          p_gameweek: gameweek,
          p_manager1_score: manager1,
          p_manager2_score: manager2,
        },
        { source: `progress:${source}` },
      );
      if (!finalize.ok || !finalize.payload?.ok) {
        console.error("SoccerTime progression finalize RPC failed", {
          dependency: "neon",
          source,
          gameweek,
          status: finalize.status,
          attempts: finalize.attempts,
          error: finalize.payload?.error || "unknown",
        });
        return { ok: false, finalized, activeGameweek: gameweek, error: finalize.payload?.error || "Finalization failed" };
      }

      finalized.push({ gameweek, manager1, manager2 });
      console.info("SoccerTime Gameweek finalized", { source, gameweek, manager1, manager2 });
    }

    const stateResult = await soccerTimeRpc(
      "league_state_by_id",
      { p_league_id: LEAGUE_ID },
      { source: `progress:${source}` },
    );
    const activeGameweek = stateResult.ok && stateResult.payload?.ok
      ? Number(stateResult.payload.league?.active_gameweek)
      : undefined;
    return { ok: true, finalized, activeGameweek };
  } catch (error) {
    console.error("SoccerTime progression failed", { dependency: "fpl", source, error });
    return {
      ok: false,
      finalized: [],
      error: error instanceof Error ? error.message : "Gameweek progression failed",
    };
  }
}
