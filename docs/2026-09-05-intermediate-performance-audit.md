# Intermediate Chrome performance investigation

Investigated September 5, 2026, approximately 21:20–21:37 Asia/Shanghai. Scope: the local Eazo TXT reader and book map in Chrome, especially slowdown after continued development that clears on refresh. This is a diagnosis and decision report; no application source fixes were made.

**Finding:** The evidence points more toward temporary allocation/rendering pressure in a substantial development page than toward a large permanently retained JavaScript leak. Development-session overhead remains a plausible amplifier, but Fast Refresh has not been isolated as the root cause. There are also concrete application-level inefficiencies that survive production compilation. The worst reported lag was not captured in a CPU trace, so a definitive causal attribution would overstate this audit.

**What was measured**

The existing user tab was inspected without reloading it. A separate tab opened the same local URL and restored the same two saved assistance artifacts. Only the disposable tab was used for zoom exercises and a reload. Chrome DevTools was opened for counters; garbage collection was requested once on the original tab. The disposable tab was closed and the original tab was left open with DevTools closed.

| Observation | Existing tab | Fresh development tab |
| --- | --- | --- |
| Attached HTML/SVG elements at first DOM comparison | 16,450 | 16,447 |
| TXT chunks | 92 | 92 |
| Source text spans | 6,426 | 6,426 |
| Assistance artifacts | 2 | 2 |
| Map nodes at overview | 5 | 5 |
| Cached map pages at first comparison | 15 | 0 |
| Chrome tab-memory label in one comparison | 818 MB | 331 MB |
| Later JavaScript heap observation | 134 MB before explicit collection; 61.7 MB after | 84.9 MB initially; 164 MB after short zoom exercise; 59.4 MB after settling at a deeper level |
| Settled CPU sample | 0.2% | 0.1% |
| Settled layouts and style recalculations per second | 0 / 0 | 0 / 0 |

The initial native Chrome observation flagged the original tab at 938 MB and later about 1.0 GB. Its label subsequently fell through 818 MB, 685 MB, and 534 MB during investigation, without reloading that tab. These are approximate, delayed tab-memory labels, not equivalent to live JavaScript heap. They include costs outside JavaScript. Inspection, accessibility extraction, DevTools docking, browser collection, concurrent development, and tab foreground/background status can affect the readings; the difference is not a controlled estimate of bytes leaked by Eazo.

Chrome Performance monitor reported approximately 56,000 DOM nodes for each page. That metric includes node types beyond the attached elements counted with `querySelectorAll('*')`; the two counts should not be compared as though they measured the same thing.

The disposable tab completed five rapid cycles of two zoom-in and two zoom-out key presses, returning to five overview nodes and approximately the same attached element count. These rapid cycles did not allow the debounced child-page requests to populate the cache. A subsequent two-step zoom followed by a separate observation did: 11 visible nodes and five cached pages. After settling, the heap was 59.4 MB and CPU/layout activity returned to near idle. This short exercise did not reproduce a monotonic leak or the reported severe lag. It is not a long-session soak test.

**Likely contributors and production relevance**

| Contributor | Evidence and confidence | Production relevance |
| --- | --- | --- |
| Temporary allocations and development-session overhead | Memory was higher in the older tab, but much of its JS heap was reclaimable. Fresh-tab heap also rose during interaction and fell afterward. Moderate evidence for allocation pressure; low confidence about which function or development feature caused the worst slowdown. | Development instrumentation and Fast Refresh do not represent production execution. Application allocation costs still remain. |
| Map movement causes reader-side work | Confirmed by code. Camera changes update `TextWorkspace`; it rebuilds slot objects and passes a new `onEnhance` function. Those changed props defeat the reader's outer memoization. Cost has not been attributed by a render profiler. | Yes. Production compilation does not automatically fix these prop/state relationships. |
| Whole-book DOM baseline | Confirmed by DOM and code: all 92 chunks and thousands of source spans are mounted. CSS skips offscreen layout/painting but does not remove these elements or their React representation. | Yes. Production should be measured separately, but this structure remains. |
| Selection and enhancement history growth | Confirmed retention policy: selections and anchors append; generated artifacts, placements and undo/redo history have no explicit session cap. Retaining saved work is intentional, not by itself a leak. Only two artifacts were present in the measured page, so this is not established as the current dominant cause. | Yes, especially long usage sessions with many selections/results. |
| Expensive targeted layout operations | Font changes scan source spans and read geometry; source jumps may realign for up to 90 frames. Bounded and action-specific, not an observed idle loop. | Yes. Investigate if font switching or source jumps specifically trigger lag. |

The map-to-reader path is especially worth improving because a camera move should not need to reconstruct assistance content in the other pane. However, this is **not** a claim that every paragraph rerenders on every move. Individual `TxtChunk` components are memoized, and unaffected chunks receive a stable empty slot array. The extra work is the reader-level traversal, slot allocation/filtering, chunks containing artifacts, and callback/effect churn.

Useful code locations:

