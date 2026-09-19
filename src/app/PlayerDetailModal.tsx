"use client";

import PlayerFace from "./PlayerFace";

export type PlayerDetail = {
  season: {
    fplPoints: number;
    soccerTimePoints: number;
    minutes: number;
    starts: number;
    goals: number;
    assists: number;
    cleanSheets: number;
    saves: number;
    penaltiesSaved: number;
    penaltiesMissed: number;
    ownGoals: number;
    yellowCards: number;
    redCards: number;
    form: number;
    pointsPerGame: number;
  };
  history: Array<{
    round: number;
    points: number;
    officialPoints: number;
    minutes: number;
    goals: number;
    assists: number;
    cleanSheets: number;
    saves: number;
    bonusRemoved: number;
    ownGoals: number;
    penaltiesMissed: number;
    opponents: string[];
  }>;
  news?: string;
};

type Player = {
  id: number;
  code?: number;
  name: string;
  firstName?: string;
  lastName?: string;
  team: string;
  position: string;
  status?: string;
  chanceOfPlayingNextRound?: number | null;
};

function availability(player: Player) {
  if (player.status === "d") return player.chanceOfPlayingNextRound != null ? `Doubt · ${player.chanceOfPlayingNextRound}% chance` : "Doubt";
  if (player.status === "i") return "Injured";
  if (player.status === "s") return "Suspended";
  if (player.status === "n") return "Unavailable";
  return null;
}

function StatBox({ label, value }: { label: string; value: number }) {
  return <div className="playerStatBox"><b>{value}</b><span>{label}</span></div>;
}

export default function PlayerDetailModal({
  player,
  detail,
  loading,
  picks,
  managers,
  moves,
  leagueStart,
  currentGw,
  currentPoints,
  onClose,
}: {
  player: Player;
  detail: PlayerDetail | null;
  loading: boolean;
  picks: any[];
  managers: any[];
  moves: any[];
  leagueStart: number;
  currentGw: number;
  currentPoints: number;
  onClose: () => void;
}) {
  const pick = picks.find((item) => Number(item.player_id) === player.id);
  const owner = pick ? managers.find((manager) => manager.id === pick.manager_id) : null;
  const playerMoves = moves.filter((move) => move.dropped_player_name === player.name || move.added_player_name === player.name);
  const history = (detail?.history || []).filter((item) => item.round >= leagueStart);
  const alert = availability(player);

  return <div className="playerModalBackdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="playerModal card" role="dialog" aria-modal="true" aria-labelledby="player-detail-title">
      <button className="playerModalClose" type="button" onClick={onClose} aria-label="Close player details">×</button>
      <div className="playerDetailHero">
        <PlayerFace name={player.name} position={player.position} code={player.code} headshot large />
        <div className="grow">
          <div className="eyebrow">{player.team} · {player.position}</div>
          <h2 id="player-detail-title">{player.firstName || ""} {player.lastName || player.name}</h2>
          <div className="playerTitle">
            {alert && <span className="statusTag">{alert}</span>}
            {owner && <span className="captainTag">Rostered · {owner.club_name}</span>}
          </div>
        </div>
        <div className="livePoints detailLive"><b>{currentPoints}</b><span>GW {currentGw}</span></div>
      </div>

      {loading ? <div className="playerDetailLoading">Loading season history…</div> : detail ? <>
        <div className="playerStatGrid">
          <StatBox label="SOCCERTIME" value={detail.season.soccerTimePoints} />
          <StatBox label="FPL PTS" value={detail.season.fplPoints} />
          <StatBox label="GOALS" value={detail.season.goals} />
          <StatBox label="ASSISTS" value={detail.season.assists} />
          <StatBox label="MINUTES" value={detail.season.minutes} />
          <StatBox label={player.position === "GK" ? "SAVES" : "CLEAN SHEETS"} value={player.position === "GK" ? detail.season.saves : detail.season.cleanSheets} />
        </div>

        {detail.news && <div className="banner error">{detail.news}</div>}

        <div className="playerDetailSection">
          <div className="eyebrow">SoccerTime history</div>
          <div className="meta">{owner ? `Current roster: ${owner.club_name}${pick ? ` · drafted pick ${pick.pick_no}` : ""}` : "Currently a free agent"}.</div>
          {playerMoves.length > 0 && <div className="playerMoves">
            {playerMoves.slice(0, 6).map((move) => <div className="transactionRow" key={move.id}>
              <div className="transactionIcon">↔</div>
              <div className="grow">
                <div className="name">GW {move.gameweek}</div>
                <div className="meta">{move.dropped_player_name === player.name ? `Dropped for ${move.added_player_name}` : `Added for ${move.dropped_player_name}`}</div>
              </div>
            </div>)}
          </div>}
        </div>

        <div className="playerDetailSection">
          <div className="eyebrow">Gameweek scoring</div>
          {history.length ? history.map((item) => <div className="row" key={item.round}>
            <div className="gameweekBadge"><span>GW</span><b>{item.round}</b></div>
            <div className="grow">
              <div className="name">{item.opponents.join(" · ") || "Premier League"}</div>
              <div className="meta">
                {item.minutes} min
                {item.goals ? ` · ${item.goals} goal${item.goals === 1 ? "" : "s"}` : ""}
                {item.assists ? ` · ${item.assists} assist${item.assists === 1 ? "" : "s"}` : ""}
                {item.saves ? ` · ${item.saves} saves` : ""}
                {item.bonusRemoved ? ` · ${item.bonusRemoved} bonus removed` : ""}
              </div>
            </div>
            <div className="tablePts"><b>{item.points}</b><span>ST PTS</span></div>
          </div>) : <div className="emptyState"><div className="emptyIcon">◎</div><b>No SoccerTime Gameweeks yet</b><span>This player's house-scoring history will appear here as Gameweeks are played.</span></div>}
        </div>
      </> : <div className="emptyState"><div className="emptyIcon">!</div><b>Player details unavailable</b><span>The live FPL player feed could not be loaded. Try again shortly.</span></div>}
    </section>
  </div>;
}
