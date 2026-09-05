# Targeted reader rendering fix

Implemented after approval of the intermediate performance audit's first recommendation.

Camera changes still update the workspace and map as before, but now reuse the reader's assistance slots and enhancement callback. The existing memoized reader can therefore skip camera-only updates. Slot dependencies include selections, anchors, artifacts, placement/collapse state, interaction state, request status, source identity and busy state so real reader changes continue to propagate. Enhancement generation receives its target selection explicitly; retry retains its original selection.

Only `src/features/assistance/workspace.tsx` has a lasting application change. No history limits, source-offset changes, reader virtualization, package changes or custom prop comparators were introduced.

Validation:

- Temporary logging inside the actual `ContinuousTxtReader` render function measured five alternating zoom-in/zoom-out pairs in Chrome development mode, with two restored assistance artifacts: 22 reader render calls before the change, zero after it. Both sequences ended at zoom 1 with two artifacts. These are development render invocations, not production timings, frame counts or a percentage speedup. The temporary logging was removed.
- Browser checks confirmed collapse/expand, interactive detail level changing from 3 to 4 and back, and map navigation to “Exchange Plan for 1881 Copies.” The reader highlighted the expected “Having regard…” passage and scrolled to it. A subsequent native text selection changed the highlight to the selected word. Reopening the saved checkpoint restored its original highlighted passage and both assistance artifacts.
- TypeScript checking and ESLint on the changed file passed. All 103 existing tests passed, including persistence, source anchoring, inline placement and undo/redo coverage.

No live AI generation was requested and no user checkpoint was overwritten for this check. Production timing and long-session memory behavior remain unmeasured. This removes a confirmed source of unnecessary rendering in both build modes; it does not establish that every cause of the originally reported long-session lag has been fixed.
