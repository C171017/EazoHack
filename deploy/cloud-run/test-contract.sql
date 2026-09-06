-- Run ONLY against a disposable local PostgreSQL database.
\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create table auth.users(id uuid primary key);
\ir supabase-worker-contract.sql
insert into auth.users values ('11111111-1111-4111-8111-111111111111');
insert into public.eazo_analysis_jobs(id,owner_id,book_id,source_path,source_sha256,model,pipeline_version)
values ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','book','owner/source.txt',repeat('a',64),'test-model','test-v1');
do $$
declare
  job uuid := '22222222-2222-4222-8222-222222222222';
  first_token uuid := '33333333-3333-4333-8333-333333333333';
  next_token uuid := '44444444-4444-4444-8444-444444444444';
  result_value jsonb;
begin
  if has_function_privilege('anon','public.eazo_worker(text,uuid,uuid,jsonb)','execute') or
     has_function_privilege('authenticated','public.eazo_worker(text,uuid,uuid,jsonb)','execute') then raise exception 'client RPC permission leak'; end if;
  result_value := public.eazo_worker('claim',job,first_token);
  if result_value->>'id' <> job::text then raise exception 'claim failed'; end if;
  if public.eazo_worker('claim',job,next_token) <> '{"busy":true}'::jsonb then raise exception 'duplicate claim acquired'; end if;
  perform public.eazo_worker('heartbeat',job,first_token);
  begin
    perform public.eazo_worker('complete',job,first_token);
    raise exception 'completion without result accepted';
  exception when raise_exception then if sqlerrm <> 'missing_result' then raise; end if; end;
  perform public.eazo_worker('write',job,first_token,jsonb_build_object('key','run/chunk.json','object',job::text||'/objects/'||repeat('b',64)||'.json','hash',repeat('b',64)));
  if public.eazo_worker('list',job,first_token,'{"prefix":"run/"}') <> '["chunk.json"]'::jsonb then raise exception 'list failed'; end if;
  update public.eazo_analysis_jobs set lease_until=clock_timestamp()-interval '1 second' where id=job;
  perform public.eazo_worker('claim',job,next_token);
  begin
    perform public.eazo_worker('write',job,first_token,'{"key":"stale"}');
    raise exception 'stale writer accepted';
  exception when raise_exception then if sqlerrm <> 'lease_lost' then raise; end if; end;
  if public.eazo_worker('read',job,next_token,'{"key":"run/chunk.json"}') is null then raise exception 'checkpoint lost'; end if;
  perform public.eazo_worker('write',job,next_token,jsonb_build_object('key','result.json','object',job::text||'/objects/'||repeat('c',64)||'.json','hash',repeat('c',64)));
  perform public.eazo_worker('complete',job,next_token);
  if public.eazo_worker('claim',job,first_token) is not null then raise exception 'completed job restarted'; end if;
  if (select result->>'hash' from public.eazo_analysis_jobs where id=job) <> repeat('c',64) then raise exception 'result not published'; end if;
end $$;
select 'lease fencing, replay, permissions and publication checks passed' as result;
