import { getSoccerTimeOidcToken, neonRpc } from "@/lib/neon-server";
import { soccerTimeScore, type FplExplain, type FplScoreStats } from "@/lib/scoring";

const FPL = "https://fantasy.premierleague.com/api";
const LEAGUE_ID = "a96ae9f9-cd1a-4079-af67-1a8edc3ce331";

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
  const oidcToken = await getSoccerTimeOidcToken();
  if (!oidcToken) return { ok: false, finalized: [], error: "Missing workload identity" };

  try {
    const bootstrap = await fplJson("/bootstrap-static/") as {
      events: Array<{ id: number; finished: boolean; data_checked: boolean }>;
    };
    const confirmed = new Set(
      bootstrap.events.filter((event) => event.finished && event.data_checked).map((event) => event.id),
    );
    const finalized: Array<{ gameweek: number; manager1: number; manager2: number }> = [];

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const stateResult = await neonRpc(oidcToken, "league_state_by_id", { p_league_id: LEAGUE_ID });
      if (!stateResult.ok || !stateResult.payload?.ok) {
        console.error("SoccerTime progression state RPC failed", {
          source,
          status: stateResult.status,
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

      const live = await fplJson(`/event/${gameweek}/live/`) as {
        elements: Array<{ id: number; stats?: FplScoreStats; explain?: FplExplain[] }>;
      };
      const scores = Object.fromEntries(
        (live.elements || []).map((element) => [String(element.id), soccerTimeScore(element.stats, element.explain)]),
      );
      const manager1 = scoreBySlot(state, scores, 1);
      const manager2 = scoreBySlot(state, scores, 2);

      const finalize = await neonRpc(oidcToken, "finalize_gameweek_by_id", {
        p_league_id: LEAGUE_ID,
        p_gameweek: gameweek,
        p_manager1_score: manager1,
        p_manager2_score: manager2,
      });
      if (!finalize.ok || !finalize.payload?.ok) {
        console.error("SoccerTime progression finalize RPC failed", {
          source,
          gameweek,
          status: finalize.status,
          error: finalize.payload?.error || "unknown",
        });
        return { ok: false, finalized, activeGameweek: gameweek, error: finalize.payload?.error || "Finalization failed" };
      }

      finalized.push({ gameweek, manager1, manager2 });
      console.info("SoccerTime Gameweek finalized", { source, gameweek, manager1, manager2 });
    }

    const stateResult = await neonRpc(oidcToken, "league_state_by_id", { p_league_id: LEAGUE_ID });
    const activeGameweek = stateResult.ok && stateResult.payload?.ok
      ? Number(stateResult.payload.league?.active_gameweek)
      : undefined;
    return { ok: true, finalized, activeGameweek };
  } catch (error) {
    console.error("SoccerTime progression failed", { source, error });
    return {
      ok: false,
      finalized: [],
      error: error instanceof Error ? error.message : "Gameweek progression failed",
    };
  }
}
