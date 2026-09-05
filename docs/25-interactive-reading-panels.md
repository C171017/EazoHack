# Interactive reading panels

Implemented 2026-09-05. Select a TXT passage and choose **Interactive panel** (the orchid pointer icon or **⌘3**). The result appears at that passage in the reading stream.

## Delivered behavior

- **Compare:** choose between 2–6 perspectives, conditions, or clearly labelled hypothetical cases. Each choice changes the condition, outcome, explanation, and source quote. Optionally keep the first case visible as a baseline.
- **Sequence:** move through 2–6 passage-grounded stages using step buttons, Previous/Next, or a keyboard-accessible range input. The range selects discrete stages; it does not imply a quantitative scale.
- Both modes include a learning question, takeaway, assumptions/limitations, and reset. Changes are local after generation and do not make additional model calls.
- Controls are labelled, show their selected state, and announce updated results. Content wraps in the reading pane and inherits the approved orchid palette.
- Exploration state belongs to the artifact and survives enhancement undo/redo during the mounted TXT workspace. The existing TXT workspace still does not restore generated artifacts after a page reload. The persisted artifact contract also accepts the new kind without changing old records.

This iteration delivers qualitative explorations. Continuous numerical simulation, arbitrary generated JavaScript, remote embeds, and 3D scenes remain outside this implementation.

## Provider and prompt

The existing Vertex Gemini adapter handles the new `interactive_panel` route, using the same `GEMINI_MODEL`, project, region, and ADC/Vercel OIDC configuration as Explanation and Diagram. No additional service or credential is required.

`src/server/providers/interactive-prompt.ts` defines the dedicated system instruction, JSON response schema, and source-data prompt. `passage-explorer-v1` is saved in each artifact. The instruction asks the model to choose the smallest meaningful exploration of one question, keep the passage's language and attribution, and avoid invented measurements or causal certainty. The model receives selected text plus surrounding context as JSON data in a separate user message.

The result is validated by `src/shared/interactive-panel.ts`: 2–6 distinct state labels, a passage-grounded first state, no hypothetical sequence steps, bounded text, and no extra fields. Each state must contain a quotation found in the actual selection (whitespace differences are tolerated). Context-only or fabricated quotations reject the entire result. The dispatcher repeats the quotation check against its frozen selection and verifies artifact identity and anchors.

Quotation matching verifies textual provenance, not whether a model's interpretation is correct. Outputs remain marked as AI reading aids that have not been independently verified. Hypothetical outcomes are explicitly labelled and their supporting quotation is presented as the starting idea, not proof of the hypothetical outcome.

## Integration and compatibility

`interactive_ui` remains the legacy Explanation route and schema. `interactive_panel` has its own artifact variant, so option 3 cannot accidentally generate an Explanation or be miscoloured. Existing saved explanation, mock slider, diagram, illustration, and deferred source-discovery artifacts still parse. Route collection bounds derive from the route registry, which now contains five IDs (four current enhancements plus deferred source discovery).

The renderer in `src/features/assistance/interactive-panel.tsx` only renders React text and registered controls. It never evaluates model code. Corrupt or out-of-range restored state falls back to the first case. Loading, frozen source binding, failed-route retry, inline placement, coloured marks, and generation undo/redo reuse the existing reader pipeline.

## Validation

`tests/interactive-panel.test.ts` covers prompt/provider wiring, source quote rejection, contract bounds, unsafe fields, escaped rendering, meaningful state changes, sequence controls, corrupt state, all four enhancement routes over the HTTP handlers, and undo/redo. Existing routing and persistence tests also exercise the expanded artifact registry.
