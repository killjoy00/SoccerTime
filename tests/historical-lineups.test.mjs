import test from "node:test";
import assert from "node:assert/strict";
import { buildHistoricalLineups } from "../src/lib/historical-lineups.ts";

const managers = [{ id: "one", slot: 1 }, { id: "two", slot: 2 }];
const picks = Array.from({ length: 16 }, (_, index) => ({
  manager_id: index < 8 ? "one" : "two",
  player_id: index + 1,
  player_name: "Player " + (index + 1),
  position: index % 8 === 0 ? "GK" : index % 8 < 3 ? "DEF" : index % 8 < 6 ? "MID" : "FWD",
}));
const scores = Object.fromEntries(picks.map((pick) => [String(pick.player_id), 1]));
scores["8"] = 5;
scores["16"] = 4;
const base = {
  gameweek: 9,
  activeGameweek: 9,
  roundStart: 8,
  managers,
  currentPicks: picks,
  moves: [],
  scores,
  matchup: { status: "final", manager1_score: 17, manager2_score: 22 },
};

test("historical recap reconstructs lineups only when both scores verify", () => {
  // Manager one: 7*1 + 5 = 12, captain five = 5, total 17.
  // Manager two: 7*1 + 4 = 11, captain four = 4, total 15.
  const match = { ...base.matchup, manager2_score: 15 };
  const result = buildHistoricalLineups({ ...base, matchup: match });
  assert.ok(result);
  assert.equal(result[1].score, 17);
  assert.equal(result[2].score, 15);
  assert.equal(result[1].players.find((p) => p.player_id === 8).totalPoints, 10);
  assert.equal(result[2].players.find((p) => p.player_id === 16).totalPoints, 8);
});

test("earlier-round and unverified lineups never appear as facts", () => {
  assert.equal(buildHistoricalLineups({ ...base, gameweek: 7 }), null);
  assert.equal(buildHistoricalLineups({ ...base, moves: null }), null);
  assert.equal(buildHistoricalLineups({ ...base, matchup: { ...base.matchup, manager1_score: 999 } }), null);
  assert.equal(buildHistoricalLineups({ ...base, scores: undefined }), null);
});

test("recap undoes later pickups before calculating historic scores", () => {
  const current = picks.map((pick) => pick.player_id === 7 ? { ...pick, player_id: 20, player_name: "New Player" } : pick);
  const result = buildHistoricalLineups({
    ...base,
    activeGameweek: 10,
    currentPicks: current,
    moves: [{
      manager_id: "one", gameweek: 10,
      added_player_id: 20, dropped_player_id: 7,
      dropped_player_name: "Player 7", moved_at: "2026-10-26T10:00:00Z",
    }],
    matchup: { ...base.matchup, manager2_score: 15 },
  });
  assert.ok(result);
  assert.ok(result[1].players.some((p) => p.player_id === 7));
  assert.ok(!result[1].players.some((p) => p.player_id === 20));
});

test("ambiguous captain is shown as separate bonus without assigning a captain", () => {
  const result = buildHistoricalLineups({
    ...base,
    scores: { ...scores, "7": 5 },
    matchup: { status: "final", manager1_score: 21, manager2_score: 15 },
  });
  assert.ok(result);
  assert.equal(result[1].unattributedCaptainBonus, 5);
  assert.equal(result[1].players.filter((p) => p.captain).length, 0);
});
