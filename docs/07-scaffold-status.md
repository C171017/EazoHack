# Scaffold implementation status

Updated 2026-09-05. The current user authorized scaffolding, subagents, local development and visual verification, while leaving unresolved product choices open. This update supersedes the earlier documentation-only authorization. The raw Republic download was not edited.

## Delivered

- Next.js App Router, TypeScript, Tailwind theme tokens and a two-pane React workspace.
- A real Book I opening excerpt read from the immutable local source. It is visibly an excerpt, not a claim of full-book processing. Display reflows hard-wrapped lines while DOM text retains LF-normalized source offsets. Multi-line and cross-paragraph selections become exact quote anchors.
- Zod contracts for the book, PDF/TXT anchor locators, selections, route plans/runs, all four artifact kinds, references, graphs, chunk coverage, analysis runs, bookmarks and raw activity events. Raw activity fields do not define metrics or heatmaps.
- Explicit mock route controls and provider interfaces, application dispatch, DAG validation, isolated errors, frozen request snapshots, cancellation and retry foundations. Real routing/provider mode reports `not_configured`; no fallback impersonates real output.
- A registered React configuration renderer and controlled SVG fixture diagram. Image output is labeled as a placeholder; source output states no search occurred. **Real integrations: 0/4. Mock contracts: 4/4.**
- React Flow fixture topology with independent zoom. It illustrates application route relationships, not extracted claims about Plato.
- IndexedDB checkpoint repository with schema/binding validation and transaction commit handling. UI saves one replaceable checkpoint containing one selection, anchors, all current mock artifacts, slider state, map viewport and anchor bookmarks. It restores after refresh and reports failures. No cloud persistence, permanent-storage promise, or multi-checkpoint library.

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

Node used: 22.22.3. Direct versions locked in package-lock.json: Next.js 16.3.4, React/React DOM 19.2.8, Zod 4.5.4, React Flow 12.11.6, PDF.js 6.3.289, Tailwind 4.3.3, TypeScript 6.0.3. PDF.js's Node engine requires >=22.13.0. PDF.js is installed for the approved boundary but its viewer is deferred. Tests use Node's test runner with tsx and fake-indexeddb. The install audit reported zero known vulnerabilities at installation time.

The setup follows the [official Next.js installation documentation](https://nextjs.org/docs/app/getting-started/installation) and [Tailwind Next.js PostCSS guide](https://tailwindcss.com/docs/installation/framework-guides/nextjs). No hosted fonts or external runtime service dependencies are needed.

Turbopack's CSS worker hit a local sandbox port-binding restriction, including an escalated attempt. Webpack successfully builds the same code. The dev script also uses Webpack to stay consistent. Dev server binds only `127.0.0.1:3000`; stop it before a production build because both use `.next`.

## Intentionally unresolved

Actual route selection logic, trigger/override/combination policy, live providers/models, source-discovery scope, per-route demo depth, full-book navigation/extraction/analysis, semantic book graph, activity aggregation/heatmap, hosting. The handoff's PDF fixture/viewer work and complete PDF reader remain deferred; the initial programmatic source fixture and real TXT excerpt support this scaffold's contract checks.

## Next implementation boundaries

1. Confirm routing interaction/policy and desired demonstration depth before replacing the mock controls.
2. Define full Republic processing coverage and graph semantics; preserve immutable source and version derived data.
3. Integrate/verify the reader format and cross-page behavior independently from assistance.
4. Select and preflight real providers/source scope, then extend mock-only artifact payloads with validated durable resources.
5. Expand checkpoint persistence to a saved-artifact library and source-file Blob storage when that product flow is chosen.

No commit or push was performed by this scaffolding task. Other concurrent task commits were observed and preserved; remaining edits are available in the working tree.
