# Low-risk performance changes

Implements the five green items from the September 6 audit: scoped CSS detection, selective catalogue writes, early analysis-input rejection, pipeline observability, and deployment regression checks. Public/private caching, authentication client reuse, reader virtualization, synchronization architecture, and other yellow/orange proposals are outside this change.

## Runtime behavior

- Tailwind reads class names only from `src`. Keep complete utility names there; if a future component generates classes elsewhere, explicitly register that source. Analysis files, book text, tests, and generated PDF assets are not class sources. Font declarations and language choices are retained.
- Catalogue reads use read-only IndexedDB transactions. Legacy or colliding shelf positions are repaired only when detected, using a fresh read inside the write transaction. A move updates its book and any displaced book. Source blobs, custom titles, emblems, and duplicate-upload placement behavior are preserved.
- Analysis source downloads enforce the existing 1 MiB limit during streaming. An uncompressed oversized Content-Length is rejected before consuming the body. Missing/incorrect lengths cannot bypass the streamed limit. Compressed responses are limited using the decoded body bytes. Accepted sources still pass the SHA-256 check; normal reader downloads retain their existing 50 MiB limit.

## Pipeline telemetry

Set the server/worker environment variable `EAZO_PERFORMANCE_LOG=1` to emit JSON lines to the existing process log. No external telemetry service is installed; logging is disabled by default. The flag must be set in each execution environment independently. Existing running workers do not pick up source/environment changes until restarted normally.

When opted in, detached local upload workers inherit the dev server's stdout so their structured metrics are visible there; otherwise their output remains discarded as before. Cloud Run and directly invoked CLI jobs use their normal stdout.

`eazo-performance-v1` records use a random execution correlation ID, not a book/account/source identifier. Fields are restricted to fixed operation/stage names, numeric durations, counters, outcomes, and a whitelist of token counts. They exclude prompts, passages, paths, credentials, raw errors, and provider response IDs. Logging failures do not affect pipeline success, retries, or publication.

- `timing`: authentication, provider HTTP/response decoding, model-result validation, checkpoint read/write/list, and analysis/extraction/synthesis/review/emblem/axes/calibration/hierarchy stages. Storage timings include whichever local or durable JsonStore is active.
- `count`: storage hits/misses, validated checkpoint restoration/recovery, provider-reply reuse, and scheduled retries. A storage hit means a file/object exists; it is not necessarily a validated reusable result.
- `usage`: whitelisted usage metadata from each actual Vertex response, captured before finish/JSON/schema rejection. Restored checkpoints do not add their historical usage again. Missing usage stays explicitly unknown; a transport failure with no response cannot establish token usage or billing.
- `run`: actual elapsed execution time, counts, and observed usage totals. Parallel operations overlap and stages contain child timings: do not sum them as wall time. Existing manifest `validatedCalls` stays unchanged for compatibility and is not a complete billing ledger. A cached reply still carries its original model duration there.

Use at least one warm and one resumed run when interpreting cache metrics. The included tests mock provider/auth/storage behavior, including incomplete replies and concurrency; they do not spend tokens. Real elapsed model cost and paid-call duplication remain separate load/fault-injection benchmarks.

## Build and smoke checks

`npm run build:vercel` with `VERCEL=1` validates both published sample graph/hierarchy pairs and their required files in the homepage/map function traces. All emitted app function traces are scanned for private development files and total size. Critical API traces must exist.

`scripts/performance-budgets.json` contains explicit byte budgets: 300 KiB raw / 100 KiB gzip for all emitted CSS, 100 MB for reader/map traces, 250 MB for other app traces, 8 MiB decoded / 3 MiB offline-gzipped for each sample HTML response, and 1 MiB for a sample heat-index page. These are regression ceilings with headroom, not target load times or a claim that all emitted CSS downloads on every route. Trace totals are not final Vercel package sizes. Review a changed asset baseline before deliberately updating a ceiling.

`npm run smoke:vercel -- http://127.0.0.1:PORT` verifies both explicit sample reader routes and their namespaced map versions, response budgets, stale-version rejection, PDF range delivery, allowlisted assets, disabled development routes, and invalid-input rejection before generation. The target must serve the same published sample versions as the checkout running the script. It does not authenticate users or invoke models/jobs. Production protection bypass, if required, remains an environment-only secret.

Source text, UTF-16 anchors, continuous reading, native selection, and browser gestures are unchanged. The implementation is shared across Safari and Chromium browsers; no browser-specific runtime branches were added.

## Validation on September 6

- 277 tests passed; after the last adjustments, all 19 focused library, shelf-migration, source-body, telemetry, and local-analysis tests passed. TypeScript passed. ESLint reported no errors and one pre-existing unused-variable warning in `.local-dev/economics-metrics.mjs`.
- An isolated production snapshot at `/private/tmp/eazo-green-build-72xou690` passed `VERCEL=1 npm run build:vercel`, including both published maps and all 20 emitted app traces. The shared checkout was being edited by other tasks; this is a snapshot validation, not certification of subsequent concurrent changes or a deployment.
- Same-snapshot standalone CSS comparison: automatic scanning 651,763 raw / 128,272 gzip bytes; scoped scanning 213,191 raw / 73,239 gzip bytes. Difference: 438,572 raw / 55,033 gzip bytes and 8,999 unwanted numeric padding rules. All 207 font faces remained. Final Next build output across all CSS files was 236,781 raw / 78,911 gzip bytes.
- The CSS budget guard was deliberately lowered only in the temporary snapshot; the checker correctly failed and the temporary budget was restored.
- Local production smoke checks passed both readers, both versioned heat indexes, byte budgets, stale-version rejection, PDF range delivery, asset allowlisting, and unauthenticated generation rejection. No paid generation or remote deployment was performed.
- In-app browser checks verified the desktop bookshelf, navigation to the Chinese reader, and its 390 × 844 layout without horizontal overflow. Physical Windows/mobile devices were not available for certification. These changes add no browser-specific behavior.
