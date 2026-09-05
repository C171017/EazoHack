# Inline TXT reader artifacts

Implemented locally on 2026-09-05. This delivers the primary TXT reading-workspace architecture from [D14](17-inline-reader-artifacts.md). The separate `/pdf` workspace has not been migrated.

## Delivered behavior

- Original selectable DOM text is split only at source offsets; artifact slots are siblings outside source spans. Concatenating source spans still produces the complete original normalized text.
- Selection opens assistance controls directly after the selected passage in the left reader. Existing Gemini explanation and concept-diagram routes feed that same reading flow. The right side remains the book map.
- Selecting another passage retains earlier selections, anchors, artifacts and interaction state. An in-flight response remains bound to its frozen selection, even if the active selection changes. Failures and targeted retries remain attached to their original passage.
- Placements persist artifact/selection/anchor IDs, exact end offset, stable order and collapsed state in the existing local checkpoint. Old checkpoints acquire placements from their original single TXT anchors. Unresolved results remain accessible with a visible warning instead of being rebound silently.
- Each card can collapse, expand or be removed from the current workspace. Explicit Save locally persists the full collection and control state. Removing a result before saving can be reversed by reopening the saved checkpoint.
- Native selection is restored after source spans split. Copy events with source endpoints export the exact source slice, excluding embedded artifact text. Selecting within a generated card remains ordinary generated-content selection.
- Ready image payloads can contain a bounded PNG/JPEG/WebP data URL with width/height; these resources survive IndexedDB storage and reserve image space. Placeholder payloads remain compatible. No image provider was connected; Image and Sources remain disabled in the production route controls.

## Rendering and performance

The browser continues to lay out native text and React cards. Existing offscreen chunk containment remains enabled. Pretext is optional and has not been added: this implementation does not require custom per-line measurement. Artifacts keep stable IDs and source offsets across rendering; source navigation reads only source spans, avoiding inserted card text.

## Verification

TypeScript and ESLint passed. Automated coverage includes source-range splitting, legacy-placement migration, collapse-state persistence, invalid/missing placement bindings, duplicate placements, and ready-image resource validation. The full existing test suite remains passing. An isolated production build passed with the reader fonts fetched, without sharing the running dev server's output directory.

Local Chromium checks exercised restored fixtures at their exact passage, independent collapse/expand, selecting and copying across four artifact slots, and saving/reloading their collapsed states. The cross-card clipboard contained only the original two paragraphs, including the original paragraph break. Provider availability and model quality are independent from these renderer checks.

The standalone PDF reflow integration, arbitrary-shape text wrapping, an actual image-generation provider, and baseline-device/Firefox/Safari performance measurements remain follow-up work. This delivery does not claim those checks or integrations.
