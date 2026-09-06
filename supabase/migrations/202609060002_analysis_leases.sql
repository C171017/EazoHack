begin;
-- Atomic claim, including recovery after worker termination. Each claim fences older workers.
create function public.claim_analysis_job(p_job_id uuid)
returns setof public.analysis_jobs language sql security invoker set search_path = '' as $$
  update public.analysis_jobs set status = 'running', attempt = attempt + 1,
    lease_token = gen_random_uuid(), lease_expires_at = now() + interval '5 minutes', updated_at = now()
  where id = p_job_id and (status = 'queued' or (status = 'running' and lease_expires_at < now()))
  returning *;
$$;
create function public.heartbeat_analysis_job(p_job_id uuid, p_lease_token uuid)
returns boolean language sql security invoker set search_path = '' as $$
  with renewed as (
    update public.analysis_jobs set lease_expires_at = now() + interval '5 minutes', updated_at = now()
    where id = p_job_id and status = 'running' and lease_token = p_lease_token and lease_expires_at > now()
    returning id
  ) select exists(select 1 from renewed);
$$;
-- Upload/validate all output files first; publication and success become visible atomically.
create function public.complete_analysis_job(p_job_id uuid, p_lease_token uuid, p_graph_version text, p_manifest_sha256 text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare j public.analysis_jobs;
begin
  select * into j from public.analysis_jobs where id = p_job_id for update;
  if not found or j.status <> 'running' or j.lease_token is distinct from p_lease_token
    or j.lease_expires_at is null or j.lease_expires_at <= now() then return false; end if;
  insert into public.graph_versions(book_id, source_id, owner_id, job_id, graph_version, output_token, manifest_object, manifest_sha256)
  values(j.book_id, j.source_id, j.owner_id, j.id, p_graph_version, j.lease_token,
    j.owner_id::text || '/' || j.book_id::text || '/' || j.id::text || '/' || j.lease_token::text || '/manifest.json', p_manifest_sha256);
  update public.analysis_jobs set status = 'succeeded', lease_token = null, lease_expires_at = null, updated_at = now() where id = j.id;
  return true;
end;
$$;
revoke all on function public.claim_analysis_job(uuid), public.heartbeat_analysis_job(uuid,uuid), public.complete_analysis_job(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.claim_analysis_job(uuid), public.heartbeat_analysis_job(uuid,uuid), public.complete_analysis_job(uuid,uuid,text,text) to service_role;
commit;
