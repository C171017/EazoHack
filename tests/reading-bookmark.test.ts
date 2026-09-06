import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readingBookmark } from '../src/features/reader/reading-bookmark';
import { WorkspaceSnapshotSchema } from '../src/features/persistence';
import { makeMockArtifact } from '../src/shared/fixtures';
import type { Selection, SourceAnchor } from '../src/shared/schemas';

const source = { bookId: 'book', fileHash: 'hash', extractionVersion: 'v1', sourceText: 'x'.repeat(1000) };
function generation(id: string, offset: number, createdAt: string) {
  const anchor: SourceAnchor = { id, bookId: source.bookId, fileHash: source.fileHash, extractionVersion: source.extractionVersion, locators: [{ kind: 'txt', startOffset: offset, endOffset: offset + 10 }], quote: 'x'.repeat(10), prefix: '', suffix: '', resolution: 'exact' };
  const selection: Selection = { id, bookId: source.bookId, anchorIds: [id], selectedText: anchor.quote, contextSnapshot: '', createdAt };
  return { anchor, selection, artifact: { ...makeMockArtifact('interactive_ui', selection, id), createdAt } };
}
const older = generation('older', 700, '2026-09-06T01:00:00Z');
const latest = generation('latest', 100, '2026-09-06T02:00:00Z');
function snapshot() {
  return WorkspaceSnapshotSchema.parse({ schemaVersion: 1, id: 'book', bookId: 'book', selections: [older.selection, latest.selection], anchors: [older.anchor, latest.anchor], artifacts: [older.artifact, latest.artifact], readerPosition: { fileHash: 'hash', extractionVersion: 'v1', startOffset: 900 }, savedAt: '2026-09-06T03:00:00Z' });
}
test('reopening follows generation time, not passage order or the last scroll', () => {
  const saved = snapshot();
  assert.equal(readingBookmark(JSON.parse(JSON.stringify(saved)), source), 100);
  saved.artifacts.reverse();
  assert.equal(readingBookmark(saved, source), 100);
  saved.artifacts = [older.artifact]; // Undo the newest output.
  assert.equal(readingBookmark(saved, source), 700);
});
test('no retained enhancements falls back to saved position, including zero', () => {
  const saved = snapshot(); saved.artifacts = [];
  assert.equal(readingBookmark(saved, source), 900);
  saved.readerPosition!.startOffset = 0;
  assert.equal(readingBookmark(saved, source), 0);
  saved.readerPosition = null;
  assert.equal(readingBookmark(saved, source), null);
});
test('bookmarks never navigate into another book or incompatible source', () => {
  const saved = snapshot();
  assert.equal(readingBookmark(saved, { ...source, bookId: 'other' }), null);
  assert.equal(readingBookmark(saved, { ...source, fileHash: 'changed' }), null);
  saved.anchors[1].quote = 'wrong quote';
  assert.equal(readingBookmark(saved, source), 700);
});
