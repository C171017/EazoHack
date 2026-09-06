-- READ ONLY. Run after COMMIT; do not rerun the migration to test its status.
select jsonb_build_object(
 'account_state_exists',to_regclass('public.account_state') is not null,
 'heads_exist',to_regclass('public.reading_heads') is not null,
 'save_rpc_exists',to_regprocedure('public.eazo_save_snapshot(uuid,uuid,uuid,bigint,jsonb)') is not null,
 'head_rpc_exists',to_regprocedure('public.eazo_snapshot_head(uuid)') is not null,
 'head_rls',(select relrowsecurity from pg_class where oid='public.reading_heads'::regclass),
 'state_rls',(select relrowsecurity from pg_class where oid='public.account_state'::regclass),
 'anonymous_cannot_read_heads',not has_table_privilege('anon','public.reading_heads','SELECT'),
 'client_cannot_insert_snapshots',not has_table_privilege('authenticated','public.reading_snapshots','INSERT'),
 'client_can_save',has_function_privilege('authenticated','public.eazo_save_snapshot(uuid,uuid,uuid,bigint,jsonb)','EXECUTE'),
 'anonymous_cannot_save',not has_function_privilege('anon','public.eazo_save_snapshot(uuid,uuid,uuid,bigint,jsonb)','EXECUTE'),
 'client_cannot_begin_deletion',not has_function_privilege('authenticated','public.eazo_begin_account_deletion(uuid)','EXECUTE'),
 'storage_guard_enabled',exists(select 1 from pg_trigger where tgrelid='storage.objects'::regclass and tgname='eazo_account_active' and tgenabled='O'),
 'storage_owner',(select pg_get_userbyid(relowner) from pg_class where oid='storage.objects'::regclass),
 'books',(select count(*) from public.books),
 'sources',(select count(*) from public.book_sources),
 'snapshots',(select count(*) from public.reading_snapshots),
 'heads',(select count(*) from public.reading_heads),
 'reserved_source_bytes',(select coalesce(sum((manifest->>'sourceBytes')::bigint),0) from public.book_sources)
) as migration_007_postflight;
