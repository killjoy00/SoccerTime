"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import BottomNav from "../BottomNav";
import PlayerFace from "../PlayerFace";
import { rpc } from "@/lib/neon";

type Manager = {
  id: string;
  slot: number;
  name: string;
  club_name: string;
  wins: number;
  draws: number;
  losses: number;
  fantasy_points: number | string;
  table_points: number | string;
};

type Matchup = {
  gameweek: number;
  status: string;
  manager1_score: number | string;
  manager2_score: number | string;
  winner_slot: number | null;
};

type RoundResult = {
  round_no: number;
  winner_slot: number | null;
  manager1_wins: number;
  manager2_wins: number;
  manager1_points: number | string;
  manager2_points: number | string;
};

type LeagueState = {
  ok: boolean;
  error?: string;
  league?: { active_gameweek?: number };
  draft?: { round_no?: number; start_gameweek?: number; end_gameweek?: number; status?: string };
  managers?: Manager[];
  matchups?: Matchup[];
  round_results?: RoundResult[];
};

type TeamGame = {
  slot: 1 | 2;
  gameweek: number;
  score: number;
};

type StaticPlayer = {
  id: number;
  code?: number;
  name: string;
  team: string;
  position: string;
};

type StaticData = {
  players?: StaticPlayer[];
  scores?: Record<string, Record<string, number>>;
};

type Streak = {
  kind: "W" | "D" | "L" | "—";
  count: number;
};

function number(value: number | string | null | undefined) {
  return Number(value || 0);
}

function club(manager: Manager | undefined, fallback: string) {
  return manager?.club_name || fallback;
}

function resultForSlot(game: Matchup, slot: 1 | 2): "W" | "D" | "L" {
  const mine = number(slot === 1 ? game.manager1_score : game.manager2_score);
  const theirs = number(slot === 1 ? game.manager2_score : game.manager1_score);
  return mine === theirs ? "D" : mine > theirs ? "W" : "L";
}

function currentStreak(games: Matchup[], slot: 1 | 2): Streak {
  if (!games.length) return { kind: "—", count: 0 };
  const sorted = [...games].sort((a, b) => Number(b.gameweek) - Number(a.gameweek));
  const kind = resultForSlot(sorted[0], slot);
  let count = 0;
  for (const game of sorted) {
    if (resultForSlot(game, slot) !== kind) break;
    count += 1;
  }
  return { kind, count };
}

