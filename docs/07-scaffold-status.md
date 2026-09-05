# Scaffold implementation status

> Latest delivery · 2026-09-05: inline artifact slots are now implemented in the main TXT reader, with persistent placement, collapse state and source-only copying. Earlier statements below that the right-side passage panel awaits migration are superseded for TXT. PDF remains separate. See [implementation and verification](18-inline-reader-implementation.md).

> Product supersession · 2026-09-05: the current passage panel described below is now a migration target. The approved design anchors generated images, interactive UI, diagrams and source cards inside the left reading stream while the right side remains the book map. This is not implemented yet. Native DOM remains the canonical source-text renderer; a whole-reader Pretext rewrite is not selected. See [inline reader artifact decision](17-inline-reader-artifacts.md).

> Latest delivery: [semantic zoom and local Gemini hierarchy](15-semantic-zoom-implementation.md) replaces spatial paging with five layers and bounded viewport requests. See that record for current tests, build, data, and device-test limits.

## PDF / whole-book documentation clarification · 2026-09-05

TXT and PDF, complete supplied-source preservation, and the four-stage PDF text pipeline are now authorized scope; older entries below describing PDF/OCR as deferred refer to their recorded delivery stage. Reader work is proceeding separately. This documentation pass does not certify that implementation or automatic whole-book graph generation.

See [PDF and whole-book analysis](11-pdf-whole-book-analysis.md) for independent reader/analysis jobs, embedded extraction before OCR, direct-PDF model input, chapter discovery, and evidence-bound merging. Read-only measurements: all 628 pages extracted with pypdf in 5.14 seconds (spacing issues); 12 pdfplumber pages in 0.49 seconds (about 25 seconds for 628 pages by extrapolation only). No OCR/graph latency or accuracy acceptance is claimed. Provider and processing-host recommendations remain unselected by this documentation update.

Updated 2026-09-05. The current user authorized scaffolding, subagents, local development and visual verification, while leaving unresolved product choices open. This update supersedes the earlier documentation-only authorization. The raw Republic download was not edited.

## Delivered

- Next.js App Router, TypeScript, Tailwind theme tokens and a two-pane React workspace.
- A real Book I opening excerpt read from the immutable local source. It is visibly an excerpt, not a claim of full-book processing. Display reflows hard-wrapped lines while DOM text retains LF-normalized source offsets. Multi-line and cross-paragraph selections become exact quote anchors.
- Zod contracts for the book, PDF/TXT anchor locators, selections, route plans/runs, all four artifact kinds, references, graphs, chunk coverage, analysis runs, bookmarks and raw activity events. Raw activity fields do not define metrics or heatmaps.
- Explicit mock route controls and provider interfaces, application dispatch, DAG validation, isolated errors, frozen request snapshots, cancellation and retry foundations. Real routing/provider mode reports `not_configured`; no fallback impersonates real output.
- A registered React configuration renderer and controlled SVG fixture diagram. Image output is labeled as a placeholder; source output states no search occurred. **Real integrations: 0/4. Mock contracts: 4/4.**
- React/SVG rendering of a shared 3D coordinate model: orbit/pan/zoom, three canonical projections, keyboard navigation, collision-separated labels, source inspector and node list. Nine editorial occurrences in three themes, with five identities and exact source anchors. React Flow has been removed.
- IndexedDB checkpoint repository with schema/binding validation and transaction commit handling. UI saves one replaceable checkpoint containing one selection, anchors, all current mock artifacts, slider state, 3D map camera/projection/selected occurrence/source range/reader anchor and bookmarks. It restores after refresh and reports failures. No cloud persistence, permanent-storage promise, or multi-checkpoint library.

## Validation actually performed

| Check | Result |
| --- | --- |
| `npm test` | 27 passing tests: schema integrity, exact source/hash, dispatch/API behavior, cancellation/retry, storage failure/recovery, HTML escaping and slider boundaries |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| Production build | Passed with Next.js Webpack; default scripts use `--webpack` |
| Browser 1440×900 and 1920×1080 | Readable two-column shell, independent scroll areas, readable mock map/results |
| Empty selection | Run and save controls disabled; no node/page substitute |
| Selection | Real multiline and cross-paragraph selections; visible persisted marks retain exact source text |
| One/four route exercise | One route yields one result; all four yield separately labeled mock variants |
| Deliberate image failure | Interactive UI, diagram and source fixtures survive independently |
| Refresh recovery | Original highlight, three mock results and slider value 4 restored |
| Repeat run/save | Edited slider, saved, reran with fresh artifact IDs, saved successfully without orphaned interaction state |
| Browser diagnostics | No captured console errors or warnings in tested flows |
| Raw source | SHA-256 remains `19d6e62b3cebec70f7704700655052d906f02be75bcc9b3b2140ba5b2df66883` |

