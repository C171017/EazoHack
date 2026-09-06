-- READ ONLY. Run as postgres before applying migration 007.
select jsonb_build_object(
 'database_role',current_user,
 'migration_absent',to_regclass('public.account_state') is null and to_regclass('public.reading_heads') is null,
 'worker_ready',to_regprocedure('public.eazo_worker(text,uuid,uuid,jsonb)') is not null,
 'dispatch_ready',to_regprocedure('public.eazo_reserve_dispatch(uuid,uuid)') is not null,
 'storage_owner',(select pg_get_userbyid(relowner) from pg_class where oid='storage.objects'::regclass),
 'storage_trigger_privilege',has_table_privilege(current_user,'storage.objects','TRIGGER'),
 'storage_metadata_exists',exists(select 1 from information_schema.columns where table_schema='storage' and table_name='objects' and column_name='metadata'),
 'books',(select count(*) from public.books),
 'sources',(select count(*) from public.book_sources),
 'snapshots',(select count(*) from public.reading_snapshots),
 'active_jobs',(select count(*) from public.analysis_jobs where status in ('queued','running')),
 'legacy_sources_to_backfill',(select count(*) from public.book_sources s join storage.objects o on o.bucket_id='eazo-sources' and o.name=s.source_object where not(s.manifest ? 'sourceBytes') and jsonb_typeof(o.metadata->'size')='number'),
 'existing_storage_triggers',(select coalesce(jsonb_agg(tgname),'[]') from pg_trigger where tgrelid='storage.objects'::regclass and not tgisinternal)
) as migration_007_preflight;
