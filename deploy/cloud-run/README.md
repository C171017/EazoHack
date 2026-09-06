# Cloud Run Jobs authorization checkpoint

Prepared 2026-09-06 against commit `7888dfa6ced33550ef01118e0d8eff13acb3179a`.
Nothing has been pushed, provisioned, deployed or executed against Vertex/Supabase.
The original checkout is read-only to this task. Its HEAD matched; uncommitted
`docs/23-fine-axis-scale.md` and later reader/library/spine edits are not included.
At final inspection its HEAD advanced to `e21e595bb75f149d5f78128d9ec09c7b77e0385a` with those library/documentation changes, plus an uncommitted `continuous-txt-reader.tsx` edit. The committed analysis pipeline is unchanged. Reconcile the final source revision before building the release image. Never merge automatically.

## Proposed resources and decisions

| Resource | Proposal |
| --- | --- |
| Existing project candidate | `eazo-hack-20260905-c1710` from local gcloud configuration; ownership/billing/APIs NOT verified |
| Run region / registry region | `asia-east1` (Taiwan); proposal for East Asia audience, no Shanghai reliability measurement |
| Job | `eazo-book-analysis` |
| Artifact Registry Docker repository | `eazo-workers` |
| Image | `asia-east1-docker.pkg.dev/PROJECT_ID/eazo-workers/book-analysis@sha256:IMAGE_DIGEST` |
| Runtime service account | `eazo-book-worker@PROJECT_ID.iam.gserviceaccount.com` |
| Separate invocation service account | `eazo-jobs-invoker@PROJECT_ID.iam.gserviceaccount.com` |
| Secret Manager secret | `eazo-supabase-worker-key`, pin numeric version `1` initially |
| Identity pool/provider | reuse an inspected, restricted existing Vercel federation; otherwise propose `eazo-vercel` / `eazo-production` |
| Compute | 1 vCPU, 2 GiB RAM, 1 task, parallelism 1, 7,200-second task timeout, 2 infrastructure retries |
| Application concurrency | 2 extraction requests; remaining phases follow existing sequential implementation |
| Vertex location / model | `global`; model comes from trusted job row, current default `gemini-3.8-flash`; verify project access and availability before paid test |

Cloud Run parallelism limits tasks **within an execution**, not concurrent executions.
The web backend must enforce an initial global active-book cap of 1 plus per-user quotas.
The database lease prevents duplicate execution of the SAME job, not different jobs.
A two-hour timeout is an initial bound, not proof a full book completes in two hours.
A job can consume up to six task-hours across three attempts; waiting/retries also cost.

## Prepared implementation

- `Dockerfile` packages only analysis dependencies/source, uses Node 22 and a non-root user.
  Its sibling Docker ignore file excludes source books, local results, `.env*`, credentials,
  Git state and unrelated app files. `tsx` stays installed because it runs the TypeScript entrypoint.
  `npm ci --ignore-scripts` uses the separate worker lockfile (four pinned direct runtime dependencies). The tested base-image digest is pinned; refresh it deliberately with release validation.
- `scripts/cloud-run-book.ts` runs extraction, axis assignment/calibration and hierarchy generation.
  All phase JSON stores use an AsyncLocalStorage adapter; the original local CLI still uses files.
- `src/server/book-analysis/cloud/store.ts` reads/writes Supabase over bounded HTTPS requests.
  Checkpoint payloads have SHA-256 object addresses, then a lease-fenced RPC publishes their pointers.
- `supabase-worker-contract.sql` is a **reference contract for the Supabase task**, not an applied migration.
  It includes a row lock, 120-second renewable lease, three-attempt limit, idempotency constraint,
  checkpoint index and atomic final-result pointer. Clients cannot call the worker RPC.
- `src/server/book-analysis/cloud/invoke.ts` provides the Vercel server helper. It uses a dedicated
  invocation identity and a Google OAuth access token, then POSTs the job UUID override to Run v2.
  It returns the operation name immediately. It does not create a public route or enforce user ownership.

## Supabase / Vercel integration contract (must be accepted before deployment)

1. Supabase owns private buckets `analysis-inputs` and `analysis-private`, each with 16 MiB limits.
   Accept canonical UTF-8 text, including PDF-extracted text only after its source-anchor representation
   is fixed. The worker hashes exact uploaded bytes; anchor offsets refer to LF-normalized UTF-16 text,
   exactly as the current reader pipeline. No trimming, rewriting or OCR occurs in the worker.
2. Vercel authenticates the user, verifies book ownership and input ownership/checksum, restricts model
   and pipeline version to server allowlists, and enforces book-size/chunk and spending quotas.
   Accepted source objects must be immutable (versioned paths; no subsequent client overwrite).
3. The server inserts `eazo_analysis_jobs` with `owner_id`, `book_id`, `source_path`, `source_sha256`,
   `model`, `pipeline_version`. Reuse the existing UUID on the unique tuple conflict. These fields are
   immutable after insertion. Use the built image's source revision as `pipeline_version`.
