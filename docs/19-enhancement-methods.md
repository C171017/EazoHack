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

The TXT reader now reveals four colored SVG icon buttons beside the selected text: blue speech bubble (Explanation), green hierarchy (Diagram), purple clicking pointer (Interactive panel), and amber palette (Illustration). The floating picker uses feathered blur and staggered motion, with reduced-motion support. It dismisses on Escape, outside pointer input, scrolling, or resize. Mouse/pointer selection and keyboard Shift-arrow extension preserve canonical source offsets.

Explanation and Diagram launch their existing providers directly, using the legacy `interactive_ui` and `concept_diagram` route IDs respectively. Interactive panel and Illustration remain visible with unavailable hints and cannot submit requests. No provider or saved-artifact schema migration is implied. Save and reopen controls live under Reading session, while generated results and retry controls remain attached to the original passage. The separate PDF workspace retains its existing controls.

## Model research

See [model/provider shortlist](20-generation-model-research.md) for current research, weighted scores and citations. Global backend access was confirmed for this comparison. No model has been selected for implementation by this research.

Latest selection proposal: [API-first, cost-aware shortlist](21-api-cost-model-shortlist.md), reflecting the user's lighter-harness constraint. Provider choices remain unapproved.
