# Spatial reading heat

The approved revision uses a classic green → yellow → orange → red heat field in
3D, replacing the source-axis ribbon and the 50-bin strip. All, Explanation,
Diagram, Interactive panel, and Illustration filters retain a shared intensity
scale. The visualization is inspired by weather-temperature contours, visually
checked against [this Weather Spark example](https://weatherspark.com/fingerprint/weatherspark_50650.png).

## Placement

1. Keep one footprint per completed supported route run, independent of output
   count. Failed/cancelled/pending runs add none; duplicate run IDs are idempotent.
2. Validate every footprint against the active book's hash, extraction version,
   exact quote, and source offsets. Merge overlapping ranges to avoid double
   counting the same text.
3. Match against leaf occurrences' actual source ranges, ranked by greatest text
   overlap, smallest interval gap, nearest interval midpoint, then stable leaf ID.
   No additional LLM call is needed. Repeated selections reuse their match during
   placement. Matching is independent of camera, zoom, and visible cluster level.
4. Deposit one unit at the winning leaf's existing 3D coordinates. Do not use a
   cluster's representative position. A nearest leaf without a 3D position stays
   explicitly unmapped instead of silently moving to a less relevant note.
5. Aggregate by leaf and enhancement method. The inspector distinguishes nearest
   text fallbacks from overlaps and links to both the leaf and original selection.

A lazy, version-checked `kind=heat-index` request provides only leaf IDs, labels,
positions, and source intervals, in pages of at most 512. It never sends the full
source text or all graph edges. The server caches this index for the loaded map.

## Field and color

In the graph's existing world units, each active leaf contributes a truncated
spherical Gaussian with sigma 20 and radius 60 (37.5% narrower than the initial version):

```
K(d) = (exp(-d² / (2 × 20²)) - exp(-4.5)) / (1 - exp(-4.5)), d < 60
K(d) = 0, d >= 60
H(p) = sum over leaves [generationCount × K(distance(p, leaf))]
```

This has peak 1 per generation and smoothly vanishes at its boundary. Sum scalar
intensities **in 3D before coloring**. Nearby spheres form continuous warm regions;
do not add RGB sprites or projected 2D blur values. The fixed continuous color
stops are green at 1, yellow at 4, orange at 8, and red at 12+. Values above 12
saturate visually, while exact counts remain available. Alpha fades to transparent
at the low-density boundary; zero activity is invisible. There is no animated pulse.

An orthographic maximum-intensity projection samples the precomputed 3D field.
Two far-apart green sources that happen to project to the same pixel remain green:
screen overlap cannot create additional density. Rotation changes the view, not
the heat values. Reader progress translates the volume by exactly the same Z
translation as graph leaves. Cluster expansion never moves the heat sources.

## Performance and persistence

- Fixed 64 × 48 × 96 grid: 294,912 bytes (288 KiB) for the uploaded R8 texture,
  plus a transient Float32 accumulation buffer. Each leaf touches only nearby voxels.
- Field rebuilt only on footprint/filter changes, not camera or reading updates.
- WebGL 2, one full-screen triangle, at most 128 samples per ray, early exit at red,
  and approximately 180,000 shaded pixels regardless of screen resolution/DPR.
- Redraw on demand with requestAnimationFrame coalescing, no idle animation loop.
  GPU resources are disposed on unmount and restored after context loss.
- Up to 128 transparent hit targets in the scene; all heated leaves remain
  available in the native inspector picker. Graph labels/edges remain above heat.
- No new dependencies. If WebGL 2 is unavailable, counts and saved outputs remain
  accessible and the UI reports that the spatial display is unavailable.
- Existing IndexedDB footprints and outputs are reused without migration. Undoing
  an inline result does not erase its generation history. Source-version mismatch
  is explicit. History is browser-local, not aggregated across devices/users.

Initial-radius browser stress measurement on 2026-09-06 (before the radius reduction): all 288 leaves at weight 12,
1400 × 1000 viewport capped by the renderer. Field build 31.2 ms; 20 measured
camera redraws after five warm-up draws averaged 0.9 ms, p95 1.2 ms, including
`gl.finish` and a 1-pixel readback. These are local measurements, not universal
frame-time guarantees. With three active leaves, the observed rebuild was 9.8 ms.

Validation covers matching/ties/gaps, stale sources and unplaced leaves, method
counts, persistence, Gaussian falloff, accumulation, false overlap in depth,
bounded grid size, and the real book/API index. Browser QA covered green/yellow/red
sources, adjacent-source fusion, method filtering, XY projection, leaf navigation,
and GPU rendering. The temporary QA route is removed after verification. No model
requests or sample footprints were added to the real reading history.
