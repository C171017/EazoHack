import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { createSelectionActivityRepository, selectionTimestamp } from '../src/features/persistence/selection-activity';
import { createWorkspaceRepository } from '../src/features/persistence';
import type { Selection, SourceAnchor } from '../src/shared/schemas';

function passage(bookId = 'book-1') {
  const anchor: SourceAnchor = {
    id: 'anchor-1', bookId, fileHash: `hash:${bookId}`, extractionVersion: 'txt-lf-v1',
    locators: [{ kind: 'txt', startOffset: 10, endOffset: 26 }],
    quote: 'What is justice?', prefix: 'He asked: ', suffix: '\n', resolution: 'exact',
  };
  const selection: Selection = {
    id: 'selection-1', bookId, anchorIds: [anchor.id], selectedText: anchor.quote,
    contextSnapshot: 'Test source', createdAt: '2026-09-05T10:11:12Z',
  };
  return { selection, anchors: [anchor] };
}

test('timestamps identify the capture second in UTC, without rounding into the next second', () => {
  assert.equal(selectionTimestamp(new Date('2026-09-05T18:11:12.999+08:00')), '2026-09-05T10:11:12Z');
});

test('selections persist independently of checkpoints and retain exact source locations after reopening', async () => {
  const indexedDB = new IDBFactory();
  const repository = createSelectionActivityRepository({ indexedDB });
  const input = passage();
  const saved = await repository.record(input.selection, input.anchors);
  // Mutating UI state later must not alter the recorded event.
  input.anchors[0].quote = 'Changed';
  const checkpoints = createWorkspaceRepository({ indexedDB });
  await checkpoints.save({ schemaVersion: 1, id: 'checkpoint', bookId: 'book-1', savedAt: '2026-09-05T10:12:00Z' });
  await checkpoints.remove('checkpoint');
  await checkpoints.close();
  await repository.close();
  const reopened = createSelectionActivityRepository({ indexedDB });
  assert.deepEqual(await reopened.list('book-1'), [saved]);
  assert.equal(saved.anchors[0].quote, 'What is justice?');
  assert.deepEqual(saved.anchors[0].locators, [{ kind: 'txt', startOffset: 10, endOffset: 26 }]);
  await reopened.close();
});

test('repeat visits and concurrent selections in the same second append instead of overwriting', async () => {
  const indexedDB = new IDBFactory();
  const first = createSelectionActivityRepository({ indexedDB });
  const second = createSelectionActivityRepository({ indexedDB });
  const input = passage();
  await Promise.all([
    first.record(input.selection, input.anchors),
    second.record(input.selection, input.anchors),
  ]);
  await first.record(input.selection, input.anchors, '2026-09-05T10:11:15Z');
  const other = passage('book-2');
  await second.record(other.selection, other.anchors);
  const rows = await first.list('book-1');
  assert.equal(rows.length, 3);
  assert.equal(new Set(rows.map(row => row.sequence)).size, 3);
  assert.deepEqual(rows.map(row => row.selectedAt), ['2026-09-05T10:11:12Z', '2026-09-05T10:11:12Z', '2026-09-05T10:11:15Z']);
  assert.ok(rows.every(row => row.selection.createdAt === input.selection.createdAt));
  assert.equal((await second.list('book-2')).length, 1);
  await first.close(); await second.close();
});

test('invalid source bindings never create activity records', async () => {
  const repository = createSelectionActivityRepository({ indexedDB: new IDBFactory() });
  const { selection, anchors } = passage();
  await assert.rejects(repository.record(selection, []));
  await assert.rejects(repository.record(selection, [{ ...anchors[0], bookId: 'other' }]));
  await assert.rejects(repository.record(selection, [{ ...anchors[0], id: 'missing' }]));
  await assert.rejects(repository.record(selection, [{ ...anchors[0], resolution: 'unresolved' }]));
  await assert.rejects(repository.record(selection, anchors, '2026-09-05T10:11:12.123Z'));
  assert.deepEqual(await repository.list('book-1'), []);
  await repository.close();
});

test('a failed write is reported, preserves earlier events, and allows a subsequent save', async () => {
  const repository = createSelectionActivityRepository({ indexedDB: new IDBFactory() });
  const { selection, anchors } = passage();
  const saved = await repository.record(selection, anchors);
  const original = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function () { throw new DOMException('Full', 'QuotaExceededError'); };
  try {
    await assert.rejects(repository.record(selection, anchors), /operation failed/);
  } finally { IDBObjectStore.prototype.add = original; }
  assert.deepEqual(await repository.list('book-1'), [saved]);
  await repository.record(selection, anchors);
  assert.equal((await repository.list('book-1')).length, 2);
  await repository.close();
});
