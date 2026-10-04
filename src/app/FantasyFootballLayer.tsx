"use client";

import { useEffect, useMemo, useState } from "react";
import PlayerFace from "./PlayerFace";

type Player = {
  id: number;
  code?: number;
  name: string;
  firstName?: string;
  lastName?: string;
  team: string;
  teamId?: number;
  position: string;
  total: number;
  recent?: number[];
  form?: number;
  pointsPerGame?: number;
  minutes?: number;
  status?: string;
  news?: string;
  chanceOfPlayingNextRound?: number | null;
};

type Fixture = {
  id: number;
  event: number | null;
  kickoff: string | null;
  started: boolean;
  finished: boolean;
  home: { id: number; name: string; shortName: string; goals: number | null };
  away: { id: number; name: string; shortName: string; goals: number | null };
};

const POSITION_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

function recentAverage(player?: Player) {
  if (!player) return 0;
  const recent = (player.recent || []).map(Number).filter(Number.isFinite).slice(-4);
  if (recent.length) return recent.reduce((sum, value) => sum + value, 0) / recent.length;
  const form = Number(player.form);
  if (Number.isFinite(form) && form > 0) return form;
  const ppg = Number(player.pointsPerGame);
  return Number.isFinite(ppg) ? ppg : 0;
}

function pickProjection(pick: any, catalog: Map<number, Player>, captains: any[]) {
  const player = catalog.get(Number(pick.player_id));
  const multiplier = captains.some((captain) =>
    captain.manager_id === pick.manager_id && Number(captain.player_id) === Number(pick.player_id),
  ) ? 2 : 1;
  return recentAverage(player) * multiplier;
}

function teamProjection(picks: any[], catalog: Map<number, Player>, captains: any[]) {
  return picks.reduce((sum, pick) => sum + pickProjection(pick, catalog, captains), 0);
}

function availability(player?: Player) {
  if (!player) return null;
  if (player.status === "d") return player.chanceOfPlayingNextRound != null ? `${player.chanceOfPlayingNextRound}%` : "Doubt";
  if (player.status === "i") return "Injured";
  if (player.status === "s") return "Suspended";
  if (player.status === "n") return "Out";
  return null;
}

function fixtureFor(player: Player | undefined, fixtures: Fixture[]) {
  if (!player?.teamId) return null;
  return fixtures.find((fixture) => fixture.home.id === player.teamId || fixture.away.id === player.teamId) || null;
}

function fixtureText(player: Player | undefined, fixture: Fixture | null) {
  if (!player || !fixture || !player.teamId) return "Fixture TBD";
  const home = fixture.home.id === player.teamId;
  const opponent = home ? fixture.away.shortName : fixture.home.shortName;
  if (fixture.finished) return `${opponent} · FT`;
  if (fixture.started) return `${opponent} · LIVE`;
  if (!fixture.kickoff) return `${opponent} · TBD`;
  return `${opponent} · ${new Date(fixture.kickoff).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}`;
}

function PlayerStatus({
  pick,
  catalog,
  fixtures,
  captains,
}: {
  pick: any;
  catalog: Map<number, Player>;
  fixtures: Fixture[];
  captains: any[];
}) {
  const player = catalog.get(Number(pick.player_id));
  const fixture = fixtureFor(player, fixtures);
  const isCaptain = captains.some((captain) =>
    captain.manager_id === pick.manager_id && Number(captain.player_id) === Number(pick.player_id),
  );
  const alert = availability(player);
  return <div className="fantasyPlayerMeta">
    <span>{player?.team || pick.team_name || "Premier League"}</span>
    <span>·</span>
    <span>{fixtureText(player, fixture)}</span>
    {isCaptain && <span className="fantasyInlineTag captain">C · 2×</span>}
    {alert && <span className="fantasyInlineTag alert">{alert}</span>}
  </div>;
}

function sortedPicks(picks: any[]) {
  return [...picks].sort((a, b) =>
    (POSITION_ORDER[a.position] ?? 9) - (POSITION_ORDER[b.position] ?? 9) ||
    Number(a.pick_no || 999) - Number(b.pick_no || 999),
  );
}

function remainingCount(picks: any[], catalog: Map<number, Player>, fixtures: Fixture[]) {
  return picks.filter((pick) => {
    const fixture = fixtureFor(catalog.get(Number(pick.player_id)), fixtures);
    return fixture && !fixture.finished;
  }).length;
}

