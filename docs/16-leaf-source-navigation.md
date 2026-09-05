# Leaf nodes and source navigation

Implemented and checked locally on 2026-09-05.

## Existing persisted association

The analysis pipeline already records this association. Extraction references application-assigned passage IDs; it does not invent character offsets. `assembleGraph` resolves those IDs against the original normalized TXT and saves:

- Each leaf occurrence's ordered `anchorIds`.
- Each anchor's book ID, source file hash, extraction version, exact UTF-16 half-open range, quotation, prefix and suffix.
- The graph/source versions alongside the graph and semantic hierarchy.

A passage is an evidence section supporting a generated note; an exact locator proves where that section is, not that the model's interpretation is correct or that it identified the smallest possible supporting sentence. A leaf can have multiple supporting passages. The first persisted anchor is its default reading destination and the basis of its Z coordinate; additional anchors remain separately available.

Semantic parent groups preserve references to the original leaves. They summarize their children and have no fabricated source location of their own. The versioned map detail API returns a leaf's original anchors on demand. No new model run or data migration is required for navigation.

## Interaction contract

Clicking a leaf in the map, activating it with Enter/Space, choosing it in Browse, or following a related-occurrence link opens its details and automatically jumps the left reader to its first source anchor. Re-activating the same leaf returns to that passage again. Additional evidence and relation-evidence buttons navigate to their own saved anchors.

Only explicit activation triggers the jump. Restoring a saved map selection, panning, rotating, zooming or refetching details does not automatically reset reading position. Parent activation continues to expand the hierarchy. Leaf requests are matched to the latest explicit activation and current selected ID; an older detail response cannot trigger a jump after a different leaf/group has been chosen. Failed detail requests retain the existing Retry control.

Before navigating or highlighting, the reader verifies source identity/version, exact resolution, a single TXT locator, bounds and quote equality. A stale or unresolved anchor leaves the reader in place and displays a notice. It does not guess a destination from a label or map coordinate.

The reader aligns the starting character, including anchors inside long paragraphs and text split by highlight markup. The highlighted render chunk stays painted despite the offscreen-chunk optimization. The same stored quote is highlighted in the source; selecting a map node does not replace the user's separately held assistance selection.

## Verification

- TypeScript, ESLint, and all 81 automated tests passed. Map reset and parent-group expansion preserved the reader passage in browser checks.
- All 288 published leaves and every referenced source anchor resolved correctly through the hierarchy/detail API and the reader's source-block lookup.
- Regression tests cover stale file/extraction/book identities, changed quotes, invalid bounds, unresolved and multiple-locator inputs, and repeated text with UTF-16 non-BMP characters.
- Browser checks covered Browse → Book VII's Allegory of the Cave (`514A`), a direct map-label click to Book VI's Assent to the fourfold schema, Enter/Space activation, additional evidence (`514C`), re-activation of the same leaf and rapid successive leaf changes. Highlight text matched the selected leaf's primary quote and began approximately 150 pixels below the reader's top edge. A screenshot confirmed the painted highlight after repeated navigation.
- The existing TXT book-map path is covered. The standalone PDF reader remains separate; arbitrary PDF-to-map navigation is not implemented by this change.
