# Reasoning depth × generality: implementation

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
4. A separate review call sees the proposed scores plus exact source passages for named prerequisites. Unsupported assignments are revised as a complete batch and re-reviewed, with bounded retries. Failed scoring does not discard accepted source nodes or publish a replacement map.
5. Application validation checks coverage, ranges, references, target evidence, self-references, zero-with-prerequisites, cyclic prerequisite chains, coordinate/assessment agreement, and preservation of all accepted source content and Z. Model review remains an interpretation, not independent scholarly certification.
6. `semantic-hierarchy-v2` groups the newly scored XYZ space while checking topic coherence separately. Group depth is not reasoning depth or generality.
7. The CLI publishes the new map pointer only after hierarchy validation. Previous versioned graphs/hierarchies stay available. Calls, usage, failures and request fingerprints are saved separately for resume; model replies are not silently reused for changed prompts.

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

TypeScript, ESLint and the current 94-test suite pass, including source-preserving reassessment, fractional/unknown coordinates, correction/review checkpoints, invalid prerequisites, corrupted checkpoint rejection, unplaced access, representative group ranges and legacy hierarchy compatibility. Production build, live reassessment and browser results are recorded below once complete.
