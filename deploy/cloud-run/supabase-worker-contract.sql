-- REVIEW ONLY: Supabase task must integrate this contract before remote application.
-- No client writes. The authenticated web backend inserts owner-checked requests.
create table public.eazo_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  book_id text not null check (book_id ~ '^[a-z0-9-]+$'),
  source_path text not null,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  model text not null,
  pipeline_version text not null,
  status text not null default 'queued' check (status in ('queued','running','retryable','complete','failed')),
  attempts integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  checkpoints jsonb not null default '{}',
  result jsonb,
  error_code text,
  updated_at timestamptz not null default now(),
  unique(owner_id, book_id, source_sha256, model, pipeline_version)
);
alter table public.eazo_analysis_jobs enable row level security;
revoke all on public.eazo_analysis_jobs from anon, authenticated;
-- Expose a separate owner-filtered status view/API; never expose internal checkpoints.
grant all on public.eazo_analysis_jobs to service_role;

create function public.eazo_worker(p_action text, p_job uuid, p_token uuid, p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  j public.eazo_analysis_jobs;
  k text;
  result_value jsonb;
begin
  select * into j from public.eazo_analysis_jobs where id = p_job for update;
  if not found then raise exception 'unknown_job'; end if;
  if p_action = 'claim' then
    if j.status in ('complete','failed') then return null; end if;
    if j.lease_until > clock_timestamp() then return '{"busy":true}'::jsonb; end if;
    if j.attempts >= 3 then
      update public.eazo_analysis_jobs set status='failed',error_code='attempts_exhausted',updated_at=clock_timestamp() where id=p_job;
      return null;
    end if;
    update public.eazo_analysis_jobs set status='running',attempts=attempts+1,lease_token=p_token,
      lease_until=clock_timestamp()+interval '120 seconds',updated_at=clock_timestamp() where id=p_job;
    return jsonb_build_object('id',j.id,'book_id',j.book_id,'source_path',j.source_path,
      'source_sha256',j.source_sha256,'model',j.model,'pipeline_version',j.pipeline_version);
  end if;
  if j.status <> 'running' or j.lease_token is distinct from p_token or j.lease_until <= clock_timestamp() then
    raise exception 'lease_lost';
  end if;
  if p_action='heartbeat' then
    update public.eazo_analysis_jobs set lease_until=clock_timestamp()+interval '120 seconds',updated_at=clock_timestamp() where id=p_job;
    return 'true'::jsonb;
  elsif p_action='read' then
    return j.checkpoints -> (p_payload->>'key');
  elsif p_action='list' then
    select coalesce(jsonb_agg(substring(key from length(p_payload->>'prefix')+1)), '[]'::jsonb) into result_value
    from jsonb_object_keys(j.checkpoints) as t(key)
    where starts_with(key,p_payload->>'prefix') and strpos(substring(key from length(p_payload->>'prefix')+1),'/')=0;
    return result_value;
  elsif p_action='write' then
    k := p_payload->>'key';
    if k is null or k='' or k like '/%' or k ~ '(^|/)\.\.(/|$)' then raise exception 'invalid_key'; end if;
    if coalesce(p_payload->>'hash','') !~ '^[a-f0-9]{64}$' or
      (p_payload->>'object') is distinct from (p_job::text||'/objects/'||(p_payload->>'hash')||'.json') then
      raise exception 'invalid_object';
    end if;
    update public.eazo_analysis_jobs set checkpoints=jsonb_set(checkpoints,array[k],jsonb_build_object('object',p_payload->>'object','hash',p_payload->>'hash')),
      updated_at=clock_timestamp() where id=p_job;
    return 'true'::jsonb;
  elsif p_action='complete' then
    result_value := j.checkpoints -> 'result.json';
    if result_value is null then raise exception 'missing_result'; end if;
    update public.eazo_analysis_jobs set status='complete',result=result_value,lease_token=null,lease_until=null,
      error_code=null,updated_at=clock_timestamp() where id=p_job;
    return 'true'::jsonb;
  elsif p_action='retry' then
    update public.eazo_analysis_jobs set status=case when attempts>=3 then 'failed' else 'retryable' end,
      lease_token=null,lease_until=null,error_code='worker_failed',updated_at=clock_timestamp() where id=p_job;
    return 'true'::jsonb;
  end if;
  raise exception 'unknown_action';
end $$;
revoke all on function public.eazo_worker(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.eazo_worker(text,uuid,uuid,jsonb) to service_role;
-- Supabase task owns private bucket creation: analysis-inputs (16 MiB max, canonical UTF-8 TXT)
-- and analysis-private (16 MiB max JSON). Neither bucket permits client mutation of
-- accepted input versions or internal checkpoints. No remote commands were run.
