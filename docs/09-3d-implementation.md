# 3D canvas implementation · 2026-09-05

> 2026-09-05 implementation: semantic zoom, bounded viewport loading and the Gemini-generated five-layer Republic hierarchy are now delivered locally. See [current implementation and verification](15-semantic-zoom-implementation.md). Earlier pending/paging notes below are historical; baseline-device benchmarks remain pending.

> Design update, 2026-09-05: [Semantic zoom and hierarchy](14-semantic-zoom-hierarchy.md) supersedes fixed spatial paging as the target large-map design. Pinch zoom will progressively shrink/merge nodes into meaningful parents and expand them again, with bounded viewport loading. Dragging must preserve zoom. This is pending implementation: the fixed-size-node and bounded-sample behavior below records the earlier delivery, not the new transition contract.

The user authorized reading the revised contract, evaluating rendering technology, inspecting the local PoliMap meetings implementation and demo, and implementing the 2D → 3D change. This supersedes historical scaffold stop gates for this work. It does not choose live providers or authorize whole-book AI analysis.

## Renderer decision

**Selected: React + SVG rendering of a shared orthographic 3D world.** A small pure camera module rotates XYZ coordinates and projects them onto the SVG plane. Free orbit and all three canonical projections use that same graphVersion. This is a 3D coordinate renderer, not an independently laid-out set of 2D graphs. It has no WebGL or GPU-context requirement. React Flow and its CSS have been removed from the dependency tree. Next.js, React, TypeScript, Tailwind, Zod, PDF.js and IndexedDB remain.

| Approach | Assessment for Eazo | Decision |
| --- | --- | --- |
| CSS 3D, as used in PoliMap | Excellent continuous scene transforms and browser-native node controls. Inverse transforms are needed for readable labels; projected label collision management and relation geometry would still be custom. Opacity, overflow and other ancestor styles can flatten a preserve-3d scene. | Inspected as reference; adapt spatial grid, independent node picking and camera continuity, not its political axes or domain code. |
| Canvas 2D with projected XYZ | Compact scene rendering; requires custom hit testing plus a parallel accessible DOM and label pipeline. | No benefit for this nine-occurrence sample. |
| WebGL / Three.js | Suitable for large scenes and actual solid geometry; requires a new runtime dependency, GPU fallback, picking and accessible overlays. | Deferred until a measured larger graph needs it. No claim that WebGL is unsuitable in general. |
| SVG with projected XYZ | Readable fixed-size text, native focus/click targets, inspectable edges and no GPU context. Labels can move with leader lines while semantic points remain fixed. | Implemented for this bounded sample. Spatial rendering is guarded at 80 occurrences; larger graphs use the complete node list. This guard is an engineering limit, not a validated production capacity claim. |

References checked: [MDN transform-style](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/transform-style) and [SVG tabindex](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/tabindex). Local Next.js 16.3.4 guides for `use client` and lazy loading were read before implementation. Reference code: `/Users/17c1710/Project/PoliMap/apps/web/components/meetings/MeetingsSpace.tsx`; running reference: `http://localhost:3000/meetings`. PoliMap was read and interacted with; no source edits were made there.

## Data and provenance

- `GraphSchema` now holds graphVersion, source fingerprint/version/length, full anchors, territories, identities, occurrences and directed evidence-bearing relations.
- The displayed editorial sample contains nine occurrences, five concept identities and three themes from the exact Book I opening excerpt. It does not claim automatic theme discovery or full-book coverage. Theme coverage counts sample occurrences only. Structural classification, theme order and relations are explicitly editorial; confidence is unassessed (`null`).
- X is a fixed theme position within this graphVersion; Y equals canonical level 0–4; Z is exact first-anchor UTF-16 offset divided by complete LF-normalized source length. The raw source is untouched. Its introduction occupies substantial source space, so Book I does not begin at Z=0.
- “Book I opening · expanded” changes only the visible Z range, not stored coordinates. “Entire source file” shows the real narrow sample extent. Labels state excerpt beginning/end or full-file beginning/end.
- Identities carry no fabricated Z. Their occurrences have distinct anchors, and the inspector links all occurrences of the selected identity.
- Invalid endpoints, unknown evidence IDs, mixed source fingerprints, incorrect Y, invented Z and duplicate IDs are rejected. Unknown coordinates remain null and are available in the node list, not moved to the origin.
- The current Z validation path is TXT-only. Future PDF occurrences need an explicit source-order resolver rather than guessed coordinates.

## Interaction and persistence

- Initial 3D overview with gesture-driven magnetic alignment to X×Y concept, X×Z theme development, and Y×Z structure development. The four view buttons have been removed. Keys 1–4 remain as a keyboard-only accessibility shortcut. The same selected occurrence and reader source survive switching.
- Drag to orbit in every view. Shift-drag pans. A 10° capture radius attracts the camera; release settles it onto the nearest plane. A 15° departure radius lets small movements return to the snapped plane while deliberate drags exit without recapturing the same plane in that gesture. Reversed alignments remain the same projection. Zoom buttons and Reset view are available. Arrow keys on the scene orbit; arrows on a node traverse directed relations where available, otherwise source-list order. All labels are keyboard-focusable.
- Projection settling uses a 520 ms critically damped spring response and is cancellable; OS reduced-motion preference makes settling immediate. The same scene rotates throughout; no fade, crossfade or graph remount is used. No idle animation runs. Nodes never shrink with perspective; collision offsets apply only to labels. Browse nodes is an always-available accessible reading path, including unknown positions.
- Read this passage scrolls the original reader to an exact highlight without replacing the user's assistance selection. Selecting original text still opens the existing passage panel and mock workflow.
- Save view works even before a user text selection. The existing single IndexedDB checkpoint now also stores graphVersion, projection, orbit, pan, zoom, selected occurrence, source range and reader anchor. Save locally in the passage panel saves the same state. Legacy 2D checkpoints load with `mapView=null`; their source and artifact data are retained. Old 2D pan coordinates are not misinterpreted as a 3D camera. A mismatched graphVersion resets the camera rather than reusing stale coordinates.

## Validation and limits

Automated checks cover exact source anchors, repeated identity/occurrence separation, invalid coordinate/reference rejection, unknown placement, canonical projection math, semantic-coordinate immutability, collision label offsets and legacy/current checkpoint parsing, alongside the existing route, artifact, reader and persistence tests.

The renderer is delivered against a bounded editorial sample. Dynamic extraction, whole-book coverage, final relation taxonomy, GPU-scale performance, model providers, PDF viewer and hosting remain open. The current 80-occurrence guard and collision algorithm require representative larger-book measurements before raising the spatial budget. Browser validation and final command results are recorded in `07-scaffold-status.md`.