- `src/features/assistance/workspace.tsx:32`: camera state lives in the parent workspace.
- `src/features/assistance/workspace.tsx:88`: accumulating selections and anchors.
- `src/features/assistance/workspace.tsx:135`: assistance slots rebuilt during workspace rendering.
- `src/features/assistance/workspace.tsx:164`: reader receives slots and an inline enhancement callback.
- `src/features/reader/continuous-txt-reader.tsx:166`: font-change geometry scan.
- `src/features/reader/continuous-txt-reader.tsx:263`: bounded source-jump alignment.
- `src/features/reader/continuous-txt-reader.tsx:372`: per-chunk slot filtering.
- `src/features/assistance/enhancement-history.ts`: retained generation and undo/redo history.
- `src/app/globals.css:130`: offscreen rendering containment.

**What the audit did not find**

The reviewed map/reader paths clean up their principal listeners, observers, timers and animation frames. The map cache has a hard 48-page limit, with budgets of 36 normal nodes, 72 transition entries, 64 incoming edges and 18 labels. Requests are debounced and aborted on effect cleanup. These existing protections make an unbounded map cache or obvious perpetual animation a weaker explanation for the observed session.

This is scoped inspection, not proof that all listeners, browser-native resources, extensions, PDF workers or detached objects are leak-free. The active reader was TXT; PDF/OCR workloads were not exercised. Later diagnostics exposed generic asynchronous message-channel errors, but without an application stack they do not establish an Eazo cause. No extension was disabled.

**Why refresh can help**

A refresh rebuilds the document and its JavaScript environment, discarding temporary runtime state and allocations before restoring the saved checkpoint. It can also discard unsaved session history. Fast Refresh preserves state across many source edits and reruns hooks, so a development tab has a different history from a newly loaded page. This makes the user's observation consistent with accumulated runtime pressure; it does not prove Fast Refresh leaks memory. A server-process leak alone is a weaker fit because refreshing Chrome does not restart the server.

Production removes the live-update/development machinery, but retains the whole-book reader, camera/state relationships and history policy. Therefore, “production will definitely fix it” is not supported.

**Recommended decision**

1. First fix, if approved: stabilize reader callbacks and derived slots, and prevent camera-only changes from doing reader/assistance work. Preserve source offsets, text selection/copy, inline artifacts, save/reopen, and map-to-source jumps. Expected benefit: less allocation and more consistent map interaction in both development and production. This is the smallest well-supported application change; a speedup percentage is not yet known.
2. In parallel with subsequent development, use a production preview for acceptance checks and collect a CPU/allocation trace when the lag is actually present. Keep live code updates for coding. A clean tab is a useful temporary workaround, not a diagnosis or permanent fix.
3. Consider compacting unused selection history and bounding undo retention if long enhancement sessions show growth. Preserve saved artifacts and their anchors; do not silently discard user work.
4. Defer whole-reader virtualization until measurement justifies it. It could reduce baseline memory, but it is a larger change with risks to native selection, find-in-page, copying, accessibility, exact source jumps and scroll stability. Existing chunk containment already provides part of the rendering benefit.

For a decisive follow-up, compare one fixed source/data snapshot in three conditions: fresh development without edits, development with repeated Fast Refresh updates, and production. Run the same scroll, zoom/orbit, source-jump and assistance sequence for 20–30 minutes. Record frame/interaction latency, long tasks, retained heap after collection, DOM nodes, listeners, and total renderer memory. A rising retained heap or detached-node count across repeated return-to-baseline cycles would justify a leak investigation; allocation spikes with a stable retained baseline would favor render/allocation optimization. Do not compare different saved histories or graph versions as a pure dev-versus-production experiment.

**Validation limits and changes made during the audit**

No application source or configuration was edited by this audit; this report is its only intended repository addition. Other development was modifying and committing files during the investigation, so the current branch head is not a frozen identifier for every observation. The temporary source copy used for the build check remains at `/private/tmp/eazo-performance-2AJTrI` for local inspection and excludes environment files.

An initial build command accidentally ran in the working checkout and touched generated `.next` output; it failed with Google Fonts DNS errors. The subsequent build ran in the isolated copy with network access, remained at compilation without further output for several minutes, and was stopped. The reason for that second stall was not established. No completed production artifact or production performance measurements were obtained. Afterward the development route returned HTTP 200, and a separate browser reload verified all 92 reader chunks and the five-node map. The original user tab was never refreshed. No server was intentionally restarted, no deployment was made, and no AI-generation request was sent.

Reference material: [Next.js Fast Refresh](https://nextjs.org/docs/architecture/fast-refresh), also checked against the installed Next.js 16.3.4 guide; [Chrome memory diagnosis](https://developer.chrome.com/docs/devtools/memory-problems); [Chrome Performance monitor](https://developer.chrome.com/docs/devtools/performance-monitor); [React memoization](https://react.dev/reference/react/memo); [offscreen content visibility](https://web.dev/articles/content-visibility). These explain the mechanisms and measurement limits; the app-specific findings above come from this local inspection.
