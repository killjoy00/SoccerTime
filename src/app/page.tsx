"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import {rpc} from "@/lib/neon";

type Player={
  id:number;
  code?:number;
  name:string;
  firstName?:string;
  lastName?:string;
  photo?:string|null;
  team:string;
  teamId?:number;
  position:string;
  total:number;
  recent:number[];
  form?:number;
  pointsPerGame?:number;
  status?:string;
  news?:string;
  chanceOfPlayingNextRound?:number|null;
};
type Fixture={id:number;event:number|null;kickoff:string|null;started:boolean;finished:boolean;home:{id:number;name:string;shortName:string;goals:number|null};away:{id:number;name:string;shortName:string;goals:number|null}};
type Data={updatedAt:string|null;currentEvent?:number;finishedEvents?:number[];players:Player[];fixtures:Fixture[];scores:Record<string,Record<string,number>>};

const EMPTY:Data={updatedAt:null,players:[],fixtures:[],scores:{}};
const positions=["GK","DEF","MID","FWD"];

function expectedSlot(pick:number,first:number){
  const pair=Math.floor((pick-1)/2);
  return pair%2===0?(pick%2?first:3-first):(pick%2?3-first:first);
}

export default function Home(){
  const [tab,setTab]=useState("match");
  const [code,setCode]=useState("");
  const [slot,setSlot]=useState(1);
  const [state,setState]=useState<any>(null);
  const [data,setData]=useState<Data>(EMPTY);
  const [liveScores,setLiveScores]=useState<Record<string,number>>({});
  const [liveAt,setLiveAt]=useState<string|null>(null);
  const [msg,setMsg]=useState("");
  const [query,setQuery]=useState("");
  const [pos,setPos]=useState("ALL");
  const [finalizing,setFinalizing]=useState(false);

  const load=useCallback(async(c:string,selectedSlot:number)=>{
    try{
      const x=await rpc("league_state",{p_code:c.trim()});
      setState(x);
      if(x.ok){
        localStorage.setItem("soccertime-code",c.trim());
        localStorage.setItem("soccertime-slot",String(selectedSlot));
        setMsg("");
      }else setMsg(x.error||"League not found");
    }catch(error:any){setMsg(error.message||"Could not reach the league database")}
  },[]);

  useEffect(()=>{
    const savedCode=localStorage.getItem("soccertime-code")||"";
    const savedSlot=Number(localStorage.getItem("soccertime-slot")||1);
    setCode(savedCode);
    setSlot(savedSlot);
    fetch("/data/epl.json",{cache:"no-store"}).then(r=>r.json()).then(setData).catch(()=>setMsg("Premier League feed is temporarily unavailable."));
    if(savedCode)load(savedCode,savedSlot);
  },[load]);

  const managers=state?.managers||[];
  const me=managers.find((m:any)=>m.slot===slot);
  const opponent=managers.find((m:any)=>m.slot!==slot);
  const manager1=managers.find((m:any)=>m.slot===1);
  const manager2=managers.find((m:any)=>m.slot===2);
  const picks=state?.picks||[];
  const mine=picks.filter((p:any)=>p.manager_id===me?.id);
  const theirs=picks.filter((p:any)=>p.manager_id===opponent?.id);
  const gw=Number(state?.league?.active_gameweek||4);
  const roundNo=Number(state?.draft?.round_no||1);
  const roundStart=Number(state?.draft?.start_gameweek||gw);
  const roundEnd=Number(state?.draft?.end_gameweek||Math.min(gw+3,38));

  const refreshLive=useCallback(async()=>{
    if(!state?.ok)return;
    try{
      const response=await fetch(`/api/live?gw=${gw}`,{cache:"no-store"});
      if(!response.ok)return;
      const result=await response.json();
      setLiveScores(result.scores||{});
      setLiveAt(result.updatedAt||null);
    }catch{}
  },[gw,state?.ok]);

  useEffect(()=>{
    if(!state?.ok)return;
    refreshLive();
    const id=window.setInterval(refreshLive,60000);
    return()=>window.clearInterval(id);
  },[refreshLive,state?.ok]);

  const baseScore=useCallback((playerId:number)=>{
    const key=String(playerId);
    if(Object.prototype.hasOwnProperty.call(liveScores,key))return Number(liveScores[key]||0);
    return Number(data.scores?.[String(gw)]?.[key]||0);
  },[data.scores,gw,liveScores]);

  const scoreFor=useCallback((pick:any)=>{
    const base=baseScore(pick.player_id);
    const captain=(state?.captains||[]).some((c:any)=>c.manager_id===pick.manager_id&&c.player_id===pick.player_id);
    return base*(captain?2:1);
  },[baseScore,state?.captains]);

  const scoreBySlot=useCallback((managerSlot:number)=>{
    const manager=managers.find((m:any)=>m.slot===managerSlot);
    if(!manager)return 0;
    return picks.filter((p:any)=>p.manager_id===manager.id).reduce((sum:number,p:any)=>sum+scoreFor(p),0);
  },[managers,picks,scoreFor]);

  const myScore=scoreBySlot(slot);
  const theirScore=scoreBySlot(slot===1?2:1);

  useEffect(()=>{
    const confirmed=data.finishedEvents?.includes(gw);
    if(!confirmed||!state?.ok||state?.matchup?.status==="final"||picks.length!==16||finalizing)return;
    setFinalizing(true);
    rpc("finalize_gameweek",{
      p_code:code,
      p_gameweek:gw,
      p_manager1_score:scoreBySlot(1),
      p_manager2_score:scoreBySlot(2),
    }).then(()=>load(code,slot)).catch(()=>{}).finally(()=>setFinalizing(false));
  },[code,data.finishedEvents,finalizing,gw,load,picks.length,scoreBySlot,slot,state?.matchup?.status,state?.ok]);

  const drafted=new Set(picks.map((p:any)=>p.player_id));
  const filtered=useMemo(()=>data.players
    .filter(player=>player.status!=="u")
    .filter(player=>!drafted.has(player.id))
    .filter(player=>pos==="ALL"||player.position===pos)
    .filter(player=>!query||`${player.name} ${player.firstName||""} ${player.lastName||""} ${player.team}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a,b)=>b.total-a.total||b.form!-a.form!),[data.players,drafted,pos,query]);

  const nextFixtures=useCallback((player:Player)=>{
    if(!player.teamId)return "";
    return data.fixtures
      .filter(f=>f.event&&f.event>=roundStart&&f.event<=roundEnd&&(f.home.id===player.teamId||f.away.id===player.teamId))
      .sort((a,b)=>Number(a.event)-Number(b.event))
      .map(f=>f.home.id===player.teamId?`${f.away.shortName} H`:`${f.home.shortName} A`)
      .join(" · ");
  },[data.fixtures,roundEnd,roundStart]);

  async function draft(player:Player){
    setMsg("");
    try{
      const result=await rpc("draft_pick",{p_code:code,p_slot:slot,p_player_id:player.id,p_name:player.name,p_position:player.position,p_team_name:player.team,p_photo:player.photo||null});
      if(!result.ok)setMsg(result.error);
      await load(code,slot);
    }catch(error:any){setMsg(error.message||"Draft pick failed")}
  }

  async function captain(pick:any){
    setMsg("");
    try{
      const result=await rpc("set_captain",{p_code:code,p_slot:slot,p_gameweek:gw,p_player_id:pick.player_id});
      if(!result.ok)setMsg(result.error);
      await load(code,slot);
    }catch(error:any){setMsg(error.message||"Captain update failed")}
  }

  async function saveManager(managerSlot:number,name:string,clubName:string){
    const result=await rpc("save_manager",{p_code:code,p_slot:managerSlot,p_name:name,p_club_name:clubName});
    if(!result.ok)setMsg(result.error);
    await load(code,slot);
  }

  if(!state?.ok)return <main className="shell">
    <header className="mast"><div className="brand">Soccer<span>Time</span></div><span className="pill">HOUSE DERBY</span></header>
    <section className="card setup">
      <div className="eyebrow">Two players. One house. All season.</div>
      <h2>Enter your family league</h2>
      <p className="sub">Use the same private code on both phones, then choose your side. SoccerTime remembers the device.</p>
      <label>League code</label><input value={code} onChange={e=>setCode(e.target.value)} placeholder="family league code" autoCapitalize="none"/>
      <label>I am</label><select value={slot} onChange={e=>setSlot(Number(e.target.value))}><option value={1}>Manager 1</option><option value={2}>Manager 2</option></select>
      {msg&&<p className="banner error">{msg}</p>}
      <button className="btn" onClick={()=>load(code,slot)}>Enter SoccerTime</button>
    </section>
  </main>;

  return <>
    <main className="shell">
      <header className="mast"><div className="brand">Soccer<span>Time</span></div><span className="pill">GW {gw} · ROUND {roundNo}</span></header>
      {msg&&<div className="banner error">{msg}</div>}

      {tab==="match"&&<>
        <section className="card hero">
          <div className="eyebrow">Gameweek {gw} · House Derby</div>
          <div className="scoreline">
            <div className="club"><strong>{me?.club_name}</strong><span className="sub">{me?.name}</span></div>
            <div className="score">{myScore}<small>–</small>{theirScore}</div>
            <div className="club"><strong>{opponent?.club_name}</strong><span className="sub">{opponent?.name}</span></div>
          </div>
          <p className="sub" style={{textAlign:"center",marginBottom:0}}>{liveAt?`Live scoring checked ${new Date(liveAt).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}`:data.updatedAt?`League data synced ${new Date(data.updatedAt).toLocaleString()}`:"Premier League data loading"}</p>
        </section>
        <div className="grid2">
          <div className="card stat"><span className="tiny">YOUR RECORD</span><b>{me?.wins}-{me?.draws}-{me?.losses}</b><span className="sub">{me?.table_points} table pts</span></div>
          <div className="card stat"><span className="tiny">ROUND {roundNo}</span><b>GW {roundStart}–{roundEnd}</b><span className="sub">Redraft after {roundEnd}</span></div>
        </div>
        {state?.draft?.status==="open"&&<div className="banner">Round {roundNo} draft is open. {picks.length}/16 picks complete.</div>}
        <Fixtures fixtures={data.fixtures.filter(f=>f.event===gw)}/>
        <Roster title={me?.club_name} picks={mine} scoreFor={scoreFor} caps={state.captains}/>
        <Roster title={opponent?.club_name} picks={theirs} scoreFor={scoreFor} caps={state.captains}/>
      </>}

      {tab==="squad"&&<>
        <h2>{me?.club_name}</h2><p className="sub">All eight players score each Gameweek. Your captain scores double.</p>
        <Roster title="Your squad" picks={mine} scoreFor={scoreFor} caps={state.captains} captain={captain}/>
        <section className="card"><div className="eyebrow">Round schedule</div>{mine.length?mine.map((pick:any)=>{const player=data.players.find(p=>p.id===pick.player_id);return <div className="row" key={pick.player_id}><div className="grow"><div className="name">{pick.player_name}</div><div className="meta">{player?nextFixtures(player):"Fixtures loading"}</div></div></div>}):<div className="empty">Draft your Round {roundNo} squad first.</div>}</section>
      </>}

      {tab==="draft"&&<>
        <div className="draftbar"><div className="eyebrow">Round {roundNo} · GW {roundStart}–{roundEnd}</div><h3>{state.draft?.status==="complete"?"Draft complete":`Pick ${state.draft?.current_pick||1} · ${managers.find((m:any)=>m.slot===expectedSlot(state.draft?.current_pick||1,state.draft?.first_slot||1))?.name}'s turn`}</h3><span className="sub">8 each · 1 GK · 2 DEF · 3 MID · 2 FWD · exclusive ownership</span></div>
        <div className="filters"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search players or clubs"/><select value={pos} onChange={e=>setPos(e.target.value)}><option value="ALL">ALL</option>{positions.map(value=><option key={value}>{value}</option>)}</select></div>
        {data.players.length===0?<div className="card empty">Current Premier League player feed is syncing. The draft room will populate automatically.</div>:<section className="card">{filtered.slice(0,140).map(player=><div className="row" key={player.id}><div className="avatar" aria-hidden="true" style={{display:"grid",placeItems:"center",fontWeight:900}}>{player.name.slice(0,1)}</div><div className="grow"><div className="name">{player.name}{player.status&&player.status!=="a"?" ⚠":""}</div><div className="meta"><span className="pos">{player.position}</span>{player.team} · {player.total} pts · form {player.form??0}</div><div className="tiny">{player.news||nextFixtures(player)}</div></div><button className="btn" disabled={state.draft?.status!=="open"||expectedSlot(state.draft?.current_pick||1,state.draft?.first_slot||1)!==slot} onClick={()=>draft(player)}>Draft</button></div>)}</section>}
      </>}

      {tab==="players"&&<>
        <h2>Premier League players</h2><p className="sub">Current FPL points are used as the live scoring source. Injuries and availability come from the same current-season feed.</p>
        <div className="filters"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search players or clubs"/><select value={pos} onChange={e=>setPos(e.target.value)}><option value="ALL">ALL</option>{positions.map(value=><option key={value}>{value}</option>)}</select></div>
        <section className="card">{data.players.filter(p=>p.status!=="u").filter(p=>(pos==="ALL"||p.position===pos)&&(!query||`${p.name} ${p.team}`.toLowerCase().includes(query.toLowerCase()))).sort((a,b)=>b.total-a.total).slice(0,160).map(player=><div className="row" key={player.id}><div className="avatar" aria-hidden="true" style={{display:"grid",placeItems:"center",fontWeight:900}}>{player.name.slice(0,1)}</div><div className="grow"><div className="name">{player.name}{player.status&&player.status!=="a"?" ⚠":""}</div><div className="meta"><span className="pos">{player.position}</span>{player.team} · form {player.form??0}</div><div className="tiny">{player.news||nextFixtures(player)}</div></div><div className="pts">{player.total}</div></div>)}</section>
      </>}

      {tab==="league"&&<>
        <h2>Season table</h2>
        <section className="card">{[...managers].sort((a:any,b:any)=>b.table_points-a.table_points||Number(b.fantasy_points)-Number(a.fantasy_points)).map((manager:any,index:number)=><div className="row" key={manager.id}><div className="pts">{index+1}</div><div className="grow"><div className="name">{manager.club_name}</div><div className="meta">{manager.wins}W · {manager.draws}D · {manager.losses}L · {manager.fantasy_points} fantasy pts</div></div><div className="pts">{manager.table_points}</div></div>)}</section>
        <h2>Round champions</h2>
        <section className="card">{(state.round_results||[]).length?(state.round_results||[]).map((result:any)=>{const winner=managers.find((m:any)=>m.slot===result.winner_slot);return <div className="row" key={result.round_no}><div className="pts">🏆</div><div className="grow"><div className="name">Round {result.round_no}: {winner?.club_name||"Shared"}</div><div className="meta">{result.manager1_wins}–{result.manager2_wins} in weekly wins · {result.manager1_points}–{result.manager2_points} fantasy pts</div></div></div>}):<div className="empty">Your first Round champion will appear after GW {roundEnd}.</div>}</section>
        <h2>Match history</h2>
        <section className="card">{(state.matchups||[]).filter((m:any)=>m.status==="final").length?(state.matchups||[]).filter((m:any)=>m.status==="final").map((match:any)=><div className="row" key={match.gameweek}><div className="grow"><div className="name">Gameweek {match.gameweek}</div><div className="meta">{manager1?.club_name} {match.manager1_score} – {match.manager2_score} {manager2?.club_name}</div></div></div>):<div className="empty">No House Derby results yet.</div>}</section>
        <h2>Club names</h2>
        <ManagerEditor manager={manager1} onSave={(name,club)=>saveManager(1,name,club)}/>
        <ManagerEditor manager={manager2} onSave={(name,club)=>saveManager(2,name,club)}/>
        <section className="card"><div className="eyebrow">Format</div><h3>Four-Gameweek rounds</h3><p className="sub">Fresh exclusive snake draft every four Gameweeks. Weekly wins earn 3 table points and draws earn 1. Round champions and the full-season champion are both kept in your family history.</p></section>
      </>}
    </main>
    <nav className="bottom"><div className="bottomin">{[["match","⚽","Match"],["squad","♟","Squad"],["draft","↻","Draft"],["players","◎","Players"],["league","🏆","League"]].map(([id,icon,label])=><button key={id} className={`nav ${tab===id?"active":""}`} onClick={()=>setTab(id)}><b>{icon}</b>{label}</button>)}</div></nav>
  </>;
}

function Roster({title,picks,scoreFor,caps,captain}:{title:string;picks:any[];scoreFor:(p:any)=>number;caps:any[];captain?:(p:any)=>void}){
  return <section className="card"><h3>{title}</h3>{picks.length===0?<div className="empty">No players drafted yet.</div>:picks.map(p=>{const isCaptain=caps?.some((c:any)=>c.manager_id===p.manager_id&&c.player_id===p.player_id);return <div className="row" key={p.pick_no}><div className="grow"><div className="name">{p.player_name} {isCaptain&&"©"}</div><div className="meta"><span className="pos">{p.position}</span>{p.team_name} · Pick {p.pick_no}</div></div><div className="pts">{scoreFor(p)}</div>{captain&&<button className="btn secondary" onClick={()=>captain(p)}>{isCaptain?"Captain":"Make C"}</button>}</div>})}</section>;
}

function Fixtures({fixtures}:{fixtures:Fixture[]}){
  if(!fixtures.length)return null;
  return <section className="card"><div className="eyebrow">Premier League · Gameweek fixtures</div>{fixtures.map(f=><div className="row" key={f.id}><div className="grow"><div className="name">{f.home.shortName} {f.started&&f.home.goals!==null?f.home.goals:""} {f.started?"–":"vs"} {f.started&&f.away.goals!==null?f.away.goals:""} {f.away.shortName}</div><div className="meta">{f.finished?"Final":f.started?"Live":f.kickoff?new Date(f.kickoff).toLocaleString([], {weekday:"short",hour:"numeric",minute:"2-digit"}):"TBD"}</div></div></div>)}</section>;
}

function ManagerEditor({manager,onSave}:{manager:any;onSave:(name:string,club:string)=>Promise<void>}){
  const [name,setName]=useState(manager?.name||"");
  const [club,setClub]=useState(manager?.club_name||"");
  useEffect(()=>{setName(manager?.name||"");setClub(manager?.club_name||"")},[manager?.name,manager?.club_name]);
  return <section className="card setup"><div className="eyebrow">Manager {manager?.slot}</div><label>Manager name</label><input value={name} onChange={e=>setName(e.target.value)} maxLength={40}/><label>Club name</label><input value={club} onChange={e=>setClub(e.target.value)} maxLength={60}/><button className="btn secondary" disabled={!name.trim()||!club.trim()} onClick={()=>onSave(name.trim(),club.trim())}>Save names</button></section>;
}
