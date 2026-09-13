-- Data API fallback authorization for Vercel OIDC.
-- The Data API requires a valid JWT from the configured Vercel JWKS/audience.
-- These wrappers additionally require the exact signed production SoccerTime subject.

create or replace function api.is_soccertime_workload()
returns boolean
language sql
stable
security definer
set search_path to 'api','auth','public'
as 'select coalesce(auth.user_id(),'''')=''owner:killjoy00s-projects:project:soccer-time:environment:production''';

create or replace function api.roster_moves_state(p_code text)
returns jsonb
language sql
security definer
set search_path to 'api','auth','public'
as 'select case when not api.is_soccertime_workload() then jsonb_build_object(''ok'',false,''error'',''Unauthorized'') when not exists(select 1 from api.leagues l where l.join_code=p_code) then jsonb_build_object(''ok'',false,''error'',''League not found'') else jsonb_build_object(''ok'',true,''moves'',coalesce((select jsonb_agg(jsonb_build_object(''id'',rm.id,''gameweek'',rm.gameweek,''manager_id'',rm.manager_id,''dropped_player_name'',dropped.name,''added_player_name'',added.name,''moved_at'',rm.moved_at) order by rm.moved_at desc) from api.roster_moves rm left join api.players dropped on dropped.api_id=rm.dropped_player_id left join api.players added on added.api_id=rm.added_player_id where rm.league_id=(select id from api.leagues where join_code=p_code)),''[]''::jsonb)) end';

create or replace function api.league_state_by_id(p_league_id uuid)
returns jsonb
language sql
security definer
set search_path to 'api','auth','public'
as 'select case when not api.is_soccertime_workload() then jsonb_build_object(''ok'',false,''error'',''Unauthorized'') else coalesce((select api.league_state(l.join_code) from api.leagues l where l.id=p_league_id),jsonb_build_object(''ok'',false,''error'',''League not found'')) end';

create or replace function api.finalize_gameweek_by_id(p_league_id uuid,p_gameweek integer,p_manager1_score numeric,p_manager2_score numeric)
returns jsonb
language sql
security definer
set search_path to 'api','auth','public'
as 'select case when not api.is_soccertime_workload() then jsonb_build_object(''ok'',false,''error'',''Unauthorized'') else coalesce((select api.finalize_gameweek(l.join_code,p_gameweek,p_manager1_score,p_manager2_score) from api.leagues l where l.id=p_league_id),jsonb_build_object(''ok'',false,''error'',''League not found'')) end';

create or replace function api.league_state_workload(p_code text)
returns jsonb
language sql
security definer
set search_path to 'api','auth','public'
as 'select case when not api.is_soccertime_workload() then jsonb_build_object(''ok'',false,''error'',''Unauthorized'') else api.league_state(p_code) end';

create or replace function api.draft_pick_workload(p_code text,p_slot integer,p_player_id integer,p_name text,p_position text,p_team_name text,p_photo text)
returns jsonb
language sql
security definer
set search_path to 'api','auth','public'
as 'select case when not api.is_soccertime_workload() then jsonb_build_object(''ok'',false,''error'',''Unauthorized'') else api.draft_pick(p_code,p_slot,p_player_id,p_name,p_position,p_team_name,p_photo) end';

create or replace function api.set_captain_workload(p_code text,p_slot integer,p_gameweek integer,p_player_id integer)
returns jsonb
language sql
security definer
set search_path to 'api','auth','public'
as 'select case when not api.is_soccertime_workload() then jsonb_build_object(''ok'',false,''error'',''Unauthorized'') else api.set_captain(p_code,p_slot,p_gameweek,p_player_id) end';

create or replace function api.pickup_player_workload(p_code text,p_slot integer,p_gameweek integer,p_drop_player_id integer,p_add_player_id integer,p_name text,p_position text,p_team_name text,p_photo text)
returns jsonb
language sql
security definer
set search_path to 'api','auth','public'
as 'select case when not api.is_soccertime_workload() then jsonb_build_object(''ok'',false,''error'',''Unauthorized'') else api.pickup_player(p_code,p_slot,p_gameweek,p_drop_player_id,p_add_player_id,p_name,p_position,p_team_name,p_photo) end';

create or replace function api.save_manager_workload(p_code text,p_slot integer,p_name text,p_club_name text)
returns jsonb
language sql
security definer
set search_path to 'api','auth','public'
as 'select case when not api.is_soccertime_workload() then jsonb_build_object(''ok'',false,''error'',''Unauthorized'') else api.save_manager(p_code,p_slot,p_name,p_club_name) end';

revoke execute on function api.is_soccertime_workload() from public, anonymous, "soccer-time";
revoke execute on function api.league_state_workload(text) from public;
revoke execute on function api.draft_pick_workload(text,integer,integer,text,text,text,text) from public;
revoke execute on function api.set_captain_workload(text,integer,integer,integer) from public;
revoke execute on function api.pickup_player_workload(text,integer,integer,integer,integer,text,text,text,text) from public;
revoke execute on function api.save_manager_workload(text,integer,text,text) from public;

grant execute on function api.roster_moves_state(text) to anonymous, "soccer-time";
grant execute on function api.league_state_by_id(uuid) to anonymous, "soccer-time";
grant execute on function api.finalize_gameweek_by_id(uuid,integer,numeric,numeric) to anonymous, "soccer-time";
grant execute on function api.league_state_workload(text) to anonymous, "soccer-time";
grant execute on function api.draft_pick_workload(text,integer,integer,text,text,text,text) to anonymous, "soccer-time";
grant execute on function api.set_captain_workload(text,integer,integer,integer) to anonymous, "soccer-time";
grant execute on function api.pickup_player_workload(text,integer,integer,integer,integer,text,text,text,text) to anonymous, "soccer-time";
grant execute on function api.save_manager_workload(text,integer,text,text) to anonymous, "soccer-time";
