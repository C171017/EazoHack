# Finer reasoning and generality scale

2026-09-06. The flat map was dominated by rows and columns: the prior Republic snapshot had only 30 distinct X–Y positions among 288 occurrences. Allowing decimals in a five-anchor prompt had not produced enough differentiation.

## Decision

Use **0–10 ratings in tenths** for both reasoning depth and generality, with eleven explicitly described anchors. This permits 101 positions per axis. Changing only the grid would leave exact score ties unchanged; adding integer navigation layers would not solve score quantization either. The model selects adjacent anchors and explains a supported intermediate position, without defaulting to integers or halves. Actual ties and unknown values remain valid. More available values are not a promise of uniform distribution or measured interval precision.

The complete shared rubric is `src/shared/book-axes.ts`. It distinguishes inference sequences, complete local arguments, prior results, combined arguments and culminating synthesis; generality distinguishes an individual, bounded cases, subtypes, classes, domains, cross-domain and universal claims. Ratings apply to the particular sourced occurrence.

## Data and pipeline

- `reasoning-generality-v2` and `book-axes-v2` require fresh source-based reassessment. Old numbers are never multiplied to manufacture the new interpretation. All source occurrences, identities, original relations, topics, anchors and Z remain intact.
- Extraction continues producing qualitative reasoning/scope hints. Reconciliation is followed by the new scored assignment and independent review; no old structural-level classifier determines coordinates. Review examines fractional placement, scope, actual internal reasoning and named prerequisites.
- Whole-book consistency uses the new scale, including propagated prerequisite floors and uncertainty. Old consistency metadata does not carry across reassessment. When a prerequisite floor raises a rating, a constrained model step rewrites its explanation before source review; every score, prerequisite, evidence anchor and generality field is locked. This fixes stale numeric prose that previously caused valid notes and their dependents to become unplaced. Numerical precision is checked in both model-response validation and graph validation.
- `semantic-hierarchy-v3` rebuilds spatial grouping from the new coordinates and explicitly forbids snapping. Grouping depth remains separate from axis scores; the existing 8-child limit, zoom policy and representative-child rule are retained.
- Versioned graph/hierarchy files and request fingerprints retain old snapshots and prevent reuse of incompatible replies. The axes-only CLI switches the local published map only after hierarchy validation.

## Geometry and display

The existing geometry contract is retained: X=rating/10, Y=rating×4/10, Z=unchanged source progress. Geometry Y in 0–4 is a storage unit, **not** the displayed score. Shared conversion functions handle both versions. This keeps projection, camera fitting, panning, heat-field coordinates and hierarchy bounds consistent without changing those systems.

Grid spacing stays 50 world units, independent of 0.1 score precision. Flat X–Y score labels use 0, 2, 4, 6, 8, 10 when in view; node details, evidence explanations and group ranges all display the correct versioned denominator. Legacy reasoning/generality snapshots retain 0–4 labels and coordinates. No random jitter or grid attraction is applied.

## Verification

Tests cover legacy snapshot reading, mandatory reassessment, source preservation, all 101 round-trip score positions, invalid precision/ranges, independent review/retry/resume, unknown positions, prerequisite consistency and representative-child bounds. Full suite and live Republic results are recorded below after completion.

### Published Republic result

- Graph: `axis-consistency-v1-6871be462cd59801`; map: `semantic-hierarchy-v3-a7e1da16f4f05052`.
- All 288 notes are placed, with zero unknown coordinates and zero prerequisite-depth conflicts. All 213 original relations, source text/anchors, identities, topics and Z positions are unchanged.
- Distinct reasoning-depth values: **6 → 64**; distinct generality values: **9 → 65**. Distinct X–Y pairs: **30 → 252**. Largest exact X–Y tie: **48 → 5**. These measure underlying semantic positions, independent of camera fitting or displaced group badges.
- Navigation frontiers: 288 → 84 → 26 → 11 → 4; five navigation layers and 406 total hierarchy entries. Source validation and complete hierarchy reachability/bounds validation passed.
- TypeScript, ESLint, diff whitespace checks and all 180 tests passed, including the long-chain explanation regression and its rejection of unauthorized score edits.

Reproduce the distribution comparison with:

```sh
node --import tsx scripts/audit-axis-scale.ts \
  data/books/plato-republic/analysis/semantic-hierarchy-v2-b7628d5e4649ece7/graph.json \
  data/books/plato-republic/analysis/current-graph.json
```

Browser verification passed in an isolated temporary dev snapshot: all four projections, stable group expansion, fractional group ranges, leaf details (`n-3-7`: X 2.3 / 10, Y 3.8 / 10), and source navigation. The isolated browser reported no errors or warnings. The old hierarchy version correctly returns HTTP 409. The shared port-3000 page also displayed the new scale; ongoing workspace refreshes motivated the isolated navigation check. Local publication only; no deployment or Git commit was made.