function longestWinStreak(games: Matchup[], slot: 1 | 2) {
  let longest = 0;
  let current = 0;
  for (const game of [...games].sort((a, b) => Number(a.gameweek) - Number(b.gameweek))) {
    if (resultForSlot(game, slot) === "W") {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

function streakLabel(streak: Streak) {
  if (!streak.count || streak.kind === "—") return "No streak yet";
  const word = streak.kind === "W" ? "win" : streak.kind === "L" ? "loss" : "draw";
  return streak.count + " " + word + (streak.count === 1 ? "" : "s") + " straight";
}

function winnerForGame(game: Matchup, manager1?: Manager, manager2?: Manager) {
  const score1 = number(game.manager1_score);
  const score2 = number(game.manager2_score);
  if (score1 === score2) return "Draw";
  return score1 > score2 ? club(manager1, "Manager 1") : club(manager2, "Manager 2");
}

export default function HistoryClient() {
  const [state, setState] = useState<LeagueState | null>(null);
  const [staticData, setStaticData] = useState<StaticData>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const code = localStorage.getItem("soccertime-code")?.trim();
      if (!code) {
        if (active) {
          setError("Open SoccerTime and enter your family league first.");
          setLoading(false);
        }
        return;
      }
      try {
        const [result, feed] = await Promise.all([
          rpc("league_state", { p_code: code }),
          fetch("/data/epl.json", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).catch(() => null),
        ]);
        if (!active) return;
        if (!result?.ok) setError(result?.error || "Could not load league history.");
        else {
          setState(result);
          setError("");
        }
        if (feed) setStaticData(feed);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load league history.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    const interval = window.setInterval(load, 120000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const manager1 = state?.managers?.find((manager) => Number(manager.slot) === 1);
  const manager2 = state?.managers?.find((manager) => Number(manager.slot) === 2);
  const activeGameweek = number(state?.league?.active_gameweek);
  const roundNo = number(state?.draft?.round_no);
  const roundStart = number(state?.draft?.start_gameweek);
  const roundEnd = number(state?.draft?.end_gameweek);

  const completed = useMemo(
    () => (state?.matchups || [])
      .filter((matchup) => matchup.status === "final")
      .sort((a, b) => Number(b.gameweek) - Number(a.gameweek)),
    [state?.matchups],
  );

  const stats = useMemo(() => {
    const m1Wins = completed.filter((game) => number(game.manager1_score) > number(game.manager2_score)).length;
    const m2Wins = completed.filter((game) => number(game.manager2_score) > number(game.manager1_score)).length;
    const draws = completed.length - m1Wins - m2Wins;
    const teamGames: TeamGame[] = completed.flatMap((game) => [
      { slot: 1, gameweek: Number(game.gameweek), score: number(game.manager1_score) },
      { slot: 2, gameweek: Number(game.gameweek), score: number(game.manager2_score) },
    ]);
    const highest = teamGames.length
      ? [...teamGames].sort((a, b) => b.score - a.score || b.gameweek - a.gameweek)[0]
      : null;
    const lowest = teamGames.length
      ? [...teamGames].sort((a, b) => a.score - b.score || b.gameweek - a.gameweek)[0]
      : null;
    const biggest = completed.length
      ? [...completed].sort((a, b) => Math.abs(number(b.manager1_score) - number(b.manager2_score)) - Math.abs(number(a.manager1_score) - number(a.manager2_score)))[0]
      : null;
    const closest = completed.length
      ? [...completed].sort((a, b) => Math.abs(number(a.manager1_score) - number(a.manager2_score)) - Math.abs(number(b.manager1_score) - number(b.manager2_score)))[0]
      : null;
    const combined = completed.length
      ? [...completed].sort((a, b) => (number(b.manager1_score) + number(b.manager2_score)) - (number(a.manager1_score) + number(a.manager2_score)))[0]
      : null;
    return {
      m1Wins,
      m2Wins,
      draws,
      highest,
      lowest,
      biggest,
      closest,
      combined,
      m1Current: currentStreak(completed, 1),
      m2Current: currentStreak(completed, 2),
      m1LongestWins: longestWinStreak(completed, 1),
      m2LongestWins: longestWinStreak(completed, 2),
    };
  }, [completed]);

  const roundResults = useMemo(
    () => [...(state?.round_results || [])].sort((a, b) => Number(b.round_no) - Number(a.round_no)),
    [state?.round_results],
  );

  const currentRound = useMemo(() => {
    const games = completed.filter((game) => Number(game.gameweek) >= roundStart && Number(game.gameweek) <= roundEnd);
    const m1Wins = games.filter((game) => number(game.manager1_score) > number(game.manager2_score)).length;
    const m2Wins = games.filter((game) => number(game.manager2_score) > number(game.manager1_score)).length;
    const m1Points = games.reduce((sum, game) => sum + number(game.manager1_score), 0);
    const m2Points = games.reduce((sum, game) => sum + number(game.manager2_score), 0);
    const leader = m1Wins === m2Wins
      ? (m1Points === m2Points ? null : m1Points > m2Points ? manager1 : manager2)
      : m1Wins > m2Wins ? manager1 : manager2;
    return { games, m1Wins, m2Wins, m1Points, m2Points, leader };
  }, [completed, manager1, manager2, roundEnd, roundStart]);

  const playerOfWeek = useMemo(() => {
    const latest = completed[0];
    if (!latest) return null;
    const scores = staticData.scores?.[String(latest.gameweek)];
    if (!scores) return null;
    const entries = Object.entries(scores)
      .map(([id, score]) => ({ id: Number(id), score: Number(score) }))
      .filter((entry) => Number.isFinite(entry.id) && Number.isFinite(entry.score))
      .sort((a, b) => b.score - a.score || a.id - b.id);
    const leader = entries[0];
    if (!leader) return null;
    const player = staticData.players?.find((item) => Number(item.id) === leader.id);
    if (!player) return null;
    const tied = entries.filter((entry) => entry.score === leader.score).length;
    return { ...player, score: leader.score, gameweek: Number(latest.gameweek), tied };
  }, [completed, staticData.players, staticData.scores]);

  const milestones = useMemo(() => {
    const latest = completed[0];
    if (!latest) return [] as Array<{ kicker: string; title: string; detail: string }>;
    const score1 = number(latest.manager1_score);
    const score2 = number(latest.manager2_score);
    const margin = Math.abs(score1 - score2);
    const highScore = Math.max(score1, score2);
    const cards: Array<{ kicker: string; title: string; detail: string }> = [];

    if (stats.highest && Number(stats.highest.gameweek) === Number(latest.gameweek) && stats.highest.score === highScore) {
      cards.push({
        kicker: "NEW RECORD",
        title: "Season-high score",
        detail: String(stats.highest.score) + " points by " + (stats.highest.slot === 1 ? club(manager1, "Manager 1") : club(manager2, "Manager 2")),
      });
    }
    if (stats.biggest && Number(stats.biggest.gameweek) === Number(latest.gameweek) && margin > 0) {
      cards.push({
        kicker: "RIVALRY MARK",
        title: "Biggest win so far",
        detail: String(margin) + "-point margin · " + winnerForGame(latest, manager1, manager2),
      });
    } else if (stats.closest && Number(stats.closest.gameweek) === Number(latest.gameweek)) {
      cards.push({
        kicker: "PHOTO FINISH",
        title: "Closest derby so far",
        detail: String(margin) + "-point margin in GW " + String(latest.gameweek),
      });
    }

    const winnerSlot: 1 | 2 | null = score1 === score2 ? null : score1 > score2 ? 1 : 2;
    const current = winnerSlot === 1 ? stats.m1Current : winnerSlot === 2 ? stats.m2Current : null;
    const winner = winnerSlot === 1 ? manager1 : winnerSlot === 2 ? manager2 : undefined;
    if (current?.kind === "W" && current.count >= 2) {
      cards.push({
        kicker: "HEAT CHECK",
        title: String(current.count) + " straight for " + club(winner, "Leader"),
        detail: "Longest win streak: " + String(winnerSlot === 1 ? stats.m1LongestWins : stats.m2LongestWins),
      });
    }

    return cards.slice(0, 3);
  }, [completed, manager1, manager2, stats]);

  if (loading) {
    return <><main className="shell historyShell theme-history"><HistoryHeader /><section className="card"><div className="eyebrow">Rivalry archive</div><HistorySkeleton /></section></main><BottomNav active="history" draftOpen={state?.draft?.status === "open"} /></>;
  }

  if (error || !state?.ok) {
    return <><main className="shell historyShell theme-history"><HistoryHeader /><section className="card"><div className="emptyState"><div className="emptyIcon" aria-hidden="true">▥</div><b>History is not ready yet</b><span>{error || state?.error || "History unavailable."}</span></div><Link className="btn historyHomeBtn" href="/">Back to SoccerTime</Link></section></main><BottomNav active="history" draftOpen={state?.draft?.status === "open"} /></>;
  }

  const biggestMargin = stats.biggest ? Math.abs(number(stats.biggest.manager1_score) - number(stats.biggest.manager2_score)) : 0;
  const closestMargin = stats.closest ? Math.abs(number(stats.closest.manager1_score) - number(stats.closest.manager2_score)) : 0;
  const highestClub = stats.highest?.slot === 1 ? club(manager1, "Manager 1") : club(manager2, "Manager 2");
  const biggestWinner = stats.biggest
    ? number(stats.biggest.manager1_score) === number(stats.biggest.manager2_score)
      ? "Draw"
      : number(stats.biggest.manager1_score) > number(stats.biggest.manager2_score)
        ? club(manager1, "Manager 1")
        : club(manager2, "Manager 2")
    : "—";

  return <><main className="shell historyShell theme-history">
    <HistoryHeader />

    <section className="card historyHero">
      <div className="eyebrow">All-time house derby</div>
      <div className="historySeries">
        <div><span>{club(manager1, "Manager 1")}</span><b>{stats.m1Wins}</b></div>
        <div className="historySeriesMid"><strong>{stats.draws}</strong><span>draws</span></div>
        <div><span>{club(manager2, "Manager 2")}</span><b>{stats.m2Wins}</b></div>
      </div>
      <p className="sub">{completed.length ? `${completed.length} completed Gameweek${completed.length === 1 ? "" : "s"}` : `History starts when Gameweek ${activeGameweek || 4} finalizes.`}</p>
    </section>

    <div className="grid2 historyStats">
      <div className="card stat"><span className="tiny">SEASON TABLE</span><b>{number(manager1?.table_points)}–{number(manager2?.table_points)}</b><span className="sub">table points</span></div>
      <div className="card stat"><span className="tiny">SOCCERTIME POINTS</span><b>{number(manager1?.fantasy_points)}–{number(manager2?.fantasy_points)}</b><span className="sub">season total</span></div>
    </div>

    <h2>Records</h2>
    <section className="card historyRecords">
      <RecordRow label="Highest team score" value={stats.highest ? `${stats.highest.score} pts` : "—"} detail={stats.highest ? `${highestClub} · GW ${stats.highest.gameweek}` : "Waiting for the first final score"} />
      <RecordRow label="Biggest win" value={stats.biggest ? `${biggestMargin} pts` : "—"} detail={stats.biggest ? `${biggestWinner} · GW ${stats.biggest.gameweek}` : "Waiting for the first final score"} />
      <RecordRow label="Closest derby" value={stats.closest ? `${closestMargin} pt${closestMargin === 1 ? "" : "s"}` : "—"} detail={stats.closest ? `GW ${stats.closest.gameweek} · ${number(stats.closest.manager1_score)}–${number(stats.closest.manager2_score)}` : "Waiting for the first final score"} />
      <RecordRow label="Highest combined score" value={stats.combined ? `${number(stats.combined.manager1_score) + number(stats.combined.manager2_score)} pts` : "—"} detail={stats.combined ? `GW ${stats.combined.gameweek}` : "Waiting for the first final score"} />
    </section>

    <h2>Round champions</h2>
    <section className="card">
      {roundResults.length ? roundResults.map((round) => {
        const winner = round.winner_slot === 1 ? manager1 : round.winner_slot === 2 ? manager2 : undefined;
        return <div className="historyRound" key={round.round_no}>
          <div className="historyRoundTrophy">🏆</div>
          <div className="grow">
            <div className="name">Round {round.round_no} · {winner ? club(winner, "Champion") : "Shared"}</div>
            <div className="meta">Weekly wins {round.manager1_wins}–{round.manager2_wins} · SoccerTime points {number(round.manager1_points)}–{number(round.manager2_points)}</div>
          </div>
        </div>;
      }) : <div className="emptyState"><div className="emptyIcon" aria-hidden="true">🏆</div><b>No Round champion yet</b><span>The first champion will be crowned after GW {roundEnd || 7}.</span></div>}
    </section>

    <h2>Gameweek scorecards</h2>
    <section className="historyTimeline">
      {completed.length ? completed.map((game) => {
        const score1 = number(game.manager1_score);
        const score2 = number(game.manager2_score);
        const winner = score1 === score2 ? "Draw" : score1 > score2 ? club(manager1, "Manager 1") : club(manager2, "Manager 2");
        return <article className="card historyGame" key={game.gameweek}>
          <div className="historyGameTop"><span className="eyebrow">Gameweek {game.gameweek}</span><span className="pill">{winner}</span></div>
          <div className="historyGameScore">
            <div><span>{club(manager1, "Manager 1")}</span><b>{score1}</b></div>
            <strong>–</strong>
            <div><span>{club(manager2, "Manager 2")}</span><b>{score2}</b></div>
          </div>
          <div className="meta">Margin {Math.abs(score1 - score2)} · Combined {score1 + score2}</div>
        </article>;
      }) : <section className="card"><div className="emptyState"><div className="emptyIcon" aria-hidden="true">⚽</div><b>No completed Gameweeks yet</b><span>GW {activeGameweek || 4} will appear here automatically after official FPL data is checked and SoccerTime finalizes the result.</span></div></section>}
    </section>
  </main><BottomNav active="history" draftOpen={state?.draft?.status === "open"} /></>;
}

function HistoryHeader() {
  return <header className="mast"><div className="brand">Soccer<span>Time</span></div><Link className="pill historyBack" href="/">← Game</Link></header>;
}

function RecordRow({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="row"><div className="grow"><div className="name">{label}</div><div className="meta">{detail}</div></div><div className="historyRecordValue">{value}</div></div>;
}

function HistorySkeleton(){
  return <div className="skeletonList" aria-label="Loading rivalry history"><span className="srOnly">Loading rivalry history</span>{Array.from({length:5},(_,i)=><div className="skeletonRow" key={i}><div className="skeletonAvatar"/><div className="skeletonGrow"><div className="skeletonLine wide"/><div className="skeletonLine short"/></div><div className="skeletonScore"/></div>)}</div>;
}
