# Text-only book analysis MVP

> 2026-09-05 implementation: semantic zoom, bounded viewport loading and the Gemini-generated five-layer Republic hierarchy are now delivered locally. See [current implementation and verification](15-semantic-zoom-implementation.md). Earlier pending/paging notes below are historical; baseline-device benchmarks remain pending.

> Design refinement, 2026-09-05 — pending implementation: the [semantic zoom hierarchy contract](14-semantic-zoom-hierarchy.md) adds bottom-up LM summarization of nearby, semantically compatible accepted leaves, automatic depth proposals, validated parent/child membership, and versioned subtree indexes for viewport loading. The stages and 24-occurrence paging below describe the current MVP; they do not yet produce or render this hierarchy. Display caps must not discard accepted leaves. Hierarchy generation/readiness is tracked separately from source coverage.

The user authorized the Gemini pipeline, a live run on the complete Republic TXT, saved results, and replacement of the editorial map. For this MVP the analysis boundary accepts **plain text only**. PDF-to-text conversion is upstream future work; the existing PDF reader is independent of this pipeline.

## Run and storage

```sh
npm run analyze:book -- --dry-run
npm run analyze:book
```

The command loads `.env.local` and uses the existing Vertex Application Default Credentials. It sends book text to Google using `gemini-3.8-flash` (or the explicit `GEMINI_MODEL` setting). No keys or access tokens are written into analysis output. It runs as a local/server worker process, independently of Next.js request timeouts. This release does not expose a public upload/job-start endpoint.

For another text file, use `--input /absolute/book.txt --book-id example --output /absolute/output`. The built-in reader currently loads the Republic snapshot only. The preflight limit is 500 candidate occurrences, at most eight per chunk; oversized input fails explicitly instead of truncating the book.

Results live under `data/books/plato-republic/analysis/`:

- `current-graph.json`: the accepted snapshot read by the page, replaced atomically only after complete validation.
- `<run-id>/manifest.json`: complete source-range coverage, stage/status, model/prompt version, response IDs, usage, and completion counts.
- `<run-id>/chunk-*.json`: independently validated section results, reusable after interruption.
- `<run-id>/synthesis.json`, optional `identity-repair.json`, `synthesis-resolved.json`, `review-*.json`, `candidates.json`: initial reconciliation, targeted repair of missing identity assignments, fully resolved partitions, evidence review and candidates before rejected items are removed.
- `<run-id>/graph.json`: versioned accepted graph.
- `<run-id>/attempts/` and `errors/`: provider responses and diagnostic records, including unsuccessful attempts. Token accounting for all calls must include attempts, not just the validated-call manifest.

Request fingerprints prevent reuse of a checkpoint after its prompt, schema, input, model, or output budget changes. Prompt contracts and interpretation rules are versioned; intentional semantic changes should increment `PROMPT_VERSION` to create a new graph version. A single-process lock prevents simultaneous writes to the same output directory. After a hard process kill, confirm the process has stopped before removing `.run.lock`.

JSON files are sufficient for this single-book, precomputed MVP. No Docker, SQL server, graph database, embeddings, or vector database is required. Browser reading checkpoints remain in IndexedDB. Files on a developer machine are durable across restarts; serverless local writes must not be used as shared durable storage. For multi-user uploads, move book files and snapshots to object storage and job/user/version records to a managed relational database, with a background worker. Docker is an optional way to run infrastructure, not a requirement imposed by this graph.

## Stages and contracts

