import fs from "node:fs/promises";

const BASE = "https://fantasy.premierleague.com/api";
const ALLOW_STALE_ON_FAILURE = process.env.SOCCERTIME_ALLOW_STALE_FPL === "1";
const RETRY_DELAYS_MS = [0, 400, 1200];

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function officialSavePoints(stats = {}, explain = []) {
  if (explain.length) {
    return explain.reduce((total, fixture) => total + (fixture.stats || [])
      .filter((item) => item.identifier === "saves")
      .reduce((sum, item) => sum + number(item.points), 0), 0);
  }
  return Math.floor(number(stats.saves) / 3);
}

function soccerTimeSavePoints(stats = {}, explain = []) {
  if (explain.length) {
    return explain.reduce((total, fixture) => total + (fixture.stats || [])
      .filter((item) => item.identifier === "saves")
      .reduce((sum, item) => sum + Math.floor(number(item.value) / 2), 0), 0);
  }
  return Math.floor(number(stats.saves) / 2);
}

function soccerTimeScore(stats = {}, explain = []) {
  return number(stats.total_points)
    - number(stats.bonus)
    + (soccerTimeSavePoints(stats, explain) - officialSavePoints(stats, explain))
    - (2 * number(stats.own_goals))
    - number(stats.penalties_missed);
}


function retryable(status) {
  return status === 403 || status === 408 || status === 425 || status === 429 || status >= 500;
}

async function wait(ms) {
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(path) {
  let lastError;
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    await wait(RETRY_DELAYS_MS[attempt]);
    try {
      const response = await fetch(`${BASE}${path}`, {
        headers: {
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
          "accept": "application/json,text/plain,*/*",
          "accept-language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        const error = new Error(`${path}: ${response.status}`);
        lastError = error;
        if (attempt + 1 < RETRY_DELAYS_MS.length && retryable(response.status)) {
          console.warn(`FPL retry ${attempt + 1}/${RETRY_DELAYS_MS.length} for ${path} after HTTP ${response.status}`);
          continue;
        }
        throw error;
      }
      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt + 1 < RETRY_DELAYS_MS.length) {
        console.warn(`FPL retry ${attempt + 1}/${RETRY_DELAYS_MS.length} for ${path} after network failure`);
        continue;
      }
    }
  }
  throw lastError || new Error(`${path}: FPL request failed`);
}

async function sync() {
const bootstrap = await api("/bootstrap-static/");
const rawFixtures = await api("/fixtures/");
const teams = new Map(bootstrap.teams.map((team) => [team.id, team]));
const positions = new Map(
  bootstrap.element_types.map((type) => [
    type.id,
    type.singular_name_short === "GKP" ? "GK" : type.singular_name_short,
  ]),
);

const current =
  bootstrap.events.find((event) => event.is_current) ||
  bootstrap.events.find((event) => event.is_next) ||
  bootstrap.events.find((event) => !event.finished) ||
  bootstrap.events.at(-1);
const currentEvent = current?.id || 1;
const events = bootstrap.events.map((event) => ({
  id: event.id,
  name: event.name,
  deadline: event.deadline_time,
  finished: Boolean(event.finished),
  dataChecked: Boolean(event.data_checked),
  isCurrent: Boolean(event.is_current),
  isNext: Boolean(event.is_next),
}));
const finishedEvents = events.filter((event) => event.finished && event.dataChecked).map((event) => event.id);

const playableEvents = bootstrap.events
  .filter((event) => event.finished || event.is_current)
  .map((event) => event.id);
const scores = {};
for (const eventId of playableEvents) {
  const live = await api(`/event/${eventId}/live/`);
  scores[String(eventId)] = Object.fromEntries(
    live.elements.map((element) => [String(element.id), soccerTimeScore(element.stats, element.explain)]),
  );
}

const players = bootstrap.elements.map((player) => {
  const team = teams.get(player.team);
  const recent = playableEvents
    .map((eventId) => scores[String(eventId)]?.[String(player.id)])
    .filter((value) => value !== undefined)
    .slice(-5);
  return {
    id: player.id,
    code: player.code,
    name: player.web_name,
    firstName: player.first_name,
    lastName: player.second_name,
    team: team?.name || "",
    teamId: player.team,
    position: positions.get(player.element_type) || "MID",
    total: Number(player.total_points || 0),
    recent,
    form: Number(player.form || 0),
    pointsPerGame: Number(player.points_per_game || 0),
    minutes: Number(player.minutes || 0),
    starts: Number(player.starts || 0),
    goals: Number(player.goals_scored || 0),
    assists: Number(player.assists || 0),
    cleanSheets: Number(player.clean_sheets || 0),
    saves: Number(player.saves || 0),
    status: player.status,
    news: player.news || "",
    chanceOfPlayingNextRound: player.chance_of_playing_next_round,
    photo: null,
  };
});

const fixtures = rawFixtures.map((fixture) => ({
  id: fixture.id,
  event: fixture.event,
  kickoff: fixture.kickoff_time,
  started: fixture.started,
  finished: Boolean(fixture.finished || fixture.finished_provisional),
  home: {
    id: fixture.team_h,
    name: teams.get(fixture.team_h)?.name || "",
    shortName: teams.get(fixture.team_h)?.short_name || "",
    goals: fixture.team_h_score,
  },
  away: {
    id: fixture.team_a,
    name: teams.get(fixture.team_a)?.name || "",
    shortName: teams.get(fixture.team_a)?.short_name || "",
    goals: fixture.team_a_score,
  },
}));

const output = {
  provider: "official-fpl-public-api",
  updatedAt: new Date().toISOString(),
  currentEvent,
  events,
  finishedEvents,
  players,
  fixtures,
  scores,
};

await fs.mkdir("public/data", { recursive: true });
await fs.writeFile("public/data/epl.json", JSON.stringify(output));
console.log(`Synced ${players.length} players, ${fixtures.length} fixtures, through GW${currentEvent}`);
}

try {
  await sync();
} catch (error) {
  if (!ALLOW_STALE_ON_FAILURE) throw error;

  try {
    const existing = JSON.parse(await fs.readFile("public/data/epl.json", "utf8"));
    if (!Array.isArray(existing?.players) || !existing.players.length || !Array.isArray(existing?.fixtures) || !existing.fixtures.length) {
      throw new Error("Existing SoccerTime feed is not usable");
    }
    console.warn(
      `FPL sync failed; keeping last-known-good public/data/epl.json from ${existing.updatedAt || "unknown time"}. ${error instanceof Error ? error.message : error}`,
    );
  } catch (staleError) {
    console.error("FPL sync failed and no usable last-known-good static feed exists", staleError);
    throw error;
  }
}
