# Paper material candidates

Generated with the built-in imagegen tool on 2026-09-05. The user selected **A — Warm book paper**. The original PNGs remain as design sources; only the optimized versions of A in `public/textures/` are delivered to the reader.

Requested sequence: select material, prepare image sizes and formats plus browser selection, then refine CSS shape and lighting. Preserve real selectable text.

## Implemented material and CSS layers

- Reproduce exports with `node scripts/prepare-paper-texture.mjs` after `npm ci`. The script uses sharp already installed with Next.js; no image processing runs in the browser or on a request.
- 600 × 600 and 1200 × 1200 exports in AVIF (quality 70), WebP (quality 88), and JPEG (quality 92). Full-color sampling for AVIF/JPEG preserves fine fiber color. Exact sizes are in `web-assets.json`.
- CSS `image-set()` selects the supported format and density: AVIF first, WebP second, JPEG last. Browsers without typed `image-set()` get the 600px JPEG. A plain paper color remains while loading or if the image cannot load.
- The tile is always 600 CSS pixels across. Viewport width changes the amount of paper shown, not fiber size. Standard-density screens use the 600px source; high-density screens can use 1200px. Resolution is capped at 2x to keep memory and download costs bounded. There is no device sniffing or JavaScript router.
- AVIF payloads: 22,632 bytes at 1x, 141,249 bytes at 2x, compared with the 2,349,980-byte original. WebP: 27,876 / 172,078 bytes. JPEG: 51,721 / 285,368 bytes. One chosen texture is shared by the sheet and masthead, not six downloads.
- `src/app/globals.css` puts static horizontal lighting above the opaque material, with fine sheet edges, shallow shadows, and a narrower surround on phones. The backgrounds belong to the bounded scroll surface, not the book's full height. No new animations, filters, blend modes, DOM nodes, or runtime dependencies.
- Existing typography, text selection, source offsets, font choices, and chunk rendering are retained. Forced-colors mode removes the background images and decorative shadows.
- Keep the `warm-book-v1-*` filenames in sync with CSS; use a new version for future changes to an already deployed material.

Validation: production build (including TypeScript), lint, and all four TXT document tests passed. Browser checks covered desktop and 390px layout, visible tile boundaries, scrolling, menu controls, and selection. Fresh browser resource inventories confirmed only the 600px AVIF at standard density and only the 1200px AVIF at high density. No frame-rate benchmark or non-Chromium browser test was performed.

## A — Warm book paper

File: `a-warm-book-paper.png`

Exact generation prompt:

Use case: photorealistic-natural. Asset type: reusable paper-material background for a long-form reading website, with real dark text to be rendered above it later. Generate one square, high-resolution, full-bleed, orthographic scan-like image of blank paper material. Material fills every pixel, no visible sheet boundary. Very fine fibers and minute natural surface irregularity should be visible but restrained; realistic paper, not just flat beige. Even diffuse neutral illumination across the entire image, consistent brightness across all edges, designed for seamless tiling with no obvious motifs. No text, letters, printed marks, labels, watermark, objects, page edges, folds, creases, stains, tears, cast shadows, vignette, directional lighting, gradient, large blotches, or decorative pattern. Keep the center and margins equally quiet and readable. Material direction A: fresh uncoated cream paper from a beautifully made literary paperback. Pale warm ivory, extremely subtle oatmeal-colored cellulose fibers, close fine matte grain, soft dry tactile surface. Clean contemporary book stock, not aged or yellow parchment. Natural irregularities at small scale, low contrast suitable for many hours of reading. Favor realism and understated warmth.

## B — Soft cotton paper

File: `b-soft-cotton-paper.png`

Exact generation prompt:

Use case: photorealistic-natural. Asset type: reusable paper-material background for a long-form reading website, with real dark text to be rendered above it later. Generate one square, high-resolution, full-bleed, orthographic scan-like image of blank paper material. Material fills every pixel, no visible sheet boundary. Very fine fibers and minute natural surface irregularity should be visible but restrained; realistic paper, not just flat beige. Even diffuse neutral illumination across the entire image, consistent brightness across all edges, designed for seamless tiling with no obvious motifs. No text, letters, printed marks, labels, watermark, objects, page edges, folds, creases, stains, tears, cast shadows, vignette, directional lighting, gradient, large blotches, or decorative pattern. Keep the center and margins equally quiet and readable. Material direction B: premium smooth cotton-rag writing paper, luminous neutral off-white with only the slightest warm undertone. Delicate interlocking cotton fibers, soft velvety matte tooth, barely perceptible cloudlike variations at a fine scale. Smoother and lighter than traditional cream book paper, elegant and clean, not coarse watercolor paper or canvas. Subtle but credible tactile surface.

## C — Fine laid paper

File: `c-fine-laid-paper.png`

Exact generation prompt:

Use case: photorealistic-natural. Asset type: reusable paper-material background for a long-form reading website, with real dark text to be rendered above it later. Generate one square, high-resolution, full-bleed, orthographic scan-like image of blank paper material. Material fills every pixel, no visible sheet boundary. Very fine fibers and minute natural surface irregularity should be visible but restrained; realistic paper, not just flat beige. Even diffuse neutral illumination across the entire image, consistent brightness across all edges, designed for seamless tiling with no obvious motifs. No text, letters, printed marks, labels, watermark, objects, page edges, folds, creases, stains, tears, cast shadows, vignette, directional lighting, gradient, large blotches, or decorative pattern. Keep the center and margins equally quiet and readable. Material direction C: refined light ivory laid book paper. An extremely delicate, closely spaced, almost imperceptible parallel laid-line structure nestled into irregular fine cellulose fibers; material texture rather than a drawn pattern. Pale flax undertone, restrained natural tooth, clean archival quality. A little more tactile character than smooth book paper while remaining calm beneath text. No strong stripes, grid, fabric weave, or antique damage.
