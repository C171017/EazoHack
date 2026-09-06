# Account synchronization implementation status — 2026-09-06

Implemented locally with Google as the only application login option. No live provider configuration, hosted schema migration, or deployment was performed in this task.

## Delivered

- Google PKCE initiation/callback, cookie sessions, protected-request renewal, account switching and sign-out.
- Owner-scoped private records, revision-based snapshot RPCs, account-scoped browser caches, stale-account request rejection.
- Automatic progress/highlight/aid/map-state/footprint save and restore; durable local pending changes and retry; explicit conflict choices with recovery copies.
- Guest autosave, local book/progress import and Save to account from the reader (including sample books). Matching Republic source retains its public verified map.
- Account usage limits, ZIP export with paginated history and private file downloads, recoverable deletion workflow and privacy/storage explanation.
- Immutable source validation with bounded per-account process cache.

## Verification

- Full application suite: 258 tests passed.
- TypeScript validation passed; lint has no errors (an unrelated existing local-dev unused-variable warning remains).
- Isolated production build passed. Later small export missing-file handling and sample-map retention changes passed typecheck and targeted account/auth/export tests.
- Disposable PostgreSQL runner passed all access-control, worker, account, and concurrent-save tests; no hosted database was used.
- Browser verified Google-only account page, unavailable-provider feedback, guest autosave, same-passage restoration after reload, and Save to account navigation.

## Live activation still required

1. Finish Google Auth Platform setup in `eazo-hack-20260905-c1710`. Eazo app name and External/testing audience are prepared in the browser. Automatic approval review rejected entering the private support/contact email into Google's contact form because that specific transmission was not explicitly authorized. The contact field remains pending.
2. Create the web OAuth client and configure Supabase Google provider/redirect allow-list and canonical EAZO_SITE_URL, following `docs/google-auth-setup.md`. Existing local `.env.local` has no Supabase runtime configuration.
3. Apply only the new migration 007 to the existing hosted schema after confirming migration state. Migrations 001–005 were previously documented as installed; do not blindly reapply them. New cloud APIs need migration 007 before activation.
4. Deploy the reviewed application to the existing protected preview, then verify actual Google authentication with two accounts, two-device synchronization, signed Storage access and physical deletion using disposable data.

Google setup and hosted verification are not implied by passing mocked auth/HTTP tests or disposable PostgreSQL tests. Existing code may be changing concurrently in other tasks; recheck the exact release diff before deployment.

## Practical limits

Offline reading works on an already-open book. Cold opening/reloading a cloud source still requires network. Snapshot/history quotas reject additional saves once full, retaining pending local work. Exports use a fixed history cutoff while editable book metadata and heads are current as fetched. Deleted account tombstones remain to fence late writes; copies on other offline devices and provider backups/logs have separate lifecycles.
