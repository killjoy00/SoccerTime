/**
 * Reconstruct a finished Gameweek only when the current round's ownership and
 * the recorded matchup score can verify the result. Older rounds have no
 * queryable archived lineup in league_state, so never fabricate player rows.
 */
export type ArchivedPick = {
  manager_id: string;
  player_id: number;
  player_name: string;
  position: string;
  team_name?: string;
};

export type ArchivedMove = {
  manager_id: string;
  gameweek: number;
  added_player_id: number;
  dropped_player_id: number;
  dropped_player_name?: string;
  moved_at?: string;
};

export type RecapPlayer = ArchivedPick & {
  points: number;
  totalPoints: number;
  captain: boolean;
};

export type RecapSide = {
  players: RecapPlayer[];
  captainBonus: number;
  unattributedCaptainBonus: number;
  score: number;
};

export type HistoricalLineups = Record<1 | 2, RecapSide>;

const POSITION_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

export function buildHistoricalLineups(args: {
  gameweek: number;
  activeGameweek: number;
  roundStart: number;
  matchup: { status: string; manager1_score: number | string; manager2_score: number | string };
  managers: Array<{ id: string; slot: number }>;
  currentPicks: ArchivedPick[];
  moves: ArchivedMove[] | null;
  scores: Record<string, number> | undefined;
  playerCatalog?: Array<{ id: number; name: string; team?: string; position?: string }>;
}): HistoricalLineups | null {
  const { gameweek, activeGameweek, roundStart, matchup, managers, currentPicks, moves, scores } = args;
  if (matchup.status !== "final" || !Number.isInteger(gameweek) ||
      gameweek < roundStart || gameweek > activeGameweek || !moves || !scores) return null;

  const byId = new Map((args.playerCatalog || []).map((player) => [Number(player.id), player]));
  const picks = currentPicks.map((pick) => ({ ...pick, player_id: Number(pick.player_id) }));

  // A move recorded for GW N is part of that week's starting roster.
  // Undo only later-GW moves, latest first, to restore GW N's lineup.
  const laterMoves = moves
    .filter((move) => Number(move.gameweek) > gameweek && Number(move.gameweek) <= activeGameweek)
    .sort((a, b) => Date.parse(b.moved_at || "") - Date.parse(a.moved_at || ""));

  for (const move of laterMoves) {
    const index = picks.findIndex((pick) =>
      pick.manager_id === move.manager_id &&
      Number(pick.player_id) === Number(move.added_player_id));
    if (index < 0) return null;
    const dropped = byId.get(Number(move.dropped_player_id));
    picks[index] = {
      ...picks[index],
      player_id: Number(move.dropped_player_id),
      player_name: move.dropped_player_name || dropped?.name || "Player",
      team_name: dropped?.team || "",
      position: dropped?.position || picks[index].position,
    };
  }

  if (managers.length !== 2 || picks.length !== 16 ||
      new Set(picks.map((pick) => pick.player_id)).size !== 16) return null;

  const output = {} as HistoricalLineups;
  for (const slot of [1, 2] as const) {
    const manager = managers.find((item) => Number(item.slot) === slot);
    const expected = Number(slot === 1 ? matchup.manager1_score : matchup.manager2_score);
    if (!manager || !Number.isFinite(expected)) return null;

    const roster = picks.filter((pick) => pick.manager_id === manager.id);
    if (roster.length !== 8) return null;
    const players: RecapPlayer[] = [];
    for (const pick of roster) {
      const key = String(pick.player_id);
      if (!Object.prototype.hasOwnProperty.call(scores, key)) return null;
      const points = Number(scores[key]);
      if (!Number.isFinite(points)) return null;
      players.push({ ...pick, points, totalPoints: points, captain: false });
    }

    const baseScore = players.reduce((sum, player) => sum + player.points, 0);
    const captainBonus = expected - baseScore;
    const possibleCaptains = players.filter((player) => player.points === captainBonus);
    if (possibleCaptains.length === 0) return null;
    if (possibleCaptains.length === 1) {
      possibleCaptains[0].captain = true;
      possibleCaptains[0].totalPoints += captainBonus;
    }

    players.sort((a, b) =>
      (POSITION_ORDER[a.position] ?? 5) - (POSITION_ORDER[b.position] ?? 5) ||
      b.totalPoints - a.totalPoints);
    output[slot] = {
      players,
      captainBonus,
      unattributedCaptainBonus: possibleCaptains.length === 1 ? 0 : captainBonus,
      score: expected,
    };
  }
  return output;
}
