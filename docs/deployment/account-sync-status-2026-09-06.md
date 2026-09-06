# Public read.vin release verified — 2026-09-06

This section supersedes the earlier Preview-only and pending-login notes below.

- User explicitly authorized making the account system public on `read.vin`.
- Google OAuth audience is **In production**. App homepage `https://read.vin`, privacy policy `https://read.vin/privacy`, and authorized domain `read.vin` are configured. Basic identity/email/profile only; no test-user restriction for this public configuration.
- Supabase Site URL is `https://read.vin`; exact production callback `/auth/callback` is allowed. Google provider enabled; Email provider disabled.
- Production runtime configuration is installed in Vercel's encrypted Production records, including actual Supabase credentials, the canonical origin, and existing Inco/fal provider credentials. An initial copy used redacted placeholders; live verification caught it, the three Supabase values were corrected from a validated private runtime source, and the same release was redeployed successfully. No credentials are stored here.
- Verified corrected READY Production deployment: `dpl_BbyK4KBm6tTKpGkfTcKc4PMZMsSx`, source main `4c060b1`. Main includes the agreed account features and latest reader UI. Signed-out cloud-icon Google entry and removed legacy login page are preserved; `/account` is available only after sign-in.
- Live browser Google login completed on `read.vin` using the approved owner account. `/account` displayed that identity, private-library controls, export, and deletion. No Preview protection bypass was used for this public flow.
- All 11 public HTTP smoke checks passed. Real hosted A/B tests passed directly against `https://read.vin`: source upload, revision/idempotency/conflict preservation, source validation, app/RPC/RLS/Storage isolation, paginated export, real refresh rotation, secure cookies, expired-session cleanup, foreign-origin denial, and removed password endpoint. `/account` SSR checks passed for both owners with no cross-account or token leakage. No paid model calls or account deletion occurred in this production pass.
- Local frozen release passed 267 tests, typecheck, lint and the Vercel build. The earlier isolated account-deletion lifecycle test also passed against the same hosted database/service contract.
- Concurrent later main commit `df86fca` updates unrelated reader/map flow and includes the smoke-script version fix. Auth/account files were unchanged; Git integration may advance the public deployment normally. This task did not force-push or cancel independent builds.

## Remaining separate production AI permission

`EAZO_ENABLE_ANALYSIS=0` remains deliberate. Automatic approval review rejected granting Production's Google Cloud Workload Identity User access because the public-release request did not specifically authorize service-account impersonation. No IAM changes were applied. A user approval question naming the two existing service accounts and exact Production principal is pending. Public login, private libraries, and reading synchronization work independently. See `production-wif-2026-09-06.md` before attempting those access changes; do not bypass the rejection.

Private A/B evidence: `/private/tmp/eazo-private-config/qa-run-742952f7-a876-4798-9ed4-d1513fc859d5/report.json`. Release evidence: `/private/tmp/eazo-production-release-sm84wn63/.release-validation/RELEASE.md`. These are temporary artifacts; never print credential files from their neighboring private directories.

# Google login verified — 2026-09-06

Google provider enabled after the user saved its credentials. Browser OAuth verification completed on the protected account-sync preview: Google account chooser, approved basic-profile consent, Supabase callback, then Eazo displayed the signed-in owner account and private empty library. The legacy Email provider was subsequently disabled; final provider settings were verified through the Auth settings endpoint. This supersedes the pending credential handoff notes below.

The protected preview is validated. `read.vin` Production was not updated by this task, and Google's audience remains Testing with the approved test user. A public rollout still requires configuring the production origin/environment and Google audience for the intended users.

# Live activation progress — 2026-09-06

This section supersedes the earlier local-only implementation status below.

- User approved the Google support/contact email and explicitly approved accepting the Google API Services User Data Policy and creating the web OAuth client.
- Google OAuth configuration and a Web application client were created in `eazo-hack-20260905-c1710`; callback is the project's Supabase `/auth/v1/callback`. The Google client secret is never stored in repository code. Its entry into Supabase is a browser-policy user handoff.
- Google external audience remains Testing, with the approved owner account added as a test user.
- Hosted migration 007 applied and postflight verified. Existing book/source/job preserved, source storage reservation backfilled to 1,316 bytes, and managed Storage ownership preserved.
- Supabase Site URL is `https://eazo-hack-account-sync-c171017.vercel.app`; exactly one callback URL ending `/auth/callback` is allowed. A proposed query wildcard was rejected by automatic approval review and removed; matching Site URL origin accepts the state-bearing callback without it.
- Current `read.vin` is associated with Production through GitHub/main. This task preserves that public deployment and validates a separate protected Preview. Old deployment notes describing read.vin as protected Preview are outdated.
- Release snapshot `/private/tmp/eazo-account-release-k1j_dfsj` isolates the account feature from unrelated concurrent changes. Tests, typecheck, lint, Vercel build and eleven HTTP smoke checks passed. Preview deployment `dpl_AibKdBMPneGDKdmaBLpCKgSZx2mE` reached READY and serves the dedicated alias. Both preview URLs return unauthenticated 302 to Vercel authentication; public Production routing was not changed.

- Hosted lifecycle test: a newly-created, uniquely marked synthetic account uploaded and saved a small source, then was deleted through the app. Its records, auth identity and Storage API download paths were removed; late worker and signed uploads were fenced. Existing accounts untouched; no model calls.
- Hosted A/B checks passed for distinct identities, source upload, revision/idempotency/conflict handling, and app/RPC/RLS/Storage cross-account isolation. Final checks also passed for paginated owner-only export, actual access-token refresh, secure session cookies, invalid-session cleanup, cross-origin rejection, and the removed password endpoint. The suite used two real hosted Supabase synthetic accounts, not two completed Google consent flows.
- Google provider is still disabled pending the user-only client credential entry/save step in the open Supabase panel. Application Google-only UI is deployed, but a completed Google consent round trip has not yet been verified. Email provider has not yet been disabled; complete Google activation before removing that existing provider. Test sessions were minted only for the retained synthetic QA accounts; the application exposes only Google login.

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
