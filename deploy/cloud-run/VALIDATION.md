# Local validation, 2026-09-06

- `npm run typecheck`: passed after worker, invocation helper and checkpoint adapter changes.
- ESLint for new cloud modules, worker entrypoint, JSON adapter and new tests: passed.
- `node --import tsx --test tests/cloud-run-store.test.ts tests/book-analysis.test.ts tests/book-axes.test.ts tests/semantic-zoom.test.ts`: 26 passed, 0 failed.
  Covers source coordinate retention, phase cache replay, hierarchy checks, durable adapter restoration,
  storage failure before pointer publication, checksum corruption, stale-lease preflight and async context isolation.
- `deploy/cloud-run/test-contract.sql` applied to a disposable PostgreSQL instance under `/private/tmp`:
  passed duplicate claim, lease expiry/takeover, stale token rejection, checkpoint listing/restoration,
  missing-result refusal, terminal no-op and client RPC privilege checks. Instance stopped afterward.
  This used stub Supabase roles/auth table; it does NOT validate actual Supabase Storage or deployed RLS.
- `git diff --check`: passed.
- Dependencies resolved from the original checkout's existing `node_modules` through a temporary local
  symlink; source checkout not modified. Installed Next.js environment-variable guide read before edits.
- gcloud local project: `eazo-hack-20260905-c1710`; active account list empty. No cloud inventory,
  billing status, IAM policy or model quota could be verified without login.
- Docker daemon 29.7.2 available after local sandbox escalation. Build result recorded below.

Not performed: remote SQL/storage changes, API enablement, billing changes, registry push, deployment,
paid analysis, Vercel federation token exchange, full cross-platform end-to-end, interruption test on
Cloud Run, owner-isolation tests on real Supabase, Shanghai network reliability tests.

The SQL is a reviewable reference contract; integration with the Supabase task remains mandatory.
The Vercel task owns public route authorization, quotas, dispatch reconciliation and reader result loading.

Container checks:
- Initial full-app dependency build failed with npm ECONNRESET. Replaced it with a separate worker
  manifest/lockfile pinned to the same four direct dependency versions as the app.
- `docker build --platform linux/amd64 -f deploy/cloud-run/Dockerfile -t eazo-book-analysis:local-check .`:
  passed, 51 packages installed. Final base image pinned to the digest resolved by this successful build.
- Image inspection: `amd64`, runtime user `node`, reported image size 88,897,505 bytes.
- `docker run --rm --platform linux/amd64 --network none --read-only -e TSX_DISABLE_CACHE=1 eazo-book-analysis:local-check`:
  imports and entrypoint loaded; expected exit 1 with generic missing-configuration failure.
  No network, credential injection, provider request or cloud execution occurred.
