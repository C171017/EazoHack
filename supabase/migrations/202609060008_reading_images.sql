begin;
-- Immutable, private illustration bytes are separate from frequent reading checkpoints.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('eazo-reading','eazo-reading',false,14000000,array['text/plain']);
create policy eazo_reading_read on storage.objects for select to authenticated using (
 bucket_id='eazo-reading' and exists (
  select 1 from public.book_sources s where s.owner_id=(select auth.uid())
   and name ~ ('^'||s.owner_id::text||'/'||s.book_id::text||'/'||s.id::text||'/[a-f0-9]{64}\.txt$')
 ));
create policy eazo_reading_insert on storage.objects for insert to authenticated with check (
 bucket_id='eazo-reading' and exists (
  select 1 from public.book_sources s where s.owner_id=(select auth.uid())
   and name ~ ('^'||s.owner_id::text||'/'||s.book_id::text||'/'||s.id::text||'/[a-f0-9]{64}\.txt$')
 ));
create function public.eazo_guard_reading_image() returns trigger
language plpgsql security definer set search_path='' as $$
declare owner uuid; used bigint;
begin
 if new.bucket_id<>'eazo-reading' then return new; end if;
 owner:=split_part(new.name,'/',1)::uuid;
 perform public.eazo_assert_active(owner);
 select coalesce(sum(coalesce((metadata->>'size')::bigint,0)),0) into used
  from storage.objects where bucket_id='eazo-reading' and starts_with(name,owner::text||'/') and id<>new.id;
 if used+coalesce((new.metadata->>'size')::bigint,0)>104857600 then
  raise check_violation using message='reading_image_storage_limit';
 end if;
 return new;
end $$;
revoke all on function public.eazo_guard_reading_image() from public,anon,authenticated;
create trigger eazo_reading_image_guard before insert or update on storage.objects
 for each row execute function public.eazo_guard_reading_image();
create or replace function public.eazo_delete_account_rows(p_owner uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,746201));
 if not exists(select 1 from public.account_state where owner_id=p_owner) then raise exception 'deletion_not_started'; end if;
 if exists(select 1 from storage.objects where bucket_id in ('eazo-sources','eazo-analysis','eazo-reading') and starts_with(name,p_owner::text||'/')) then
  raise exception 'storage_cleanup_incomplete';
 end if;
 delete from public.analysis_checkpoints where job_id in(select id from public.analysis_jobs where owner_id=p_owner);
 delete from public.graph_versions where owner_id=p_owner;
 delete from public.analysis_jobs where owner_id=p_owner;
 delete from public.reading_heads where owner_id=p_owner;
 delete from public.reading_snapshots where owner_id=p_owner;
 delete from public.reading_events where owner_id=p_owner;
 delete from public.book_sources where owner_id=p_owner;
 delete from public.books where owner_id=p_owner;
 delete from public.generation_usage where owner_id=p_owner;
end $$;
commit;
