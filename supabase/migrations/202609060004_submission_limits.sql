begin;
create table public.generation_usage(owner_id uuid not null references auth.users(id),day date not null,used integer not null,primary key(owner_id,day));
alter table public.generation_usage enable row level security;
revoke all on public.generation_usage from public,anon,authenticated;
grant all on public.generation_usage to service_role;
create function public.eazo_generation_quota(p_owner uuid) returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 insert into public.generation_usage values(p_owner,current_date,1) on conflict(owner_id,day) do update set used=public.generation_usage.used+1 where public.generation_usage.used<50 returning used into n;
 return n is not null;
end $$;
create function public.eazo_submit_job(p_owner uuid,p_source uuid,p_key text,p_model text,p_pipeline text) returns uuid language plpgsql security invoker set search_path='' as $$
declare j public.analysis_jobs; s public.book_sources; new_id uuid;
begin
 perform pg_advisory_xact_lock(592771495287);
 select * into j from public.analysis_jobs where owner_id=p_owner and idempotency_key=p_key;
 if found then
  if j.source_id<>p_source or j.model<>p_model or j.pipeline_version<>p_pipeline then raise exception 'idempotency_conflict'; end if;
  return j.id;
 end if;
 if exists(select 1 from public.analysis_jobs where status in ('queued','running')) then raise exception 'worker_busy'; end if;
 if (select count(*) from public.analysis_jobs where owner_id=p_owner and created_at>=current_date)>=3 then raise exception 'daily_job_limit'; end if;
 select * into strict s from public.book_sources where id=p_source and owner_id=p_owner;
 insert into public.analysis_jobs(book_id,source_id,owner_id,idempotency_key,model,pipeline_version)
 values(s.book_id,s.id,p_owner,p_key,p_model,p_pipeline) returning id into new_id;
 return new_id;
end $$;
revoke all on function public.eazo_generation_quota(uuid),public.eazo_submit_job(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.eazo_generation_quota(uuid),public.eazo_submit_job(uuid,uuid,text,text,text) to service_role;
commit;
