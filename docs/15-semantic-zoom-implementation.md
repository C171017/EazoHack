> 2026-09-05 supersession: the user selected X = reasoning depth, Y = generality. The new reviewed axis stage and representative group placement supersede earlier topic/structure coordinates and bounds-center placement for new maps. Historical results below retain their original versions. See [axis redesign](22-map-axis-redesign.md).

# Semantic zoom implementation and local review

Delivered 2026-09-05 against [the approved hierarchy design](14-semantic-zoom-hierarchy.md). This replaces spatial pagination in the book map. PDF extraction, passage assistance and the accepted source occurrences remain independent.

## What is implemented

- Trackpad pinch changes zoom around the canvas centre; zooming out progressively recentres panned content and returns to a centred overview at 100%. Chromium/Edge use non-passive Ctrl/Meta-wheel handling; WebKit gesture events have a separate handler. Ordinary two-finger scrolling pans. Buttons and +/− use the same bounded zoom calculation. Drag orbits, Shift-drag pans, and magnetic projection alignment/keys 1–4 remain.
- Scale depends on viewport dimensions and explicit zoom, not the camera orientation or visible-node bounds. Dragging, releasing, snapping, fetching and replacing nodes never call fit-to-view. The inspector overlays the scene so opening it does not resize the map or push its controls off screen.
- Zoom thresholds expand a non-overlapping cut of the hierarchy. If expansion would exceed the cap, a parent stays visible. Missing subtrees also retain their parents with loading/retry feedback. Node glyphs shrink toward lower zoom; a cancellable 260 ms transition moves children from/to parent display positions and interpolates opacity/radius. Reversing starts from the currently interpolated state. Reduced-motion mode switches immediately.
- The server supplies a compact bootstrap containing the root summaries, bounds, source/graph/hierarchy identity, counts and theme labels. It does **not** serialize every occurrence, relationship and quotation into the client component. The full TXT reader still receives its complete text; the payload reduction reported below is for the graph, not the entire page.
- A subtree-bounds traversal selects only intersecting cached branches. Nodes outside the scene are not mounted; an intersecting group's bounds may have its centre outside the scene, in which case a clipped group representative keeps that subtree accessible. Unknown positions stay in Browse, never at the origin.
- Version-checked, abortable `/api/book-map` requests load child pages, a selected leaf's source evidence, a search/list page, an ancestor path or visible relation summaries. Requests are debounced while navigating. Late results never reset the camera. The cache has a hard bound and protects recently traversed paths where possible; evicted branches can be fetched again.
- The inspector retains a selected leaf while it is aggregated or leaves the viewport. Visible ancestors indicate its selection. Browse/search and related-occurrence links load the ancestor path and explicitly reveal the target. Saved views bind both graphVersion and hierarchyVersion; an incompatible hierarchy resets the camera instead of reusing a cluster ID with different membership.
- Relations retain type, direction, count and original relation IDs. Theme, source-role and source-range filters apply to the underlying relations. Group titles/summaries and counts describe the full group; the UI explains this when filtering. Browse uses 30-item request pages, so the alternative reading path does not mount the entire node list.

## Initial tuning values

These are implemented engineering budgets, **not certified capacities for M1/M2 or Windows laptops**. Values live in `src/shared/zoom-hierarchy.ts` and the selector in `src/features/book-graph/semantic-window.ts`.

| Setting | Current value |
| --- | --- |
| Root / direct child maximum | 8 / 8 |
| Simultaneous active nodes | Overview 8; detail 1: 20; deeper detail: 36 |
| Transition nodes, including entering and leaving | 72 maximum |
| Labels / relation summaries | 18 / 64 maximum; fewer labels where viewport space requires it |
| Cached child pages | 48, each at most 8 entries; selected detail and list response are kept separately, not an unbounded detail history |
| Browse request page | 30 leaf entries |
| Zoom range | 1×–48× |
| Enter next detail level | `1.8 ** depth` — this book: 1.8×, 3.24×, 5.832×, 10.4976× |
| Leave a detail level | Below 86% of its entry threshold |
| Node transition | 260 ms, reversible/cancellable; immediate with reduced motion |
| Child/detail / relation / browse debounce | 80 / 140 / 160 ms |
| Hierarchy build guard | At most 6 parent levels; failure preserves the published map |

Labels have native focus and title text even when a long visible label is shortened. Nodes without a displayed text label still expose their full accessible name and hover title. These limits govern the scene; the pre-existing text-analysis extraction budget is still 500 candidate occurrences, independently of rendering.

## Gemini generation and saved data

The original extraction, reconciliation, targeted identity repair and leaf evidence review remain unchanged. A separate versioned stage runs **after** the accepted leaf graph:

