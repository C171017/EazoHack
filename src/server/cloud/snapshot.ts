import type { WorkspaceSnapshot } from '@/features/persistence';
import { resolveTxtAnchor } from '@/features/reader/source-anchor';
import { RequestBodyError } from '@/server/http';

/** A checkpoint can only attach evidence and offsets to its immutable source. */
export function validateSnapshotSource(snapshot: WorkspaceSnapshot, source: {
  bookId: string; fileHash: string; extractionVersion: string; sourceText: string;
}) {
  const position = snapshot.readerPosition;
  if (snapshot.bookId !== source.bookId || [...snapshot.anchors, ...snapshot.footprints.flatMap(event => event.anchors)].some(anchor => !resolveTxtAnchor(anchor, source))
    || (position && (position.fileHash !== source.fileHash || position.extractionVersion !== source.extractionVersion
      || position.startOffset > source.sourceText.length))) {
    throw new RequestBodyError('Saved reading does not match this source.', 400);
  }
}
