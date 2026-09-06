# Uploaded-book map flow

Local development uploads now have separate stages:

1. Extract and save readable text. The import's 100% means text is ready.
2. Start a background map job when the uploaded book becomes active (including behind the Library after import).
3. Poll real job state while reading: running, interrupted/failed, or ready. Load the completed map automatically.

Jobs and immutable text inputs are stored under ignored `.local-dev/book-analysis/<source-key>/`. Source keys bind book ID, extracted text, original file hash, and extraction version. A separate Node worker survives closing the reader and dev-server requests; reopening the same book reconnects. Retry reuses validated provider checkpoints, and duplicate starts reuse an active/completed job. Local endpoints are restricted to loopback development; hosted books use the separate authenticated Cloud library workflow.

There is no fixed section, graph-node, anchor, or hierarchy-depth ceiling. Extraction runs in bounded batches; synthesis uses at most 48 candidate occurrences per request. Theme summaries are reduced recursively. Concept reconciliation retrieves bounded candidate identities and requires model confirmation of equivalence; it does not force a merge or promise exhaustive global matching. Axis requests use retrieved context and explicit prerequisites. Higher hierarchy levels use already-reviewed child summaries instead of resending every descendant quotation. All source leaves are retained, and deep hierarchies remain navigable within the existing zoom range.

This is not infinite capacity: existing import/HTTP file-size protections, process memory, storage, model quotas and runtime costs still apply. The server still holds the assembled graph in memory. Source processing coverage means the extracted text, not omitted PDF pages, and concept/edge coverage remains a selective, model-reviewed reading outline. Browser scene and subtree-page budgets remain bounded.

Validation includes a synthetic book exceeding the former 62-section/500-node limits, exact source coverage, checkpoint reuse, interrupted-job recovery, origin rejection, and correct-source completed-map loading. Live verification used the uploaded Economics book (130 text sections), including interruption and resumption. Full Economics map completion is a separate, ongoing provider run.
