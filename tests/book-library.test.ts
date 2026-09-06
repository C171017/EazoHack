import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createBookLibrary, uploadedBookId } from '../src/features/reader/book-library-store';
import { readUploadedBook } from '../src/features/reader/upload-book';

test('library retains multiple books across connections, deduplicates uploads, and restores text and PDF bytes', async () => {
  const storage = new IDBFactory();
  const library = createBookLibrary(storage);
  const text = await readUploadedBook(new File(['A first chapter.\r\nA second paragraph.'], 'First book.txt'));
  const pdf = await readUploadedBook(new File(['%PDF-1.7\nLibrary fixture'], 'Second book.pdf'));
  await library.save(text);
  await library.save(pdf);
  await library.save(text);
  const reopened = createBookLibrary(storage);
  const entries = await reopened.list();
  assert.equal(entries.length, 2);
  assert.deepEqual(new Set(entries.map(entry => entry.title)), new Set(['First book.txt', 'Second book.pdf']));
  assert.ok(entries.every(entry => !('preview' in entry) && !('data' in entry)));
  assert.deepEqual(await reopened.load(uploadedBookId(text)), text);
  assert.deepEqual(await reopened.load(uploadedBookId(pdf)), pdf);
  await assert.rejects(reopened.load('missing'), /no longer available/);
});

test('a new library has no uploaded books', async () => {
  assert.deepEqual(await createBookLibrary(new IDBFactory()).list(), []);
});

test('moves persist, occupied spaces swap, and deletion removes source and catalogue together', async () => {
  const storage = new IDBFactory();
  const library = createBookLibrary(storage);
  const first = await readUploadedBook(new File(['One'], 'One.txt'));
  const second = await readUploadedBook(new File(['Two'], 'Two.txt'));
  const a = uploadedBookId(first), b = uploadedBookId(second);
  await library.save(first, 1);
  await library.save(second, 2);
  await library.move(a, 2);
  let entries = await createBookLibrary(storage).list();
  assert.equal(entries.find(entry => entry.id === a)?.shelf?.slot, 2);
  assert.equal(entries.find(entry => entry.id === b)?.shelf?.slot, 1);
  await library.move(a, 5);
  await library.save(first); // Reupload must retain the rearranged slot.
  entries = await library.list();
  assert.equal(entries.find(entry => entry.id === a)?.shelf?.slot, 5);
  await assert.rejects(library.move(a, 0), /shelf space/);
  await library.remove(a);
  assert.deepEqual((await library.list()).map(entry => entry.id), [b]);
  await assert.rejects(library.load(a), /no longer available/);
  assert.deepEqual(await library.load(b), second);
});