1. Partition candidates into spatial neighbourhoods of at most 24 using the widest normalized XYZ dimension; screen projection is not involved.
2. Gemini 3.8 Flash partitions each neighbourhood into coherent groups of 1–8 children, writes labels/summaries/reasons, and may retain singletons. Its group-size decisions determine how many rounds/layers are needed. The application continues until at most eight roots remain; it enforces progress and depth limits instead of trusting model claims about hardware performance.
3. A separate Gemini call reviews every proposed group against child descriptions and the exact source quotations of its descendant leaves. Rejected proposals are revised with the review findings; bounded retries fail explicitly.
4. Application validation proves complete leaf reachability, one parent per child, no cycles/duplicate members/dangling references, valid bounds/counts/depth and matching graph/source versions. Leaf data and original anchors cannot change during aggregation.
5. Save a versioned graph copy, hierarchy and call records, then atomically switch `current-map.json`. A failed hierarchy build leaves the previous published map usable. The source graph may independently be ready before its hierarchy is ready.

Prompts: `src/server/book-analysis/hierarchy-prompts.ts`. Runtime: `hierarchy-run.ts`. Hierarchy membership and source versions support evidence resolution through the original leaves; each group's detailed rationale and model review are retained in its `level-*-batch-*` response files. Parent display positions are derived bounds centres, not fabricated source occurrences or replacements for Y structuralLevel.

```sh
# Reuse the accepted leaf graph and generate/resume only its hierarchy:
npm run analyze:book -- --hierarchy-only

# Run/resume extraction, reconciliation and leaf review, then build the hierarchy:
npm run analyze:book

# Repeat the local selector microbenchmark:
node --import tsx scripts/benchmark-map.ts
```

Both generation paths use the existing Vertex configuration. Hierarchy calls use two-way bounded concurrency, request-fingerprinted checkpoints, saved provider replies/reviews/usage and a shared analysis-process lock. They send existing public-domain book evidence to the already configured provider; no credentials are stored in output.

## Generated Republic result

Local publication: `data/books/plato-republic/analysis/current-map.json` → `semantic-hierarchy-v1-595bddb5ccce9110/`.

The run retained **288 accepted source occurrences**, their **213 original directed relationships**, and all existing source anchors. It produced **118 unique parent groups**, **5 roots** and **5 total layers**. The successive frontiers were **288 → 84 → 26 → 11 → 5**; frontier counts include carried singletons, so they are not counts of newly created groups. All 46 grouping/review calls completed and the hierarchy passed structural validation. Automated review is not human scholarly verification.

The overview groups are Dialogue Framing and Justice; The Ideal City and Guardians; Psychology, Culture, and Arts; Metaphysics and Philosopher-Kings; Regime Decline and Destiny. The group summaries, leaves and original quotations are available for review at [local dev](http://127.0.0.1:3000).

## Verification and remaining limits

- TypeScript, ESLint and 78 tests passed, including new tests for hierarchy coverage/corruption, focus-preserving zoom, hysteresis, bounded complete cuts, offscreen pruning, cache eviction, reversible transitions, typed relation provenance, checkpoint reuse and failed-publication preservation. The production Next.js build passed in an isolated temporary copy, without disrupting the local dev server's `.next` directory.
- Actual API checks returned bounded child/detail/browse responses and HTTP 409 for a stale version. The first browse response contained 30 entries. The bootstrap is **5,395 bytes** as compact JSON, versus **1,291,445 bytes** for the complete graph JSON.
- Browser checks traversed all four threshold boundaries into the fifth layer, reversed zoom, searched for the Cave, revealed its exact occurrence through its ancestry, loaded the `514A` source quotation, and retained the same zoom value through a rotation drag. The observed threshold sequence peaked at 35 active nodes, 57 transient rendered nodes, and 47 cached pages, within the configured budgets. Full labels remain in native accessible names. Inspector opening/closing keeps the camera scale stable.
- `selector-benchmark.json` records 2,000 measured selector calls after warmup over the real generated hierarchy on an **Apple M4 Max**, Node 22.22.3: p95 approximately **0.080 ms**, maximum approximately **0.31 ms**; the sweep reached the 36-node cap without exceeding it. This is a selector microbenchmark, **not browser frame time, end-to-end latency, memory certification or an M1/M2 result**.
- Physical trackpad feel, native Safari pinch, OS reduced-motion behavior and the full performance matrix on M1/M2 Air and representative Windows integrated-GPU laptops still need device testing. No claim of passing those hardware gates is made. Hosted jobs, arbitrary uploads, multi-user isolation and scaling beyond the existing extraction budget remain outside this release.
