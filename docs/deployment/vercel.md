# Eazo Vercel deployment preparation

Prepared 2026-09-06. **Local preparation only: no Vercel project, environment, domain, billing, IAM, database or deployment was changed.**

## Source and account checkpoint

- Base commit: `7888dfa6ced33550ef01118e0d8eff13acb3179a` in this isolated worktree and `/Users/17c1710/Project/Eazo Hack`.
- Final source recheck: original HEAD advanced to `e21e595bb75f149d5f78128d9ec09c7b77e0385a` (library controls/messaging and axis documentation), with an additional uncommitted removal of the edition/hint paragraphs in `continuous-txt-reader.tsx`. These UI changes were not copied or merged here; deployment code is independent, but integrate the selected final source and rerun validation before deploying.
- Original checkout inspected read-only. Its only uncommitted change at inspection was 16 added lines in `docs/23-fine-axis-scale.md`; runtime code matched. Do not overwrite that change. Recheck before integrating these files; no automatic merge, commit or push is authorized.
- Vercel dashboard inspected read-only: signed in, scope `c171017`, Hobby, “Deploy your first project.” No existing project was shown. CLI was not installed. Account access works; GitHub installation/repository access has not been verified.
- Proposed new project: `eazo-hack`, source repository `C171017/EazoHack`, repository root `./`. Project-name availability and final approved source commit still need verification.
- The app currently reads the bundled Republic source/map, keeps user library state in IndexedDB, and exposes short AI request handlers. Cloud accounts, private cloud library storage, and hosted analysis require the sibling Supabase and Cloud Run changes. A successful Vercel build alone is not full-stack completion.

## Prepared configuration

| Setting | Prepared value / reason |
| --- | --- |
| Framework | Next.js, frontend and `src/app/api/**` together |
| Node | `>=22.13.0 <23`, selects Vercel 22.x; local check uses 22.22.3 |
| Install | `npm ci`, committed lockfile |
| Build | `npm run build:vercel` |
| Output | Leave framework default `.next`; no static export, custom server or Docker |
| Function region | `hkg1` (Hong Kong), provisional Shanghai candidate; confirm against Supabase region before creating project |
| Compute | Use Fluid Compute; existing assist limit 120 s and emblem limit 60 s fit the documented Hobby ceiling |
| Asset delivery | Vercel build prepares allowlisted files in ignored `public/_pdf/`; Next `beforeFiles` rewrites preserve `/api/pdf/source` and `/api/pdf/assets/*` |
| File tracing | Explicit source text, map pointer, hierarchy graph/hierarchy JSON and demo PDF includes; post-build checks verify the exact pointer-selected version |