export function FantasyMatchupCenter({
  gw,
  me,
  opponent,
  mine,
  theirs,
  captains,
  catalog,
  fixtures,
  matchups,
  moves,
  scoreFor,
  deadline,
  gameweekLocked,
  lockKnown,
  onOpen,
}: {
  gw: number;
  me: any;
  opponent: any;
  mine: any[];
  theirs: any[];
  captains: any[];
  catalog: Map<number, Player>;
  fixtures: Fixture[];
  matchups: any[];
  moves: any[];
  scoreFor: (pick: any) => number;
  deadline: string;
  gameweekLocked: boolean;
  lockKnown: boolean;
  onOpen: (player: Player) => void;
}) {
  const myProjection = teamProjection(mine, catalog, captains);
  const theirProjection = teamProjection(theirs, catalog, captains);
  const projectionEdge = myProjection - theirProjection;
  const myRemaining = remainingCount(mine, catalog, fixtures);
  const theirRemaining = remainingCount(theirs, catalog, fixtures);
  const currentMoves = moves.filter((move) => Number(move.gameweek) === gw).length;
  const myCaptain = captains.find((captain) => captain.manager_id === me?.id);
  const theirCaptain = captains.find((captain) => captain.manager_id === opponent?.id);
  const myCaptainPick = mine.find((pick) => Number(pick.player_id) === Number(myCaptain?.player_id));
  const theirCaptainPick = theirs.find((pick) => Number(pick.player_id) === Number(theirCaptain?.player_id));
  const mySorted = sortedPicks(mine);
  const theirSorted = sortedPicks(theirs);
  const rows = Math.max(mySorted.length, theirSorted.length);
  const weeks = [...matchups].sort((a, b) => Number(a.gameweek) - Number(b.gameweek));

  return <>
    <section className="card fantasyPanel">
      <div className="fantasyPanelHead">
        <div>
          <div className="eyebrow">Matchup central</div>
          <h3>Everything that matters this Gameweek</h3>
        </div>
        <span className="fantasyBadge">GW {gw}</span>
      </div>
      <div className="fantasyMetricGrid">
        <div className="fantasyMetric">
          <span>FORM PROJECTION</span>
          <b>{myProjection.toFixed(1)}–{theirProjection.toFixed(1)}</b>
          <small>{Math.abs(projectionEdge) < 0.5 ? "Dead even" : projectionEdge > 0 ? `${me?.club_name || "You"} +${projectionEdge.toFixed(1)}` : `${opponent?.club_name || "Opponent"} +${Math.abs(projectionEdge).toFixed(1)}`}</small>
        </div>
        <div className="fantasyMetric">
          <span>PLAYERS LEFT</span>
          <b>{myRemaining}–{theirRemaining}</b>
          <small>{gameweekLocked ? "Including live players" : "Before first kickoff"}</small>
        </div>
        <div className="fantasyMetric">
          <span>CAPTAINS</span>
          <b>{myCaptainPick?.player_name || "—"}</b>
          <small>vs {theirCaptainPick?.player_name || "—"}</small>
        </div>
        <div className="fantasyMetric">
          <span>GW ACTIVITY</span>
          <b>{currentMoves}</b>
          <small>{currentMoves === 1 ? "roster move" : "roster moves"}</small>
        </div>
      </div>
      <div className="fantasyActionBar">
        <span className={myCaptainPick ? "good" : "warn"}>{myCaptainPick ? "✓ Captain set" : "! Captain needed"}</span>
        <span>{lockKnown ? (gameweekLocked ? "Lineups locked" : `Moves open · ${deadline}`) : "Checking kickoff"}</span>
        <span>{projectionEdge >= 0 ? "Form edge: you" : "Form edge: opponent"}</span>
      </div>
    </section>

    {weeks.length > 0 && <section className="fantasyWeekStrip" aria-label="Gameweek schedule">
      {weeks.map((matchup) => {
        const week = Number(matchup.gameweek);
        const isCurrent = week === gw;
        const mineScore = Number(me?.slot === 1 ? matchup.manager1_score : matchup.manager2_score);
        const theirScore = Number(me?.slot === 1 ? matchup.manager2_score : matchup.manager1_score);
        const hasScore = Number.isFinite(mineScore) && Number.isFinite(theirScore);
        const result = matchup.status === "final" && hasScore ? (mineScore === theirScore ? "D" : mineScore > theirScore ? "W" : "L") : null;
        return <div className={`fantasyWeekPill ${isCurrent ? "current" : ""}`} key={week}>
          <span>GW {week}</span>
          <b>{result || (isCurrent ? "LIVE" : "—")}</b>
          {hasScore && <small>{mineScore}–{theirScore}</small>}
        </div>;
      })}
    </section>}

    <section className="card fantasyPanel">
      <div className="fantasyPanelHead">
        <div>
          <div className="eyebrow">Lineup matchup</div>
          <h3>{me?.club_name || "Your team"} vs {opponent?.club_name || "Opponent"}</h3>
        </div>
        <span className="fantasyBadge">ALL 8 ACTIVE</span>
      </div>
      <div className="fantasyLineupHeader">
        <span>{me?.club_name || "You"}</span>
        <span>POS</span>
        <span>{opponent?.club_name || "Opponent"}</span>
      </div>
      <div className="fantasyLineup">
        {Array.from({ length: rows }, (_, index) => {
          const left = mySorted[index];
          const right = theirSorted[index];
          const leftPlayer = left ? catalog.get(Number(left.player_id)) : undefined;
          const rightPlayer = right ? catalog.get(Number(right.player_id)) : undefined;
          const position = left?.position || right?.position || "";
          return <div className="fantasyLineupRow" key={`${left?.player_id || "x"}-${right?.player_id || "x"}-${index}`}>
            <button className="fantasySide fantasySide-left" type="button" disabled={!leftPlayer} onClick={() => leftPlayer && onOpen(leftPlayer)}>
              <div className="fantasySideName">
                <strong>{left?.player_name || "—"}</strong>
                {left && <PlayerStatus pick={left} catalog={catalog} fixtures={fixtures} captains={captains} />}
              </div>
              {left && <div className="fantasyScoreCell"><b>{scoreFor(left)}</b><small>{pickProjection(left, catalog, captains).toFixed(1)} proj</small></div>}
            </button>
            <div className={`fantasyPosition fantasyPosition-${String(position).toLowerCase()}`}>{position}</div>
            <button className="fantasySide fantasySide-right" type="button" disabled={!rightPlayer} onClick={() => rightPlayer && onOpen(rightPlayer)}>
              {right && <div className="fantasyScoreCell"><b>{scoreFor(right)}</b><small>{pickProjection(right, catalog, captains).toFixed(1)} proj</small></div>}
              <div className="fantasySideName">
                <strong>{right?.player_name || "—"}</strong>
                {right && <PlayerStatus pick={right} catalog={catalog} fixtures={fixtures} captains={captains} />}
              </div>
            </button>
          </div>;
        })}
      </div>
      <p className="tiny fantasyFootnote">Projection is a recent-form estimate using each player's latest SoccerTime/FPL form data; it is not an official betting or FPL projection.</p>
    </section>
  </>;
}

