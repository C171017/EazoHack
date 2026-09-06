begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
alter table public.books add constraint book_metadata_size check(octet_length(metadata::text)<=131072) not valid;
alter table public.book_sources add constraint source_manifest_size check(octet_length(manifest::text)<=131072) not valid;
alter table public.reading_events add constraint reading_event_size check(octet_length(payload::text)<=3145728) not valid;
-- Preserve earlier uploaded sources and account for their actual size before enforcing reservations.
update public.book_sources s set manifest=jsonb_set(s.manifest,'{sourceBytes}',o.metadata->'size')
 from storage.objects o where o.bucket_id='eazo-sources' and o.name=s.source_object
 and not (s.manifest ? 'sourceBytes') and jsonb_typeof(o.metadata->'size')='number'
 and o.metadata->>'size' ~ '^[0-9]+$' and (o.metadata->>'size')::numeric between 1 and 52428800;
-- Tombstones deliberately survive auth deletion, fencing late signed uploads/workers.
create table public.account_state (
 owner_id uuid primary key,
 deleting_at timestamptz not null default now()
);
alter table public.account_state enable row level security;
revoke all on public.account_state from public,anon,authenticated;
grant select on public.account_state to authenticated;
grant all on public.account_state to service_role;
create policy owner_read on public.account_state for select to authenticated using (owner_id=(select auth.uid()));

create function public.eazo_assert_active(p_owner uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_owner is null then raise insufficient_privilege using message='account_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,746201));
 if exists(select 1 from public.account_state where owner_id=p_owner)
  or not exists(select 1 from auth.users where id=p_owner) then
  raise insufficient_privilege using message='account_deleting';
 end if;
end $$;
revoke all on function public.eazo_assert_active(uuid) from public,anon,authenticated;
grant execute on function public.eazo_assert_active(uuid) to service_role;

create function public.eazo_guard_account_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare used bigint;
begin
 perform public.eazo_assert_active(new.owner_id);
 if tg_op='INSERT' and tg_table_name='books' and
  (select count(*) from public.books where owner_id=new.owner_id)>=100 then
  raise check_violation using message='book_limit';
 elsif tg_op='INSERT' and tg_table_name='book_sources' then
  if (select count(*) from public.book_sources where owner_id=new.owner_id)>=500 then
   raise check_violation using message='source_version_limit';
  end if;
  if not (new.manifest ? 'sourceBytes') or jsonb_typeof(new.manifest->'sourceBytes') is distinct from 'number'
   or (new.manifest->>'sourceBytes') !~ '^[0-9]+$' then
   raise check_violation using message='source_size_required';
  else
   used:=(new.manifest->>'sourceBytes')::bigint;
   if used<1 or used>52428800 then raise check_violation using message='source_file_limit'; end if;
   if used+(select coalesce(sum((manifest->>'sourceBytes')::bigint),0) from public.book_sources where owner_id=new.owner_id)>104857600 then
    raise check_violation using message='source_storage_limit';
   end if;
  end if;
 end if;
 if tg_op='INSERT' and tg_table_name='reading_events' then
  if (select coalesce(sum(octet_length(payload::text)),0) from public.reading_events where owner_id=new.owner_id)
   +octet_length(new.payload::text)>104857600 then
   raise check_violation using message='snapshot_storage_limit';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.eazo_guard_account_write() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['books','book_sources','reading_snapshots','reading_events','analysis_jobs','graph_versions','generation_usage'] loop
  execute format('create trigger account_active before insert or update on public.%I for each row execute function public.eazo_guard_account_write()',t);
 end loop;
end $$;

-- Hosted storage.objects is owned by supabase_storage_admin. Its existing schema is untouched.
-- Creating this guard uses the postgres role's existing TRIGGER privilege, not table ownership.
create function public.eazo_guard_storage_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare account_id uuid; object_bytes bigint; total_bytes bigint;
begin
 if new.bucket_id not in ('eazo-sources','eazo-analysis') then return new; end if;
 if split_part(new.name,'/',1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  raise insufficient_privilege using message='invalid_object_owner';
 end if;
 account_id:=split_part(new.name,'/',1)::uuid;
 perform public.eazo_assert_active(account_id);
 if new.bucket_id='eazo-sources' then
  object_bytes:=coalesce((new.metadata->>'size')::bigint,0);
  if object_bytes>52428800 then raise check_violation using message='source_file_limit'; end if;
  select coalesce(sum(coalesce((metadata->>'size')::bigint,0)),0) into total_bytes
   from storage.objects where bucket_id='eazo-sources' and starts_with(name,account_id::text||'/') and id<>new.id;
  if total_bytes+object_bytes>104857600 then raise check_violation using message='source_storage_limit'; end if;
 end if;
 return new;
end $$;
revoke all on function public.eazo_guard_storage_write() from public,anon,authenticated;
create trigger eazo_account_active before insert or update on storage.objects
 for each row execute function public.eazo_guard_storage_write();

alter table public.reading_snapshots add column mutation_id uuid;
alter table public.reading_snapshots add column base_revision bigint;
alter table public.reading_snapshots add column accepted_revision bigint;
create unique index reading_snapshot_mutation on public.reading_snapshots(owner_id,device_id,mutation_id) where mutation_id is not null;
create table public.reading_heads (
 source_id uuid primary key references public.book_sources(id),
 owner_id uuid not null references auth.users(id),
 revision bigint not null check(revision>0),
 snapshot_id uuid not null references public.reading_snapshots(id)
);
alter table public.reading_heads enable row level security;
revoke all on public.reading_heads from public,anon,authenticated;
grant select on public.reading_heads to authenticated;
grant all on public.reading_heads to service_role;
create policy owner_read on public.reading_heads for select to authenticated using (owner_id=(select auth.uid()));
-- Existing manual saves become revision one without rewriting immutable history.
insert into public.reading_heads(source_id,owner_id,revision,snapshot_id)
 select distinct on(source_id) source_id,owner_id,1,id from public.reading_snapshots order by source_id,created_at desc,id desc;
revoke insert on public.reading_snapshots from authenticated;

create function public.eazo_snapshot_head(p_source uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.book_sources where id=p_source and owner_id=auth.uid()) then
  raise insufficient_privilege using message='source_not_found';
 end if;
 select jsonb_build_object('revision',h.revision,'payload',s.payload) into result
  from public.reading_heads h join public.reading_snapshots s on s.id=h.snapshot_id where h.source_id=p_source and h.owner_id=auth.uid();
 return coalesce(result,'{"revision":0,"payload":null}'::jsonb);
end $$;

create function public.eazo_save_snapshot(p_source uuid,p_device uuid,p_mutation uuid,p_base_revision bigint,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); source public.book_sources; head public.reading_heads;
 prior public.reading_snapshots; snapshot uuid; current_revision bigint; checkpoint text; local_id text;
begin
 perform public.eazo_assert_active(owner);
 select * into source from public.book_sources where id=p_source and owner_id=owner;
 if not found then raise insufficient_privilege using message='source_not_found'; end if;
 if p_device is null or p_mutation is null or p_base_revision is null or p_base_revision<0
  or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>3145728 then
  raise check_violation using message='invalid_snapshot';
 end if;
 checkpoint:=p_payload->>'id';
 select local_book_id into local_id from public.books where id=source.book_id;
 if checkpoint is null or length(checkpoint) not between 1 and 200 or (p_payload->>'bookId') is distinct from local_id
  or jsonb_typeof(p_payload->'anchors') is distinct from 'array' then
  raise check_violation using message='snapshot_source_mismatch';
 end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'anchors') a where
  (a->>'fileHash') is distinct from source.file_hash or (a->>'extractionVersion') is distinct from source.extraction_version) then
  raise check_violation using message='snapshot_source_mismatch';
 end if;
 select * into head from public.reading_heads where source_id=p_source;
 current_revision:=coalesce(head.revision,0);
 select * into prior from public.reading_snapshots where owner_id=owner and device_id=p_device and mutation_id=p_mutation;
 if found then
  if prior.source_id<>p_source or prior.base_revision<>p_base_revision or prior.payload<>p_payload then
   raise check_violation using message='idempotency_conflict';
  end if;
  if prior.accepted_revision is not null then return jsonb_build_object('status','saved','revision',prior.accepted_revision); end if;
  return public.eazo_snapshot_head(p_source)||jsonb_build_object('status','conflict');
 end if;
 if (select coalesce(sum(octet_length(payload::text)),0) from public.reading_snapshots where owner_id=owner)+octet_length(p_payload::text)>104857600 then
  raise check_violation using message='snapshot_storage_limit';
 end if;
 insert into public.reading_snapshots(book_id,source_id,owner_id,checkpoint_id,device_id,payload,mutation_id,base_revision,accepted_revision)
  values(source.book_id,p_source,owner,checkpoint,p_device,p_payload,p_mutation,p_base_revision,
   case when current_revision=p_base_revision then current_revision+1 else null end) returning id into snapshot;
 if current_revision<>p_base_revision then return public.eazo_snapshot_head(p_source)||jsonb_build_object('status','conflict'); end if;
 insert into public.reading_heads(source_id,owner_id,revision,snapshot_id) values(p_source,owner,current_revision+1,snapshot)
  on conflict(source_id) do update set revision=excluded.revision,snapshot_id=excluded.snapshot_id;
 return jsonb_build_object('status','saved','revision',current_revision+1);
