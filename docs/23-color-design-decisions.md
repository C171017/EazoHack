# Color design decisions

Recorded 2026-09-05 from the user's review of the first color proposal (Copper & ink).

## Approved

| Element | Decision |
| --- | --- |
| X — reasoning depth | Coral red `#D87970` |
| Y — generality | Blue `#729AD5` |
| Z — source order | Warm white `#F2EEE5` |
| 3D space background | Charcoal `#121519` |
| Paper reader | Preserve the existing section exactly. Do not adopt the proposed paper color. |

The reader's current base paper token is `#F6F2E6`, but its appearance depends on the existing `warm-book-v1` texture assets, lighting gradients, 600px texture scale, borders, shadows, typography, and surrounding material. Preserve all of these; the base token alone is not a replacement for the paper treatment. The rejected preview paper token was `#F4ECDD`.

## Still open

- Overall theme/brand accent: undecided. The proposed copper `#B96B48` was not approved. The user will research and choose this later; do not substitute another accent automatically.
- Four enhancement colors: redesign for stronger visual distinction while retaining a coherent family. All palettes below are proposals, not approvals.
- Keep the intended mapping between each enhancement's icon, generated passage highlight, and associated note badge. Use a darker ink on paper and a related brighter tint on the dark space where necessary.
- Node body encoding (blended X/Y, split colors, or colored ring) remains a proposal. Approval of the axis colors does not approve a node-color algorithm or replace the existing topic-color contract.
- Default selection color before enhancement choice remains undecided along with the theme color.

## Enhancement proposals, second review

Each pair is paper ink / dark-space tint. Highlights use a translucent version of the paper ink, with unchanged reader text color. Distinct icons and labels remain present alongside color.

| Enhancement | A — jewel colors (recommended) | B — vivid contrast |
| --- | --- | --- |
| Explanation | Cobalt `#2455B8` / `#78A6FF` | Azure `#12649E` / `#6EC3F4` |
| Diagram | Emerald `#167044` / `#62D39B` | Burnt orange `#AC4B17` / `#F8A56F` |
| Interactive panel | Orchid `#A12D87` / `#EF8AD7` | Violet `#713ABE` / `#B99AF5` |
| Illustration | Ochre `#945B08` / `#F0BB58` | Forest `#407025` / `#9DCB76` |

The new proposals separate hue families more strongly than the first blue/teal/purple/copper palette. A uses blue/green/magenta/gold; B uses blue/orange/violet/green. A retains blue for explanation and green for diagrams while moving the old purple toward magenta and copper toward gold.

This turn records design decisions and creates review previews only. It does not apply these colors to production UI or change the paper reader.
