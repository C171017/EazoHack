# Reading trajectory replay

The circular SVG replay control sits at the top left of the map. One activation
plays the active book's mapped, completed enhancement footprints in timestamp
order, oldest first. Equal timestamps use stable generation IDs; repeated visits
remain separate stops. The existing validated heat placement is the only source
of coordinates. Unmapped or incompatible footprints are not given invented positions.

During playback a temporary 3D overview fits every visited leaf and its heat halo.
The original map, its camera/selection, and the reader position are preserved
underneath and return when playback ends. The view contains the existing spatial
grid, a pale chronological trail, a moving ring, and cumulative heat. Heat keeps
the existing green/yellow/orange/red density scale; trail color does not encode
density. A small count and timestamp show which generation has been reached.

Idle gaps between timestamps are compressed. Visits normally take 700 ms, with
travel capped at 30 seconds for long histories. Playback holds the finished trail
for 1.5 seconds, fades the trail, then closes. There is no looping, scrubber,
generation request, history write, or camera write. The button is disabled during
playback and when there is no usable history or history is still loading.

Heat uses the full trajectory's fixed volume bounds throughout, so growing history
cannot shift the sampling grid. Uploads are limited to eight per second; the canvas
trail animates independently without rendering thousands of DOM nodes. All visits
are accumulated even when a large history crosses several timestamps in one frame.
Reduced motion uses discrete stops without interpolated movement or fading.
RAF and GPU resources are disposed when playback finishes, the map unmounts, or
the source/history changes. WebGL failures retain the trail and existing fallback.

Validation: chronology versus source order, duplicate IDs, tied timestamps, return
visits, cumulative heat/method counts, final density equivalence, fixed bounds,
single/empty/large history timing, reduced motion, and overview fit at narrow widths.
Browser QA uses temporary in-memory fixtures without adding personal footprints.
