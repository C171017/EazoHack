# Low-risk performance changes

Implements the five green items from the September 6 audit: scoped CSS detection, selective catalogue writes, early analysis-input rejection, pipeline observability, and deployment regression checks. Public/private caching, authentication client reuse, reader virtualization, synchronization architecture, and other yellow/orange proposals are outside this change.

## Runtime behavior

- Tailwind reads class names only from `src`. Keep complete utility names there; if a future component generates classes elsewhere, explicitly register that source. Analysis files, book text, tests, and generated PDF assets are not class sources. Font declarations and language choices are retained.
- Catalogue reads use read-only IndexedDB transactions. Legacy or colliding shelf positions are repaired only when detected, using a fresh read inside the write transaction. A move updates its book and any displaced book. Source blobs, custom titles, emblems, and duplicate-upload placement behavior are preserved.
- Analysis source downloads enforce the existing 1 MiB limit during streaming. An uncompressed oversized Content-Length is rejected before consuming the body. Missing/incorrect lengths cannot bypass the streamed limit. Compressed responses are limited using the decoded body bytes. Accepted sources still pass the SHA-256 check; normal reader downloads retain their existing 50 MiB limit.

## Pipeline telemetry

Set the server/worker environment variable `EAZO_PERFORMANCE_LOG=1` to emit JSON lines to the existing process log. No external telemetry service is installed; logging is disabled by default. The flag must be set in each execution environment independently. Existing running workers do not pick up source/environment changes until restarted normally.

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
