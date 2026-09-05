# Reasoning depth × generality: implementation

The original 0–4 scoring release below is superseded by the [2026-09-06 fine scale](23-fine-axis-scale.md); its measurements remain a historical baseline.

2026-09-05. User-selected option 1 from the axis comparison. Current semantic contract: [08-book-map-3d.md](08-book-map-3d.md).

## Delivered behavior

- X increases with the occurrence's within-book reasoning depth. Y increases with the generality of its particular claim. Z and all source anchors retain their meaning and values.
- Shared rubric anchors are 0–4 with evidence-supported intermediate values; X is stored geometrically as rating/4 and Y as rating. No book-relative stretching, random scatter, forced occupancy, or conversion of the previous axis numbers.
- Topics retain their sourced assignments and colors. Legacy topic centroid metadata remains for compatibility, not coordinate generation.
- Node details display each rating and a separate “Why this position?” explanation, source evidence buttons and links to explicitly identified prerequisite nodes.
- Each new group marker is a stable weighted representative of its children in normalized XYZ, not the center of its bounds. Its complete bounds remain available. Selected groups display X/Y range lines and numeric ranges; a summary is never treated as a newly extracted source claim.
- Unknown coordinates remain null. A bounded, paginated Unplaced notes list opens their original source and details without inventing a spatial point or resetting the camera.
- Older graph snapshots remain readable with explicit legacy axis labels. Graph/hierarchy version changes reset incompatible saved spatial state. Reading content, highlights and generated artifacts are separate.

## Gemini 3.8 Flash pipeline

The configured provider/model is retained. No new service or model is introduced.

1. `text-graph-v2` extraction emits qualitative `reasoningHint` and `generalityHint`, replacing structural-level classification. Source review still checks claims, attribution and typed relations. Themes remain display metadata.
2. A separate `book-axes-v1` stage scores each accepted occurrence after reconciliation. Each batch contains 24 targets, the complete accepted-node catalog and exact source passages for targets and related nodes. Two batches run concurrently.
3. Each assignment includes independent depth/generality values, rationales and anchor IDs. Depth can cite accepted prerequisite IDs. The model must distinguish internal inferential steps, direct introductions, missing evidence, and actual dependencies. The prompt explicitly forbids inferring depth from chronology, difficulty, graph degree or absence of edges; it separates generality from abstraction, repetition, importance and physical scale.
4. A separate review call sees the proposed scores plus exact source passages for named prerequisites. Unsupported assignments are revised as a complete batch and re-reviewed, with bounded retries. Provider/validation failures preserve the published map. Unresolved semantic assignments in the bounded whole-book consistency pass become explicitly unknown rather than discarding accepted source nodes or forcing a score.
5. A whole-book consistency pass examines depth inversions across batches and positive-depth nodes without separate prerequisites. It rechecks total prior reasoning, corrects scores or removes unsupported links, and propagates unknown prerequisite depth. A separate review validates each correction. A topological pass carries minimum reviewed depth through long chains without adding arbitrary increments; every raised result is source-reviewed before acceptance. Publication requires zero remaining known-depth conflicts. Uncertainty propagates through required prerequisites; positive-depth disagreement is never hidden by removing the source node.
6. Application validation checks coverage, ranges, references, target evidence, self-references, zero-with-prerequisites, cyclic prerequisite chains, coordinate/assessment agreement, and preservation of all accepted source content and Z. Model review remains an interpretation, not independent scholarly certification.
7. `semantic-hierarchy-v2` groups the newly scored XYZ space while checking topic coherence separately. Group depth is not reasoning depth or generality.
8. The CLI publishes the new map pointer only after hierarchy validation. Previous versioned graphs/hierarchies stay available. Calls, usage, failures and request fingerprints are saved separately for resume; model replies are not silently reused for changed prompts.

Rubric/schema: `src/shared/book-axes.ts`. Axis prompts: `src/server/book-analysis/axis-prompts.ts`. Runner: `axis-run.ts`. Extraction and grouping prompts are updated in their existing modules.

The Vertex response-schema adapter omits large or deeply nested array maxima from the wire grammar; local Zod still enforces every bound. Initial axis requests with nested maxima returned HTTP 400. A minimal model diagnostic succeeded; simplifying the wire grammar allowed the same axis response schema to generate successfully. This is a provider grammar compatibility adjustment, not relaxed local validation.