end $$;
revoke all on function public.eazo_snapshot_head(uuid),public.eazo_save_snapshot(uuid,uuid,uuid,bigint,jsonb) from public,anon;
grant execute on function public.eazo_snapshot_head(uuid),public.eazo_save_snapshot(uuid,uuid,uuid,bigint,jsonb) to authenticated;

create function public.eazo_begin_account_deletion(p_owner uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,746201));
 -- Cancel and invalidate every lease before activating the write fence.
 if not exists(select 1 from public.account_state where owner_id=p_owner) then
  update public.analysis_jobs set status='cancelled',lease_token=null,lease_expires_at=null,updated_at=now()
   where owner_id=p_owner and status in ('queued','running');
  insert into public.account_state(owner_id) values(p_owner);
 end if;
end $$;
create function public.eazo_delete_account_rows(p_owner uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,746201));
 if not exists(select 1 from public.account_state where owner_id=p_owner) then raise exception 'deletion_not_started'; end if;
 if exists(select 1 from storage.objects where bucket_id in ('eazo-sources','eazo-analysis') and starts_with(name,p_owner::text||'/')) then
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
revoke all on function public.eazo_begin_account_deletion(uuid),public.eazo_delete_account_rows(uuid) from public,anon,authenticated;
grant execute on function public.eazo_begin_account_deletion(uuid),public.eazo_delete_account_rows(uuid) to service_role;
commit;