Cancellation and retry are verified at dispatcher level; their production UI policy is not defined. PDF cross-page selection is represented and schema-tested but **not browser-implemented or accepted**. The first scaffold gate is covered; later reader/real-service/demo gates are not claimed complete.

## Environment and dependencies

Node used: 22.22.3. Direct versions locked in package-lock.json: Next.js 16.3.4, React/React DOM 19.2.8, Zod 4.5.4, PDF.js 6.3.289, Tailwind 4.3.3, TypeScript 6.0.3. PDF.js's Node engine requires >=22.13.0. PDF.js is installed for the approved boundary but its viewer is deferred. Tests use Node's test runner with tsx and fake-indexeddb. The install audit reported zero known vulnerabilities at installation time.

The setup follows the [official Next.js installation documentation](https://nextjs.org/docs/app/getting-started/installation) and [Tailwind Next.js PostCSS guide](https://tailwindcss.com/docs/installation/framework-guides/nextjs). No hosted fonts or external runtime service dependencies are needed.

Turbopack's CSS worker hit a local sandbox port-binding restriction, including an escalated attempt. Webpack successfully builds the same code. The dev script also uses Webpack to stay consistent. Dev server binds only `127.0.0.1:3000`; stop it before a production build because both use `.next`.

## Intentionally unresolved

Actual route selection logic, trigger/override/combination policy, live providers/models, source-discovery scope, per-route demo depth, full-book navigation/extraction/analysis, relation taxonomy, large-graph renderer capacity, activity aggregation/heatmap, hosting. The 3D axes and projections are decided in [the 3D book-map contract](08-book-map-3d.md); they are now implemented on a bounded source-backed editorial sample. The handoff's PDF fixture/viewer work and complete PDF reader remain deferred; the initial programmatic source fixture and real TXT excerpt support this scaffold's contract checks.

## Next implementation boundaries

1. Add validated `ArtifactPlacement` persistence and migrate generated results from the right passage panel into anchor-aware slots in the left reader; preserve immutable source text and exact selection behavior.
2. Confirm routing interaction/policy and desired demonstration depth before replacing the mock controls.
3. Extend the implemented React/SVG 3D renderer only after measuring representative larger graphs; preserve immutable source and version derived data. The current spatial guard is 80 occurrences, with a full node-list fallback above that limit.
4. Integrate/verify the PDF reflow reader's artifact slots independently from the immutable original-page canvas/text layer.
5. Select and preflight real providers/source scope, then extend mock-only artifact payloads with validated durable resources.
6. Expand checkpoint persistence to a saved-artifact library and source-file Blob storage when that product flow is chosen.

No commit or push was performed by this scaffolding task. Other concurrent task commits were observed and preserved; remaining edits are available in the working tree.

## 3D migration verification · 2026-09-05

- Renderer comparison and implementation choices: [09-3d-implementation.md](09-3d-implementation.md).
- `npm test`: 35 passing tests, including eight new graph/projection/legacy-checkpoint checks. Source integrity test still verifies the original SHA-256.
- TypeScript and ESLint: passed. Production Webpack build passed in an isolated temporary checkout using the same locked dependencies, avoiding the running server's `.next` directory.
- Live Chrome checks: 3D and all three projection controls; selection retained across projection changes; exact source highlight; arrow-key relation traversal; view-only checkpoint save/reload; mobile node-list browsing and saving at 390×844; desktop projection readability at 1440×900 and the user's default display.
- Visual checks found and corrected broad SVG node hit targets and the mobile passage-control overlap. All labels have distinct button hit targets; connector lines do not intercept clicks.
- Reduced-motion behavior is implemented via `prefers-reduced-motion`; no OS preference change or physical low-performance device test was performed. No production-scale benchmark is claimed.
- Existing multiline original-text selection still opens the passage panel; both Interactive UI and Concept diagram mock routes completed and saved together in live Chrome. The raw source and PoliMap repository were not edited. No commit or push performed.

## Magnetic view navigation update

Removed the four projection buttons. Dragging now orbits in every view; near-plane attraction and a 520ms spring settle replace explicit visual view controls. Capture radius is 10°, departure radius is 15°; Shift-drag remains pan. Camera values stay continuous, including reversed views/full yaw turns, and projection labels switch only after settling. Keyboard shortcuts and reduced-motion support remain. Tests: 38 passing, including nearest-plane, pole-exit and spring-continuity checks.

Live browser verification confirmed pointer-driven capture into X×Y, Y×Z and X×Z, small-drag return to the same plane, and deliberate exit remaining in free 3D. TypeScript, lint and the isolated production build passed.
