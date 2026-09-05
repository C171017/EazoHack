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
