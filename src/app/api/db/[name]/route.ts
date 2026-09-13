import { NextRequest, NextResponse } from "next/server";

const API = "https://ep-icy-resonance-aw87iron.apirest.c-12.us-east-1.aws.neon.tech/neondb/rest/v1";
const ALLOWED = new Set([
  "league_state",
  "draft_pick",
  "set_captain",
  "pickup_player",
  "save_manager",
  "finalize_gameweek",
]);
const GAMEWEEK_LOCKED_ACTIONS = new Set(["set_captain", "pickup_player"]);

async function hasGameweekStarted(gameweek: unknown) {
  const gw = Number(gameweek);
  if (!Number.isInteger(gw) || gw < 1 || gw > 38) {
    throw new Error("Invalid Gameweek");
  }

  const response = await fetch("https://fantasy.premierleague.com/api/fixtures/", {
    headers: { "user-agent": "SoccerTime family fantasy app" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`FPL fixtures ${response.status}`);

  const fixtures = (await response.json()) as Array<{
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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ name: string }> },
) {
  const { name } = await context.params;

  if (!ALLOWED.has(name)) {
    return NextResponse.json({ error: "Unsupported database action" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (GAMEWEEK_LOCKED_ACTIONS.has(name)) {
    try {
      if (await hasGameweekStarted(body.p_gameweek)) {
        const action = name === "set_captain" ? "Captain" : "Pickups";
        return NextResponse.json(
          { error: `Gameweek ${body.p_gameweek} has started. ${action} are locked.` },
          { status: 409 },
        );
      }
    } catch (error) {
      console.error("Could not verify Gameweek lock", error);
      return NextResponse.json(
        { error: "Could not verify the Gameweek lock. Try again shortly." },
        { status: 503 },
      );
    }
  }

  const oidcToken = request.headers.get("x-vercel-oidc-token");
  if (!oidcToken) {
    return NextResponse.json({ error: "Missing Vercel workload identity" }, { status: 503 });
  }

  try {
    const response = await fetch(`${API}/rpc/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Profile": "api",
        "Accept-Profile": "api",
        "Authorization": `Bearer ${oidcToken}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await response.text();
    const contentType = response.headers.get("content-type") || "application/json";

    if (!response.ok) {
      console.error("Neon RPC failed", {
        name,
        status: response.status,
        body: text.slice(0, 1000),
      });
    }

    return new Response(text, {
      status: response.status,
      headers: { "content-type": contentType },
    });
  } catch (error) {
    console.error("Neon RPC network failure", name, error);
    return NextResponse.json({ error: "Database connection failed" }, { status: 502 });
  }
}
