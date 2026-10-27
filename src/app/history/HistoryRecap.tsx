import Link from "next/link";
import PlayerFace from "../PlayerFace";
import type { HistoricalLineups, RecapSide } from "@/lib/historical-lineups";

type Game = {
  gameweek: number;
  status: string;
  manager1_score: number | string;
  manager2_score: number | string;
};

type Manager = { id: string; slot: number; club_name: string; name?: string };

function RecapRoster({ side }: { side: RecapSide }) {
  return <div className="historyRecapRoster">
    {side.players.map((player) => <div className="historyRecapPlayer" key={player.player_id}>
      <PlayerFace name={player.player_name} position={player.position} />
      <div className="historyRecapPlayerName">
        <strong>{player.player_name}</strong>
        <span>{player.position}{player.team_name ? ` · ${player.team_name}` : ""}</span>
      </div>
      {player.captain && <span className="historyRecapCaptain">C · 2×</span>}
      <div className="historyRecapPlayerScore"><b>{player.totalPoints}</b><small>{player.captain ? `${player.points} × 2` : "PTS"}</small></div>
    </div>)}
    {side.unattributedCaptainBonus !== 0 && <div className="historyRecapPlayer historyRecapBonus">
      <span>Captain bonus · player not uniquely identifiable</span>
      <b>{side.unattributedCaptainBonus > 0 ? "+" : ""}{side.unattributedCaptainBonus}</b>
    </div>}
    <div className="historyRecapRosterTotal"><span>Confirmed team total</span><b>{side.score}</b></div>
  </div>;
}

export default function HistoryRecap({
  game,
  managers,
  lineups,
  pastGames,
}: {
  game: Game;
  managers: Manager[];
  lineups: HistoricalLineups | null;
  pastGames: Game[];
}) {
  const score1 = Number(game.manager1_score);
  const score2 = Number(game.manager2_score);
  const manager1 = managers.find((manager) => Number(manager.slot) === 1);
  const manager2 = managers.find((manager) => Number(manager.slot) === 2);
  const name1 = manager1?.club_name || "Manager 1";
  const name2 = manager2?.club_name || "Manager 2";
  const winner = score1 === score2 ? null : score1 > score2 ? name1 : name2;
  const margin = Math.abs(score1 - score2);
  const before = pastGames.filter((match) => Number(match.gameweek) < Number(game.gameweek) && match.status === "final");
  const record1 = before.filter((match) => Number(match.manager1_score) > Number(match.manager2_score)).length;
  const record2 = before.filter((match) => Number(match.manager2_score) > Number(match.manager1_score)).length;
  const draws = before.length - record1 - record2;

  return <>
    <Link className="historyRecapBack" href="/history">‹ All gameweek results</Link>
    <section className="card historyRecapHero">
      <div className="historyRecapTop"><span>GAMEWEEK {game.gameweek} · HOUSE DERBY</span><span className="historyRecapFinal">FINAL</span></div>
      <div className="historyRecapScoreboard">
        <div className="historyRecapClub"><strong>{name1}</strong><span>{manager1?.name || "Manager 1"}</span></div>
        <div className="historyRecapBigScore">{score1}<span>–</span>{score2}</div>
        <div className="historyRecapClub"><strong>{name2}</strong><span>{manager2?.name || "Manager 2"}</span></div>
      </div>
      <p className="historyRecapResult">{winner ? `${winner} won by ${margin} point${margin === 1 ? "" : "s"}` : "The derby finished in a draw"}</p>
    </section>

    <div className="historyRecapStats">
      <div><span>WINNING MARGIN</span><b>{margin}</b><small>points</small></div>
      <div><span>COMBINED SCORE</span><b>{score1 + score2}</b><small>SoccerTime points</small></div>
      <div><span>SERIES BEFORE GW {game.gameweek}</span><b>{record1}–{record2}</b><small>{draws} draw{draws === 1 ? "" : "s"}</small></div>
    </div>

    <h2 className="historyRecapHeading">Both teams · scoring recap</h2>
    <div className="historyRecapTeams">
      {([1, 2] as const).map((slot) => <section className="card historyRecapTeam" key={slot}>
        <div className="historyRecapTeamHeader">
          <div><span>MANAGER {slot}</span><h3>{slot === 1 ? name1 : name2}</h3></div>
          <div className="historyRecapTeamPoints"><b>{slot === 1 ? score1 : score2}</b><span>PTS</span></div>
        </div>
        {lineups ? <RecapRoster side={lineups[slot]} /> :
          <div className="historyRecapUnavailable">
            <strong>Team score verified</strong>
            <p>The final score is recorded, but a reliable player-by-player lineup for this Gameweek is not available in the current archive. SoccerTime won’t guess players or captain points.</p>
          </div>}
      </section>)}
    </div>
    <p className="historyRecapSource">Final totals come from the stored league result. Player rows appear only when SoccerTime can rebuild both rosters and reconcile every point, including captain bonuses.</p>
  </>;
}
