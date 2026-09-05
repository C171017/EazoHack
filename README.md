# Eazo · Nonlinear reading workspace

A local workspace for **read → select → explore → save**. The foundation is TypeScript, React, Next.js, Tailwind CSS, Zod and IndexedDB. The React/SVG 3D map reads a saved, source-anchored Gemini analysis of the Republic TXT, with three canonical 2D projections. Whole-book analysis accepts plain text only for this MVP; PDF conversion is a separate upstream concern.

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
- Orbitable 3D book space plus X×Y, X×Z and Y×Z projections, source navigation, keyboard controls, theme/text-type filters, spatial pages and a complete filtered node list. Gemini results replace the editorial sample after full-source processing, reconciliation and evidence review.
- Shared validated contracts for anchors, selections, multi-route plans, task states, four artifact variants, references and graph data.
- Keyless production Vertex AI provider for Gemini 3.8 Flash explanations and concept diagrams, plus explicit mock providers, independent partial failures, dependency validation, cancellation and retry foundations. See [production setup](docs/10-gemini-production.md).
- Controlled React/SVG renderers; no model-supplied HTML, code or Tailwind classes. The image fixture is an honest placeholder and source fixture performs no retrieval.
- One IndexedDB checkpoint containing the selected passage, validated artifacts, interaction state, 3D camera, projection, selected occurrence, reader anchor and bookmarks. Save errors are visible; refresh restores the checkpoint. Saving replaces the prior checkpoint.

This is a scaffold, not a completed four-provider product. The route checkboxes and run button are developer fixture controls, not a finalized routing or trigger policy. Generated-looking results are not evidence of real generation.

## Confirmed design refinement · pending implementation

The map will use pinch-driven semantic zoom: bounded visible nodes merge into meaningful parent summaries when zooming out and expand when zooming in, with reversible threshold transitions and viewport-based loading. Book analysis will build the hierarchy from leaves upward with LM-proposed depth and application-enforced budgets. Dragging must no longer auto-zoom. Performance targets include M1/M2 MacBook Air and comparable Windows laptops with integrated graphics. See the [hierarchy and loading contract](docs/14-semantic-zoom-hierarchy.md); current spatial paging remains the implemented behavior until this refinement is built and measured.

## Still open / deferred

The current analysis MVP takes plain text. PDF reader work is being handled separately; future PDF-to-text conversion can feed the same analysis boundary. See the [PDF extraction and graph design note](docs/11-pdf-whole-book-analysis.md) for that separate work.

Still open: routing policy, source discovery, image services, richer relation taxonomies, large-graph rendering, arbitrary book uploads, hosted background jobs, cross-device persistence and activity metrics. Gemini is connected for text analysis, explanations and concept diagrams. The [3D book-map contract](docs/08-book-map-3d.md) defines the three axes; processing coverage does not imply exhaustive or human-verified conceptual coverage.

## Documentation

| Document | Purpose |
| --- | --- |
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
| [Semantic zoom hierarchy](docs/14-semantic-zoom-hierarchy.md) | Confirmed multi-level analysis, pinch thresholds, viewport budgets, transitions and baseline-device acceptance; pending implementation |
| [Book source](data/books/plato-republic/SOURCE.md) | Unmodified source and checksum |

The newer documentation was recovered from the existing local handoff worktree. The current user's instruction supersedes its historical documentation-only authorization and first-gate stop language; unresolved product decisions remain open.
