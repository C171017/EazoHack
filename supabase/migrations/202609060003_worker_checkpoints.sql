begin;
-- Internal checkpoints never appear in owner-visible job summaries.
create table public.analysis_checkpoints (
 job_id uuid not null references public.analysis_jobs(id), key text not null,
 object text not null, hash text not null check(hash ~ '^[a-f0-9]{64}$'),
 primary key(job_id,key)
);
alter table public.analysis_checkpoints enable row level security;
revoke all on public.analysis_checkpoints from public,anon,authenticated;
grant all on public.analysis_checkpoints to service_role;
create function public.eazo_worker(p_action text,p_job uuid,p_token uuid,p_payload jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.analysis_jobs; s public.book_sources; b public.books; k text; result_value jsonb;
begin
 select * into j from public.analysis_jobs where id=p_job for update;
 if not found then raise exception 'unknown_job'; end if;
 if p_action='claim' then
  if j.status in ('succeeded','failed','cancelled') then return null; end if;
  if j.lease_expires_at>clock_timestamp() then return '{"busy":true}'::jsonb; end if;
  if j.attempt>=3 then
   update public.analysis_jobs set status='failed',error_code='attempts_exhausted',lease_token=null,lease_expires_at=null,updated_at=now() where id=p_job;
   return null;
  end if;
  select * into strict s from public.book_sources where id=j.source_id;
  select * into strict b from public.books where id=j.book_id;
  if coalesce(s.manifest->>'sourceSha256','') !~ '^[a-f0-9]{64}$' then raise exception 'missing_source_hash'; end if;
  update public.analysis_jobs set status='running',attempt=attempt+1,lease_token=p_token,lease_expires_at=now()+interval '5 minutes',updated_at=now() where id=p_job;
  return jsonb_build_object('id',j.id,'book_id',b.local_book_id,'owner_id',j.owner_id,'cloud_book_id',j.book_id,
   'source_path',s.source_object,'source_sha256',s.manifest->>'sourceSha256','file_hash',s.file_hash,
   'extraction_version',s.extraction_version,'model',j.model,'pipeline_version',j.pipeline_version);
 end if;
 if j.status<>'running' or j.lease_token is distinct from p_token or j.lease_expires_at is null or j.lease_expires_at<=clock_timestamp() then raise exception 'lease_lost'; end if;
 if p_action='heartbeat' then
  update public.analysis_jobs set lease_expires_at=now()+interval '5 minutes',updated_at=now() where id=p_job; return 'true'::jsonb;
 elsif p_action='read' then
  select jsonb_build_object('object',object,'hash',hash) into result_value from public.analysis_checkpoints where job_id=p_job and key=p_payload->>'key'; return result_value;
 elsif p_action='list' then
  select coalesce(jsonb_agg(substring(key from length(p_payload->>'prefix')+1)),'[]') into result_value from public.analysis_checkpoints
   where job_id=p_job and starts_with(key,p_payload->>'prefix') and strpos(substring(key from length(p_payload->>'prefix')+1),'/')=0; return result_value;
 elsif p_action='write' then
  k:=p_payload->>'key';
  if k is null or k='' or k like '/%' or k ~ '(^|/)\.\.(/|$)' then raise exception 'invalid_key'; end if;
  if coalesce(p_payload->>'hash','') !~ '^[a-f0-9]{64}$' or (p_payload->>'object') is distinct from (j.owner_id::text||'/'||j.book_id::text||'/'||j.id::text||'/checkpoints/'||(p_payload->>'hash')||'.json') then raise exception 'invalid_object'; end if;
  insert into public.analysis_checkpoints values(p_job,k,p_payload->>'object',p_payload->>'hash')
   on conflict(job_id,key) do update set object=excluded.object,hash=excluded.hash; return 'true'::jsonb;
 elsif p_action='complete' then
  return to_jsonb(public.complete_analysis_job(p_job,p_token,p_payload->>'graph_version',p_payload->>'manifest_sha256'));
 elsif p_action='retry' then
  update public.analysis_jobs set status=case when attempt>=3 then 'failed' else 'queued' end,
   lease_token=null,lease_expires_at=null,error_code='worker_failed',updated_at=now() where id=p_job; return 'true'::jsonb;
 end if;
 raise exception 'unknown_action';
end $$;
revoke all on function public.eazo_worker(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.eazo_worker(text,uuid,uuid,jsonb) to service_role;
-- Use only the worker claim entrypoint, which enforces the attempt ceiling.
revoke execute on function public.claim_analysis_job(uuid) from service_role;
commit;