## Commands

```sh
# Preserve accepted occurrences and their original relations; re-score axes,
# independently review them, rebuild grouping, then publish the replacement map.
npm run analyze:book -- --axes-only

# New complete source extraction/reconciliation/review + axes + hierarchy.
npm run analyze:book

# Reuse an accepted graph. Legacy axes are assessed before new grouping.
npm run analyze:book -- --hierarchy-only
```

The new stage is source-grounded but does not claim exhaustive dependency discovery. Missing or ambiguous prerequisites must remain explicit rather than forcing all nodes onto the map. Intermediate scores do not establish interval measurement or cross-book calibration.

## Verification

TypeScript, ESLint and the current 99-test suite pass, including source-preserving reassessment, fractional/unknown coordinates, correction/review checkpoints, invalid prerequisites, corrupted checkpoint rejection, unplaced access, representative group ranges and legacy hierarchy compatibility. The isolated production build also passed with `NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection"` to work around the host's font-download connection stall. The running dev server's `.next` directory was not used. Live map and browser results follow below.


## Published Republic result and browser verification

- Published graph: `axis-consistency-v1-b5ee0f8270c2ca8c`; map: `semantic-hierarchy-v2-b7628d5e4649ece7`.
- Preserved all 288 accepted occurrences, 213 original typed relations, identities, themes, exact source text/anchors and Z coordinates. Final known coordinates: 288; unplaced: 0; prerequisite-depth conflicts: 0.
- The reviewed hierarchy has five layers and five roots; successive frontiers are 288 → 79 → 27 → 9 → 5.
- Browser QA at 1600×1000 passed all four view modes with unchanged zoom, visible new axis explanations, group range readouts and lines, leaf selection, per-axis source-evidence activation, and stale-version rejection (HTTP 409). No browser page errors occurred. The checked source occurrence was n-2-3.
- Revalidated the published graph against the immutable original source and validated complete hierarchy reachability, derived positions/ranges and node counts.
- The earlier 30 distinct X–Y positions become 30 distinct positions under entirely different semantics. The largest exact semantic tie is 48 occurrences (previously 27); these are underlying projected coordinates, not simultaneously rendered glyph counts. This release therefore does NOT claim that the axis change alone reduces density. Bounded semantic zoom, distinct labels, source navigation and group ranges preserve inspectability; genuine score ties are retained rather than perturbed.
- Local implementation only; no deployment was performed. Old published snapshots and interrupted candidate builds remain available with their provenance.

## Viewport spacing update

The map now keeps a separate fit transform in camera state. The schema can serialize it; the current TXT workspace still starts a fresh view on reload. Initial opening, projection switching, explicit group exploration and **Fit overview** frame the projected content with room for labels. Fit magnification does not change semantic zoom or any source-derived score. The fitted world-space centre remains fixed during free orbit and reading; the source plane continues to move normally. X–Y views show numeric rating ticks at the viewport edges.

Automatic traversal looks one layer beyond the zoom threshold and expands only when the projected children fit the node budget, spacing and label checks. Crowded branches retain their parent; missing pages retain the parent until loaded. A smaller separation threshold for already expanded branches provides hysteresis. Explicit group selection bypasses the density gate and frames its children, so ties remain navigable. Label placement avoids other labels, markers, the timeline, the expanded axis key and the inspector.

Cluster navigation badges may shift at most 64 screen pixels to avoid a marker or control collision. A dot and connector disclose the unchanged semantic anchor; relation lines still terminate at those anchors. Occurrence positions, published hierarchy membership, scores and Gemini prompts are unchanged. This extends the earlier label-only displacement rule to cluster handles; it does not reassign semantic coordinates.

Validation: map tests cover the published Republic footprint, camera serialization and focal zoom, all projections and small panes, source movement, collision avoidance, deterministic bounded badge offsets, early expansion, retained crowded parents and explicit access to ties. Live browser checks at 1280×720 showed nine labeled groups in X–Y with zero label-to-label or label-to-marker intersections, and verified group opening, source-evidence activation, projection switching and timeline navigation. The current checkout passed TypeScript, ESLint and all 135 tests. No model rerun or deployment was needed.
