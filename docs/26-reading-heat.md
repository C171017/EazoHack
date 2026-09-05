# Reading heat

Implemented option 1: one sequential blue brightness scale with All, Explanation,
Diagram, Interactive panel, and Illustration filters. Method colors identify the
filter controls and count breakdown; heat always uses the same numeric scale.

- One completed route run adds one footprint, even if it returns several artifacts.
  Failed, cancelled, pending, and source-discovery runs add none. Replaying a run ID
  does not increase its count; a new successful generation does.
- Footprints retain their exact source anchors and generated outputs in local
  IndexedDB (`eazo-reading-footprints`). Undoing an inline result does not erase
  the historical generation. The inspector can reopen saved outputs after reload.
  Storage errors are visible and retryable; uncommitted events remain in memory.
- The book is divided into 50 equal source-length bins (2% each). Each generation
  belongs to its passage midpoint's bin. For multiple anchors, this is a
  source-length-weighted midpoint. Book, file hash, extraction version, bounds,
  resolution, and quote must match before an event is placed.
- The fixed legend is 0, 1, 2, 3–5, 6–10, and 11+ generations. Filtering, rotating,
  scrolling, zooming, and adding activity elsewhere do not renormalize this scale.
- A ribbon follows the projected Z/source axis; it has no inferred X/Y rating.
  The horizontal whole-book strip stays available when the ribbon is offscreen
  or Z collapses in the XY projection. Both open the same count/history inspector.
- A footprint means assistance was generated, not that the passage was understood,
  read for a particular duration, or considered difficult. Counts are local to this
  browser, not aggregated across users or devices. Recording starts with completed
  generations made after this feature is installed; earlier unsaved sessions cannot
  be reconstructed. PDF workspace heat is outside this TXT-map implementation.

Validation: counting/filter/source-identity and IndexedDB reopen/failure tests;
browser checks with isolated sample generations for populated and empty states,
method filtering, inspector artifacts/source links, reload, visibility, and XY.
The temporary browser fixture page was removed after verification.