4. After insertion, call `invokeBookAnalysis(id)`; persist returned operation metadata in the web
   orchestration layer. Timeout is ambiguous: reuse the SAME job UUID if retrying dispatch.
   A durable outbox/reconciler must retry inserts whose dispatch failed. This is a cross-platform
   dependency; no cron/scheduler was provisioned here.
5. The worker receives ONLY `EAZO_ANALYSIS_JOB_ID` as an override, claims the row, verifies source hash
   and pipeline revision, then restores every checkpoint remotely. It polls a live competing lease
   for at most 150 seconds so an infrastructure retry can wait out a killed worker's old lease.
   Heartbeat runs every 25 seconds. Loss of heartbeat aborts provider requests and prevents new calls;
   RPC fencing rejects stale writes and publication even if a container is still alive.
6. Completed provider replies are checkpointed before phase validation; phase request/schema hashes
   and existing Zod/source checks govern reuse. No local volume, file lock, or `/tmp` data is required.
   Exact-once **billing** is impossible: a kill after Vertex returns but before durable upload/pointer
   commit can repeat that request. Duplicate dispatch and completed checkpoint processing are avoided;
   this small non-transactional provider/storage window remains explicitly at-least-once.
7. Only `status=complete` and its `result` pointer expose the finished `{graph,hierarchy,sourceSha256,
   pipelineVersion}` JSON. Intermediate `current-graph.json` / `current-map.json` are private checkpoints.
   Vercel verifies ownership before issuing short-lived download URLs or serving graph/map responses.
   Reader routes currently loading filesystem artifacts need Supabase result adapters in the web task.
8. On failure, checkpoints remain and status is `retryable` or `failed` after three claims. If the
   LAST attempt is killed, status can remain `running` past `lease_until`. The orchestration reconciler
   must compare Cloud Run execution status and expired leases: mark exhausted jobs failed, re-dispatch
   unexhausted jobs with the same ID. Do not reset attempts automatically. Explicit retry after fixing
   a permanent failure is an operator action. No retry daemon is supplied or running here.
9. Deletion/retention belongs to Supabase: delete checkpoints and unreferenced objects only after
   confirming no live lease. A completed row pins its final object. Keep source and result retention
   consistent with account deletion. Do not make these buckets public.

The MVP uses a server-only Supabase service-role JWT, which bypasses RLS across the project. This is
not bucket-scoped least privilege. Keep it exclusively in Secret Manager/runtime, never `NEXT_PUBLIC_*`,
logs, build args or browser code. A narrower Supabase worker gateway/credential can replace the backend
contract later. Until then, the key is a deliberate trust boundary requiring review with the Supabase task.

## Environment variables (names only)

Worker: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Secret Manager reference),
`GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `EAZO_PIPELINE_VERSION`,
`EAZO_ANALYSIS_JOB_ID` (per-execution override). `GEMINI_MODEL` is set from the validated job row.
Do not set `VERCEL` or `GOOGLE_APPLICATION_CREDENTIALS` in Cloud Run: existing GoogleAuth uses
metadata-server ADC from the attached runtime service account; no downloaded service-account key.

Vercel invoker: `GOOGLE_CLOUD_PROJECT`, `GCP_PROJECT_NUMBER`, `GCP_WORKLOAD_IDENTITY_POOL_ID`,
`GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`, `GCP_JOBS_INVOKER_SERVICE_ACCOUNT_EMAIL`,
`GCP_JOBS_REGION`, `GCP_ANALYSIS_JOB_NAME`; Vercel supplies its short-lived OIDC token.
This does not replace `GCP_SERVICE_ACCOUNT_EMAIL` used by the existing interactive Vertex provider.

## IAM and authentication

Runtime: grant project `roles/aiplatform.user` initially (predefined Vertex caller role; review a custom
predict-only role if policy demands further restriction); secret-level `roles/secretmanager.secretAccessor`
on ONLY `eazo-supabase-worker-key`. No Run admin/invoker, Storage admin or service-account keys.

Invoker: job-level `roles/run.jobsExecutorWithOverrides` (required for the job UUID override), not Run
admin. The Vercel federated production subject gets `roles/iam.workloadIdentityUser` on this invoker SA.
Use `google.subject=assertion.sub`, exact team/project/environment subject and an issuer condition.
The helper uses Vercel's default token audience; set the provider allowed audience to
`https://vercel.com/VERCEL_TEAM_SLUG`. Do not use Google's default provider audience unless the helper
is changed to request that custom audience. Match team issuer mode to `https://oidc.vercel.com/TEAM_SLUG`
or the explicitly selected global issuer. Never trust all pool identities or all preview deployments.

Deployer: needs API/service enablement permission for setup, repository write access for image push,
Run developer on the project/job plus serviceAccountUser on runtime SA; IAM/secret setup needs the
corresponding administrative permissions. Keep deployer permissions separate from runtime/invoker.
Google-managed Run service agent retains normal image-pull permissions; no worker registry-writer grant.

## Exact proposed steps AFTER user authorization

Unresolved values: confirmed project/account and billing state; project number; Supabase project URL,
service-role secret imported privately; Vercel team/project names and issuer mode; federation state;
final merged source revision/image digest; model access/quota. CLI inspection found no active gcloud
account. Login must happen interactively; do not paste credential values in chat.

