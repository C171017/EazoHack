# Bookshelf upload to hosted analysis

The production bookshelf saved TXT/PDF imports locally and showed 100% text preparation, then called `/api/book-analysis`, which deliberately rejects hosted requests. Cloud readers also did not poll for map completion.

The fix routes production imports through account source upload, idempotent hosted submission, source-specific status polling, and opening the published cloud reader. Existing jobs are reused; explicit retry resumes queued/running jobs or restarts failed jobs. Local development analysis remains available. Status checks require source ownership and return private, uncached responses.

Validation: typecheck, scoped ESLint, all new regression tests, and an isolated `VERCEL=1 npm run build:vercel` passed. Full suite: 349/351 pass. Both failures also reproduce in an unchanged HEAD archive: Chinese sample slot migration and mixed text/image provider dispatch. Build snapshot: `/private/tmp/eazo-upload-fix-bbsmaedj`.

Live account inspection confirmed the uploaded Kong Yiji was only in the browser library. Copied that book and its saved reading progress to the user's private account successfully. No source text changed.

Production remains separately blocked: live read-only IAM inspection shows the jobs-invoker service account grants `roles/iam.workloadIdentityUser` only to the exact Preview subject, not Production. The production Gemini permission previously approved does not grant permission to invoke book-analysis jobs. See `production-wif-2026-09-06.md`. Worker authorization and enabling hosted analysis still need completion; these code changes have not been deployed by this task.

## Approved production enablement

The user explicitly approved the production jobs-invoker grant, enabling hosted analysis, and deployment. Added only the exact production subject `owner:c171017:project:eazo-hack:environment:production` to `roles/iam.workloadIdentityUser` on `eazo-jobs-invoker@eazo-hack-20260905-c1710.iam.gserviceaccount.com`; the existing Preview binding remains. Set only the production `EAZO_ENABLE_ANALYSIS` variable to `1`, verified required worker configuration exists, and checked unrelated environment records were unchanged.

Production deployment in progress: `eazo-hack-l4ngt85px-c171017.vercel.app` (`dpl_9jUZa2JqQ1GwVRsWrsKNupFyGV1F`), using the tested frozen snapshot. Concurrent bookshelf component/style edits were excluded.

## Final live verification

Production deployment `dpl_27pBgmc6kLbeqrFEeVZ3AYkbmxPn` (`https://eazo-hack-rjjlock8x-c171017.vercel.app`) is READY and aliased to `https://read.vin`. This includes the duplicate-upload correction: prepare verifies the immutable storage object and reuses it; interrupted uploads with only a source row still receive an upload URL. The authenticated regression suite now passes 22 tests, including source ownership, exact-source job status, idempotent submission, explicit retry, duplicate uploads and interrupted uploads. The updated isolated production build passed.

The real Kong Yiji job `4d785882-52cb-4c80-8bb2-ea7a4c74f6cb` succeeded on attempt 1: submitted `2026-09-06T07:16:42.059839Z`, published `2026-09-06T07:17:57.479175Z`, approximately 75.4 seconds end to end. The browser automatically opened `/?book=cloud` and rendered six Chinese map notes, from the tavern's class structure through Kong Yiji's final appearance. This is measured success, not a sub-minute guarantee. No worker image or pipeline was changed.

Read-only public smoke checks passed after production enablement. The Google browser session expired during investigation and was restored using the same previously signed-in account. Both the initial local copy and the saved account reading remain.

Final bookshelf reopen verification on the updated release passed: opening the original local Kong Yiji tile reused the existing source and automatically returned to the completed cloud map. The working map was left open in the browser.
