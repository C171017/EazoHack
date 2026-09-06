# Account synchronization and deletion

Migration `202609060007_account_sync.sql` follows migrations 001–005 (006 is reserved). Apply it to a disposable database first. This work does not itself apply a production migration or enable Google in a hosted project.

## Synchronization contract

Authenticated RPC `eazo_snapshot_head(p_source)` returns `{revision,payload}`. A new source starts at revision 0 with a null payload. Existing manual history is retained; its latest snapshot becomes revision 1.

`eazo_save_snapshot(p_source,p_device,p_mutation,p_base_revision,p_payload)` authenticates from `auth.uid()`, validates source ownership and payload source identity, and serializes writes per account using a transaction advisory lock. A matching base revision returns `{status:"saved",revision}`. A stale base returns `{status:"conflict",revision,payload}` describing the current head. The conflicting candidate remains in immutable history. The route maps the latter to HTTP 409. Choosing a resolution submits a new mutation against the displayed current revision; another concurrent save can still cause a new conflict.

Mutation IDs are scoped to account and device. Retrying the same mutation and payload returns its original accepted revision without inserting another snapshot. Reusing a mutation ID with a different source, base, or payload is rejected. Authenticated clients cannot directly insert snapshots or update heads to bypass this protocol.

## Allowances

- 100 books and 500 immutable source versions per account.
- 50 MiB per source file and 100 MiB total source files. Registration requires and reserves declared `manifest.sourceBytes`; Storage metadata additionally checks actual source object sizes.
- 3 MiB maximum snapshot or reading event; 100 MiB retained snapshot history and a separate 100 MiB event allowance. Old conflicting snapshots are retained rather than silently discarded to make room. Reaching the limit rejects the save; the browser must retain pending local work and display the error.
- Book metadata and source manifests are bounded to 128 KiB each.
- Existing hosted-analysis and generation quotas still apply independently.

All quota checks occur inside the same per-account transaction lock, including service writes. There is no per-user database: RLS and source foreign keys enforce ownership in the shared database.

## Export

`exportAccount(user,cursor)` returns one metadata page with `table`, `records`, and `nextCursor`. Snapshot/event pages contain one record; other pages contain at most ten. The browser assembles these into a downloadable archive. `exportAccountFile(user,{kind,id})` validates an owner-visible source or published graph version before signing the exact source/original or manifest/graph/hierarchy object. URLs last 60 seconds and should be fetched immediately. Service-role reads are not used for export.

Export uses validated UUID keyset cursors and a captured creation-time cutoff, so concurrent inserts cannot shift pages or enter an in-progress history export. Reading heads and editable book metadata are current as fetched, rather than a database-wide transactional snapshot; a head advanced on another device during export may point beyond the history cutoff. The retained accepted snapshots identify the earlier head. Finish pending sync and pause edits on other devices for a fully consistent archive. Previously prepared sources whose upload never completed can be missing; the archive should report missing files explicitly.

## Deletion ordering and retries

1. Trusted API calls `eazo_begin_account_deletion(owner)` after authentication, same-origin validation, and explicit confirmation in the account UI.
2. The RPC cancels queued/running jobs, invalidates leases, and creates an account tombstone while holding the account lock.
3. The API recursively deletes the owner prefix from both private buckets using the Storage HTTP API. SQL deletion of `storage.objects` alone would leave physical object bytes behind.
4. `eazo_delete_account_rows(owner)` verifies storage metadata is empty, then removes checkpoints, graphs, jobs, heads, snapshots, events, sources, books, and generation usage in foreign-key order.
5. The auth identity is deleted last. A failed earlier step leaves the identity available to retry cleanup. The tombstone deliberately has no auth foreign key and remains after deletion, fencing late worker or signed-upload database writes.

The deletion RPCs are service-only. Database triggers also fence trusted worker writes after deletion starts. This is logical cancellation; an already executing model request can continue externally until its worker notices its cancelled lease. Provider backups/logs, exported copies, and offline caches on other devices follow their own retention rules. Validate Storage HTTP behavior in the hosted staging project; disposable SQL tests do not prove physical blob deletion or signed-token race handling.

## Verification

From the repository root, run:

```sh
scripts/test-account-db.sh
node --import tsx --test tests/cloud-account.test.ts
```

The database runner locates PostgreSQL on PATH (or Homebrew PostgreSQL 14), creates a temporary cluster with a private Unix socket and no TCP listener, applies every migration, runs all three SQL test files and the concurrent-transaction proof, then stops and removes its own cluster. Set `EAZO_TEST_PG_BIN=/path/to/postgresql/bin` if needed. It never accepts an existing or remote database connection. PostgreSQL process/shared-memory permissions are needed when running inside a sandbox.

For manual tests on a fresh vanilla PostgreSQL test database only, apply `supabase/tests/local-platform.sql`, migrations 001–005, then 007. Do not run the platform stand-ins against Supabase itself. On local Supabase, use the existing platform schemas.

Run `psql -v ON_ERROR_STOP=1 -f supabase/tests/account-sync.sql`. The rollback-only test covers two-account reads and writes, direct-RPC bypasses, idempotency, conflict preservation, explicit resolution, limits, cancelled jobs, late service uploads, retryable deletion, unrelated-account preservation, and the permanent deletion fence. Run `node --import tsx --test tests/cloud-account.test.ts` for the HTTP helper boundary tests.

Development verification on 2026-09-06: the complete runner passed on disposable PostgreSQL 14, including existing access-control and worker-integration checks against the full migration set. Helper tests passed. Two concurrent PostgreSQL transactions saving base revision 0 yielded exactly one accepted revision and one preserved conflicting candidate. Hosted Google login, Storage service behavior, and cross-device UI behavior still need deployment-specific verification.
