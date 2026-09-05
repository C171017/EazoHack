# PDF imports use the text reader

Updated 2026-09-06. This supersedes the active reader/import routing described in docs 11–13. The user chose lightweight PDF conversion without OCR during import. The original PDF display and local OCR components remain available in source for future development, but `/pdf` redirects to `/` and the active workspace never mounts them.

## Routing and conversion

- TXT: validate UTF-8 and normalize line endings using the existing upload path.
- PDF: retain original bytes in the library, then sequentially extract each page with PDF.js and repair spaces/line breaks using the existing geometry rules. No page rendering, OCR, OCR-cache reads, layout-service requests, or model calls occur during import.
- If usable embedded text exists, assemble it in page order and open it in the same continuous text reader as TXT. The library keeps the original PDF format label.
- Damaged embedded text that fails existing quality heuristics makes the PDF incompatible. A document with no readable embedded text, including a scanned-only PDF, is incompatible. Password-protected and invalid PDF containers receive an actionable incompatibility message. Worker, storage, and other operational failures remain retryable errors.
- A page with no embedded text contributes no text to the reader. It remains in the PDF and page manifest with `no-text-detected`. This is not a claim that it is blank or illustration-only. Mixed documents may therefore omit scanned text; the library explicitly reports this limitation. Illustration semantics and OCR remain deferred.
- Column/marginalia warnings are retained and shown as reading-order caveats; heuristic warnings do not prove that extraction is accurate or complete. The reader labels PDF-derived content “Extracted text.”

## Library progress and persistence

The library shows a circular progress indicator, stage, and processed-page count. Sequential page completion accounts for 0–95%; saving uses 99%; 100% and “Ready to read” appear only after the readable book has been saved. These percentages measure work, not elapsed/remaining time. There is no simulated timer. Processing stays in the open browser tab, supports cancellation and retry, and never exposes a partially processed book as ready.

The original PDF is saved before conversion. Cancelled or failed imports remain available as “Convert to text” after reopening the library. Successful conversion atomically replaces that same catalogue entry, using the original PDF hash as its library identity. Re-uploading a successfully converted PDF reuses its current conversion. Legacy PDF entries convert when opened; obsolete import versions are reprocessed. TXT uploads preserve their existing IDs.

The readable book uses a separate `pdf-text:<original hash>` identity. The extraction version contains the pipeline version and a hash of the derived text, preventing changed text from silently resolving old anchors. Its `originalPdf` retains bytes, hash, and a manifest with original page indexes, native/repaired sources, fragments and rectangles, warning/omission status, and global UTF-16 start/end offsets in the derived text. Blank/illustration pages are not reconstructed in the text UI.

## Verification

`tests/pdf-import.test.ts` covers Unicode offsets and page mappings, no-text-page retention, damaged text rejection, scanned-only rejection, cancellation, operational errors, legacy catalogue replacement, original-byte persistence, and exact anchors after library reopening. Existing PDF extraction/geometry tests remain in place for the underlying extraction rules.

Browser checks exercised the actual Workspace and library components on a temporary small-source QA route (removed afterward). A mixed embedded/scanned/blank fixture converted into the text reader with explicit omitted-page notes; a scanned-only fixture was rejected without OCR. The supplied 628-page Republic completed extraction and saving within an 8-second observation interval, with 12 pages lacking embedded text and 257 reading-order warnings. This is an upper-bound observation from one local run, not an accuracy score or a performance guarantee. The converted Republic opened in the text reader and its catalogue entry survived page reload. The `/pdf` redirect was also verified. The large default `/` page rendered but did not become interactive during the in-app browser check, so import interactions were verified on the temporary route instead; no default-book rendering changes were made.
