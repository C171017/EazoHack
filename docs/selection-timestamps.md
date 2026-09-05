# Selection timestamps

Completed TXT and PDF passage selections automatically append an event to the
browser's `eazo-selection-activity` IndexedDB database (`selections` store).
This includes the current highlight produced by selecting text. It does not
introduce a separate highlight action or any navigation/history UI.

Each event contains `selectedAt` (device-clock UTC ISO 8601, to the second), the
selection, and a snapshot of its exact source anchors: book/file identity,
extraction version, quotation, UTF-16 offsets, and PDF page/rectangle locations
where applicable. PDF capture time is taken before asynchronous page processing.

Events append independently of manual workspace checkpoints. Selecting the same
passage again creates another event without changing the original selection's
`createdAt`. An auto-incremented `sequence` distinguishes events within the same
second and concurrent writes from multiple tabs. The repository's `list(bookId)`
returns capture-time order, with sequence breaking ties.

Loading a checkpoint, highlighting a map source, rendering, and generating an
enhancement do not create selection events. Old checkpoints are not backfilled
with invented selection times. Empty/invalid selections are not recorded.
Storage errors use the existing reader notice; they do not block selection.

This records selected passages, not passive reading or an inferred last-read
position. Data is local to the browser profile and is not account-synced;
clearing site data removes it. Device clock changes can affect timestamp order.
Future rewind/bookmark designs can use these records without committing to a UI
or automatically resuming at a selected passage now.
