# Reading layout stability

The reader's composition and source position belong to the user. Background UI must never push reading content up or down, change the reading viewport's dimensions, reset scroll position, or move the map.

- Put transient notices, sync errors, conflicts, recovery controls, and background progress in `ReaderNoticeLayer` or another out-of-flow overlay. Never insert them as normal-flow siblings above the reader or add conditional padding/margins to make room.
- Use the controls' feathered backdrop blur for notices. Keep text and focus rings sharp; pass pointer events through empty overlay space. Bound long notices and scroll them internally.
- Do not steal focus, auto-scroll, or change source position when a notice appears, changes, retries, or disappears. Keep retry, backup, and conflict recovery accessible.
- User scrolling, source navigation, font changes, and explicit layout controls may change composition. Background results must preserve the visible source anchor when inserting or resizing content; user initiation of a request does not authorize a later reading jump.
- For future reader UI changes, check desktop and narrow mobile layouts at a nonzero reading offset. Toggle error, retry, success, conflict, and long-message states. The reader/map bounding boxes, reader scroll offset, and visible source position must remain unchanged. Check keyboard access and that the font/library and mobile map controls remain usable.

Current enforcement: sync errors, conflicts, and unplaced-result recovery are contained in the absolutely positioned `ReaderNoticeLayer`, outside the reader scroll container and flex layout. This removes their ability to resize the reading viewport. It is not a blanket guarantee for every future inline content change: those changes must also preserve the visible source anchor.