Node's old open-ended range could select Vercel's newer default Node major. The bounded range keeps this deployment on the locally tested line. [Vercel Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

The 38,190,788-byte demo PDF and 4,750,805-byte OCR JS exceed the conservative function response budget. They are served as static assets in the hosted build. Runtime handlers remain available for ordinary local development. Generated files are never committed; every Vercel build recreates them from locked dependencies and the bundled public-domain demo. Private user uploads must never enter this directory. Vercel documents a 4.5 MB function request/response limit and a standard 250 MB uncompressed function bundle limit. [Function limits](https://vercel.com/docs/functions/limitations).

Next's `beforeFiles` rewrites are required because filesystem API routes would otherwise win. Read the installed Next 16.3.4 docs in `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/{output,rewrites}.md` before modifying this behavior. The check script validates route manifests as well as file traces. Vercel's final packaging/CDN behavior still needs a protected deployment check.

Hong Kong is a compute region, not a guarantee of mainland accessibility. Co-locate API/database where practical after the other platform region decisions; the browser's route into Vercel is still a separate measurement. [Vercel regions](https://vercel.com/docs/regions).

## Environment contract (names only)

Do not paste secrets into chat. Enter secret values directly into the provider's environment UI/secret manager, scoped to the intended deployment environment. Never expose server variables via `NEXT_PUBLIC_` or `next.config.env`. Changes require a new deployment to take effect.

| Variable | Scope | Current consumption / prerequisite |
| --- | --- | --- |
| `GOOGLE_CLOUD_PROJECT` | Server | Vertex resource project; keep consistent with `GCP_PROJECT_ID` |
| `GOOGLE_CLOUD_LOCATION` | Server | Existing default `global`; cloud task must verify model availability |
| `GEMINI_MODEL` | Server | Existing default `gemini-3.8-flash`; verify entitled model before live calls |
| `GCP_PROJECT_ID` | Server | Alternate Vertex project ID |
| `GCP_PROJECT_NUMBER` | Server | Numeric project owning the WIF pool |
| `GCP_SERVICE_ACCOUNT_EMAIL` | Server | Vercel caller identity, separate from job runtime identity |
| `GCP_WORKLOAD_IDENTITY_POOL_ID` | Server | Cloud task's approved WIF pool |
| `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` | Server | Cloud task's approved OIDC provider |
| `VERCEL`, `VERCEL_OIDC_TOKEN` | Platform-managed | Do not store a copied token or manually enter production credentials |
| `IMAGE_PROVIDER` | Server | Current production default `fal`; explicit `bfl` selects BFL |
| `FAL_KEY` | Server secret | Only needed if fal is selected |
| `BFL_API_KEY` | Server secret | Only needed if BFL is selected |
| `INCO_API_KEY` | Server secret | Current Inco selector is development-only; setting this alone does not select Inco in production |
| `EAZO_PDF_LAYOUT_URL`, `EAZO_PDF_LAYOUT_LABEL`, `EAZO_PDF_LAYOUT_TOKEN` | Server; token secret | Optional layout service, independent of Cloud Run Jobs; omit until configured |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server | Proposed handoff name; requires Supabase client/auth integration |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser + server | Proposed publishable key, protected by RLS; never substitute a service key |
| `SUPABASE_SECRET_KEY` | Server secret | Proposed privileged adapter credential if needed; confirm naming with Supabase task, not consumed by this branch |
| `EAZO_CLOUD_RUN_PROJECT`, `EAZO_CLOUD_RUN_REGION`, `EAZO_CLOUD_RUN_JOB` | Server | Proposed job resource identifiers; not consumed by this branch, reconcile with Cloud Run task |

This table intentionally distinguishes existing variables from proposed cross-platform names. Do not configure unused handoff variables and assume the integration works. Keep preview and production credentials separate; preview must not gain production data access. Public Supabase values are frozen into the browser bundle at build time. [Next environment variables](https://nextjs.org/docs/app/guides/environment-variables), [Vercel environment variables](https://vercel.com/docs/environment-variables).

## Vertex OIDC handoff to the Cloud Run task

Existing `src/server/providers/vertex-gemini.ts` calls `getVercelOidcToken()` inside a request, exchanges it using Google `ExternalAccountClient`, and impersonates `GCP_SERVICE_ACCOUNT_EMAIL`. It uses ADC outside Vercel. This branch changes none of that authentication behavior.

The current code does **not** request a custom OIDC audience. Therefore configure GCP allowed audiences to the actual default Vercel token audience `https://vercel.com/c171017`, if this remains the selected scope. Do not choose GCP's default provider audience without also updating token acquisition. The `//iam.googleapis.com/projects/.../providers/...` value in the external account client is the STS target audience, a different field from the subject token's `aud`.

Cloud task should inspect/confirm issuer mode, exact project name and environment claims. With team issuer mode the expected issuer is `https://oidc.vercel.com/c171017`; global mode uses `https://oidc.vercel.com`. Restrict trust to the exact owner/project and authorized `preview` or `production` subject, never every project in the pool. Use a scoped Workload Identity User binding for impersonation and only the resource roles needed for Vertex and the selected job. Avoid service-account key files. Provisioning/IAM changes require authorization in the cloud task. [Vercel GCP OIDC guide](https://vercel.com/docs/oidc/gcp), [OIDC reference](https://vercel.com/docs/oidc/reference).

## Cross-platform integration contracts

### Supabase task owns auth, data and storage

- Supply the project URL, public-key variable name, region, private bucket IDs, RLS policies, session verification helper and migration version in documentation. No secret values in handoff messages.
- Protect `/api/assist/[kind]`, `/api/book-emblem` and any future analysis submission/status endpoint with verified Supabase identity, ownership checks and per-user quotas before public release. The current handlers do not enforce user authentication; Origin checks alone would not fix this.
- Upload books directly from the authenticated browser to private Supabase Storage using restricted signed upload authorization or the user session and Storage policies. Do not proxy full PDFs through Vercel's JSON handlers (current app limit 128 KiB).
- Use owner-scoped book IDs and storage keys, immutable source hash/extraction version, graph version and analysis state. Carry source anchors across cloud persistence unchanged. The bundled Republic file remains the bootstrap demo, not a writable shared user library.
- Supply the implemented auth callback route. Add its exact protected preview and production URLs to Supabase's redirect allowlist after approval; avoid broad wildcard production callbacks. Final domain choice changes this configuration.
- Browser download URLs must be authenticated or short-lived signed URLs, including PDF range support and needed CORS. Verify session refresh, sign-out, upload, reload and cross-account denial.

### Cloud Run task owns long-running analysis and invocation adapter

- Provide a named Cloud Run **Job**, approved region, runtime service account, input/output storage contract, status schema and idempotent submission adapter. A Job is executed through the Cloud Run Admin API; it is not an HTTP service URL.
- Proposed flow: authenticated browser uploads source → Vercel verifies ownership and creates a durable pending analysis record → server invokes `POST https://run.googleapis.com/v2/projects/{project}/locations/{region}/jobs/{job}:run` using a Google OAuth access token → return `202` with application job ID → UI polls authorized status → job publishes validated graph/source metadata to Supabase.
- If using per-execution overrides, the cloud task must provide the required override permission as well as basic execution permission. Pass an application analysis ID, not arbitrary commands, credentials or unverified caller-supplied storage URLs. Job runtime reads its own secrets from the approved secret store.
- Submission must tolerate uncertain responses: persist idempotency state, avoid duplicate paid runs, and reconcile the Cloud Run operation/execution name. Job retries must not partially publish a graph. Do not run `scripts/analyze-book.ts` inside a Vercel request or write analysis output under the deployed `data/` directory.
- The currently bundled map loader caches an immutable filesystem version. It does not automatically see cloud job output. Cloud-backed reader/map loading and job-status UI remain cross-platform application integration work, not enabled by environment variables.

Provider references: [Supabase direct uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads), [Cloud Run job execution](https://docs.cloud.google.com/run/docs/execute/jobs).

## Exact authorization sequence

No command in this section has been run against Vercel.

1. Review/integrate this worktree with the Supabase and Cloud Run changes; choose the source commit/branch explicitly. Do not import the untouched `main` and assume these local files are included. No automatic merge/push.
2. **First external authorization:** create project `eazo-hack` under existing `c171017`, link/import `C171017/EazoHack` at repository root, use Next.js/Node 22.x and the prepared build/region settings. No paid upgrade, credit card, billing change or domain purchase. If GitHub access is missing, show the exact repository permission request before granting it.
3. Import can trigger deployment. Prefer creating/configuring an empty project via the dashboard/CLI project-add workflow, then connecting the approved repository/branch and deploying the protected preview. If the import wizard couples creation with deployment, authorization must explicitly include that first protected deployment. Verify Standard Protection is enabled before credentials or code become reachable. If the UI cannot guarantee a protected first deployment, stop before Deploy and resolve that setting separately.
4. Configure Preview-only environment names from the table, obtaining secrets through the secure UI. Enable/verify OIDC token generation and agree issuer/audience/claims with the Cloud Run task. This step changes external configuration and is part of the approval. Do not grant preview access to production resources.
5. Deploy one protected Preview from the reviewed source. Do not use `vercel --prod`, promote it, attach a production domain, disable protection or authorize automatic production releases at this checkpoint. If using Git integration, verify which branch triggers production before connecting; use the reviewed non-production branch for the first preview.
6. Inspect build/trace output, run the smoke checks and authenticated browser/cloud tests. Only run paid provider/job tests within the authorized test budget. Capture sanitized outcomes, not tokens or book contents.
7. **Separate public-release authorization:** after auth/storage/jobs and Shanghai tests pass, present the exact source commit, production environment, production branch, visibility and domain. Ask permission to configure Production variables, deploy/promote to production and publish the agreed URL. Check Hobby eligibility for the intended use; any necessary paid plan change requires separate approval.
8. Start with the assigned `*.vercel.app` URL unless the user names an owned custom domain. For an owned domain, present the exact hostname and Vercel-generated DNS records after project creation; authorize DNS and Supabase callback changes before applying. No speculative DNS records or domain purchases.
9. For subsequent Git imports/releases, document automatic deployment behavior and only enable it within the approved scope. Rollback changes deployment routing, not Supabase schema or persisted job results; retain compatible schema/graph versions.

[Deployment Protection](https://vercel.com/docs/deployment-protection), [Git deployments](https://vercel.com/docs/deployments/git), [Domain setup](https://vercel.com/docs/domains/working-with-domains/add-a-domain).

## Validation and Shanghai smoke plan

Local commands, no model credentials needed:

```sh
npm ci
npm run lint
npm test
VERCEL=1 npm run build:vercel
VERCEL=1 npm run start -- --port 3106
# In another terminal, from the same checkout:
npm run smoke:vercel -- http://127.0.0.1:3106
```

`VERCEL=1` is a local build emulation flag here, not a token. On Vercel it is platform-managed. The build checker deliberately fails if the CDN rewrites are absent. The smoke script checks root, real map heat data, stale-version 409, PDF range response, worker/large OCR data, disallowed asset 404, development panel 404, layout availability and invalid assistance input. It never calls a paid provider. For a protected preview, run against its exact URL with an approved protection-bypass secret supplied in the shell environment if needed; never place that secret in a command argument, URL or report. A login redirect must not count as a pass.

Network acceptance remains **untested**. After a protected deploy:

| Test | Evidence / acceptance |
| --- | --- |
| Shanghai venue Wi-Fi and a mobile hotspot, normal network path | 5 cold browser loads and 20 warm API probes per network; record connection failures, HTTP status, TTFB, total time and p50/p95; label any VPN/proxy use separately |
| Reader/map | Open Republic, scroll, select source text, open map, zoom/expand, select an occurrence and return to its source; no missing graph or hydration failures |
| PDF/OCR | PDF initial range, later page range, embedded text selection, one scanned-page OCR; MIME/WASM/worker responses correct and no 413; compare cold and warm downloads |
| Fonts | Verify English/Chinese faces; Next downloads Google fonts at build time and self-hosts them, so reader browsers should not require fonts.googleapis.com |
| Auth/cloud library | Sign in/out, refresh, upload small TXT and PDF directly to storage, reopen on another browser; other account cannot access private book/status/artifacts |
| Hosted analysis | One authorized small job completes with durable status and source-validated graph; duplicate submission does not start another job; failure leaves previous graph usable |
| Assistance | One authorized call per enabled method; bounded cancellation/timeout and useful errors; inspect Vercel→Vertex/fal/BFL separately from Shanghai→Vercel |
| External images | Exercise enabled image providers and actual delivery hosts. Generated fal/BFL illustrations currently return inline JPEG data URLs; BFL polling/image download occurs server-side. Record any browser-direct external host after integration and test it from both networks; if none are used, record that explicitly |
| Response budgets | Measure `/api/assist/all` JSON including inline image plus other artifacts; provider limits alone do not prove the combined response fits 4.5 MB. Move durable image bytes to private storage if needed before release |
| Release candidate | No auth bypass, secrets in HTML/client chunks/logs, hidden dev controls, or accidental production deployment; final custom domain tested separately |

Proposed demo target, subject to measurement: no failed core requests, usable reader within 5 s, warm map API p95 below 1.5 s on both Shanghai networks. Report model and full-PDF/OCR latency separately; do not claim mainland reliability from region proximity or a local build.

See `vercel-validation.md` for observed results and remaining limits.
