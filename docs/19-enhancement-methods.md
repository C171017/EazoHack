# Four enhanced-reading methods

Confirmed by the user on 2026-09-05. This document supersedes older four-route product descriptions that include source discovery. It records product intent and the current TXT selection controls; provider selection remains separate.

| Method | Output | Quality priorities | Scope |
| --- | --- | --- | --- |
| Explanation | Structured text, styled by the application using readable typography, headings, lists, tables and callouts | Passage fidelity, clarity, useful organization, calibrated interpretation | First iteration priority; an independent method rather than a simulation side effect |
| Diagram | Code-rendered SVG graphs, timelines, charts, process diagrams and other programmatic visuals | Semantic correctness, readable labels/layout, valid structure | Next iteration priority; generated raster images belong to Illustration |
| Interactive panel | Embedded controls, simulations, exploratory interfaces and potentially 3D scenes | Correct mechanisms, useful interaction, robust state and readable presentation | Three.js/embedded 3D is a future option, not a selected dependency or delivered capability |
| Illustration | Images created by an image-generation model | Description fidelity, instructional usefulness, composition and visual quality | Separate image model and inference provider |

Research briefs/source discovery are deferred for now. Source anchoring and distinguishing original text from generated interpretation remain requirements for all four methods; deferring retrieval does not remove provenance.

All outputs belong at the selected passage in the left reading stream; the right side remains the whole-book map. One selection may receive multiple outputs.

## Generation and rendering boundary

The model supplies structured explanation content and visual/interaction specifications; application components own styling and rendering. Existing D10 remains the runtime baseline: validated configuration and tested components, not arbitrary model-generated JavaScript execution. Code-based diagrams can be rendered from validated data. Future free-form SVG/code or Three.js execution needs an explicit implementation design; this discussion does not silently authorize it.

Models and inference providers are separate choices. Each method may have its own pairing, while one text/code model may serve several methods. Model research recommendations are not final provider selections.

## Implementation status

The TXT reader now reveals four colored SVG icon buttons beside the selected text: cobalt speech bubble (Explanation), emerald hierarchy (Diagram), orchid clicking pointer (Interactive panel), and gold palette (Illustration). The floating picker uses feathered blur and staggered motion, with reduced-motion support. It dismisses on Escape, outside pointer input, scrolling, or resize. Mouse/pointer selection and keyboard Shift-arrow extension preserve canonical source offsets.

All four methods are connected. Explanation and Diagram use the legacy `interactive_ui` and `concept_diagram` routes. Interactive panel uses the distinct `interactive_panel` route through the existing Vertex Gemini provider and renders validated scenario comparisons or process steppers; see [interactive reading panels](25-interactive-reading-panels.md). Illustration uses `generated_image`; see [Z-Image illustrations](24-z-image-illustrations.md). Existing artifact records remain compatible. The text reader has no Reading session panel or checkpoint save/restore flow; generated results and retry controls remain attached to the original passage. Its reading and enhancement state lasts for the current mounted workspace. The separate PDF workspace retains its existing controls.

## Model research

See [model/provider shortlist](20-generation-model-research.md) for current research, weighted scores and citations. Global backend access was confirmed for this comparison. No model has been selected for implementation by this research.

Latest selection proposal: [API-first, cost-aware shortlist](21-api-cost-model-shortlist.md), reflecting the user's lighter-harness constraint. Provider choices remain unapproved.

Approved color implementation: see [color decisions](23-color-design-decisions.md). Generated TXT marks retain their enhancement identity across selection changes and undo/redo; overlapping methods have separate underline segments.
