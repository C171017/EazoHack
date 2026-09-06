# Performance audit evidence — September 6, 2026

Read-only application audit. Application source, migrations, cloud resources, credentials, and deployed settings were not modified by this audit. This evidence note is the audit's repository addition. Other tasks changed the shared checkout during the audit; an isolated snapshot was used for production checks. HEAD observed during the audit: `4c060b1`. This does not certify later edits or the deployed application.

## Environment and scope

- Apple M4 Max, arm64, macOS 26.6.2, Node 22.22.3.
- Installed Next.js 16.3.4; local framework guides for browser support, lazy loading, and bundle analysis were inspected.
- Isolated snapshot: `/private/tmp/eazo-performance-audit-vmcjmyy8` (also available under `/tmp`). Source, scripts, public assets, and data were copied; installed node_modules was linked; `.env` files were not copied.
- `VERCEL=1 npm run build:vercel` passed: optimized compilation 5.9 seconds, TypeScript 2.6 seconds. `next start` reported ready in 66 ms. These are phase timings on a powerful local computer, not deployment build time or a serverless cold-start benchmark.
- The initial build snapshot omitted `.gitignore`. This was explicitly investigated in a separate controlled CSS experiment; the excessive CSS persisted with `.gitignore` restored. The CSS fix was not applied to the application or browser-tested.
- Safari 26.6.2: production Republic source and map visibly rendered, and source scrolling advanced the map timeline. This was a desktop smoke check, not a CPU/GPU trace or full feature certification.
- In-app browser: production layout tested at 390 × 844; map opened with no horizontal document overflow. This was viewport testing, not physical mobile hardware or a touch-gesture test. Windows Chrome/Edge, Android hardware, and iOS Safari were not exercised.
- No live database EXPLAIN, load testing, paid model calls, cloud mutations, or telemetry collection were performed. Deployment documents were inspected but their cloud state was not independently recertified.

## Current measurements

### CSS source-scanning experiment

Installed Tailwind/PostCSS 4.3.3; identical standalone optimization and gzip level 9; faithful repository copy including `.gitignore`:

- Automatic scanning: 650,842 raw bytes; 128,091 gzip bytes.
- Excluding only data: 212,351 raw bytes; 73,095 gzip bytes.
- `source(none)` plus `@source "../"` from `src/app/globals.css`: 212,246 raw bytes; 73,056 gzip bytes.
- Difference between automatic and source-limited: 438,596 raw bytes and 55,035 gzip bytes, 8,999 numeric padding rules removed. All 207 font faces remained; their font-rule content was 183,373 bytes in every variant.
- Analysis identifiers such as `p-100012` are interpreted as Tailwind padding classes. Source detection should cover actual UI class locations and explicitly include any classes genuinely generated outside src.
- `.gitignore` omission explained only 1,574 raw bytes in the controlled snapshot comparison; it was not the cause of the main finding.
- Standalone output is not byte-identical to Next's final CSS processing. This is a measured CSS experiment, not a measured page-load speedup.
- Detailed experiment JSON: `/private/tmp/eazo-css-audit-s36khrlg/summary.json`.

### Initial document transfer and DOM

Isolated production HTML fetched from localhost without cookies. Gzip values were computed offline from the response, not measured Vercel transfer bytes:

- Republic: 4,119,742 decoded HTML bytes; 1,173,529 gzip bytes. Inline scripts contained 1,453,206 bytes, including full source props. 92 chunks and 6,487 source spans.
- Hong Lou Meng: 5,731,743 decoded HTML bytes; 2,280,260 gzip bytes. Inline scripts contained 2,632,976 bytes. 56 chunks and 2,515 source spans. Its map was unavailable in this snapshot, so this does not measure a completed Chinese graph.
- Republic development tab initially had 17,507 elements; do not use that as the production DOM baseline.
- Settled fresh production Republic page had 17,417 elements. The hidden mobile exploration section retained 4,214 descendant elements, including 3,423 SVG gradient stops. CSS visibility was hidden. It had zero layout height until opened.
- At 390 × 844, opening the map produced about 524 px of map height and 266 px of reader height; horizontal document overflow was false.
- Six warm Republic localhost whole-response samples: 187.99, 187.42, 177.06, 178.28, 183.75, 175.32 ms. These include local HTTP and complete response transfer; they are neither TTFB nor user-facing latency, and six samples do not establish a p95.
- Sample map responses currently use `Cache-Control: private, no-store`; the root page uses private/no-store policy. Public and private cache policies must remain separate.

### CPU microbenchmarks

Node execution on M4 Max; results identify algorithms, not Safari/Chrome frame time:

