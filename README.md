# Eazo · Nonlinear reading workspace

A local, credential-free scaffold for **read → select → explore → save**. The approved foundation is TypeScript, React, Next.js App Router/Route Handlers, Tailwind CSS, Zod, PDF.js, IndexedDB, and a three-dimensional whole-book map with three canonical 2D projections. The canvas now uses React/SVG projections of a shared 3D coordinate model, with an explicitly labeled, source-backed Book I editorial sample.

## Run locally

Requires Node.js 22.13 or newer (installed PDF.js requires this version on Node 22).

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). No credentials or environment variables are required. The dev server binds to loopback.

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Stop the dev server before running a production build; they share `.next`.

## Available now

- Two-pane desktop workspace with an exact Book I excerpt from the downloaded Republic. Select text across lines/paragraphs; offsets use UTF-16 positions in the LF-normalized complete source.
- Orbitable 3D book space plus X×Y, X×Z and Y×Z projections, readable node labels, exact source navigation, keyboard controls and a node-list fallback. Nine editorial sample occurrences; no automatic whole-book analysis.
- Shared validated contracts for anchors, selections, multi-route plans, task states, four artifact variants, references and graph data.
- Keyless production Vertex AI provider for Gemini 3.8 Flash explanations and concept diagrams, plus explicit mock providers, independent partial failures, dependency validation, cancellation and retry foundations. See [production setup](docs/10-gemini-production.md).
- Controlled React/SVG renderers; no model-supplied HTML, code or Tailwind classes. The image fixture is an honest placeholder and source fixture performs no retrieval.
- One IndexedDB checkpoint containing the selected passage, validated artifacts, interaction state, 3D camera, projection, selected occurrence, reader anchor and bookmarks. Save errors are visible; refresh restores the checkpoint. Saving replaces the prior checkpoint.

This is a scaffold, not a completed four-provider product. The route checkboxes and run button are developer fixture controls, not a finalized routing or trigger policy. Generated-looking results are not evidence of real generation.

## Still open / deferred

Routing triggers, overrides and combination policy; actual models/providers; source-discovery scope; route demo depth; full-book parsing/analysis and relation taxonomy; large-graph rendering capacity; PDF viewer integration; activity metrics; deployment. The spatial contract and three axis meanings are now decided in [the 3D book-map contract](docs/08-book-map-3d.md). The Republic source is acquired; processing scale and coverage have not been claimed. No external model, image, or search services are configured.

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
| [Book source](data/books/plato-republic/SOURCE.md) | Unmodified source and checksum |

The newer documentation was recovered from the existing local handoff worktree. The current user's instruction supersedes its historical documentation-only authorization and first-gate stop language; unresolved product decisions remain open.
