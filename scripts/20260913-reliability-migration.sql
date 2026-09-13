begin;

create table if not exists api.manager_devices (
  manager_id uuid primary key references api.managers(id) on delete cascade,
  token_hash text not null,
  claimed_at timestamptz not null default now()
);

revoke all on table api.manager_devices from public;
revoke all on table api.manager_devices from anonymous;
revoke all on table api.manager_devices from "soccer-time";

create or replace function api.claim_manager_device(
  p_code text,
  p_slot integer,
  p_device_token text
) returns jsonb
language plpgsql
security definer
set search_path to 'api', 'public'
as $function$
declare
  m_id uuid;
  wanted_hash text;
  current_hash text;
begin
  if p_slot not in (1,2) then
    return jsonb_build_object('ok',false,'error','Invalid manager slot');
  end if;
  if length(coalesce(p_device_token,'')) < 32 then
    return jsonb_build_object('ok',false,'error','Invalid device identity');
  end if;

  select m.id into m_id
  from api.managers m
  join api.leagues l on l.id=m.league_id
  where l.join_code=p_code and m.slot=p_slot;

  if m_id is null then
    return jsonb_build_object('ok',false,'error','League or manager not found');
  end if;

  wanted_hash := md5(m_id::text || ':' || p_device_token);
  insert into api.manager_devices(manager_id,token_hash)
  values(m_id,wanted_hash)
  on conflict(manager_id) do nothing;

  select token_hash into current_hash
  from api.manager_devices
  where manager_id=m_id;

  if current_hash=wanted_hash then
    return jsonb_build_object('ok',true,'claimed',true);
  end if;

  return jsonb_build_object('ok',false,'error','This manager is already linked to another device');
end
$function$;

create or replace function api.authorize_manager_device(
  p_code text,
  p_slot integer,
  p_device_token text
) returns jsonb
language plpgsql
security definer
set search_path to 'api', 'public'
as $function$
declare
  m_id uuid;
  wanted_hash text;
  current_hash text;
begin
  if p_slot not in (1,2) or length(coalesce(p_device_token,'')) < 32 then
    return jsonb_build_object('ok',false,'error','Invalid device identity');
  end if;

  select m.id into m_id
  from api.managers m
  join api.leagues l on l.id=m.league_id
  where l.join_code=p_code and m.slot=p_slot;

  if m_id is null then
    return jsonb_build_object('ok',false,'error','League or manager not found');
  end if;

  wanted_hash := md5(m_id::text || ':' || p_device_token);
  select token_hash into current_hash
  from api.manager_devices
  where manager_id=m_id;

  if current_hash=wanted_hash then
    return jsonb_build_object('ok',true);
  end if;

  return jsonb_build_object('ok',false,'error','This device is not authorized for that manager');
end
$function$;

create or replace function api.active_leagues()
returns jsonb
language sql
security definer
set search_path to 'api', 'public'
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'code', l.join_code,
        'active_gameweek', l.active_gameweek
      ) order by l.created_at
    ),
    '[]'::jsonb
  )
  from api.leagues l
  where l.active_gameweek between 1 and 38;
$function$;

create or replace function api.league_state(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'api', 'public'
as $function$
declare
  l api.leagues%rowtype;
  d api.drafts%rowtype;
  result jsonb;
begin
  select * into l from api.leagues where join_code=p_code;
  if not found then
    return jsonb_build_object('ok',false,'error','League not found');
  end if;

  select * into d
  from api.drafts
  where league_id=l.id and l.active_gameweek between start_gameweek and end_gameweek
  order by round_no desc
  limit 1;

  if d.id is null then
    select * into d
    from api.drafts
    where league_id=l.id
    order by round_no desc
    limit 1;
  end if;

  select jsonb_build_object(
    'ok',true,
    'league',to_jsonb(l),
    'managers',(
      select coalesce(jsonb_agg(to_jsonb(m) order by m.slot),'[]'::jsonb)
      from api.managers m where m.league_id=l.id
    ),
    'draft',case when d.id is null then null else to_jsonb(d) end,
    'picks',case when d.id is null then '[]'::jsonb else (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'pick_no',p.pick_no,
          'manager_id',p.manager_id,
          'player_id',p.player_id,
          'player_name',pl.name,
          'position',pl.position,
          'team_name',pl.team_name
        ) order by p.pick_no
      ),'[]'::jsonb)
      from api.draft_picks p
      join api.players pl on pl.api_id=p.player_id
      where p.draft_id=d.id
    ) end,
    'captains',(
      select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb)
      from api.captains c
      where c.league_id=l.id and c.gameweek=l.active_gameweek
    ),
    'matchup',(
      select to_jsonb(mu)
      from api.matchups mu
      where mu.league_id=l.id and mu.gameweek=l.active_gameweek
    ),
    'matchups',(
      select coalesce(jsonb_agg(to_jsonb(mu) order by mu.gameweek desc),'[]'::jsonb)
      from api.matchups mu where mu.league_id=l.id
    ),
    'round_results',(
      select coalesce(jsonb_agg(to_jsonb(rr) order by rr.round_no desc),'[]'::jsonb)
      from api.round_results rr where rr.league_id=l.id
    ),
    'roster_moves',(
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id',rm.id,
          'gameweek',rm.gameweek,
          'manager_id',rm.manager_id,
          'dropped_player_id',rm.dropped_player_id,
          'dropped_player_name',dropped.name,
          'added_player_id',rm.added_player_id,
          'added_player_name',added.name,
          'moved_at',rm.moved_at
        ) order by rm.moved_at desc
      ),'[]'::jsonb)
      from api.roster_moves rm
      left join api.players dropped on dropped.api_id=rm.dropped_player_id
      left join api.players added on added.api_id=rm.added_player_id
      where rm.league_id=l.id
    )
  ) into result;

  return result;
end
$function$;

revoke execute on all functions in schema api from public;
revoke execute on all functions in schema api from anonymous;
revoke execute on all functions in schema api from "soccer-time";

alter default privileges in schema api revoke execute on functions from public;

grant usage on schema api to "soccer-time";
grant execute on function api.league_state(text) to "soccer-time";
grant execute on function api.draft_pick(text,integer,integer,text,text,text,text) to "soccer-time";
grant execute on function api.set_captain(text,integer,integer,integer) to "soccer-time";
grant execute on function api.pickup_player(text,integer,integer,integer,integer,text,text,text,text) to "soccer-time";
grant execute on function api.save_manager(text,integer,text,text) to "soccer-time";
grant execute on function api.finalize_gameweek(text,integer,numeric,numeric) to "soccer-time";
grant execute on function api.claim_manager_device(text,integer,text) to "soccer-time";
grant execute on function api.authorize_manager_device(text,integer,text) to "soccer-time";
grant execute on function api.active_leagues() to "soccer-time";

commit;
