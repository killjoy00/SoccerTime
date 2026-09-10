import {NextRequest,NextResponse} from "next/server";

export const revalidate=60;

export async function GET(request:NextRequest){
  const raw=Number(request.nextUrl.searchParams.get("gw"));
  const gw=Number.isInteger(raw)&&raw>=1&&raw<=38?raw:null;
  if(!gw)return NextResponse.json({error:"Invalid gameweek"},{status:400});
  const response=await fetch(`https://fantasy.premierleague.com/api/event/${gw}/live/`,{
    headers:{"user-agent":"SoccerTime family fantasy app"},
    next:{revalidate:60},
  });
  if(!response.ok)return NextResponse.json({error:"FPL live feed unavailable"},{status:502});
  const data=await response.json();
  const scores=Object.fromEntries((data.elements||[]).map((element:any)=>[String(element.id),Number(element.stats?.total_points||0)]));
  return NextResponse.json({gw,scores,updatedAt:new Date().toISOString()});
}
