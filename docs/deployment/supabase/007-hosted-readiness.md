# Migration 007 hosted readiness

Inspected `eazo-hack-demo` on 2026-09-06 with read-only PostgREST, Storage listing, and a SQL catalog query. No hosted migration or deletion was performed during this inspection.

## Observed before migration

- `account_state` and `reading_heads` do not exist. Snapshot columns are the original baseline; neither sync RPC is present. Worker, generation quota, and dispatch reservation RPCs exist.
- The database has one book, one source, no reading snapshots, and one succeeded analysis job with no active lease.
- Both Eazo buckets are private with a 50 MiB object cap and their original MIME allowlists.
- SQL Editor runs as `postgres`. `storage.objects` belongs to `supabase_storage_admin`; `postgres` is not a member of that role, but has `TRIGGER` privilege. The standard `metadata` column is already present.
- Existing Storage triggers are `protect_objects_delete` and `update_objects_updated_at`.
- The existing source object has an actual size of 1,316 bytes but no `manifest.sourceBytes`. Migration 007 now backfills that size from metadata without changing the source text, hash, path, or owner.

## Exact forward-only operation

1. Run `supabase/checks/202609060007_preflight.sql` in SQL Editor as `postgres`. Confirm the migration is absent, worker/dispatch prerequisites exist, and Storage trigger privilege/metadata checks pass. Review changed counts or active jobs before proceeding.
2. Run the complete file `supabase/migrations/202609060007_account_sync.sql` once. It has an explicit transaction, a five-second lock timeout, and a sixty-second statement timeout. Do not split it into fragments.
3. Run `supabase/checks/202609060007_postflight.sql`. Confirm every permission/feature check is true, existing counts are preserved, the owner of `storage.objects` is unchanged, and source reservation totals include the existing upload.
4. Deploy the compatible Google/sync application and verify with separately identified disposable test accounts. The old application writes snapshots directly and is intentionally incompatible with the new insert privilege; coordinate the short migration/deploy window.

The final SQL does not ALTER the managed Storage table or change its owner. The unnecessary `ADD COLUMN IF NOT EXISTS metadata` statement was removed after inspecting hosted ownership. The disposable test platform now defines its own metadata column. Migration 007 only adds the named Eazo guard trigger using existing TRIGGER permission; existing managed triggers remain untouched.

## Failure and recovery

- Before COMMIT, any error—including lock timeout or a trigger privilege failure—rolls the entire migration back. Resolve the specific cause, rerun preflight, then retry the complete file. There are no irreversible data deletions in the migration.
- If the SQL editor loses its response, run postflight/preflight to determine whether COMMIT occurred. Do not blindly run the migration a second time: its CREATE statements deliberately fail instead of obscuring partial or unexpected state.
- After COMMIT, prefer a forward correction. Preserve `reading_snapshots`, `reading_heads`, and the source-size metadata. Do not drop tables or reopen direct snapshot writes to accommodate an old application, because that would break conflict detection.
- If a Storage guard problem appears, halt affected imports and use a forward function correction after inspecting the failure. Removing its deletion fence would permit late writes while cleanup is running. Keep account deletion unavailable until the guard and Storage API smoke tests pass.
- Account deletion itself is retryable: its tombstone survives failures, files are removed through the Storage API, relational rows are removed only after storage is empty, and the auth identity is last. Never clean up object metadata with SQL.

## Storage compatibility

Live read-only listing returned virtual directories with `id:null`, normal file entries with string IDs, and numeric `metadata.size`, matching the cleanup traversal. Listing works for both source and analysis folder depth. The helper deletes batches of at most 100 exact object paths using the official `{prefixes:[...]}` body, below the documented 1,000-object removal limit. It retains auth on any failure.

Signed uploads and trusted worker writes invoke the Storage database guard when their object row is inserted or updated. That guard rejects deleting/deleted account IDs. Logical job cancellation invalidates leases, but an already executing external model request may finish before the worker notices. Physical blob deletion and signed-upload timing still need a disposable hosted smoke test; read-only inspection cannot establish those effects.

Supabase documents [managed service ownership](https://supabase.com/docs/guides/platform/permissions), recommends avoiding [managed Storage schema alterations](https://supabase.com/docs/guides/storage/schema/design), and requires [object deletion through the Storage API](https://supabase.com/docs/guides/storage/management/delete-objects). The [official Storage client](https://github.com/supabase/storage-js/blob/main/src/packages/StorageFileApi.ts) confirms the list/remove endpoint bodies used here.

Validation after the readiness corrections: `scripts/test-account-db.sh` passed access controls, worker integration, account sync, and simultaneous conflicting saves against a fresh disposable PostgreSQL cluster.
