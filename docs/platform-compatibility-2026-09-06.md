# Platform compatibility implementation — September 6, 2026

This implements the platform-focused follow-up to the performance audit. It does not implement all architectural recommendations in the audit. Other tasks concurrently applied CSS, catalogue, telemetry, deployment-check, and title-page changes; those are separate work. Existing edits were preserved, and no deployment was performed by this task.

## Changes

- Portable map input tracks multiple pointer contacts. One contact orbits; two contacts pan/pinch from a stable baseline, avoiding zoom drift during two-finger translation. Mouse/pen behavior, right/middle panning, and Windows line/page wheel units remain supported. Safari trackpad GestureEvents do not double-apply touch input. Cancellation, capture loss, and fresh clicks after dragging are handled.
- Camera and timeline input publish at most once per animation frame, retaining movement deltas and flushing final input. Touch dragging now works on the timeline. Ctrl/Meta browser shortcuts, AltGr, composing text, editable fields, and already-handled keyboard events bypass map shortcuts. The documented Alt-arrow orbit remains available.
- Hidden mobile maps, maps covered by the library, and background-tab maps unmount their scene. Camera state remains in the workspace. Heat-index fetching and placement pause while inactive; completed indexes are reused when reopened. Existing scene cleanup releases requests, animation frames, and GPU resources.
- Replay retains its 8 Hz heat-update timestamp across camera changes and resizes its canvas only when dimensions change. Transform application is reset rather than compounded.
- Selection controls use visual-viewport bounds and dismiss when that viewport changes. Windows/Linux keyboard labels use Alt; Apple labels use Option. Source text and UTF-16 anchoring remain unchanged by these adjustments.
- Client analysis/cloud requests use a controller-based deadline and cancellation helper without requiring newer static AbortSignal APIs. Cleanup covers success, failure, timeout, and cancellation, including body decoding. Ordinary cloud requests default to 30 seconds; analyze/resume/account deletion allow 120 seconds. Existing positional arguments remain compatible, with optional explicit overrides.
- PDF loading detects the built-ins needed by the installed PDF.js version and selects its upstream compatibility build when necessary. The selected module and worker stay paired for the page lifetime, and the worker request includes the PDF.js version. Both worker builds are staged for deployment and covered by asset checks. This remains lazy PDF-only loading, not an additional download for ordinary TXT reading.

## Safari PDF failure found and fixed

The five-page repository fixture initially failed at 0% in Safari 26.6.2 with an undefined-function error. Temporary diagnostics in the isolated copy located the failure inside PDF.js `getTextContent()` at its `for await` loop over a ReadableStream. The modern module had loaded successfully; changing module selection alone did not fix this failure.

The active importer now aggregates `streamTextContent().getReader()` results directly, preserving item order, font styles, language, cancellation, and page cleanup without requiring async-iterable streams. A regression test uses a stream with `Symbol.asyncIterator` removed. The temporary stack-display diagnostic was removed before the final build.

After this change, Safari reached **Text ready · 100%** and displayed the embedded-text, two-column, and rotated-page text. The intentionally damaged page was omitted, the scanned page remained explicitly unextracted, and the original PDF was retained. Chrome completed the same fixture with the same notices and extracted content.

## Verification

- **337/337 tests passed** in an isolated source snapshot; production build and TypeScript passed. Scoped ESLint and diff checks passed. The first test invocation accidentally enabled the hosted Vercel guard for local-only tests; rerunning tests in their normal environment passed. VERCEL=1 was used for the build and hosted smoke server.
- Isolated snapshot: `/private/tmp/eazo-compat-build-g72rd69q`, served locally on port 3033 for final checks. No .env files were copied. Temporary diagnostic code was removed.
- **Safari 26.6.2 on an Apple M4 Max:** public reader/map rendered, library interaction worked, and the mixed PDF fixture imported and displayed successfully through the native file picker.
- **Chrome 152 on the same Mac:** desktop keyboard zoom and native mouse orbit were checked; orbit changed yaw/pitch without changing zoom. The library removed map nodes and heat canvases while covering the reader. PDF import completed successfully at 390 × 844. The extension's automated file setter was unavailable; the ordinary native picker completed the check without changing extension permissions.
- **Mobile-sized Chrome, 390 × 844:** hidden map had zero map nodes and zero SVG gradient stops, while all 6,487 Republic source spans remained. Opening restored camera zoom (2.025 in the test), and no horizontal overflow was detected. This is viewport verification, not physical Android/iPhone testing or a mobile memory benchmark.
- **Windows/Edge review and simulated event tests:** pixel/line/page wheels, horizontal/Shift-wheel behavior, mouse and pen buttons, Ctrl/Meta browser shortcuts, AltGr/IME/editable focus, two-contact transitions, gesture cancellation, and post-drag click recovery. Independent review found and verified fixes for swallowed browser zoom shortcuts and stale click suppression. No Windows VM or physical Windows browser was used.
- Final HTTP smoke checks passed both public readers/maps, stale-version rejection, PDF byte ranges, both modern/compatibility worker JavaScript responses, asset allowlisting, disabled dev endpoints, and rejection of unauthenticated generation. No paid model or remote job was invoked.

## Limits and next device checks

The shared checkout changed during validation. The final isolated snapshot matched 19 of 20 compared scoped source files; a concurrent title-page rendering change in `continuous-txt-reader.tsx` was separate from this pass's viewport adjustments. The snapshot is not certification of every later edit or a deployed release.

Physical iOS/Android pinch, keyboard/safe-area transitions, page suspension, touch selection handles, low-memory termination, Windows display scaling, and real Precision Touchpad hardware remain useful follow-up checks. The gesture/controller tests simulate inputs; they do not emulate an operating system or mobile GPU. No claim of an FPS, battery, or RAM percentage improvement is made. The measured resource change is the removal of hidden map DOM/canvases; historical reader/graph architecture costs remain separate opportunities.

Use `npm test`, `npm run typecheck`, a production build in a separate directory from the running dev server, and `node scripts/smoke-vercel.mjs http://127.0.0.1:PORT` for future validation. Re-test representative old-browser capabilities when updating PDF.js; keep the main/worker pair and the non-iterable-stream regression test together.