export function FantasyTeamOverview({
  mine,
  theirs,
  me,
  opponent,
  captains,
  catalog,
  fixtures,
  scoreFor,
}: {
  mine: any[];
  theirs: any[];
  me: any;
  opponent: any;
  captains: any[];
  catalog: Map<number, Player>;
  fixtures: Fixture[];
  scoreFor: (pick: any) => number;
}) {
  const projection = teamProjection(mine, catalog, captains);
  const injuries = mine.filter((pick) => availability(catalog.get(Number(pick.player_id)))).length;
  const positions = ["GK", "DEF", "MID", "FWD"].map((position) => ({
    position,
    count: mine.filter((pick) => pick.position === position).length,
  }));
  const captain = captains.find((item) => item.manager_id === me?.id);
  const captainPick = mine.find((pick) => Number(pick.player_id) === Number(captain?.player_id));
  const opponentCaptain = captains.find((item) => item.manager_id === opponent?.id);
  const opponentCaptainPick = theirs.find((pick) => Number(pick.player_id) === Number(opponentCaptain?.player_id));
  const hottest = [...mine].sort((a, b) => recentAverage(catalog.get(Number(b.player_id))) - recentAverage(catalog.get(Number(a.player_id))))[0];
  const opponentHottest = [...theirs].sort((a, b) => recentAverage(catalog.get(Number(b.player_id))) - recentAverage(catalog.get(Number(a.player_id))))[0];

  return <section className="card fantasyPanel">
    <div className="fantasyPanelHead">
      <div>
        <div className="eyebrow">Team dashboard</div>
        <h3>Roster intelligence</h3>
      </div>
      <span className="fantasyBadge">{mine.length}/8 ACTIVE</span>
    </div>
    <div className="fantasyMetricGrid">
      <div className="fantasyMetric"><span>FORM PROJECTION</span><b>{projection.toFixed(1)}</b><small>recent-form estimate</small></div>
      <div className="fantasyMetric"><span>AVAILABILITY</span><b>{injuries ? `${injuries} alert${injuries === 1 ? "" : "s"}` : "Clear"}</b><small>{injuries ? "review player status" : "no flagged players"}</small></div>
      <div className="fantasyMetric"><span>CAPTAIN</span><b>{captainPick?.player_name || "—"}</b><small>{captainPick ? `${scoreFor(captainPick)} pts this GW` : "selection needed"}</small></div>
      <div className="fantasyMetric"><span>HOT HAND</span><b>{hottest?.player_name || "—"}</b><small>{hottest ? `${recentAverage(catalog.get(Number(hottest.player_id))).toFixed(1)} recent avg` : "no roster yet"}</small></div>
    </div>
    <div className="fantasyRosterShape">
      {positions.map((item) => <div key={item.position}><span>{item.position}</span><b>{item.count}</b></div>)}
    </div>
    <div className="fantasyOpponentWatch">
      <div>
        <span className="tiny">OPPONENT WATCH</span>
        <strong>{opponent?.club_name || "Opponent"}</strong>
      </div>
      <div><span>Captain</span><b>{opponentCaptainPick?.player_name || "—"}</b></div>
      <div><span>Hot hand</span><b>{opponentHottest?.player_name || "—"}</b></div>
    </div>
  </section>;
}

