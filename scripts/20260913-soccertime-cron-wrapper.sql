-- Dedicated state/finalization functions for the single SoccerTime family league.
-- Both require the exact signed production Vercel workload through api.is_soccertime_workload().
-- The implementations operate directly on the private tables instead of nesting protected RPCs.

create or replace function api.soccertime_state()
returns jsonb
language sql
security definer
set search_path to 'api','auth','public'
as 'with l as (select * from api.leagues where id=''a96ae9f9-cd1a-4079-af67-1a8edc3ce331''::uuid), d as (select dr.* from api.drafts dr cross join l where dr.league_id=l.id order by (l.active_gameweek between dr.start_gameweek and dr.end_gameweek) desc, dr.round_no desc limit 1) select case when not api.is_soccertime_workload() then jsonb_build_object(''ok'',false,''error'',''Unauthorized'') when not exists(select 1 from l) then jsonb_build_object(''ok'',false,''error'',''League not found'') else (select jsonb_build_object(''ok'',true,''league'',to_jsonb(l),''managers'',(select coalesce(jsonb_agg(to_jsonb(m) order by m.slot),''[]''::jsonb) from api.managers m where m.league_id=l.id),''draft'',(select to_jsonb(d) from d),''picks'',coalesce((select jsonb_agg(jsonb_build_object(''pick_no'',p.pick_no,''manager_id'',p.manager_id,''player_id'',p.player_id,''player_name'',pl.name,''position'',pl.position,''team_name'',pl.team_name) order by p.pick_no) from api.draft_picks p join api.players pl on pl.api_id=p.player_id where p.draft_id=(select id from d)),''[]''::jsonb),''captains'',coalesce((select jsonb_agg(to_jsonb(c)) from api.captains c where c.league_id=l.id and c.gameweek=l.active_gameweek),''[]''::jsonb),''matchup'',(select to_jsonb(mu) from api.matchups mu where mu.league_id=l.id and mu.gameweek=l.active_gameweek),''matchups'',coalesce((select jsonb_agg(to_jsonb(mu) order by mu.gameweek desc) from api.matchups mu where mu.league_id=l.id),''[]''::jsonb),''round_results'',coalesce((select jsonb_agg(to_jsonb(rr) order by rr.round_no desc) from api.round_results rr where rr.league_id=l.id),''[]''::jsonb)) from l) end';

create or replace function api.finalize_soccertime_gameweek(
  p_gameweek integer,
  p_manager1_score numeric,
  p_manager2_score numeric
)
returns jsonb
language plpgsql
security definer
set search_path to 'api','auth','public'
as $$
declare
  l api.leagues%rowtype;
  mu api.matchups%rowtype;
  d api.drafts%rowtype;
  winner integer;
  next_gw integer;
  r1 integer;
  r2 integer;
  rd integer;
  rp1 numeric;
  rp2 numeric;
  next_round integer;
begin
  if not api.is_soccertime_workload() then
    return jsonb_build_object('ok',false,'error','Unauthorized');
  end if;

  select * into l
  from api.leagues
  where id='a96ae9f9-cd1a-4079-af67-1a8edc3ce331'::uuid
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','League not found');
  end if;

  if p_gameweek<>l.active_gameweek then
    return jsonb_build_object('ok',false,'error','Gameweek is not active');
  end if;

  select * into mu
  from api.matchups
  where league_id=l.id and gameweek=p_gameweek
  for update;

  if mu.status='final' then
    return jsonb_build_object('ok',true,'already_final',true);
  end if;

  if p_manager1_score>p_manager2_score then
    winner:=1;
  elsif p_manager2_score>p_manager1_score then
    winner:=2;
  else
    winner:=null;
  end if;

  insert into api.matchups(
    league_id,gameweek,manager1_score,manager2_score,status,winner_slot,finalized_at
  ) values(
    l.id,p_gameweek,p_manager1_score,p_manager2_score,'final',winner,now()
  )
  on conflict(league_id,gameweek) do update
  set manager1_score=excluded.manager1_score,
      manager2_score=excluded.manager2_score,
      status='final',
      winner_slot=excluded.winner_slot,
      finalized_at=now();

  update api.managers
  set fantasy_points=fantasy_points+case slot when 1 then p_manager1_score else p_manager2_score end,
      wins=wins+case when winner=slot then 1 else 0 end,
      losses=losses+case when winner is not null and winner<>slot then 1 else 0 end,
      draws=draws+case when winner is null then 1 else 0 end,
      table_points=table_points+case when winner=slot then 3 when winner is null then 1 else 0 end
  where league_id=l.id;

  select * into d
  from api.drafts
  where league_id=l.id and p_gameweek between start_gameweek and end_gameweek
  order by round_no desc
  limit 1;

  if d.id is not null and p_gameweek=d.end_gameweek then
    select count(*) filter(where winner_slot=1),
           count(*) filter(where winner_slot=2),
           count(*) filter(where winner_slot is null),
           coalesce(sum(manager1_score),0),
           coalesce(sum(manager2_score),0)
    into r1,r2,rd,rp1,rp2
    from api.matchups
    where league_id=l.id
      and gameweek between d.start_gameweek and d.end_gameweek
      and status='final';

    insert into api.round_results(
      league_id,round_no,winner_slot,manager1_wins,manager2_wins,draws,
      manager1_points,manager2_points,finalized_at
    ) values(
      l.id,d.round_no,
      case when r1>r2 then 1 when r2>r1 then 2 when rp1>rp2 then 1 when rp2>rp1 then 2 else null end,
      r1,r2,rd,rp1,rp2,now()
    )
    on conflict(league_id,round_no) do update
    set winner_slot=excluded.winner_slot,
        manager1_wins=excluded.manager1_wins,
        manager2_wins=excluded.manager2_wins,
        draws=excluded.draws,
        manager1_points=excluded.manager1_points,
        manager2_points=excluded.manager2_points,
        finalized_at=now();

    next_gw:=p_gameweek+1;
    if next_gw<=38 then
      next_round:=d.round_no+1;
      insert into api.drafts(
        league_id,round_no,start_gameweek,end_gameweek,first_slot,current_pick,status
      ) values(
        l.id,next_round,next_gw,least(next_gw+l.round_length-1,38),
        case when d.first_slot=1 then 2 else 1 end,1,'open'
      )
      on conflict(league_id,round_no) do nothing;
    end if;
  else
    next_gw:=p_gameweek+1;
  end if;

  if next_gw<=38 then
    update api.leagues set active_gameweek=next_gw where id=l.id;
    insert into api.matchups(league_id,gameweek,status)
    values(l.id,next_gw,'scheduled')
    on conflict(league_id,gameweek) do nothing;
  end if;

  return jsonb_build_object(
    'ok',true,
    'winner_slot',winner,
    'next_gameweek',case when next_gw<=38 then next_gw else null end
  );
end
$$;

revoke execute on function api.soccertime_state() from public;
revoke execute on function api.finalize_soccertime_gameweek(integer,numeric,numeric) from public;
grant execute on function api.soccertime_state() to anonymous, "soccer-time";
grant execute on function api.finalize_soccertime_gameweek(integer,numeric,numeric) to anonymous, "soccer-time";
