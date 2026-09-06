import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { bookLibrary } from '../src/features/reader/book-library-store';
import type { ShelfBook } from '../src/features/cloud/library';
import { persistShelfMove, placeShelfBook } from '../src/features/cloud/shelf-move';

test('sample swaps persist without any account or library network requests', async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'indexedDB', previous); else Reflect.deleteProperty(globalThis, 'indexedDB'); });
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Network unavailable'); });
  const before = await bookLibrary.list(true);
  const after = placeShelfBook(before, before[0].id, before[1].shelf!.slot);
  await persistShelfMove(before, after);
  const restored = await bookLibrary.list(true);
  for (const book of after) assert.deepEqual(restored.find(entry => entry.id === book.id)?.shelf, book.shelf);
  assert.equal(fetch.mock.callCount(), 0);
  assert.notDeepEqual(before.map(book => book.shelf), after.map(book => book.shelf));
});

test('cloud landing is available while the save is stalled; both sides of a swap are saved', async t => {
  const before: ShelfBook[] = [0, 1].map(slot => ({ id: `cloud:${slot}`, title: 'Book', kind: 'txt', addedAt: '', shelf: { slot, variant: slot }, cloud: { owner: 'alice', book: `book-${slot}`, source: `${slot}` } }));
  let release!: () => void;
  const stalled = new Promise<void>(resolve => { release = resolve; });
  const requests: { slot: number }[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(url, '/api/cloud/shelf');
    assert.equal((init?.headers as Record<string, string>)['x-eazo-owner'], 'alice');
    requests.push(JSON.parse(init!.body as string));
    await stalled;
    return Response.json({ ok: true });
  });
  const after = placeShelfBook(before, before[0].id, 1);
  let saved = false;
  const saving = persistShelfMove(before, after).then(() => { saved = true; });
  assert.deepEqual(after.map(book => book.shelf!.slot), [1, 0]);
  assert.deepEqual(before.map(book => book.shelf!.slot), [0, 1]);
  assert.equal(saved, false);
  release(); await saving;
  assert.deepEqual(requests.map(request => request.slot), [1, 0]);
});

test('failed saves reject so the UI can restore its unchanged snapshot', async t => {
  const before: ShelfBook[] = [{ id: 'cloud:1', title: 'Book', kind: 'txt', addedAt: '', shelf: { slot: 2, variant: 3 }, cloud: { owner: 'alice', book: 'book', source: '1' } }];
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { message: 'Save failed' } }, { status: 500 }));
  await assert.rejects(persistShelfMove(before, placeShelfBook(before, before[0].id, 4)), /Save failed/);
  assert.equal(before[0].shelf!.slot, 2);
});