export function FantasyPlayerMarket({
  players,
  picks,
  managers,
  onOpen,
}: {
  players: Player[];
  picks: any[];
  managers: any[];
  onOpen: (player: Player) => void;
}) {
  const [mode, setMode] = useState<"available" | "trending" | "watchlist">("available");
  const [watchlist, setWatchlist] = useState<number[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("soccertime-watchlist");
      if (raw) setWatchlist(JSON.parse(raw));
    } catch {}
  }, []);

  const owners = useMemo(() => new Map(picks.map((pick) => [Number(pick.player_id), pick.manager_id])), [picks]);
  const managerById = useMemo(() => new Map(managers.map((manager) => [manager.id, manager])), [managers]);
  const activePlayers = players.filter((player) => player.status !== "u");
  const available = activePlayers
    .filter((player) => !owners.has(player.id))
    .sort((a, b) => recentAverage(b) - recentAverage(a) || Number(b.total) - Number(a.total));
  const trending = activePlayers
    .filter((player) => !owners.has(player.id))
    .sort((a, b) => {
      const aTrend = Number(a.form || 0) - Number(a.pointsPerGame || 0);
      const bTrend = Number(b.form || 0) - Number(b.pointsPerGame || 0);
      return bTrend - aTrend || recentAverage(b) - recentAverage(a);
    });
  const watched = watchlist.map((id) => activePlayers.find((player) => player.id === id)).filter(Boolean) as Player[];
  const visible = mode === "available" ? available.slice(0, 8) : mode === "trending" ? trending.slice(0, 8) : watched;

  function toggleWatch(id: number) {
    setWatchlist((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      try { localStorage.setItem("soccertime-watchlist", JSON.stringify(next)); } catch {}
      return next;
    });
  }

  return <section className="card fantasyPanel">
    <div className="fantasyPanelHead">
      <div>
        <div className="eyebrow">Player market</div>
        <h3>Free agents, trends & watchlist</h3>
      </div>
      <span className="fantasyBadge">{available.length} FREE</span>
    </div>
    <div className="fantasySegments">
      <button type="button" className={mode === "available" ? "active" : ""} onClick={() => setMode("available")}>Top available</button>
      <button type="button" className={mode === "trending" ? "active" : ""} onClick={() => setMode("trending")}>Trending</button>
      <button type="button" className={mode === "watchlist" ? "active" : ""} onClick={() => setMode("watchlist")}>Watchlist {watchlist.length ? `(${watchlist.length})` : ""}</button>
    </div>
    <div className="fantasyMarketList">
      {visible.length ? visible.map((player) => {
        const ownerId = owners.get(player.id);
        const owner = ownerId ? managerById.get(ownerId) : null;
        const alert = availability(player);
        const trend = Number(player.form || 0) - Number(player.pointsPerGame || 0);
        return <div className="fantasyMarketRow" key={player.id}>
          <button type="button" className="fantasyWatch" aria-label={watchlist.includes(player.id) ? "Remove from watchlist" : "Add to watchlist"} onClick={() => toggleWatch(player.id)}>
            {watchlist.includes(player.id) ? "★" : "☆"}
          </button>
          <PlayerFace name={player.name} position={player.position} code={player.code} headshot />
          <button type="button" className="fantasyMarketPlayer" onClick={() => onOpen(player)}>
            <strong>{player.name}</strong>
            <span>{player.team} · {player.position}{owner ? ` · ${owner.club_name}` : " · Free agent"}</span>
            {alert && <small>{alert}{player.news ? ` · ${player.news}` : ""}</small>}
          </button>
          <div className="fantasyMarketStats">
            <div><b>{recentAverage(player).toFixed(1)}</b><span>AVG</span></div>
            <div><b>{Number(player.form || 0).toFixed(1)}</b><span>FORM</span></div>
            <div className={trend >= 0 ? "trendUp" : "trendDown"}><b>{trend >= 0 ? "+" : ""}{trend.toFixed(1)}</b><span>TREND</span></div>
          </div>
        </div>;
      }) : <div className="emptyState"><div className="emptyIcon">☆</div><b>Your watchlist is empty</b><span>Tap the star beside any player to keep an eye on them from this device.</span></div>}
    </div>
    <p className="tiny fantasyFootnote">SoccerTime uses instant same-position free-agent swaps before the first kickoff rather than NFL-style waivers.</p>
  </section>;
}

