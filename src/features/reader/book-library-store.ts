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
          for (const entry of entries) catalogue.put(entry);
          const previous = entries.find(entry => entry.id === id);
          // Conversion and duplicate uploads retain their original place and emblem.
          const shelf = previous?.shelf ?? nextShelfPosition(id, new Set([0, ...entries.map(entry => entry.shelf!.slot)]), requestedSlot);
          tx.objectStore('books').put(book, id);
          catalogue.put({ ...previous, id, title: book.title, kind: book.kind === 'pdf' || book.originalPdf ? 'pdf' : 'txt', ready: book.kind === 'txt', addedAt: previous?.addedAt ?? new Date().toISOString(), shelf,
            ...(book.kind === 'txt' && book.originalPdf ? { note: pdfImportNote(book.originalPdf.manifest) } : {}),
          } satisfies LibraryEntry);
        };
        return request;
      });
    },
    async list(): Promise<LibraryEntry[]> {
      const entries = await transaction<LibraryEntry[]>('readwrite', tx => {
        const catalogue = tx.objectStore('catalogue');
        const request = catalogue.getAll() as IDBRequest<LibraryEntry[]>;
        request.onsuccess = () => { for (const entry of placeLegacyEntries(request.result)) catalogue.put(entry); };
        return request;
      });
      return placeLegacyEntries(entries).sort((a, b) => a.shelf!.slot - b.shelf!.slot);
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
      if (!Number.isSafeInteger(slot) || slot < 1 || slot >= 10000) throw new Error('Choose an available shelf space.');
      await transaction('readwrite', tx => {
        const catalogue = tx.objectStore('catalogue');
        const request = catalogue.getAll() as IDBRequest<LibraryEntry[]>;
        request.onsuccess = () => {
          const entries = placeLegacyEntries(request.result);
          const moving = entries.find(entry => entry.id === id);
          if (!moving) return;
          const displaced = entries.find(entry => entry.shelf.slot === slot);
          for (const entry of entries) catalogue.put(entry.id === id
            ? { ...entry, shelf: { ...entry.shelf, slot } }
            : entry.id === displaced?.id ? { ...entry, shelf: { ...entry.shelf, slot: moving.shelf.slot } } : entry);
        };
        return request;
      });
    },
    async remove(id: string) {
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
  const occupied = new Set<number>([0]); // The bundled Republic has its own place.
  return [...entries].sort((a, b) => Number(!a.shelf) - Number(!b.shelf) || a.addedAt.localeCompare(b.addedAt) || a.id.localeCompare(b.id)).map(entry => {
    const shelf = entry.shelf && !occupied.has(entry.shelf.slot) ? entry.shelf : nextShelfPosition(entry.id, occupied);
    occupied.add(shelf.slot);
    return { ...entry, shelf };
  });
}
export const bookLibrary = createBookLibrary();
