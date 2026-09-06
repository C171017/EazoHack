import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore as FakeObjectStore } from 'fake-indexeddb';
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
  await library.save(first, 2);
  await library.save(second, 3);
  await library.move(a, 3);
  let entries = await createBookLibrary(storage).list();
  assert.equal(entries.find(entry => entry.id === a)?.shelf?.slot, 3);
  assert.equal(entries.find(entry => entry.id === b)?.shelf?.slot, 2);
  await library.move(a, 5);
  await library.save(first); // Reupload must retain the rearranged slot.
  entries = await library.list();
  assert.equal(entries.find(entry => entry.id === a)?.shelf?.slot, 5);
  await assert.rejects(library.move(a, -1), /shelf space/);
  await library.remove(a);
  assert.deepEqual((await library.list()).map(entry => entry.id), [b]);
  await assert.rejects(library.load(a), /no longer available/);
  assert.deepEqual(await library.load(b), second);
});

test('browsing writes nothing and moves only write affected catalogue entries', async t => {
  const library = createBookLibrary(new IDBFactory());
  const books = await Promise.all(['One', 'Two', 'Three'].map(text => readUploadedBook(new File([text], `${text}.txt`))));
  for (let i = 0; i < books.length; i++) await library.save(books[i], i + 2);
  const put = FakeObjectStore.prototype.put;
  const writes: string[] = [];
  t.mock.method(FakeObjectStore.prototype, 'put', function(this: IDBObjectStore, ...args: Parameters<typeof put>) {
    if (this.name === 'catalogue') writes.push(args[0].id);
    return Reflect.apply(put, this, args);
  });
  await library.list(); await library.list();
  assert.deepEqual(writes, []);
  await library.move(uploadedBookId(books[0]), 3);
  assert.deepEqual(new Set(writes), new Set(books.slice(0, 2).map(uploadedBookId)));
  assert.equal(writes.length, 2);
  writes.length = 0;
  await library.move(uploadedBookId(books[0]), 3);
  assert.equal(writes.length, 0, 'moving to the current slot is a no-op');
  await library.move(uploadedBookId(books[0]), 8);
  assert.equal(writes.length, 1);
  writes.length = 0;
  await library.save(books[0]);
  assert.deepEqual(writes, [uploadedBookId(books[0])]);
});

test('legacy placement repair writes only outdated records and runs once', async t => {
  const factory = new IDBFactory(), library = createBookLibrary(factory);
  const books = await Promise.all(['Legacy', 'Current'].map(text => readUploadedBook(new File([text], `${text}.txt`))));
  for (let i = 0; i < books.length; i++) await library.save(books[i], i + 2);
  const entries = await library.list();
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open('eazo-book-library', 1);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('catalogue', 'readwrite');
    tx.objectStore('catalogue').put({ ...entries[0], shelf: undefined });
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
  db.close();
  const put = FakeObjectStore.prototype.put, writes: string[] = [];
  t.mock.method(FakeObjectStore.prototype, 'put', function(this: IDBObjectStore, ...args: Parameters<typeof put>) {
    if (this.name === 'catalogue') writes.push(args[0].id);
    return Reflect.apply(put, this, args);
  });
  const repaired = await library.list();
  assert.deepEqual(writes, [entries[0].id]);
  assert.deepEqual(repaired.find(entry => entry.id === entries[1].id), entries[1]);
  assert.deepEqual(await library.list(), repaired);
  assert.equal(writes.length, 1);
});

test('example books move, swap with uploads, persist, and cannot be removed', async () => {
  const storage = new IDBFactory(), library = createBookLibrary(storage);
  const book = await readUploadedBook(new File(['Private source'], 'Private.txt'));
  await library.save(book, 2);
  await library.move('plato-republic', 2);
  await library.move('hong-lou-meng', 5);
  const reopened = createBookLibrary(storage);
  const shelf = await reopened.list(true);
  assert.equal(shelf.find(entry => entry.id === 'plato-republic')?.shelf?.slot, 2);
  assert.equal(shelf.find(entry => entry.id === 'hong-lou-meng')?.shelf?.slot, 5);
  assert.equal(shelf.find(entry => entry.id === uploadedBookId(book))?.shelf?.slot, 0);
  assert.equal((await reopened.list()).length, 1, 'cloud upload catalogue excludes examples');
  await assert.rejects(reopened.remove('plato-republic'), /permanent residents/);
  await assert.rejects(reopened.remove('hong-lou-meng'), /permanent residents/);
  assert.deepEqual(await reopened.list(true), shelf);
  assert.deepEqual(await reopened.load(uploadedBookId(book)), book);
  const next = await readUploadedBook(new File(['Next source'], 'Next.txt'));
  await reopened.save(next, 1);
  assert.equal((await reopened.list()).find(entry => entry.id === uploadedBookId(next))?.shelf?.slot, 1);
});
