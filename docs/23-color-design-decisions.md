# Color design decisions

Updated 2026-09-05: the user approved jewel palette A and requested implementation. There is no separate theme/brand color.

## Approved

| Element | Decision |
| --- | --- |
| X — reasoning depth | Coral red `#D87970` |
| Y — generality | Blue `#729AD5` |
| Z — source order | Warm white `#F2EEE5` |
| 3D space background | Charcoal `#121519` |
| Paper reader | Preserve the existing section exactly. Do not adopt the proposed paper color. |

The reader's current base paper token is `#F6F2E6`, but its appearance depends on the existing `warm-book-v1` texture assets, lighting gradients, 600px texture scale, borders, shadows, typography, and surrounding material. Preserve all of these; the base token alone is not a replacement for the paper treatment. The rejected preview paper token was `#F4ECDD`.

## Implementation and remaining scope

- No overall theme/brand accent. General controls, focus treatments, and selection before enhancement use neutrals. The proposed copper was not adopted.
- Jewel palette A is approved and implemented for the four picker icons, source highlights, artifact headings, borders, diagrams, and interactive controls. Paper ink and dark-surface tint share one registry in `src/shared/enhancements.ts`.
- Keep the intended mapping between each enhancement's icon, generated passage highlight, and associated note badge. Use a darker ink on paper and a related brighter tint on the dark space where necessary.
- Node body encoding (blended X/Y, split colors, or colored ring) remains a proposal. Approval of the axis colors does not approve a node-color algorithm or replace the existing topic-color contract.
- Plain selection uses a neutral tint (`#D9D6CE` on the paper). A running enhancement adopts its method color; failed requests do not leave a generated mark. Successful marks follow the artifacts through undo/redo and collapse. Multiple methods retain separate colored underline segments, with a neutral wash rather than a mixed category color.

## Enhancement palettes

Each pair is paper ink / dark-space tint. Highlights use a translucent version of the paper ink, with unchanged reader text color. Distinct icons and labels remain present alongside color.

| Enhancement | A — jewel colors (approved) | B — vivid contrast (not selected) |
| --- | --- | --- |
| Explanation | Cobalt `#2455B8` / `#78A6FF` | Azure `#12649E` / `#6EC3F4` |
| Diagram | Emerald `#167044` / `#62D39B` | Burnt orange `#AC4B17` / `#F8A56F` |
| Interactive panel | Orchid `#A12D87` / `#EF8AD7` | Violet `#713ABE` / `#B99AF5` |
| Illustration | Ochre `#945B08` / `#F0BB58` | Forest `#407025` / `#9DCB76` |

The new proposals separate hue families more strongly than the first blue/teal/purple/copper palette. A uses blue/green/magenta/gold; B uses blue/orange/violet/green. A retains blue for explanation and green for diagrams while moving the old purple toward magenta and copper toward gold.

Implementation preserves source offsets, paper assets, lighting, scale, typography, and surrounding material. Only annotation color changes inside the reader. The map uses the approved solid charcoal surface, red/blue/white axes, neutral grid/chrome, and a white Z scroll control. Existing topic node colors remain semantic topic colors; no axis-distance blend was introduced.

Explanation and Diagram remain the connected picker actions. Interactive panel and Illustration receive their approved styling without changing their existing unconnected status. Generated assistance is currently inline; this color change does not create a new 3D artifact-node subsystem.
