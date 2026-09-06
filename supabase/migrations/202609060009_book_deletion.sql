begin;
-- Share the existing account lock with row/storage writes. A late upload cannot
-- recreate files after its book has been removed, including signed uploads.
create function public.eazo_guard_book_storage() returns trigger
language plpgsql security definer set search_path='' as $$
declare owner uuid; book uuid;
begin
 if new.bucket_id not in ('eazo-sources','eazo-analysis','eazo-reading') then return new; end if;
 owner:=split_part(new.name,'/',1)::uuid;
 perform public.eazo_assert_active(owner);
 if split_part(new.name,'/',2) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  raise insufficient_privilege using message='invalid_object_book';
 end if;
 book:=split_part(new.name,'/',2)::uuid;
 if not exists(select 1 from public.books where id=book and owner_id=owner) then
  raise insufficient_privilege using message='book_not_found';
 end if;
 return new;
end $$;
revoke all on function public.eazo_guard_book_storage() from public,anon,authenticated;
create trigger eazo_book_exists before insert or update on storage.objects
 for each row execute function public.eazo_guard_book_storage();

create function public.eazo_delete_book_rows(p_owner uuid,p_book uuid) returns uuid[]
language plpgsql security invoker set search_path='' as $$
declare sources uuid[];
begin
 perform public.eazo_assert_active(p_owner);
 if exists(select 1 from public.books where id=p_book and owner_id<>p_owner) then
  raise insufficient_privilege using message='book_not_found';
 end if;
 select coalesce(array_agg(id),'{}'::uuid[]) into sources from public.book_sources where book_id=p_book and owner_id=p_owner;
 delete from public.analysis_checkpoints where job_id in(select id from public.analysis_jobs where book_id=p_book and owner_id=p_owner);
 delete from public.graph_versions where book_id=p_book and owner_id=p_owner;
 delete from public.analysis_jobs where book_id=p_book and owner_id=p_owner;
 delete from public.reading_heads where source_id=any(sources) and owner_id=p_owner;
 delete from public.reading_snapshots where book_id=p_book and owner_id=p_owner;
 delete from public.reading_events where book_id=p_book and owner_id=p_owner;
 delete from public.book_sources where book_id=p_book and owner_id=p_owner;
 delete from public.books where id=p_book and owner_id=p_owner;
 return sources;
end $$;
revoke all on function public.eazo_delete_book_rows(uuid,uuid) from public,anon,authenticated;
grant execute on function public.eazo_delete_book_rows(uuid,uuid) to service_role;
commit;
