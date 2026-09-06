import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { IDBFactory } from 'fake-indexeddb';
import { getChineseBookPreview } from '../src/features/reader/book-preview';
import { createTxtRenderChunks } from '../src/features/reader/txt-document';
import { createBookLibrary, uploadedBookId } from '../src/features/reader/book-library-store';
import { readUploadedBook } from '../src/features/reader/upload-book';

test('Chinese sample preserves the entire source body and exact render offsets', async () => {
  const preview = await getChineseBookPreview();
  const raw = await readFile('data/books/hong-lou-meng/raw/hong-lou-meng-gutenberg-24264.txt', 'utf8');
  const body = raw.slice(raw.indexOf('第一回　'), raw.indexOf('*** END OF THE PROJECT GUTENBERG EBOOK'));
  assert.equal(preview.sourceText.replace(/\s/g, ''), body.replace(/\s/g, ''));
  assert.ok(preview.sourceText.includes('第一二零回'));
  const chunks = createTxtRenderChunks(preview.sourceText, 16000, '红楼梦');
  assert.equal(chunks.flatMap(c => c.blocks).map(b => preview.sourceText.slice(b.startOffset, b.endOffset)).join(''), preview.sourceText);
  assert.ok(chunks.flatMap(c => c.blocks).some(b => b.kind === 'heading' && preview.sourceText.slice(b.startOffset,b.endOffset).startsWith('第一回')));
});

test('adding the second sample migrates an old upload out of slot 1 without losing its source', async () => {
  const factory = new IDBFactory();
  const library = createBookLibrary(factory);
  const book = await readUploadedBook(new File(['Existing user source'], 'Existing.txt'));
  await library.save(book, 4);
  await new Promise<void>((resolve, reject) => {
    const request = factory.open('eazo-book-library', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('catalogue', 'readwrite');
      const store = tx.objectStore('catalogue');
      const entry = store.get(uploadedBookId(book));
      entry.onsuccess = () => store.put({...entry.result, shelf: {...entry.result.shelf, slot: 1}});
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
  assert.equal((await library.list())[0].shelf?.slot, 2);
  assert.deepEqual(await library.load(uploadedBookId(book)), book);
  await assert.rejects(library.move(uploadedBookId(book), 1), /shelf space/);
});
