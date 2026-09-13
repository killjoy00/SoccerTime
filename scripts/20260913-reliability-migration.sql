create or replace function api.roster_moves_state(p_code text)
returns jsonb
language sql
security definer
set search_path to 'api','public'
as 'select case when not exists(select 1 from api.leagues l where l.join_code=p_code) then jsonb_build_object(''ok'',false,''error'',''League not found'') else jsonb_build_object(''ok'',true,''moves'',coalesce((select jsonb_agg(jsonb_build_object(''id'',rm.id,''gameweek'',rm.gameweek,''manager_id'',rm.manager_id,''dropped_player_name'',dropped.name,''added_player_name'',added.name,''moved_at'',rm.moved_at) order by rm.moved_at desc) from api.roster_moves rm left join api.players dropped on dropped.api_id=rm.dropped_player_id left join api.players added on added.api_id=rm.added_player_id where rm.league_id=(select id from api.leagues where join_code=p_code)),''[]''::jsonb)) end';

create or replace function api.league_state_by_id(p_league_id uuid)
returns jsonb
language sql
security definer
set search_path to 'api','public'
as 'select coalesce((select api.league_state(l.join_code) from api.leagues l where l.id=p_league_id),jsonb_build_object(''ok'',false,''error'',''League not found''))';

create or replace function api.finalize_gameweek_by_id(
  p_league_id uuid,
  p_gameweek integer,
  p_manager1_score numeric,
  p_manager2_score numeric
)
returns jsonb
language sql
security definer
set search_path to 'api','public'
as 'select coalesce((select api.finalize_gameweek(l.join_code,p_gameweek,p_manager1_score,p_manager2_score) from api.leagues l where l.id=p_league_id),jsonb_build_object(''ok'',false,''error'',''League not found''))';

revoke execute on all functions in schema api from public;
revoke execute on all functions in schema api from anonymous;
revoke execute on all functions in schema api from "soccer-time";
alter default privileges in schema api revoke execute on functions from public;

grant usage on schema api to "soccer-time";
grant execute on function api.league_state(text) to "soccer-time";
grant execute on function api.roster_moves_state(text) to "soccer-time";
grant execute on function api.draft_pick(text,integer,integer,text,text,text,text) to "soccer-time";
grant execute on function api.set_captain(text,integer,integer,integer) to "soccer-time";
grant execute on function api.pickup_player(text,integer,integer,integer,integer,text,text,text,text) to "soccer-time";
grant execute on function api.save_manager(text,integer,text,text) to "soccer-time";
grant execute on function api.league_state_by_id(uuid) to "soccer-time";
grant execute on function api.finalize_gameweek_by_id(uuid,integer,numeric,numeric) to "soccer-time";
