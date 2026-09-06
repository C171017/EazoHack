# Uploaded-book map repair

## Reproduced failures

- Safari on `read.vin` showed the supplied PSI brochure and the exact “Book map unavailable / Add this book to your account” dead end. The shelf confirmed this session was signed out.
- Production `useBookAnalysis` stopped whenever a device book lacked `cloudSourceId`, before asking for the session or resolving an existing account source. Its retry repeated the same branch. Account-cached books could also reopen with an owner but no source ID.
- A real hosted test of a synthetic 918-byte story uploaded source and reading successfully and dispatched job `f3b7dd86-f1fa-4fac-b1e5-e5cc6f6c6429`. The worker exhausted its three attempts. Its private checkpoint reported `No supported occurrences survived review.` Extraction had labeled all narrative nodes `paratext` because segmentation defaults all unrecognized text to `Front matter`. Review correctly rejected that classification; cached retries repeated it.

## Changes

- Production always checks the authenticated hosted path. Missing source IDs resolve by exact book ID, file hash and extraction version. Account changes fail closed.
- Signed-out readers get a direct Google sign-in link and return instructions. Signed-in device-only books get an explicit **Add to account and build map** action. No new device-only source is uploaded before that action.
- Existing maps and active jobs are reused. Account caches can repair a missing source. Hosted startup receives cancellation and idle jobs no longer poll forever as if queued.
- Unknown sections start as `Source text` with an `unknown` segmentation hint. The model must classify their actual passages. Explicit recognized editorial/chapter hints remain; published node roles and exact-source validation are unchanged.
- Extraction prompts clarify that location hints are fallible metadata. Changed section metadata and request hashes invalidate affected old checkpoints without rewriting public sample maps.

## Validation

- Focused initial account/map tests: 33 passed. After worker changes, pipeline/Chinese-map/hosted tests: 26 passed. Final full suite: **372/374 passed**. The two failures (Chinese sample slot migration and mixed text/image dispatch) also reproduced in an unchanged `d4e0f87` archive.
- Scoped ESLint, `git diff --check`, and an isolated `VERCEL=1 npm run build:vercel` passed, including TypeScript and asset tracing.
- Browser tested signed-out import, authenticated device-only import, explicit add/upload, saved-reading copy, real worker submission and failure reporting using the existing synthetic QA account. The user's brochure was not uploaded or analyzed.
- The corrected pipeline ran against the same synthetic story with the real configured model: **4 nodes, 4 identities, 3 edges, 2 themes**, and hierarchy `semantic-hierarchy-v4-bounded-1ee8e9f898053969`. Exact anchors and hierarchy validation passed.
- A separate local QA page rendered those actual generated artifacts with the application renderer. Keyboard activation opened a note, loaded its evidence, and highlighted the exact original passage. QA-only routes exist solely in the temporary checkout, not this repository or the release snapshot.
- Linux/AMD64 worker image `eazo-book-analysis:map-source-fix` built successfully from the tested snapshot. An offline, read-only container imported the pipeline and asserted neutral source hints plus the corrected extraction prompt. Local image manifest list: `sha256:35ff64f7cdbfc22d9722d3c548840a316b47eadacb7de6fe1b8682463ce7895d`. It has not been pushed to the registry.

## Release state

Not deployed. Automatic approval review rejected the web production deployment because troubleshooting/testing did not explicitly authorize changing the live service. No workaround deployment was attempted. A consolidated approval question for both the web app and existing worker release is pending.

- Tested release snapshot: `/private/tmp/eazo-map-repair-88_5dsjy`.
- Generated synthetic artifacts: `/private/tmp/eazo-map-fixed-analysis`.
- Browser rendering fixture: `/private/tmp/eazo-map-render-afj6m1sb` (`/qa`, port 3109).
- Current inspected web deployment: `dpl_2VB4dif3MZZ15Yj1J23icdwtTYo4`, `eazo-hack-4ao4qbhjd-c171017.vercel.app`, READY/Production.
- Existing worker project/job: `eazo-hack-20260905-c1710` / `asia-east1` / `eazo-book-analysis`. QA reported pipeline `worker-dd8ea048e3a052ac1249`.

After approval: publish the tested worker image, update only the existing job image/pipeline and matching web pipeline setting as needed, deploy the web fix, and repeat the synthetic hosted test through publication and automatic map opening. Preserve IAM, secrets, quotas, and other job configuration. Do not claim the hosted fix works until the updated worker succeeds. The local model/renderer success is separate from hosted publication.
