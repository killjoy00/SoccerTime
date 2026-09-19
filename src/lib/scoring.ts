export type FplScoreStats = {
  total_points?: number;
  saves?: number;
  bonus?: number;
  own_goals?: number;
  penalties_missed?: number;
};

export type FplExplain = {
  fixture?: number;
  stats?: Array<{
    identifier?: string;
    points?: number;
    value?: number;
  }>;
};

function number(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function officialSavePoints(stats: FplScoreStats, explain?: FplExplain[]) {
  if (explain?.length) {
    return explain.reduce((total, fixture) => total + (fixture.stats || [])
      .filter((item) => item.identifier === "saves")
      .reduce((sum, item) => sum + number(item.points), 0), 0);
  }
  return Math.floor(number(stats.saves) / 3);
}

function soccerTimeSavePoints(stats: FplScoreStats, explain?: FplExplain[]) {
  if (explain?.length) {
    return explain.reduce((total, fixture) => total + (fixture.stats || [])
      .filter((item) => item.identifier === "saves")
      .reduce((sum, item) => sum + Math.floor(number(item.value) / 2), 0), 0);
  }
  return Math.floor(number(stats.saves) / 2);
}

/**
 * SoccerTime keeps the standard FPL event score as its baseline, then applies
 * the house scoring changes in one place so live scoring and finalization agree:
 * - no FPL bonus/BPS points
 * - +1 point for every 2 goalkeeper saves instead of every 3
 * - own goals are -4 instead of -2
 * - penalty misses are -3 instead of -2
 */
export function soccerTimeScore(stats: FplScoreStats = {}, explain?: FplExplain[]) {
  const official = number(stats.total_points);
  const bonus = number(stats.bonus);
  const savesAdjustment = soccerTimeSavePoints(stats, explain) - officialSavePoints(stats, explain);
  const ownGoalAdjustment = -2 * number(stats.own_goals);
  const penaltyMissAdjustment = -1 * number(stats.penalties_missed);
  return official - bonus + savesAdjustment + ownGoalAdjustment + penaltyMissAdjustment;
}