First inspect/login and confirm project, billing, existing APIs, SA/pool state. If billing is absent,
STOP for explicit billing authorization (do not silently link a billing account).

```sh
gcloud auth login
gcloud projects describe eazo-hack-20260905-c1710
gcloud billing projects describe eazo-hack-20260905-c1710
gcloud services list --enabled --project=eazo-hack-20260905-c1710
```

With confirmed project substituted, enable only missing required APIs and create only absent resources:

```sh
export EAZO_PROJECT_ID=eazo-hack-20260905-c1710
gcloud services enable run.googleapis.com artifactregistry.googleapis.com aiplatform.googleapis.com secretmanager.googleapis.com iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com --project="$EAZO_PROJECT_ID"
gcloud artifacts repositories create eazo-workers --repository-format=docker --location=asia-east1 --project="$EAZO_PROJECT_ID"
gcloud iam service-accounts create eazo-book-worker --project="$EAZO_PROJECT_ID"
gcloud iam service-accounts create eazo-jobs-invoker --project="$EAZO_PROJECT_ID"
gcloud projects add-iam-policy-binding "$EAZO_PROJECT_ID" --member="serviceAccount:eazo-book-worker@$EAZO_PROJECT_ID.iam.gserviceaccount.com" --role=roles/aiplatform.user
gcloud secrets create eazo-supabase-worker-key --replication-policy=automatic --project="$EAZO_PROJECT_ID"
```

Import the Supabase key as Secret Manager version 1 using Console → Secret Manager → secret → New
version. Enter it privately there; never store it in this repository or shell command arguments.
Then bind secret access:

```sh
gcloud secrets add-iam-policy-binding eazo-supabase-worker-key --project="$EAZO_PROJECT_ID" --member="serviceAccount:eazo-book-worker@$EAZO_PROJECT_ID.iam.gserviceaccount.com" --role=roles/secretmanager.secretAccessor
```

Configure/reuse federation in Console → IAM → Workload Identity Federation using the exact issuer,
audience, subject and condition above; grant the exact production principal `roles/iam.workloadIdentityUser`
on `eazo-jobs-invoker`. Vercel task must verify these identifiers and agree before this configuration.
Supabase task must separately authorize/apply its reviewed worker contract and bucket policies first.

Build/push only the reconciled source, explicitly targeting Cloud Run's Linux AMD64 platform:

```sh
gcloud auth configure-docker asia-east1-docker.pkg.dev
docker buildx build --platform linux/amd64 -f deploy/cloud-run/Dockerfile -t "asia-east1-docker.pkg.dev/$EAZO_PROJECT_ID/eazo-workers/book-analysis:SOURCE_REVISION" --push .
```

Copy `job.yaml.template` to a local rendered YAML outside Git, replace PROJECT_ID, IMAGE_DIGEST,
SOURCE_REVISION and SUPABASE_PROJECT_REF; pin secret numeric version. Review the rendered YAML then:

```sh
gcloud run jobs replace /private/tmp/eazo-job.yaml --region=asia-east1 --project="$EAZO_PROJECT_ID"
gcloud run jobs add-iam-policy-binding eazo-book-analysis --region=asia-east1 --project="$EAZO_PROJECT_ID" --member="serviceAccount:eazo-jobs-invoker@$EAZO_PROJECT_ID.iam.gserviceaccount.com" --role=roles/run.jobsExecutorWithOverrides
```

Deployment does not execute analysis. A separately approved small paid smoke test requires an owner-
validated queued Supabase row and its JOB_UUID, then:

```sh
gcloud run jobs execute eazo-book-analysis --region=asia-east1 --project="$EAZO_PROJECT_ID" --update-env-vars=EAZO_ANALYSIS_JOB_ID=JOB_UUID --wait
```

Verify result anchors, hierarchy, source hash, status/usage, OIDC invocation, forced interruption/resume,
duplicate invocation and owner isolation BEFORE a full-book paid run. Test Shanghai connectivity from
the real demo network; provider region selection alone establishes no reliability guarantee.

## Cost and validation

Main drivers: Vertex input/output/thinking tokens across extraction, reviews, axes and hierarchy;
Cloud Run vCPU/RAM seconds including idle network waits and retries; registry storage; Secret Manager;
Supabase database/storage/egress; inter-provider transfer; logs. Budget alerts are not spending caps.
No billable inference or cloud build was run. Local container build is not a cloud deployment.

Local checks and final result are recorded in `VALIDATION.md`.

Official references checked 2026-09-06:
- [Run job execution and overrides](https://docs.cloud.google.com/run/docs/execute/jobs)
- [Run IAM roles](https://docs.cloud.google.com/iam/docs/roles-permissions/run)
- [Job timeout](https://docs.cloud.google.com/run/docs/configuring/task-timeout)
- [Job service identity](https://docs.cloud.google.com/run/docs/configuring/jobs/service-identity)
- [Vercel OIDC/GCP issuer and audience setup](https://vercel.com/docs/oidc/gcp)
- [Supabase storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Cloud Run pricing](https://cloud.google.com/run/pricing)
