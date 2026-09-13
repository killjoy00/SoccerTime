-- Dedicated, zero-argument state/finalization wrappers for the single SoccerTime family league.
-- Both require the exact signed production Vercel workload through api.is_soccertime_workload().

create or replace function api.soccertime_state()
returns jsonb
language sql
security definer
set search_path to 'api','auth','public'
as 'select case when not api.is_soccertime_workload() then jsonb_build_object(''ok'',false,''error'',''Unauthorized'') else coalesce((select api.league_state(l.join_code) from api.leagues l where l.id=''a96ae9f9-cd1a-4079-af67-1a8edc3ce331''::uuid),jsonb_build_object(''ok'',false,''error'',''League not found'')) end';

create or replace function api.finalize_soccertime_gameweek(p_gameweek integer,p_manager1_score numeric,p_manager2_score numeric)
returns jsonb
language sql
security definer
set search_path to 'api','auth','public'
as 'select case when not api.is_soccertime_workload() then jsonb_build_object(''ok'',false,''error'',''Unauthorized'') else coalesce((select api.finalize_gameweek(l.join_code,p_gameweek,p_manager1_score,p_manager2_score) from api.leagues l where l.id=''a96ae9f9-cd1a-4079-af67-1a8edc3ce331''::uuid),jsonb_build_object(''ok'',false,''error'',''League not found'')) end';

revoke execute on function api.soccertime_state() from public;
revoke execute on function api.finalize_soccertime_gameweek(integer,numeric,numeric) from public;
grant execute on function api.soccertime_state() to anonymous, "soccer-time";
grant execute on function api.finalize_soccertime_gameweek(integer,numeric,numeric) to anonymous, "soccer-time";
