import { NextRequest, NextResponse } from "next/server";
import { getSoccerTimeOidcToken, neonRpc } from "@/lib/neon-server";

const FPL = "https://fantasy.premierleague.com/api";
const EXPECTED_SCHEDULE = "0 6 * * *";

async function fplJson(path: string) {
  const response = await fetch(`${FPL}${path}`, {
    headers: { "user-agent": "SoccerTime family fantasy app" },
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

export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "production") {
    return NextResponse.json({ error: "Production only" }, { status: 403 });
  }
  if (request.headers.get("x-vercel-cron-schedule") !== EXPECTED_SCHEDULE) {
    return NextResponse.json({ error: "Cron only" }, { status: 401 });
  }

  const oidcToken = await getSoccerTimeOidcToken();
  if (!oidcToken) return NextResponse.json({ error: "Missing workload identity" }, { status: 503 });

  console.info("SoccerTime Gameweek cron started", { schedule: EXPECTED_SCHEDULE });

  try {
    const bootstrap = await fplJson("/bootstrap-static/") as {
      events: Array<{id:number;finished:boolean;data_checked:boolean}>;
    };
    const confirmed = new Set(
      bootstrap.events.filter((event) => event.finished && event.data_checked).map((event) => event.id),
    );
    const finalized: Array<{gameweek:number;manager1:number;manager2:number}> = [];

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const stateResult = await neonRpc(oidcToken, "soccertime_state", {});
      if (!stateResult.ok || !stateResult.payload?.ok) {
        console.error("SoccerTime cron state RPC failed", {
          status: stateResult.status,
          error: stateResult.payload?.error || "unknown",
        });
        throw new Error(stateResult.payload?.error || "League state unavailable");
      }
      const state = stateResult.payload;
      const gameweek = Number(state.league?.active_gameweek);

      if (!confirmed.has(gameweek)) {
        console.info("SoccerTime Gameweek cron no-op", { gameweek, reason: "FPL not data-checked" });
        break;
      }
      if (state.draft?.status !== "complete" || (state.picks || []).length !== 16) {
        console.info("SoccerTime Gameweek cron no-op", { gameweek, reason: "draft incomplete" });
        break;
      }
      if (state.matchup?.status === "final") {
        console.info("SoccerTime Gameweek cron no-op", { gameweek, reason: "already final" });
        break;
      }

      const live = await fplJson(`/event/${gameweek}/live/`) as {
        elements: Array<{id:number;stats?:{total_points?:number}}>;
      };
      const scores = Object.fromEntries(
        (live.elements || []).map((element) => [String(element.id), Number(element.stats?.total_points || 0)]),
      );
      const manager1 = scoreBySlot(state, scores, 1);
      const manager2 = scoreBySlot(state, scores, 2);

      const finalize = await neonRpc(oidcToken, "finalize_soccertime_gameweek", {
        p_gameweek: gameweek,
        p_manager1_score: manager1,
        p_manager2_score: manager2,
      });
      if (!finalize.ok || !finalize.payload?.ok) {
        console.error("SoccerTime cron finalize RPC failed", {
          gameweek,
          status: finalize.status,
          error: finalize.payload?.error || "unknown",
        });
        throw new Error(finalize.payload?.error || "Finalization failed");
      }
      finalized.push({ gameweek, manager1, manager2 });
    }

    console.info("SoccerTime Gameweek cron completed", { finalized });
    return NextResponse.json({ ok: true, finalized });
  } catch (error) {
    console.error("SoccerTime Gameweek cron failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gameweek sync failed" },
      { status: 500 },
    );
  }
}
