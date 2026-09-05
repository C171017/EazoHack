# Eazo · Nonlinear reading workspace

> 2026-09-05 latest scope: the four enhanced-reading methods are **Explanation, Diagram, Illustration, and Interactive panel**. Research briefs/source discovery are deferred. Iterate Explanation first, then Diagram; Three.js is a future option. This supersedes older product-scope lists below, not their runtime implementation history. See [confirmed method definitions](docs/19-enhancement-methods.md).

> Latest delivery · 2026-09-05: inline artifact slots are now implemented in the main TXT reader, with persistent placement, collapse state and source-only copying. Earlier statements below that the right-side passage panel awaits migration are superseded for TXT. PDF remains separate. See [implementation and verification](docs/18-inline-reader-implementation.md).

A local workspace for **read → select → explore → save**. The foundation is TypeScript, React, Next.js, Tailwind CSS, Zod and IndexedDB. The React/SVG 3D map reads a saved, source-anchored Gemini analysis of the Republic TXT, with three canonical 2D projections. Whole-book analysis accepts plain text only for this MVP; PDF conversion is a separate upstream concern.

Latest approved product direction: generated images, interactive UI and concept diagrams belong in the **left reading stream**, anchored at the selected passage; the right side remains the book map. The current passage-panel implementation has not yet been migrated. Native DOM text remains the canonical reader renderer; Pretext is optional for bounded measurement/layout problems, not a whole-reader replacement. See [inline reader artifacts and text-layout decision](docs/17-inline-reader-artifacts.md).

## Run locally

Requires Node.js 22.13 or newer (installed PDF.js requires this version on Node 22).

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Reading the saved graph requires no credentials. Live passage assistance and rerunning book analysis require the [Vertex configuration](docs/10-gemini-production.md). The dev server binds to loopback.

Run `npm run analyze:book -- --dry-run` to inspect text coverage, then `npm run analyze:book` to generate or resume the book graph. See [text-only analysis and JSON storage](docs/13-text-book-analysis.md) for prompts, checkpoints, validation, and the database decision.

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Stop the dev server before running a production build; they share `.next`.

## Available now

- Two-pane desktop workspace with the complete Republic TXT. Select text across lines/paragraphs; offsets use UTF-16 positions in the LF-normalized complete source.
- Orbitable 3D book space plus X×Y, X×Z and Y×Z projections, source navigation, keyboard controls, theme/text-type filters, five-level semantic zoom, bounded viewport loading and a paged searchable node list. Gemini results replace the editorial sample after full-source processing, reconciliation and evidence review.
- Shared validated contracts for anchors, selections, multi-route plans, task states, four artifact variants, references and graph data.
- Keyless production Vertex AI provider for Gemini 3.8 Flash explanations and concept diagrams, plus explicit mock providers, independent partial failures, dependency validation, cancellation and retry foundations. See [production setup](docs/10-gemini-production.md).
- Controlled React/SVG renderers; no model-supplied HTML, code or Tailwind classes. The image fixture is an honest placeholder and source fixture performs no retrieval.
- One IndexedDB checkpoint containing the selected passage, validated artifacts, interaction state, 3D camera, projection, selected occurrence, reader anchor and bookmarks. Save errors are visible; refresh restores the checkpoint. Saving replaces the prior checkpoint.

This is a scaffold, not a completed four-provider product. The route checkboxes and run button are developer fixture controls, not a finalized routing or trigger policy. Generated-looking results are not evidence of real generation.

## Semantic zoom · implemented locally

The map now uses pinch-driven semantic zoom, reversible cluster transitions and lazy viewport loading. Gemini has generated five layers over all 288 accepted source notes, with five overview groups. Dragging preserves zoom; the scene caps active nodes at 36. See the [implementation and verification record](docs/15-semantic-zoom-implementation.md). M1/M2 Air and comparable Windows laptops remain the target baseline; their device benchmarks are pending.

## Still open / deferred

The current analysis MVP takes plain text. PDF reader work is being handled separately; future PDF-to-text conversion can feed the same analysis boundary. See the [PDF extraction and graph design note](docs/11-pdf-whole-book-analysis.md) for that separate work.

Still open: routing policy, source discovery, image services, richer relation taxonomies, baseline-device performance validation, arbitrary book uploads, hosted background jobs, cross-device persistence and activity metrics. Gemini is connected for text analysis, explanations and concept diagrams. The [3D book-map contract](docs/08-book-map-3d.md) defines the three axes; processing coverage does not imply exhaustive or human-verified conceptual coverage.

## Documentation

| Document | Purpose |
| --- | --- |
| [Four enhancement methods](docs/19-enhancement-methods.md) | Current taxonomy, priorities and boundaries |
| [Model/provider research](docs/20-generation-model-research.md) | Three candidates per method, weighted ratings and evidence |
| [API-first model shortlist](docs/21-api-cost-model-shortlist.md) | Revised recommendations for a lighter harness and cost sensitivity |
| [Product](docs/01-product.md) | Confirmed experience and open interactions |
| [Decisions](docs/02-decisions.md) | Locked stack and unresolved choices |
| [Architecture](docs/03-architecture.md) | Module boundaries and provenance |
| [Stack](docs/04-stack.md) | Approved technology constraints |
| [Demo plan](docs/05-plan.md) | Future acceptance gates |
| [Scaffolding handoff](docs/06-scaffolding-handoff.md) | Original handoff and implementation boundaries |
| [Implementation status](docs/07-scaffold-status.md) | Actual delivered scope and validation |
| [3D book-map contract](docs/08-book-map-3d.md) | Approved axes, projections, adaptive rules and spatial data requirements |
| [3D implementation](docs/09-3d-implementation.md) | Renderer comparison, delivered interactions, data and persistence migration |
| [PDF and whole-book analysis](docs/11-pdf-whole-book-analysis.md) | Full-source scope, extraction/OCR, chapter discovery, graph evidence, timing measurements and open choices |
| [Semantic zoom hierarchy](docs/14-semantic-zoom-hierarchy.md) | Approved multi-level analysis, pinch thresholds, viewport budgets, transitions and baseline-device acceptance |
| [Semantic zoom implementation](docs/15-semantic-zoom-implementation.md) | Delivered controls, loading budgets, Gemini hierarchy, generated data and measured validation |
| [Inline reader artifacts](docs/17-inline-reader-artifacts.md) | Latest placement contract and scoped Pretext decision |
| [Book source](data/books/plato-republic/SOURCE.md) | Unmodified source and checksum |

The newer documentation was recovered from the existing local handoff worktree. The current user's instruction supersedes its historical documentation-only authorization and first-gate stop language; unresolved product decisions remain open.
