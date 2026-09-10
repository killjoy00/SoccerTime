import fs from "node:fs/promises";

const BASE = "https://fantasy.premierleague.com/api";

async function api(path) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { "user-agent": "SoccerTime family fantasy app" },
  });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

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

const playableEvents = bootstrap.events
  .filter((event) => event.finished || event.is_current)
  .map((event) => event.id);
const scores = {};
for (const eventId of playableEvents) {
  const live = await api(`/event/${eventId}/live/`);
  scores[String(eventId)] = Object.fromEntries(
    live.elements.map((element) => [String(element.id), Number(element.stats?.total_points || 0)]),
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
  finished: fixture.finished,
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
  players,
  fixtures,
  scores,
};

await fs.mkdir("public/data", { recursive: true });
await fs.writeFile("public/data/epl.json", JSON.stringify(output));
console.log(`Synced ${players.length} players, ${fixtures.length} fixtures, through GW${currentEvent}`);