- Eight Republic formatting runs: 73.13, 66.70, 65.43, 64.95, 64.20, 63.55, 65.87, 62.44 ms. Language detection: approximately 5.87–7.77 ms.
- Eight Chinese formatting runs: approximately 15.91–17.29 ms. Language detection: approximately 1.02–1.41 ms.
- Word-boundary selection in synthetic unspaced Han text, average of ten calls: 1,000 characters 0.53 ms; 10,000 1.45 ms; 100,000 14.27 ms; 1,000,000 139.43 ms. The million-character case is a stress case, not the supplied Chinese book's normal paragraph structure.
- `sameReading()` with synthetic payload strings, twelve samples: 100,000 characters median 0.40 ms; 1,000,000 median 3.97 ms; 10,000,000 median 40.30 ms. This measures only its two JSON serializations/comparison, excluding schema validation, IndexedDB cloning, queueing, and rendering. Synthetic payloads were not persisted or sent remotely.
- Fresh in-process Republic map load/validation: 39.36 ms in one sample; 288 nodes, 213 edges, 761 anchors, 406 hierarchy entries. Compact bootstrap 4,210 bytes; compact graph serialization 1,525,424 bytes.
- `visibleLinks()` over Republic roots, 1,000 iterations: median 0.023 ms; p95 0.063 ms. This argues against prioritizing a wholesale map-query rewrite for the current sample; it does not predict large private graphs.

### Packaging and code-derived quantities

- Fresh build checker: homepage trace approximately 37.40 MB; map API 36.05 MB; PDF assets 48.43 MB; PDF source 48.70 MB. These are file-trace sums, not final Vercel function package sizes.
- Homepage/map traces each referenced 1,413 data files totaling 35,717,193 available bytes, including 673 attempt files and 52 error files. One unresolved entry appeared in the independent recount; use build-check totals as approximate, not exact deployment package bytes.
- Public PDF/OCR staging: 201 files, 76,077,421 bytes; the sample PDF itself is 38,190,788 bytes. These files are not all downloaded by a normal TXT reader visit.
- Source font CSS: 184,283 raw bytes, 62,864 gzip bytes. Public font directory: 208 files totaling 6,910,915 bytes; unicode subsets mean this directory total is not initial font transfer.
- BFL permits a 4,000,000-byte JPEG, which produces a 5,333,359-byte data URL before its JSON envelope. This exceeds the documented Vercel function response ceiling. No oversized provider response was generated in the audit.
- A 10,000-visit noncoincident replay can create 20,000 Bézier segments and at least 340,000 arc samples. These are static counts, not a measured replay frame rate.
- Heat volume creation allocates about 1.406 MiB for float/byte arrays; the renderer already has a pixel budget and on-demand scheduling. Shader sample counts are not GPU duration measurements.

## Preservation requirements

Keep immutable source text and UTF-16 anchors, full continuous navigation, selection/copy semantics, source validation, private-book authorization, lease fencing, conflict recovery, and durable generated artifacts. Do not solve storage or history growth by silently discarding saved work. Browser storage persistence is best-effort unless granted; any cache reclamation must distinguish rebuildable caches from user originals/results.

The prior camera-to-reader memoization flaw has already been fixed and was excluded. The active PDF route converts embedded text and redirects the old PDF viewer route; legacy OCR/canvas internals were not represented as current TXT-reader runtime bottlenecks.

## Next measurement protocol

Use an immutable production build. Record at least 20 cold and 50 warm navigation/API samples when practical; report median and p95, sample count, cache state, build ID, device, power state, browser, and network conditions. Use separate runs for CPU traces and timing baselines because profiling itself adds overhead.

Cover Republic, Chinese text, a 20 MiB TXT stress case, representative 100/1,000-page embedded-text PDFs, and histories with 0/100/1,000/10,000 events. Record first readable passage, LCP, INP, transferred/decoded bytes, long tasks, frame intervals, memory after idle, local database write counts, pending-save queue length, SQL buffers/lock waits, cloud object reads, auth calls, model token usage across all attempts, worker resume time, and paid-call duplication under injected storage failures.

Run Safari Web Inspector and Chromium/Edge DevTools traces on physical target devices. Test Safari selection/VoiceOver/find-in-page, font changes deep in the book, bfcache return, storage pressure, PDF worker loading, and WebGL restoration. On Windows test wheel delta modes, Precision Touchpad, browser zoom, and 100/125/150/200 percent scaling. On mobile test two-finger gestures, rotation, keyboard/safe-area handling, hidden-map work, background/foreground cycles, and memory pressure. Universal code fixes need one implementation; device-specific verification remains necessary for these input, rendering, and lifecycle differences.
