-- Carry the previous Gameweek captain forward when the manager has not
-- selected a captain for the active Gameweek and the previous captain is
-- still on that manager's completed current-round roster.
--
-- Explicit captain choices are never overwritten. If the previous captain
-- is no longer rostered, no default is created.

create or replace function api.league_state(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'api','public'
as $function$
declare
  l api.leagues%rowtype;
  d api.drafts%rowtype;
  result jsonb;
begin
  select * into l
  from api.leagues
  where join_code=p_code;

  if not found then
    return jsonb_build_object('ok',false,'error','League not found');
  end if;

  select * into d
  from api.drafts
  where league_id=l.id
    and l.active_gameweek between start_gameweek and end_gameweek
  order by round_no desc
  limit 1;

  if d.id is null then
    select * into d
    from api.drafts
    where league_id=l.id
    order by round_no desc
    limit 1;
  end if;

  if d.id is not null and d.status='complete' and l.active_gameweek>1 then
    insert into api.captains(league_id,gameweek,manager_id,player_id)
    select l.id,l.active_gameweek,m.id,previous.player_id
    from api.managers m
    join api.captains previous
      on previous.league_id=l.id
     and previous.manager_id=m.id
     and previous.gameweek=l.active_gameweek-1
    join api.draft_picks roster
      on roster.draft_id=d.id
     and roster.manager_id=m.id
     and roster.player_id=previous.player_id
    left join api.captains current
      on current.league_id=l.id
     and current.gameweek=l.active_gameweek
     and current.manager_id=m.id
    where m.league_id=l.id
      and current.manager_id is null
    on conflict(league_id,gameweek,manager_id) do nothing;
  end if;

  select jsonb_build_object(
    'ok',true,
    'league',to_jsonb(l),
    'managers',(select coalesce(jsonb_agg(to_jsonb(m) order by m.slot),'[]'::jsonb) from api.managers m where m.league_id=l.id),
    'draft',case when d.id is null then null else to_jsonb(d) end,
    'picks',case when d.id is null then '[]'::jsonb else (
      select coalesce(jsonb_agg(jsonb_build_object(
        'pick_no',p.pick_no,
        'manager_id',p.manager_id,
        'player_id',p.player_id,
        'player_name',pl.name,
        'position',pl.position,
        'team_name',pl.team_name
      ) order by p.pick_no),'[]'::jsonb)
      from api.draft_picks p
      join api.players pl on pl.api_id=p.player_id
      where p.draft_id=d.id
    ) end,
    'captains',(select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) from api.captains c where c.league_id=l.id and c.gameweek=l.active_gameweek),
    'matchup',(select to_jsonb(mu) from api.matchups mu where mu.league_id=l.id and mu.gameweek=l.active_gameweek),
    'matchups',(select coalesce(jsonb_agg(to_jsonb(mu) order by mu.gameweek desc),'[]'::jsonb) from api.matchups mu where mu.league_id=l.id),
    'round_results',(select coalesce(jsonb_agg(to_jsonb(rr) order by rr.round_no desc),'[]'::jsonb) from api.round_results rr where rr.league_id=l.id)
  ) into result;

  return result;
end
$function$;
