# Layered PDF to plain text implementation

Updated 2026-09-05. This implements the text-first scope from [the PDF research and coverage document](11-pdf-whole-book-analysis.md), alongside the existing [PDF reader](12-pdf-reader-implementation.md). Server OCR, its hosting, provider, queue and full-book recognition remain unimplemented by request. The original PDF is always retained. TXT reader and model configuration are separate tasks.

## Layers and boundaries

1. **Embedded text:** PDF.js extracts text runs, original sequence and page geometry. Keep all pages, including front matter, indexes, illustrations and pages with no usable text.
2. **Geometry repair:** infer missing spaces and line breaks between compatible left-to-right runs using baseline direction and gaps. Preserve every run's characters, fragment ID and rectangle; rebuild UTF-16 offsets. Keep the pre-repair text in `rawText` (and the full native source in the document manifest). Never guess spaces within a single run, remove hyphens, correct spelling or reorder columns. CJK adjacent characters are not given Western word spaces; RTL/vertical order is retained rather than guessed.
3. **Local OCR fallback:** the existing reader can recognize individual missing/damaged pages using its serialized English Tesseract worker. Geometry repair now precedes this decision. Manual retry remains available. The full-document pass does **not** initiate OCR; it can reuse an already-cached page recognition. Unreadable pages become `ocr-deferred`, not silently omitted or classified as blank. Low-confidence/empty cached OCR stays `needs-review`.
4. **Optional layout suggestions:** retain the reader's explicit, provider-neutral layout request. It returns only a permutation of existing fragment IDs and heading references. Original source and quote offsets stay unchanged. No service is configured or selected by this implementation; suggestions are not silently applied to the plain-text export.

The quality check is a warning heuristic, not proof of correct transcription or reading order. Repeated wide gutters flag possible columns or marginal notes. A page with usable text can still need layout review. No image semantics or full-book graph analysis is performed here.

## Use and output

At `/pdf`, **PDF to plain text → Extract all pages** traverses every page sequentially. **Cancel extraction** retains completed work; **Resume / retry unresolved pages** keeps ready pages and retries pending, failed, deferred and review pages. Per-page IndexedDB entries restore ready results when starting a new pass after reload. Storage failures are visible and do not discard the in-memory output. Processing stays attached to the open browser tab; it is not a background server job.

Choose a page in the plain-text panel to read styled text or select an exact passage. Selection uses the existing PDF SourceAnchor contract with page number, original-page rectangles and UTF-16 character offsets. Matching text uses the reader's extraction version, and content hashes prevent silently rebinding changed OCR text. **Show original page** opens the corresponding PDF page.

**Download text** exports the current text, including reviewable text, with `\n\f\n` page separators and an empty slot for every page without text. Partial/unverified output is marked in the filename. **Download coverage & sources** is its JSON companion: file SHA-256, extraction versions, ordered page inventory, statuses/reasons, native and selected sources, fragment mappings, and global UTF-16 start/end offsets into the TXT. Consumers must read coverage rather than treating empty slots as blank pages. Fragment IDs are page-local: identify a fragment together with file hash, page index and extraction version. These artifacts are suitable inputs to a separate, bounded text analysis pipeline; this change does not send them to Gemini or implement its graph flow.

`document.status = finished` means traversal ended, not that the entire book has validated text. Read `coverage.ready`, `review`, `deferred`, `failed` and `pending` separately. `nonTextContent = not-analyzed` remains explicit even if all text pages pass checks.

Versions: reader `pdf-text-v3`; document pipeline `pdf-document-text-v3`. Separate document cache keys include the pipeline version, source hash and page number. Changing extraction rules requires a version bump. Saved quotations from older versions are preserved and may need selection again; they are never silently migrated.

## Implementation map

- `src/features/reader/pdf/geometry.ts`: deterministic separator repair.
- `layout-quality.ts`: repeated-gutter warnings without classifying ordinary contiguous word runs as columns.
- `document.ts`: page states, resumable traversal, coverage, text/manifest exports.
- `document-cache.ts`: validated per-page local cache.
- `document-panel.tsx`: extraction, progress, cancellation, text preview, selection and downloads.
- `pdf-page.tsx`: geometry repair before the existing OCR decision.
- `runtime.ts`: finite fallback for invalid font-ascent metrics, preserving usable geometric anchors.

## Documentation consulted

- Installed Next.js 16.3.4 documentation: `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md` and `01-app/02-guides/server-and-client-boundary.md`. Browser operations stay behind the client boundary.
- [PDF.js API documentation](https://mozilla.github.io/pdf.js/api/draft/api.js.html), plus installed 6.3.289 type/source documentation for `getTextContent`, `TextItem.transform`, `width`, `dir`, `hasEOL`, `TextLayer.textDivs` and `PDFPageProxy.cleanup`. TextDivs include empty items, so the source-to-DOM mapping retains those items. Page cleanup defers while rendering is active.
- [Tesseract.js API documentation](https://github.com/naptha/tesseract.js/blob/master/docs/api.md) and installed 6.0.1 docs: retain the existing local worker/language/recognition boundary; no new OCR provider or dependency.

## Verification and limits

Unit/integration tests cover geometry repair and preservation, CJK/RTL handling, exact quote offsets, ordinary lines versus wide gutters, missing/damaged/low-confidence text, per-page failures, cancellation/resume, cache isolation, export coverage and UTF-16 ranges. A regression test extracts actual Republic page 301 with standard fonts and checks finite rectangles and `gentle to friends`. The actual preface on page 11 is also checked to prevent differing hidden-OCR font sizes from splitting a single line into false columns.

A full local PDF.js run over the supplied 628-page Republic file extracted **1,404,426 UTF-16 characters** in **3.93 seconds**, inserted separators on **73 pages**, and reported **0 failed**, **12 OCR-deferred**, **265 layout-review**, and **351 ready** pages. This is one Node.js measurement with standard fonts and no OCR/cache/UI/model work, not a browser latency promise or accuracy score. Layout warnings remain visible; marginalia and reading order still require checking. Native text extraction succeeded for 616 pages, independently of those warnings.

Large inputs still consume browser memory for extracted text/fragment records and PDF parsing. The pass is sequential, supports cancellation, and releases PDF.js page resources, but does not claim constant memory or guaranteed performance at the reader's maximum accepted file/page limits. Severely damaged PDF containers may fail to open at all; the reader reports that failure rather than inventing an empty document.

Browser QA exercised all 628 pages, cancellation/resume, styled page text, selecting a word with an exact page anchor, and return to the corresponding original PDF page. The repository test suite (68 tests), TypeScript, ESLint and diff checks passed. Browser coverage can differ from the native-only measurement when local OCR has already been cached.
