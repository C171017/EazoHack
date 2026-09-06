# Disposable hosted account-deletion test

`scripts/qa-account-deletion.mjs` is an explicit live test against the Eazo Supabase demo project and protected account-sync preview. It is not part of `npm test` and does not run automatically.

The creation phase makes exactly one uniquely named `eazo-qa-delete-<uuid>@example.invalid` identity, with confirmed email and QA-purpose/run markers. Its random password, session, source references, and signed URLs are written only to mode-0600 files under `/private/tmp/eazo-private-config`. It does not reuse or delete the existing A/B smoke accounts or a Google account.

```sh
node scripts/qa-account-deletion.mjs --create-fixture
# Run only after the protected account-sync preview is ready:
node scripts/qa-account-deletion.mjs --run-preview
```

The script accepts only the known Supabase project and preview alias. It uses the already authenticated Vercel CLI for protected requests; application cookies are stored in private curl configuration files rather than command arguments. Before deletion it verifies the exact email, account ID, QA purpose, and run marker against the auth administration API twice.

The preview phase checks the app session, imports a synthetic 1 KiB TXT, verifies its bytes, saves reading revision one, and invokes the app's `delete-account` action with the exact `DELETE` confirmation. It then checks every owner-scoped table, both Storage listings, authenticated and previously signed downloads, the auth identity, and cleared session cookies. Finally it attempts a late worker write and a previously signed source upload and verifies the durable deletion tombstone fences both and leaves storage listings empty. No models or hosted analysis jobs are called.

The private report is `/private/tmp/eazo-private-config/account-deletion-report.json`. A failed test retains its exact fixture references for diagnosis. Once the fixture is marked deleted, the creation command refuses to create another account.

Storage absence is verified through the official Storage API and both download paths. Direct inspection of the underlying provider's S3 bytes is not available to this script; it relies on the Storage deletion API's documented physical-deletion contract.

## Verified result

The suite passed on 2026-09-06 against `https://eazo-hack-account-sync-c171017.vercel.app` (the protected preview deployment `dpl_AibKdBMPneGDKdmaBLpCKgSZx2mE`). Its own account authenticated, uploaded a checksum-verified 1 KiB source, and saved revision one. The app then completed deletion successfully.

Post-deletion checks passed for all owner-scoped rows, both Storage prefixes, authenticated and previously signed downloads, auth identity removal, and cleared app cookies. The permanent tombstone rejected both a late service-worker upload and reuse of the previously signed source upload; both prefixes remained empty afterward. No model calls or analysis jobs were made. Only the dedicated synthetic identity created by this script was deleted; existing A/B smoke accounts and user Google accounts were not targeted.
