import { FootprintSchema, type ReadingFootprint } from '../book-graph/reading-heat';
import { PersistenceError } from './index';

/** Generation history is independent of undo/redo and manual checkpoints. */
export function createFootprintRepository(options: { indexedDB?: IDBFactory; databaseName?: string } = {}) {
  let connection: Promise<IDBDatabase> | undefined;
  function database(): Promise<IDBDatabase> {
    if (connection) return connection;
    const factory = options.indexedDB ?? globalThis.indexedDB;
    if (!factory) return Promise.reject(new PersistenceError('Local reading footprints are unavailable.'));
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false;
      const request = factory.open(options.databaseName ?? 'eazo-reading-footprints', 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('generations', { keyPath: ['bookId', 'id'] });
        store.createIndex('bookId', 'bookId');
      };
      request.onsuccess = () => {
        if (settled) { request.result.close(); return; }
        settled = true;
        request.result.onversionchange = () => { request.result.close(); connection = undefined; };
        resolve(request.result);
      };
      request.onerror = () => { settled = true; reject(new PersistenceError('Could not open reading footprints.', { cause: request.error })); };
      request.onblocked = () => { settled = true; reject(new PersistenceError('Reading footprints are blocked by another tab.')); };
    }).catch((error: unknown) => { connection = undefined; throw error; });
    return connection;
  }
  return {
    async record(events: ReadingFootprint[]) {
      const parsed = FootprintSchema.array().parse(events);
      if (!parsed.length) return;
      const db = await database();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('generations', 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(new PersistenceError('Reading footprints could not be saved on this device.', { cause: tx.error }));
        try { for (const event of parsed) tx.objectStore('generations').put(event); }
        catch (error) { tx.abort(); reject(new PersistenceError('Reading footprints could not be saved on this device.', { cause: error })); }
      });
    },
    async list(bookId: string): Promise<ReadingFootprint[]> {
      const db = await database();
      const rows = await new Promise<unknown>((resolve, reject) => {
        const tx = db.transaction('generations', 'readonly');
        const request = tx.objectStore('generations').index('bookId').getAll(bookId);
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = tx.onabort = () => reject(new PersistenceError('Reading footprints could not be loaded.', { cause: tx.error }));
      });
      return FootprintSchema.array().parse(rows);
    },
    async close() {
      const pending = connection; connection = undefined;
      if (pending) (await pending).close();
    },
  };
}
