import type { WorkspaceSnapshot } from '../persistence';
import { artifactEnhancement } from '../../shared/enhancements';
import { resolveTxtAnchor } from './source-anchor';

/** Derive the bookmark from retained outputs, so undo and old saves work too. */
export function readingBookmark(saved: WorkspaceSnapshot, source: {
  bookId: string; sourceText: string; fileHash: string; extractionVersion: string;
}): number | null {
  if (saved.bookId !== source.bookId) return null;
  const anchors = new Map(saved.anchors.map(anchor => [anchor.id, anchor]));
  const newestFirst = saved.artifacts.filter(artifact => artifactEnhancement(artifact))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
  for (const artifact of newestFirst) {
    if (artifact.bookId !== source.bookId) continue;
    for (const id of artifact.anchorIds) {
      const range = resolveTxtAnchor(anchors.get(id), source);
      if (range) return range.startOffset;
    }
  }
  const position = saved.readerPosition;
  return position && position.fileHash === source.fileHash
    && position.extractionVersion === source.extractionVersion
    && Number.isSafeInteger(position.startOffset) && position.startOffset >= 0
    && position.startOffset <= source.sourceText.length ? position.startOffset : null;
}
