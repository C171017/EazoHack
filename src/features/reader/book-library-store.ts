import { SAMPLE_BOOKS, sampleBook } from '@/shared/sample-books';
import type { UploadedBook } from './upload-book';
import { pdfImportNote } from './pdf/import-model';
import { nextShelfPosition, type ShelfPosition } from './bookshelf-model';
import { BookEmblemSchema, type BookEmblem } from '@/shared/book-emblem';

export type LibraryEntry = { id: string; title: string; kind: UploadedBook['kind']; addedAt: string; ready?: boolean; note?: string; shelf?: ShelfPosition; emblem?: BookEmblem };
export const uploadedBookId = (book: UploadedBook) => book.kind === 'pdf' ? `pdf:${book.hash}` : book.originalPdf ? `pdf:${book.originalPdf.hash}` : book.bookId;

/** Keep the catalogue separate so browsing never loads every book's contents. */
export function createBookLibrary(factory?: IDBFactory, name = 'eazo-book-library') {
  async function database() {
    const storage = factory ?? globalThis.indexedDB;
    if (!storage) throw new Error('Book storage is unavailable in this browser.');
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = storage.open(name, 1);
      let blocked = false;
      request.onupgradeneeded = () => {
        request.result.createObjectStore('catalogue', { keyPath: 'id' });
        request.result.createObjectStore('books');
      };
      request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
      request.onerror = () => reject(new Error('Could not open your library. Please try again.'));
      request.onblocked = () => { blocked = true; reject(new Error('Close other Eazo tabs and try again.')); };
    });
  }
  async function transaction<T>(mode: IDBTransactionMode, run: (tx: IDBTransaction) => IDBRequest<T>): Promise<T> {
    const db = await database();
    try {
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction(['catalogue', 'books'], mode);
        const request = run(tx);
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = tx.onerror = () => reject(new Error(mode === 'readwrite' ? 'Could not save this book. Your browser storage may be full.' : 'Could not read your library. Please try again.'));
      });
    } finally { db.close(); }
  }
  return {
    async save(book: UploadedBook, requestedSlot?: number) {
      const id = uploadedBookId(book);
      await transaction('readwrite', tx => {
        const catalogue = tx.objectStore('catalogue');
        const request = catalogue.getAll() as IDBRequest<LibraryEntry[]>;
        request.onsuccess = () => {
          const entries = placeLegacyEntries(request.result);
          putChangedEntries(catalogue, request.result, entries, id);
          const previous = entries.find(entry => entry.id === id);
          // Conversion and duplicate uploads retain their original place and emblem.
          const shelf = previous?.shelf ?? nextShelfPosition(id, new Set(entries.map(entry => entry.shelf!.slot)), requestedSlot);
          tx.objectStore('books').put(book, id);
          catalogue.put({ ...previous, id, title: book.title, kind: book.kind === 'pdf' || book.originalPdf ? 'pdf' : 'txt', ready: book.kind === 'txt', addedAt: previous?.addedAt ?? new Date().toISOString(), shelf,
            ...(book.kind === 'txt' && book.originalPdf ? { note: pdfImportNote(book.originalPdf.manifest) } : {}),
          } satisfies LibraryEntry);
        };
        return request;
      });
    },
    async list(includeSamples = false): Promise<LibraryEntry[]> {
      let entries = await transaction<LibraryEntry[]>('readonly', tx => tx.objectStore('catalogue').getAll());
      const original = new Set(entries);
      if (placeLegacyEntries(entries).some(entry => !original.has(entry))) {
        // Re-read inside the write transaction: another tab may have moved a
        // book since the read. Only legacy/colliding positions need repair.
        entries = await transaction<LibraryEntry[]>('readwrite', tx => {
          const catalogue = tx.objectStore('catalogue');
          const request = catalogue.getAll() as IDBRequest<LibraryEntry[]>;
          request.onsuccess = () => putChangedEntries(catalogue, request.result, placeLegacyEntries(request.result));
          return request;
        });
      }
      return placeLegacyEntries(entries).filter(entry => includeSamples || !sampleBook(entry.id)).sort((a, b) => a.shelf!.slot - b.shelf!.slot);
    },
    async setEmblem(id: string, value: BookEmblem) {
      const emblem = BookEmblemSchema.parse(value);
      await transaction('readwrite', tx => {
        const catalogue = tx.objectStore('catalogue');
        const request = catalogue.get(id) as IDBRequest<LibraryEntry | undefined>;
        request.onsuccess = () => { if (request.result) catalogue.put({ ...request.result, emblem }); };
        return request;
      });
    },
    async move(id: string, slot: number) {
      if (!Number.isSafeInteger(slot) || slot < 0 || slot >= 10000) throw new Error('Choose an available shelf space.');
      await transaction('readwrite', tx => {
        const catalogue = tx.objectStore('catalogue');
        const request = catalogue.getAll() as IDBRequest<LibraryEntry[]>;
        request.onsuccess = () => {
          const entries = placeLegacyEntries(request.result);
          const moving = entries.find(entry => entry.id === id);
          if (!moving) return;
          const displaced = entries.find(entry => entry.shelf.slot === slot);
          const moved = entries.map(entry => entry.id === id && entry.shelf.slot !== slot
            ? { ...entry, shelf: { ...entry.shelf, slot } }
            : entry.id === displaced?.id && entry.id !== id ? { ...entry, shelf: { ...entry.shelf, slot: moving.shelf.slot } } : entry);
          putChangedEntries(catalogue, request.result, moved);
        };
        return request;
      });
    },
    async remove(id: string) {
      if (sampleBook(id)) throw new Error('Example books are permanent residents of this shelf.');
      await transaction('readwrite', tx => {
        tx.objectStore('books').delete(id);
        return tx.objectStore('catalogue').delete(id);
      });
    },
    async load(id: string): Promise<UploadedBook> {
      const book = await transaction<UploadedBook | undefined>('readonly', tx => tx.objectStore('books').get(id));
      if (!book) throw new Error('This book is no longer available. Please upload it again.');
      return book;
    },
  };
}

/** Upgrade the lightweight catalogue in place without reading source files. */
function placeLegacyEntries(entries: LibraryEntry[]) {
  const missingSamples: LibraryEntry[] = SAMPLE_BOOKS.filter(sample => !entries.some(entry => entry.id === sample.id)).map(sample => ({
    id: sample.id, title: sample.title, kind: 'txt', addedAt: '1970-01-01T00:00:00.000Z',
    ready: true, shelf: { slot: sample.slot, variant: sample.variant },
  }));
  const occupied = new Set<number>();
  return [...missingSamples, ...entries].sort((a, b) => Number(!a.shelf) - Number(!b.shelf) || a.addedAt.localeCompare(b.addedAt) || a.id.localeCompare(b.id)).map(entry => {
    const shelf = entry.shelf && !occupied.has(entry.shelf.slot) ? entry.shelf : nextShelfPosition(entry.id, occupied);
    occupied.add(shelf.slot);
    return (shelf === entry.shelf ? entry : { ...entry, shelf }) as LibraryEntry & { shelf: ShelfPosition };
  });
}

function putChangedEntries(store: IDBObjectStore, before: LibraryEntry[], after: LibraryEntry[], skipId?: string) {
  const originals = new Map(before.map(entry => [entry.id, entry]));
  for (const entry of after) if (entry.id !== skipId && entry !== originals.get(entry.id)) store.put(entry);
}
export const bookLibrary = createBookLibrary();
