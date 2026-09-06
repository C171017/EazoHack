begin;
alter table public.analysis_jobs add column dispatch_requested_at timestamptz;
create function public.eazo_reserve_dispatch(p_job uuid,p_owner uuid) returns boolean language sql security invoker set search_path='' as $$
 with reserved as (
  update public.analysis_jobs set dispatch_requested_at=clock_timestamp(),updated_at=now()
  where id=p_job and owner_id=p_owner and attempt<3
   and (status='queued' or (status='running' and lease_expires_at<now()))
   and (dispatch_requested_at is null or dispatch_requested_at<now()-interval '10 minutes')
  returning id
 ) select exists(select 1 from reserved);
$$;
revoke all on function public.eazo_reserve_dispatch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.eazo_reserve_dispatch(uuid,uuid) to service_role;
commit;
