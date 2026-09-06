# Economics pipeline audit — 2026-09-06

## Test and scope

Local development reader at `http://127.0.0.1:3000`, using the user-supplied *Economics*, ninth edition, Glenn Hubbard and Anthony Patrick O’Brien. PDF: 85,709,067 bytes (81.74 MiB), 1,187 pages, unencrypted. SHA-256: `c6f7e6e0199d7ce7bc37de79e26f8fcad817e32f4b9e5dfe482c8ebeebd4cff2`.

A fresh browser upload/import was exercised. Analysis reused the matching existing job rather than paying to repeat its completed extraction. Consequently this is a measured import plus a checkpoint-resume analysis test, **not a clean, uninterrupted timing of the entire pipeline**. Model: `gemini-3.8-flash`.

Local job key: `5fe99903ca5d2c3ab51d971c8bcf10bdde8df4e01b6bc6e971396664b7d3c311`. Checkpoints, raw provider responses, errors, and source stay under `.local-dev/book-analysis/<key>/`, outside tracked source. Working metrics are in `.local-dev/economics-pipeline-metrics.json`.

## Observations

- Fresh browser import: text-ready observed within 34 seconds of file selection (includes title confirmation and observation overhead; not an exact extraction-only duration).
- Extracted source: 4,512,293 UTF-16 characters; 130 analysis chunks; 732 candidate occurrences; 16 synthesis portions.
- Local ingestion reads the PDF into the browser, extracts embedded text, retains the original PDF and extraction evidence in IndexedDB, and sends only extracted text to the local analysis API. The 82 MB PDF is not sent to the model.
- Two omitted pages: one without embedded text and PDF page 566 rejected for damaged character mappings. Visual inspection of page 566 shows readable prose, tables, and equations; its extracted text was 2,204 characters. The whole-page rejection threshold can lose useful prose because of problematic mathematical glyphs.
- Import flagged potentially ambiguous reading order on 793 pages. This is a heuristic warning, not proof that all those pages are misordered. The current text-only pipeline does not interpret the textbook's diagrams or faithfully reconstruct tables.
- Segmentation recognizes Republic-specific headings. All 130 economics chunks receive the `Front matter` hint. Of 732 candidates, 359 were labeled commentary and 373 paratext. These are model classifications, not validated descriptions of this textbook; general nonfiction needs an appropriate source-role vocabulary and heading detection.
- The pre-existing run failed at synthesis batch 11 after repeated same-chunk links were returned in `crossEdges`. A resumed run failed similarly at batch 13 even with detailed corrective feedback. Every unrelated valid theme/identity assignment was previously discarded with the invalid optional links.
- A single status-fetch failure previously stopped browser polling permanently until manual retry. The detached worker could still be running.
- Extraction/review scheduling previously waited for each fixed batch's slowest call. Synthesis portions were sequential.
- Reload returns to the bundled Republic; reopening Economics from Library successfully reconnects to the existing job without PDF re-extraction. Automatic restoration of the selected book is a separate UX opportunity.
- The current Cloud library enforces a 1 MiB extracted-text limit, so this textbook cannot currently take the hosted path. Local success must not be presented as hosted validation.

## Changes

1. Bounded work pool for extraction, evidence review, and synthesis. Slots refill as requests finish; output order remains source order. On failure, active requests finish saving checkpoints and no further tasks start.
2. Status requests have a 30-second timeout and automatic exponential retry for network errors and HTTP 408/429/500/502/504. Retries retain the same request body/job identity; cancellation stops them. Eight total attempts maximum; authorization and local-unavailable errors remain explicit.
3. Synthesis removes only same-chunk links from the optional cross-chunk list. It retains raw responses for audit, valid theme/identity partitions, and local extraction links. Unknown/self endpoints, invalid partitions, and downstream evidence checks remain strict. Saved failed responses can be revalidated without another model call.
4. Retry validation messages enumerate all offending same-chunk links instead of reporting only a generic failure.
5. Restored valid extraction/synthesis checkpoints no longer get rewritten unchanged; saved-attempt directory listings are shared per run.

## Performance interpretation

Replaying the 130 successful extraction-call durations as a scheduling calculation gives 532.403 seconds with the old batches of three versus 470.544 seconds with a three-slot pool: **11.6% estimated stage-level saving**. This excludes retries, provider contention, disk/network overhead and other stages; it is not a measured overall speedup.

Synthesis now permits three independent portions at a time. Global identity reconciliation remains sequential because later matching depends on earlier merged identities. Axis assignment/review and hierarchical grouping still have their own conservative concurrency and evidence-review loops.

## Validation and completion

In progress: follow the resumed real book through concept reconciliation, evidence review, axis assignment/consistency, and hierarchy publication, then validate exact anchors and bounded map loading. Do not treat `text ready`, extraction completion, or a worker heartbeat as map completion.

Automated checks so far: all 201 tests passed before the additional synthesis-salvage case; targeted suites including that case passed. Final check results and actual map outcome will be recorded after the real run finishes or encounters a concrete blocker.

## Next priorities

- General nonfiction chapter boundaries and source roles, replacing the Republic-specific assumptions before judging map quality.
- Preserve trustworthy text blocks on a partly damaged page; keep excluded material and layout uncertainty explicit. Evaluate table/diagram handling separately from text-only analysis.
- Resumable/chunked hosted source upload, consistent size limits and durable background jobs before claiming support for this book in Cloud.
- Reader-friendly phase progress with completed/total counts and elapsed time; distinguish reconnecting from failed analysis.
- Consider a separately labeled early overview while full evidence review continues. Never present a partial/unreviewed map as the final validated graph.
