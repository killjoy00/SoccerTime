import {NextResponse} from "next/server";

export const revalidate=900;
const BASE="https://fantasy.premierleague.com/api";

async function get(path:string){
  const response=await fetch(`${BASE}${path}`,{headers:{"user-agent":"SoccerTime family fantasy app"},next:{revalidate:900}});
  if(!response.ok)throw new Error(`FPL ${path}: ${response.status}`);
  return response.json();
}

export async function GET(){
  try{
    const [bootstrap,rawFixtures]=await Promise.all([get("/bootstrap-static/"),get("/fixtures/")]);
    const teams=new Map<number,any>(bootstrap.teams.map((team:any)=>[team.id,team]));
    const position=new Map<number,string>(bootstrap.element_types.map((type:any)=>[type.id,type.singular_name_short==="GKP"?"GK":type.singular_name_short]));
    const current=bootstrap.events.find((event:any)=>event.is_current)||bootstrap.events.find((event:any)=>event.is_next)||bootstrap.events.find((event:any)=>!event.finished)||bootstrap.events.at(-1);
    const finishedEvents=bootstrap.events.filter((event:any)=>event.finished&&event.data_checked).map((event:any)=>event.id);
    const players=bootstrap.elements.map((player:any)=>({
      id:player.id,code:player.code,name:player.web_name,firstName:player.first_name,lastName:player.second_name,
      team:teams.get(player.team)?.name||"",teamId:player.team,position:position.get(player.element_type)||"MID",
      total:Number(player.total_points||0),recent:[],form:Number(player.form||0),pointsPerGame:Number(player.points_per_game||0),
      status:player.status,news:player.news||"",chanceOfPlayingNextRound:player.chance_of_playing_next_round,photo:null,
    }));
    const fixtures=rawFixtures.map((fixture:any)=>({
      id:fixture.id,event:fixture.event,kickoff:fixture.kickoff_time,started:Boolean(fixture.started),finished:Boolean(fixture.finished),
      home:{id:fixture.team_h,name:teams.get(fixture.team_h)?.name||"",shortName:teams.get(fixture.team_h)?.short_name||"",goals:fixture.team_h_score},
      away:{id:fixture.team_a,name:teams.get(fixture.team_a)?.name||"",shortName:teams.get(fixture.team_a)?.short_name||"",goals:fixture.team_a_score},
    }));
    return NextResponse.json({provider:"official-fpl-public-api",updatedAt:new Date().toISOString(),currentEvent:current?.id||1,finishedEvents,players,fixtures,scores:{}});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"FPL catalog unavailable"},{status:502});
  }
}
