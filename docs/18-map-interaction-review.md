# Map interaction review — 2026-09-05

Scope: hands-on local browser navigation, followed by targeted fixes for reproducible interaction failures. The design choices below remain unchanged pending user review.

## Fixed

1. **Side-to-top rotation could not snap.** From YZ (yaw 90°, pitch 0°), a vertical drag reached pitch −87.2° but remained in 3D. Top detection also required yaw near 0° or 180°, even though every yaw at a vertical pitch is an XZ projection. Top capture now depends on tilt. Following the requested refinement, entry settles to the nearest perpendicular heading after release, without steering yaw during the drag. Rotating within the top plane also retains its XZ state.
2. **Continuing toward vertical bounced away.** Another upward drag from that nearly flat pose changed pitch to about −41.3°. The orbit calculation reflected excess movement back into the tilt range. An uninterrupted drag now stops at ±90°. Further input in the same direction stays at the pole; only reversing tilts away. Incremental pointer movement avoids an overshoot dead zone, and reversing within the magnetic range starts from the displayed angle.
3. **Separate arrow taps could not leave a snapped plane.** Each ArrowUp tap from XY returned to pitch 0°. Keyboard settling now captures an approaching plane without undoing steps away from one. Three separate taps now produce pitch −0.36 radians, and further taps reach XZ.

The 30° capture range, 100% minimum zoom, hierarchy membership, source data, and group-opening behavior remain unchanged. The former 40° departure gate has been replaced by directional capture so short intentional departures are no longer undone.

## For user review — not changed

| Issue observed | Proposed change | Design choice involved |
| --- | --- | --- |
| Opening a group shows a detail panel over the lower scene and zoom/reset controls at a 1280×720 viewport. | Reserve a clear strip for navigation controls and make the panel collapsible. | Keep an overlay, move details outside the canvas, or show a compact summary when opening a group. |
| Opening The Ideal City and Guardians also expands neighboring groups; 5 overview groups become 10 visible groups in the tested top view. | Make group exploration focus on that branch and provide a parent/back action. | Current zoom expands the visible hierarchy globally; branch-only exploration would change navigation semantics. |
| Label boxes avoid one another but can overlap node circles and controls, especially after expansion and at high zoom. | Exclude node circles and control areas from label placement, showing fewer labels when necessary. | Trade simultaneous text density for clearer geometry; preserve actual source-derived node positions. |
| Two-finger scrolling can pan the entire map away at 100%, leaving a blank scene. Return to overview works. | Bound panning so some content remains visible, or gently recenter when the gesture ends. | Constrains the currently free canvas navigation. |

Top-down entry uses the nearest 90° heading, requiring at most 45° of horizontal settling. Deliberate rotation within an already-flat top view remains possible. Settling takes the shortest equivalent yaw path and can be interrupted by fresh input.

## Verification

- Browser: reproduced the original side-to-top rejection and pitch reversal before the fix; repeated the same side-to-top drag afterward and confirmed exact XZ alignment at yaw 90° / pitch −90°.
- Browser: deliberately left XZ, accumulated individual arrow taps from XY, reached XZ by keyboard, and rotated horizontally within XZ without losing flat status.
- Browser: opened a group, closed its panel, zoomed back to overview, panned offscreen and recovered, reached the 4800% upper limit with Zoom in disabled, selected a leaf, followed a related-note link, and reset to 100% / five overview groups.
- No errors in the final browser console check. The local server stopped during the initial review and was restarted before continuing.
- TypeScript, ESLint, and all 92 tests passed. Regression tests cover arbitrary top-view headings, monotonic movement to the poles, keyboard departure/arrival, and rotation within the top plane.
- Follow-up browser verification: entered XZ from yaw 0.98 radians and settled to 90°; repeated upward drags stayed at −90°; two short reverse drags produced −81.4° then −72.8° without springing back; interrupting a projection animation with ArrowDown left the new camera stable.
- Trackpad hardware pinch and Safari-specific gesture delivery were not exercised in this browser review; their existing handlers were not changed in this pass.