1. Preserve raw bytes and hash them. Normalize line endings exactly as the TXT reader does. Segment paragraphs without changing source content; assign IDs from UTF-16 offsets. Split long paragraphs safely and group into approximately 36,000-character chunks, with neighbouring context. Chunk ranges cover the entire source, including whitespace. The complete input includes Jowett's introduction and apparatus; genuine standalone Book I–X headings distinguish dialogue from introductory summaries with similar headings.
2. `extractionPrompt` creates a selective outline (normally 4–8 meaningful occurrences per chunk; zero allowed for apparatus), source roles/speakers, structural levels and local relations. The model cites supplied passage IDs. It does not generate source offsets or replace source text.
3. `synthesisPrompt` assigns occurrences to primary themes and shared identities, orders 3–7 themes, and proposes at most 30 cross-section links grounded in the cited passages. If the identity partition omits occurrences, a small targeted Gemini call assigns only those missing IDs to existing identities or explicitly preserves them as singletons. The resolved partitions must cover every occurrence exactly once; duplicates, unknown references and invalid endpoints fail validation. Opposed claims and recurring concepts retain separate occurrences.
4. `reviewPrompt` independently checks every candidate node and every edge against full cited passages. Unsupported summaries, attribution, levels, themes or edge directions are rejected with reasons. Rejected nodes and their incident edges are excluded from the accepted graph; candidates remain inspectable. This model review is not independent human verification or a claim of exhaustive recall.
5. Code resolves exact quotations, validates all references, calculates X from the locked primary theme position, sets Y to canonical level 0–4 (or unknown), and calculates Z from the first anchor's exact source offset / full source length. Identity objects have no fabricated single Z. Every extra node and relationship passage remains available in the inspector.
6. Save the accepted graph and switch the current snapshot atomically. An incomplete/failed run does not replace a working graph. Source fingerprints and exact quotation checks are repeated when loading the graph for the reader.

All stages share `SYSTEM` in `src/server/book-analysis/prompts.ts`. Book content and intermediate model text are data, never instructions. The implementation uses Vertex's structured response schema plus local Zod and reference checks. See [Google's controlled JSON generation example](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/samples/generativeaionvertexai-gemini-controlled-generation-response-schema-2).

Allowed directed links: `defines`, `supports`, `challenges`, `exemplifies`, `develops`. These are provisional MVP reading relations. All generated links are marked `model_inferred`; exact quotation matching proves where evidence comes from, not that the interpretation is true. Confidence stays unassessed rather than inventing calibrated probabilities.

## Map behavior

The server now supplies only the semantic-zoom bootstrap. Child summaries, source details, ancestor paths and filtered relation summaries load on demand; Browse returns 30 leaves per page. Spatial paging has been replaced by the hierarchy. See [semantic zoom implementation](15-semantic-zoom-implementation.md) for controls, limits, generation/resume commands and verification.

Whole-source coverage is processing coverage, not an assertion that every idea was extracted. This is a selective navigation graph. Large-graph rendering, arbitrary book uploads, hosted job scheduling, multi-user isolation and cross-device storage remain outside this MVP.

## Verified Republic run — 2026-09-05

The live Vertex run completed all 46 sections of the 1,408,266-character normalized text (raw SHA-256 `19d6e62b3cebec70f7704700655052d906f02be75bcc9b3b2140ba5b2df66883`). The accepted graph contains **288 occurrences, 77 shared identities, 213 directed links, seven themes and 761 exact source anchors**. Source roles are 154 dialogue occurrences, 119 commentary occurrences and 15 paratext occurrences. Automated evidence review excluded five nodes and 17 links, including incident links to rejected nodes.

The integration test exposed two issues which were corrected: the last paragraph before a single trailing newline needed its own passage ID, and Vertex rejected a response schema containing a 500-item array bound. Large bounds are now enforced locally. Reconciliation also required a small targeted repair for omitted identity assignments. Recorded requests, retries, review reasons and usage are retained in the run directory and `live-test-report.json`; no estimated dollar cost is asserted.

Validation: 69 tests passed; TypeScript and ESLint passed; the final production build passed in an isolated copy. Browser checks on the live page verified the generated counts, dialogue/theme filtering, spatial pagination, complete filtered browsing, cross-section identity traversal, projection switching, exact highlighted source navigation, and zero overlapping labels in the inspected view. Browser logs reported no warnings or errors during those checks. This is functional and source-integrity verification, not scholarly certification of every interpretation.
