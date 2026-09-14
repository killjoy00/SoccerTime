import { NextRequest, NextResponse } from "next/server";
import { getSoccerTimeOidcToken, neonRpc } from "@/lib/neon-server";

const FPL = "https://fantasy.premierleague.com/api";
const RPC_NAMES: Record<string, string> = {
  league_state: "league_state_workload",
  draft_pick: "draft_pick_workload",
  set_captain: "set_captain_workload",
  pickup_player: "pickup_player_workload",
  save_manager: "save_manager_workload",
};
const GAMEWEEK_LOCKED_ACTIONS = new Set(["set_captain", "pickup_player"]);

async function fplJson(path: string) {
  const response = await fetch(`${FPL}${path}`, {
    headers: { "user-agent": "SoccerTime family fantasy app" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`FPL ${path}: ${response.status}`);
  return response.json();
}

async function hasGameweekStarted(gameweek: unknown) {
  const gw = Number(gameweek);
  if (!Number.isInteger(gw) || gw < 1 || gw > 38) throw new Error("Invalid Gameweek");
  const fixtures = (await fplJson("/fixtures/")) as Array<{
    event: number | null;
    kickoff_time: string | null;
    started: boolean;
  }>;
  const gameweekFixtures = fixtures.filter((fixture) => Number(fixture.event) === gw);
  if (!gameweekFixtures.length) throw new Error("No Gameweek fixtures found");
  return gameweekFixtures.some((fixture) =>
    fixture.started === true ||
    Boolean(fixture.kickoff_time && Date.parse(fixture.kickoff_time) <= Date.now()),
  );
}

async function verifiedPlayerBody(name: string, body: Record<string, unknown>) {
  const idField = name === "pickup_player" ? "p_add_player_id" : "p_player_id";
  const playerId = Number(body[idField]);
  if (!Number.isInteger(playerId) || playerId <= 0) throw new Error("Invalid player");
  const bootstrap = await fplJson("/bootstrap-static/") as {
    elements: Array<{id:number;web_name:string;team:number;element_type:number;status:string}>;
    teams: Array<{id:number;name:string}>;
    element_types: Array<{id:number;singular_name_short:string}>;
  };
  const player = bootstrap.elements.find((item) => item.id === playerId);
  if (!player || player.status === "u") throw new Error("Player is not available");
  const positionRaw = bootstrap.element_types.find((item) => item.id === player.element_type)?.singular_name_short;
  const position = positionRaw === "GKP" ? "GK" : positionRaw;
  const team = bootstrap.teams.find((item) => item.id === player.team)?.name;
  if (!position || !team) throw new Error("Could not verify player metadata");
  return {...body,p_name:player.web_name,p_position:position,p_team_name:team,p_photo:null};
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ name: string }> },
) {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return NextResponse.json({ error: "Database actions are production-only" }, { status: 403 });
  }

  const { name } = await context.params;
  const rpcName = RPC_NAMES[name];
  if (!rpcName) return NextResponse.json({ error: "Unsupported database action" }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  try {
    if (GAMEWEEK_LOCKED_ACTIONS.has(name) && await hasGameweekStarted(body.p_gameweek)) {
      const action = name === "set_captain" ? "Captain" : "Pickups";
      return NextResponse.json({ error: `Gameweek ${body.p_gameweek} has started. ${action} are locked.` }, { status: 409 });
    }
    if (name === "draft_pick" || name === "pickup_player") body = await verifiedPlayerBody(name, body);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not verify request" }, { status: 503 });
  }

  const oidcToken = await getSoccerTimeOidcToken();
  if (!oidcToken) return NextResponse.json({ error: "Missing workload identity" }, { status: 503 });

  try {
    const result = await neonRpc(oidcToken, rpcName, body);
    if (!result.ok) {
      console.error("Neon workload RPC failed", { name, status: result.status, body: result.text.slice(0, 1000) });
    }
    return new Response(result.text, {
      status: result.status,
      headers: { "content-type": result.contentType },
    });
  } catch (error) {
    console.error("Neon workload RPC network failure", name, error);
    return NextResponse.json({ error: "Database connection failed" }, { status: 502 });
  }
}
