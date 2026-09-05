import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createBookLibrary, uploadedBookId } from '../src/features/reader/book-library-store';
import { readUploadedBook } from '../src/features/reader/upload-book';
import { BookEmblemSchema, REPUBLIC_EMBLEM, emblemExcerpt } from '../src/shared/book-emblem';
import { generateBookEmblem } from '../src/server/book-analysis/emblem';
import { POST } from '../src/app/api/book-emblem/route';

test('chosen spaces survive reload, duplicate uploads and concurrent placement without collisions', async () => {
  const factory = new IDBFactory();
  const library = createBookLibrary(factory);
  const first = await readUploadedBook(new File(['The first source.'], 'First.txt'));
  const second = await readUploadedBook(new File(['The second source.'], 'Second.txt'));
  await Promise.all([library.save(first, 7), library.save(second, 7)]);
  await library.setEmblem(uploadedBookId(first), REPUBLIC_EMBLEM);
  const before = await library.list();
  assert.deepEqual(before.map(entry => entry.shelf!.slot), [7, 8]);
  await library.save(first, 2);
  const after = await createBookLibrary(factory).list();
  assert.deepEqual(after, before, 'A duplicate must preserve position, appearance, time and icon.');
  assert.deepEqual(await library.load(uploadedBookId(first)), first);
});

test('existing catalogues migrate without losing source bytes or changing position on later reads', async () => {
  const factory = new IDBFactory();
  const library = createBookLibrary(factory);
  const book = await readUploadedBook(new File(['Original content'], 'Existing.txt'));
  await library.save(book);
  await new Promise<void>((resolve, reject) => {
    const request = factory.open('eazo-book-library', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('catalogue', 'readwrite');
      tx.objectStore('catalogue').put({ id: uploadedBookId(book), title: book.title, kind: book.kind, addedAt: '2026-01-01T00:00:00.000Z' });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
  const entries = await library.list();
  assert.equal(entries[0].shelf?.slot, 1);
  assert.deepEqual(await library.list(), entries);
  assert.deepEqual(await library.load(uploadedBookId(book)), book);
});

test('PDF conversion keeps its reserved place and custom title', async () => {
  const library = createBookLibrary(new IDBFactory());
  const pdf = await readUploadedBook(new File(['%PDF-1.7\nFixture'], 'A journey.pdf'));
  const text = await readUploadedBook(new File(['An extracted chapter.'], 'A journey.txt'));
  if (pdf.kind !== 'pdf' || text.kind !== 'txt') throw new Error('Unexpected fixture type');
  await library.save({ ...pdf, title: 'A journey' }, 4);
  await library.save({ ...text, title: 'A journey', originalPdf: { hash: pdf.hash, data: pdf.data, manifest: { version: 'fixture', fileHash: pdf.hash, offsetUnit: 'UTF-16', nonTextContent: 'retained-in-original-pdf', pages: [] } } });
  const entries = await library.list();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].shelf?.slot, 4);
  assert.equal(entries[0].title, 'A journey');
  assert.equal(entries[0].ready, true);
});

test('emblems accept bounded path data and reject executable markup and oversized output', async () => {
  assert.equal(BookEmblemSchema.safeParse(REPUBLIC_EMBLEM).success, true);
  for (const paths of [['<script>alert(1)</script>'], ['M0 0" onload="alert(1)'], ['https://example.com'], Array(13).fill('M0 0L1 1')]) {
    assert.equal(BookEmblemSchema.safeParse({ label: 'Unsafe', paths }).success, false);
  }
  const result = await generateBookEmblem({ title: 'The Republic', excerpt: 'A dialogue about justice and the ideal city.' }, async (system, prompt) => {
    assert.ok(system.includes('untrusted source content'));
    assert.ok(prompt.includes('justice'));
    return { value: REPUBLIC_EMBLEM, model: 'fixture', modelVersion: 'fixture', usage: {}, durationMs: 1 };
  });
  assert.deepEqual(result, REPUBLIC_EMBLEM);
  await assert.rejects(generateBookEmblem({ title: 'Book', excerpt: 'Text' }, async () => ({ value: { label: 'Bad', paths: ['<svg/>'] }, model: 'fixture', modelVersion: 'fixture', usage: {}, durationMs: 1 })));
});

test('upload icon samples span the book and malformed requests do not reach the provider', async () => {
  const source = 'BEGIN' + 'x'.repeat(30000) + 'ENDING';
  const excerpt = emblemExcerpt(source);
  assert.ok(excerpt.includes('BEGIN') && excerpt.includes('ENDING'));
  assert.ok(excerpt.length < 12000);
  const response = await POST(new Request('http://localhost/api/book-emblem', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '', excerpt: 'Text' }) }));
  assert.equal(response.status, 400);
});
