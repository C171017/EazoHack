# Shared 3D book-map contract

Updated 2026-09-06: the user selected **Reasoning depth × Generality**. This replaces the former X topic-territory / Y structural-level contract. Z remains source progress. Implementation and validation: [axis redesign](22-map-axis-redesign.md).

## One coordinate system, three views

| Axis | Question | Increasing away from the origin |
| --- | --- | --- |
| X — Reasoning depth | How much prior reasoning within this book does this occurrence depend on? | Introduced material → local inference → linked arguments → extended chains |
| Y — Generality | How broad a class of cases does this particular claim purport to cover? | Specific instance → bounded cases → restricted class → broad principle |
| Z — Source progress | Where does this occurrence appear in the source? | Beginning → end |

World coordinates remain Z-up: source progress is vertical, generality extends into depth, reasoning is horizontal. Rotating the camera changes projection only. In the X×Y view, positive Y extends down the screen with the existing camera convention. "Further" refers to increasing position along each labeled axis; radial distance has no overall importance, quality or truth meaning.

| Projection | Meaning |
| --- | --- |
| X×Y | Starting material and derived conclusions at different levels of generality |
| X×Z | How reasoning depth changes through the source |
| Y×Z | How the scope of claims changes through the source |

All views use the same graphVersion and hierarchyVersion. No projection-specific regrouping, rescoring, force layout, or automatic zoom on rotation/pan is permitted.

## Rating rules

Both semantic ratings use an ordered 0–10 rubric with source-supported tenths: eleven named anchors and 101 possible positions per axis. These are interpretable anchors, not equal intervals of meaning. Code maps ratings to fixed geometry units X=score/10 and Y=score×4/10; stored assessments and all visible readouts use 0–10. The grid remains an independent spatial reference, with sparse score labels; it never snaps nodes. Neither axis is normalized to the observed min/max of a particular book. Genuine ties remain visible; arbitrary jitter and forced uniform occupancy are disallowed. The full rubric and migration are documented in [fine axis scale](23-fine-axis-scale.md).

Reasoning anchors progress from directly introduced material (0), through immediate/local inferences (1–2), sequences and complete local arguments (3–4), use and combination of earlier results (5–6), synthesis and extended chains (7–8), to culminating/work-wide reasoning (9–10). This is total required reasoning within the book, not chapter order, background knowledge, difficulty or importance. Positive values need explained internal inference or evidenced prerequisites.

Generality anchors progress from one event (0), through an individual and bounded cases (1–2), narrow subtypes and defined classes (3–4), domain claims and related classes (5–6), varied settings and cross-domain principles (7–8), to near-universal and maximally general claims (9–10). This rates asserted scope, not truth, physical size, abstraction or frequency.

An abstract starting definition may have X=0 and high Y. A model-derived prediction about one specific event may have high X and Y=0. Assess the actual occurrence's statement: a depicted story and its general interpretation are different units. Preserve speakers, opposed claims and editorial attribution. Explain a mixed unit's rated scope or leave the axis unknown instead of rewriting the source.

Each axis stores its own rationale and source-anchor IDs. Reasoning can additionally cite accepted prerequisite node IDs. A separate source review inspects those prerequisites. Whole-book calibration checks total depth across batches: a dependent cannot receive a lower known depth than a required prerequisite, and an unknown required depth remains explicit. Unknown coordinates remain null and unplaced; the original node and its source remain accessible. Uncertainty is not a zero or midpoint.

## Topics and source identity

Retain 3–7 sourced topic groups, with stable labels/order and topic colors. Their order and stored legacy centroid metadata no longer set X. Nearness in the map does not imply the same topic or a semantic relation. Relationships remain explicitly typed and source-grounded.

Keep shared concept identity separate from occurrences. Coordinates assess an occurrence; repeated mentions may have different reasoning roles or scopes. Z is derived from its unchanged exact source anchor, never collapsed across occurrences or replaced by story chronology, publication date or reading history.

## Semantic zoom and groups

Navigation grouping depth is independent of both semantic axes. A source leaf may be a general principle or a specific example. Large group markers represent multiple notes, not importance or correctness.

New groups use a stable representative child position, selected by weighted distance in normalized XYZ, and retain their complete descendant bounds. A group summary is not a new source occurrence or a fresh axis-rated claim. Its representative is a navigation handle; group details disclose the ranges rather than describing the group as an average claim. Older snapshots retain their original bounds-center rule and explicit legacy axis labels.

Bounds, node and label budgets, source navigation, camera limits, and asynchronous version checks remain governed by [semantic zoom](14-semantic-zoom-hierarchy.md). Label collision handling must not rewrite semantic coordinates. Unknown notes remain accessible independently of spatial placement.

## Versions and publication

New maps require `axisVersion: reasoning-generality-v2`, reviewed axis metadata and an assessment for every accepted occurrence. Prior reasoning/generality graphs remain parseable with their original 0–4 ratings; topic/structure graphs retain explicit legacy labels; never reinterpret old topic/structure numbers as new reasoning/generality numbers.

Reassessment creates a separate staged graph, preserves accepted nodes, anchors, identities, original relations and Z, and rebuilds the hierarchy. Switch the published map only after source, coordinate and hierarchy validation pass. Changed graph/hierarchy versions invalidate saved camera mappings rather than silently restoring selections against incompatible spatial data. Keep prior snapshots and request-fingerprinted checkpoints for recovery.

Hardware performance claims still require device measurements; model reasoning and structural validation cannot certify M1/M2 or other baseline hardware performance.
