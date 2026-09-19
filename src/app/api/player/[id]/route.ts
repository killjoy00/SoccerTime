import { NextRequest, NextResponse } from "next/server";
import { soccerTimeScore } from "@/lib/scoring";

export const revalidate = 300;

const FPL = "https://fantasy.premierleague.com/api";

async function fplJson(path: string) {
  const response = await fetch(`${FPL}${path}`, {
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
      "accept": "application/json,text/plain,*/*",
      "accept-language": "en-US,en;q=0.9",
    },
    next: { revalidate: 300 },
  });
  if (!response.ok) throw new Error(`FPL ${path}: ${response.status}`);
  return response.json();
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const playerId = Number(id);
  if (!Number.isInteger(playerId) || playerId <= 0) {
    return NextResponse.json({ error: "Invalid player" }, { status: 400 });
  }

  try {
    const [bootstrap, summary] = await Promise.all([
      fplJson("/bootstrap-static/"),
      fplJson(`/element-summary/${playerId}/`),
    ]);
    const player = bootstrap.elements.find((item: any) => Number(item.id) === playerId);
    if (!player) return NextResponse.json({ error: "Player not found" }, { status: 404 });

    const teams = new Map<number, any>(bootstrap.teams.map((team: any) => [Number(team.id), team]));
    const position = new Map<number, string>(
      bootstrap.element_types.map((type: any) => [
        Number(type.id),
        type.singular_name_short === "GKP" ? "GK" : type.singular_name_short,
      ]),
    );

    const byRound = new Map<number, any>();
    for (const match of summary.history || []) {
      const round = Number(match.round);
      const existing = byRound.get(round) || {
        round,
        points: 0,
        officialPoints: 0,
        minutes: 0,
        goals: 0,
        assists: 0,
        cleanSheets: 0,
        saves: 0,
        bonusRemoved: 0,
        ownGoals: 0,
        penaltiesMissed: 0,
        opponents: [] as string[],
      };
      existing.points += soccerTimeScore(match);
      existing.officialPoints += Number(match.total_points || 0);
      existing.minutes += Number(match.minutes || 0);
      existing.goals += Number(match.goals_scored || 0);
      existing.assists += Number(match.assists || 0);
      existing.cleanSheets += Number(match.clean_sheets || 0);
      existing.saves += Number(match.saves || 0);
      existing.bonusRemoved += Number(match.bonus || 0);
      existing.ownGoals += Number(match.own_goals || 0);
      existing.penaltiesMissed += Number(match.penalties_missed || 0);
      const opponent = teams.get(Number(match.opponent_team))?.short_name;
      if (opponent) existing.opponents.push(`${opponent} ${match.was_home ? "H" : "A"}`);
      byRound.set(round, existing);
    }

    const history = [...byRound.values()].sort((a, b) => b.round - a.round);
    const soccerTimeTotal = history.reduce((sum, gameweek) => sum + Number(gameweek.points || 0), 0);

    return NextResponse.json({
      id: player.id,
      code: player.code,
      name: player.web_name,
      firstName: player.first_name,
      lastName: player.second_name,
      team: teams.get(Number(player.team))?.name || "",
      position: position.get(Number(player.element_type)) || "MID",
      photo: `/api/player-photo/${player.code}`,
      season: {
        fplPoints: Number(player.total_points || 0),
        soccerTimePoints: soccerTimeTotal,
        minutes: Number(player.minutes || 0),
        starts: Number(player.starts || 0),
        goals: Number(player.goals_scored || 0),
        assists: Number(player.assists || 0),
        cleanSheets: Number(player.clean_sheets || 0),
        saves: Number(player.saves || 0),
        penaltiesSaved: Number(player.penalties_saved || 0),
        penaltiesMissed: Number(player.penalties_missed || 0),
        ownGoals: Number(player.own_goals || 0),
        yellowCards: Number(player.yellow_cards || 0),
        redCards: Number(player.red_cards || 0),
        form: Number(player.form || 0),
        pointsPerGame: Number(player.points_per_game || 0),
      },
      history,
      news: player.news || "",
      status: player.status,
      chanceOfPlayingNextRound: player.chance_of_playing_next_round,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Player details unavailable" },
      { status: 502 },
    );
  }
}
