import type { UploadedBook } from './upload-book';

export type LibraryEntry = { id: string; title: string; kind: UploadedBook['kind']; addedAt: string };
export const uploadedBookId = (book: UploadedBook) => book.kind === 'txt' ? book.bookId : `pdf:${book.hash}`;

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
    async save(book: UploadedBook) {
      const id = uploadedBookId(book);
      await transaction('readwrite', tx => {
        tx.objectStore('books').put(book, id);
        return tx.objectStore('catalogue').put({ id, title: book.title, kind: book.kind, addedAt: new Date().toISOString() } satisfies LibraryEntry);
      });
    },
    async list(): Promise<LibraryEntry[]> {
      const entries = await transaction<LibraryEntry[]>('readonly', tx => tx.objectStore('catalogue').getAll());
      return entries.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    },
    async load(id: string): Promise<UploadedBook> {
      const book = await transaction<UploadedBook | undefined>('readonly', tx => tx.objectStore('books').get(id));
      if (!book) throw new Error('This book is no longer available. Please upload it again.');
      return book;
    },
  };
}
export const bookLibrary = createBookLibrary();
