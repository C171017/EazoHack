# Text-only book analysis MVP

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
- `<run-id>/synthesis.json`, `review-*.json`, `candidates.json`: concept/theme reconciliation, evidence review and candidates before rejected items are removed.
- `<run-id>/graph.json`: versioned accepted graph.
- `<run-id>/attempts/` and `errors/`: provider responses and diagnostic records, including unsuccessful attempts. Token accounting for all calls must include attempts, not just the validated-call manifest.

Request fingerprints prevent reuse of a checkpoint after its prompt, schema, input, model, or output budget changes. Prompt contracts and interpretation rules are versioned; intentional semantic changes should increment `PROMPT_VERSION` to create a new graph version. A single-process lock prevents simultaneous writes to the same output directory. After a hard process kill, confirm the process has stopped before removing `.run.lock`.

JSON files are sufficient for this single-book, precomputed MVP. No Docker, SQL server, graph database, embeddings, or vector database is required. Browser reading checkpoints remain in IndexedDB. Files on a developer machine are durable across restarts; serverless local writes must not be used as shared durable storage. For multi-user uploads, move book files and snapshots to object storage and job/user/version records to a managed relational database, with a background worker. Docker is an optional way to run infrastructure, not a requirement imposed by this graph.

## Stages and contracts

1. Preserve raw bytes and hash them. Normalize line endings exactly as the TXT reader does. Segment paragraphs without changing source content; assign IDs from UTF-16 offsets. Split long paragraphs safely and group into approximately 36,000-character chunks, with neighbouring context. Chunk ranges cover the entire source, including whitespace. The complete input includes Jowett's introduction and apparatus; genuine standalone Book I–X headings distinguish dialogue from introductory summaries with similar headings.
2. `extractionPrompt` creates a selective outline (normally 4–8 meaningful occurrences per chunk; zero allowed for apparatus), source roles/speakers, structural levels and local relations. The model cites supplied passage IDs. It does not generate source offsets or replace source text.
3. `synthesisPrompt` assigns every occurrence exactly once to a primary theme and a shared identity, orders 3–7 themes, and proposes at most 30 cross-section links grounded in the cited passages. Opposed claims and recurring concepts retain separate occurrences.
4. `reviewPrompt` independently checks every candidate node and every edge against full cited passages. Unsupported summaries, attribution, levels, themes or edge directions are rejected with reasons. Rejected nodes and their incident edges are excluded from the accepted graph; candidates remain inspectable. This model review is not independent human verification or a claim of exhaustive recall.
5. Code resolves exact quotations, validates all references, calculates X from the locked primary theme position, sets Y to canonical level 0–4 (or unknown), and calculates Z from the first anchor's exact source offset / full source length. Identity objects have no fabricated single Z. Every extra node and relationship passage remains available in the inspector.
6. Save the accepted graph and switch the current snapshot atomically. An incomplete/failed run does not replace a working graph. Source fingerprints and exact quotation checks are repeated when loading the graph for the reader.

All stages share `SYSTEM` in `src/server/book-analysis/prompts.ts`. Book content and intermediate model text are data, never instructions. The implementation uses Vertex's structured response schema plus local Zod and reference checks. See [Google's controlled JSON generation example](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/samples/generativeaionvertexai-gemini-controlled-generation-response-schema-2).

Allowed directed links: `defines`, `supports`, `challenges`, `exemplifies`, `develops`. These are provisional MVP reading relations. All generated links are marked `model_inferred`; exact quotation matching proves where evidence comes from, not that the interpretation is true. Confidence stays unassessed rather than inventing calibrated probabilities.

## Map behavior

The server loads the accepted graph and supplies it to the reader workspace; the editorial sample remains a test fixture. The map shows up to 24 occurrences per spatial page, with all filtered occurrences available in Browse nodes. Theme and source-role filters, the page and camera state are saved with the view. Following a related occurrence reveals its page and clears conflicting filters when necessary. Paging and filtering do not move semantic coordinates; only edges with both endpoints on the spatial page are drawn, while the selected-node inspector exposes all related nodes and supporting passages.

Whole-source coverage is processing coverage, not an assertion that every idea was extracted. This is a selective navigation graph. Large-graph rendering, arbitrary book uploads, hosted job scheduling, multi-user isolation and cross-device storage remain outside this MVP.