function streakFor(manager: any, finals: any[]) {
  const sorted = [...finals].sort((a, b) => Number(b.gameweek) - Number(a.gameweek));
  if (!sorted.length) return "—";
  let kind = "";
  let count = 0;
  for (const matchup of sorted) {
    const mine = Number(manager.slot === 1 ? matchup.manager1_score : matchup.manager2_score);
    const theirs = Number(manager.slot === 1 ? matchup.manager2_score : matchup.manager1_score);
    const nextKind = mine === theirs ? "D" : mine > theirs ? "W" : "L";
    if (!kind) kind = nextKind;
    if (nextKind !== kind) break;
    count += 1;
  }
  return `${kind}${count}`;
}

export function FantasyLeagueCenter({
  managers,
  matchups,
  moves,
  gw,
}: {
  managers: any[];
  matchups: any[];
  moves: any[];
  gw: number;
}) {
  const finals = matchups.filter((matchup) => matchup.status === "final");
  const seasonStats = managers.map((manager) => {
    const scores = finals.map((matchup) => Number(manager.slot === 1 ? matchup.manager1_score : matchup.manager2_score)).filter(Number.isFinite);
    const against = finals.map((matchup) => Number(manager.slot === 1 ? matchup.manager2_score : matchup.manager1_score)).filter(Number.isFinite);
    const pf = scores.reduce((sum, value) => sum + value, 0);
    const pa = against.reduce((sum, value) => sum + value, 0);
    return {
      manager,
      pf,
      pa,
      avg: scores.length ? pf / scores.length : 0,
      high: scores.length ? Math.max(...scores) : 0,
      streak: streakFor(manager, finals),
    };
  });
  const scoredWeeks = finals.flatMap((matchup) => [
    { slot: 1, score: Number(matchup.manager1_score), gameweek: Number(matchup.gameweek) },
    { slot: 2, score: Number(matchup.manager2_score), gameweek: Number(matchup.gameweek) },
  ]).filter((item) => Number.isFinite(item.score));
  const highWeek = [...scoredWeeks].sort((a, b) => b.score - a.score)[0];
  const closest = [...finals].sort((a, b) => Math.abs(Number(a.manager1_score) - Number(a.manager2_score)) - Math.abs(Number(b.manager1_score) - Number(b.manager2_score)))[0];
  const biggest = [...finals].sort((a, b) => Math.abs(Number(b.manager1_score) - Number(b.manager2_score)) - Math.abs(Number(a.manager1_score) - Number(a.manager2_score)))[0];

  return <>
    <section className="card fantasyPanel">
      <div className="fantasyPanelHead">
        <div>
          <div className="eyebrow">League dashboard</div>
          <h3>Records, points & streaks</h3>
        </div>
        <span className="fantasyBadge">{finals.length} FINAL GWs</span>
      </div>
      <div className="fantasyLeagueTable">
        <div className="fantasyLeagueTableHead"><span>TEAM</span><span>PF</span><span>PA</span><span>AVG</span><span>HIGH</span><span>STRK</span></div>
        {seasonStats.map(({ manager, pf, pa, avg, high, streak }) => <div className="fantasyLeagueTableRow" key={manager.id}>
          <strong>{manager.club_name}</strong>
          <span>{pf}</span>
          <span>{pa}</span>
          <span>{avg.toFixed(1)}</span>
          <span>{high}</span>
          <span>{streak}</span>
        </div>)}
      </div>
      <div className="fantasyRecordGrid">
        <div><span>HIGH SCORE</span><b>{highWeek ? highWeek.score : "—"}</b><small>{highWeek ? `GW ${highWeek.gameweek} · ${managers.find((manager) => Number(manager.slot) === highWeek.slot)?.club_name || "Team"}` : "No finals yet"}</small></div>
        <div><span>CLOSEST MATCH</span><b>{closest ? `${Math.abs(Number(closest.manager1_score) - Number(closest.manager2_score))} pt` : "—"}</b><small>{closest ? `GW ${closest.gameweek}` : "No finals yet"}</small></div>
        <div><span>BIGGEST WIN</span><b>{biggest ? `${Math.abs(Number(biggest.manager1_score) - Number(biggest.manager2_score))} pts` : "—"}</b><small>{biggest ? `GW ${biggest.gameweek}` : "No finals yet"}</small></div>
      </div>
    </section>

    <section className="card fantasyPanel">
      <div className="fantasyPanelHead">
        <div>
          <div className="eyebrow">Schedule & results</div>
          <h3>Gameweek scoreboard</h3>
        </div>
        <span className="fantasyBadge">GW {gw}</span>
      </div>
      <div className="fantasySchedule">
        {[...matchups].sort((a, b) => Number(b.gameweek) - Number(a.gameweek)).map((matchup) => {
          const m1 = managers.find((manager) => Number(manager.slot) === 1);
          const m2 = managers.find((manager) => Number(manager.slot) === 2);
          const s1 = Number(matchup.manager1_score);
          const s2 = Number(matchup.manager2_score);
          const hasScores = Number.isFinite(s1) && Number.isFinite(s2);
          return <div className={`fantasyScheduleRow ${Number(matchup.gameweek) === gw ? "current" : ""}`} key={matchup.gameweek}>
            <div className="fantasyGameweekBadge">GW <b>{matchup.gameweek}</b></div>
            <div className="fantasyScheduleTeams">
              <span><strong>{m1?.club_name || "Manager 1"}</strong>{hasScores && <b>{s1}</b>}</span>
              <span><strong>{m2?.club_name || "Manager 2"}</strong>{hasScores && <b>{s2}</b>}</span>
            </div>
            <span className={`fantasyStateTag ${matchup.status === "final" ? "final" : Number(matchup.gameweek) === gw ? "live" : ""}`}>{matchup.status === "final" ? "FINAL" : Number(matchup.gameweek) === gw ? "CURRENT" : "SCHEDULED"}</span>
          </div>;
        })}
      </div>
    </section>

    <section className="card fantasyPanel">
      <div className="fantasyPanelHead">
        <div>
          <div className="eyebrow">League activity</div>
          <h3>Transactions</h3>
        </div>
        <span className="fantasyBadge">{moves.length} MOVES</span>
      </div>
      {moves.length ? moves.slice(0, 16).map((move) => {
        const manager = managers.find((item) => item.id === move.manager_id);
        return <div className="fantasyActivityRow" key={move.id}>
          <div className="fantasyActivityIcon">↔</div>
          <div>
            <strong>{manager?.club_name || "Manager"}</strong>
            <span>added {move.added_player_name || "Player"} · dropped {move.dropped_player_name || "Player"}</span>
          </div>
          <small>GW {move.gameweek}</small>
        </div>;
      }) : <div className="emptyState"><div className="emptyIcon">↔</div><b>No transactions yet</b><span>Every free-agent swap will be logged here like a fantasy-football league activity feed.</span></div>}
    </section>
  </>;
}
