# PDF reader and four-stage page text pipeline

> Product placement update · 2026-09-05: future assistance artifacts belong in the PDF reflow reading stream at their SourceAnchor, not inside or on top of the immutable original PDF page. The current PDF workspace has not implemented these slots. See [inline reader artifacts](17-inline-reader-artifacts.md).

Entry point: `/pdf`. The PDF work is isolated from the TXT reader. `PdfReader` accepts a PDF.js document and its SHA-256 fingerprint; `onSelection` emits the existing `Selection` and PDF `SourceAnchor` contracts. `PdfWorkspace` supplies a local file picker, the Republic sample, passage inspection, explicit local checkpoints and mock assistance for integration testing.

## Implemented page paths

| Page condition | Behavior |
| --- | --- |
| Embedded text passes heuristic checks | PDF.js text layer; no OCR |
| Embedded text appears damaged | Recognize the visible page with local Tesseract.js |
| No embedded text | Recognize the visible page; empty results are explicitly marked for review |
| Reading order or headings remain ambiguous | Optional provider-neutral layout request; validate a permutation of source fragment IDs and heading references |

Quality checks cover unmapped characters, suspicious joined or fragmented Latin words, OCR confidence and potential columns/marginal notes. These are heuristics, not proof of transcription accuracy. Manual OCR retry remains available for plausible but incorrect text. The supplied OCR pack is **English only**. Embedded PDF text can contain other languages; additional OCR packs need explicit installation and language selection support.

Original PDF bytes are never rewritten. Native extraction, OCR text, word rectangles, OCR confidence and raw OCR text remain separately available. LM proposals cannot supply replacement text, omit fragments, duplicate fragments or introduce nonexistent fragment IDs. Suggested reading order is a separate view; quotations continue to reference the original extraction.

## Rendering, selection and resource limits

- Every PDF page has a lightweight placeholder. A single intersection observer mounts nearby pages, capped at eight canvases; the Republic browser check mounted three at page 301.
- Each display canvas is capped near three million pixels; OCR uses a separate canvas capped near five million pixels. OCR runs serially in one lazily loaded worker, starts after the visible page settles, stops on departure/hidden-tab changes, and releases the worker after 15 seconds idle.
- OCR is page-local, not a full-book background job. Parsed page text is cached in IndexedDB by source fingerprint, page, language and pipeline version. The reader's in-memory text cache holds 24 pages.
- PDF.js worker, fonts, character maps, WASM and OCR language data are served from installed packages on the same origin. Narrow Next.js output-tracing includes retain these runtime assets in packaged deployments. There is no CDN dependency at runtime. The sample source supports HTTP byte ranges; local files are read with the browser file API.
- Page dimensions are initially estimated and measured as pages load. Unusual mixed-size documents may refine the scrollbar while loading. Resizing preserves the first visible page and its relative position.
- The view pins mounted pages during an active native selection. Cross-page selections require text on all selected pages to be ready. Selection captures only text rectangles, avoiding whole-page wrapper rectangles.
- Anchors include PDF page index, UTF-16 range, unrotated normalized rectangles, quotation, context and a hash of the selected text-layer version. OCR revision mismatches are reported, never silently rebound.
- Explicit checkpoint save stores the current page and passage on this device. Reopening an uploaded PDF requires choosing the same local file again. The PDF binary itself is not persisted. Browser storage remains subject to quota/eviction.
- Current upload guard: 100 MB; document guard: 10,000 pages; passage guard: 20,000 characters, fewer than 100 pages and at most 200 text rectangles per page. Limits are visible errors rather than silent truncation.

## Optional LM layout adapter

No LM provider is selected or contacted automatically. Configure these server environment variables to connect an adapter:

```text
EAZO_PDF_LAYOUT_URL=https://your-layout-adapter.example/process
EAZO_PDF_LAYOUT_LABEL=Your layout service
EAZO_PDF_LAYOUT_TOKEN=<optional server-side bearer credential>
```

`POST /api/pdf/layout` is same-origin only and receives one validated `TextSource`. The configured adapter receives JSON `{ task, fragments }` with text, fragment IDs, source offsets and rectangles. It must return:

```json
{"order":["n0","n1"],"headings":[{"fragmentId":"n0","level":1}]}
```

`order` must contain **all** input fragment IDs exactly once. Heading levels are 1–6. No additional fields are accepted. The server bounds inputs and outputs to 128 KiB, allows at most 2,000 fragments for this optional operation, times out after 30 seconds, and does not follow provider redirects. Credentials never reach the browser. An application deployment must also apply its normal authentication/rate limiting before exposing a paid provider publicly.

The reader shows the service label and that page text/positions will be sent before the user clicks. Without configuration, the control is disabled and the reader/OCR remain functional. Tests exercise the adapter using mocked HTTP responses; no live LM extraction quality or provider latency is claimed.

## Verification

- Targeted automated coverage: embedded/no-text/damaged/manual OCR decisions, failed/cancelled extraction, quality warnings, validated layout order, source preservation, cross-page Unicode anchors, cache isolation, PDF range serving, asset traversal rejection and layout HTTP failures.
- Browser checks in the Codex Chromium browser: the 628-page Republic; bounded canvases; exact native word selection; real local OCR of image-only and damaged-hidden-text fixtures; an OCR line selection; saving/reopening its highlight; mock assistance handoff; rotated-page rendering; 390×844 mobile and desktop resizing.
- TypeScript, ESLint, isolated-snapshot production builds and a final project production build passed. The final deployment trace was checked for the PDF worker, OCR worker, WASM core and English language data.
- No claim of complete Safari/Firefox/physical-device, screen-reader, full-book OCR or battery benchmarking. Full-document native extraction/export is separate concurrent work, documented by its owning task.

To reproduce the synthetic PDF cases, run `tests/fixtures/make-pdf-reader-fixture.py` with Python, reportlab, Pillow, an output PDF path and optionally a TrueType font path. The file has good embedded text, an image-only page, a page with damaged hidden text, two columns, and a rotated page. It contains no user documents.
