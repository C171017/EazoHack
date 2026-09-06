import { createFootprintRepository } from '../persistence/reading-footprints';
import { mergeFootprints } from '../book-graph/reading-heat';
import { createWorkspaceRepository, WorkspaceSnapshotSchema, type WorkspaceSnapshot } from '../persistence';

export type SnapshotHead = { revision: number; payload: WorkspaceSnapshot | null };
export type SyncRecord = {
  key: string; revision: number; current: WorkspaceSnapshot; dirty: boolean;
  writerId?: string; mutationId: string; conflict: SnapshotHead | null;
};
export function readingStorageKey(ownerId: string | undefined, sourceId: string) {
  return JSON.stringify([ownerId ? 'account' : 'guest', ownerId ?? '', sourceId]);
}
export function createSyncStore(factory?: IDBFactory) {
  let connection: Promise<IDBDatabase> | undefined;
  function database() {
    if (connection) return connection;
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const idb = factory ?? globalThis.indexedDB;
      if (!idb) { reject(new Error('Device storage is unavailable.')); return; }
      const request = idb.open('eazo-reading-sync', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('reading', { keyPath: 'key' });
        request.result.createObjectStore('recovery', { autoIncrement: true });
      };
      request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); connection = undefined; }; resolve(request.result); };
      request.onerror = () => { connection = undefined; reject(request.error); };
      request.onblocked = () => { connection = undefined; reject(new Error('Close other Eazo tabs to open device storage.')); };
    });
    return connection;
  }
  async function transaction<T>(store: 'reading' | 'recovery', mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
    const db = await database();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = operation(tx.objectStore(store));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(new Error('Reading could not be saved on this device.', { cause: tx.error }));
    });
  }
  return {
    async load(key: string): Promise<SyncRecord | null> {
      const record = await transaction('reading', 'readonly', store => store.get(key)) as SyncRecord | undefined;
      if (!record) return null;
      return { ...record, current: WorkspaceSnapshotSchema.parse(record.current), conflict: record.conflict ? { ...record.conflict, payload: record.conflict.payload ? WorkspaceSnapshotSchema.parse(record.conflict.payload) : null } : null };
    },
    async save(record: SyncRecord) {
      const db = await database();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['reading', 'recovery'], 'readwrite');
        const reading = tx.objectStore('reading');
        const prior = reading.get(record.key);
        prior.onsuccess = () => {
          const previous = prior.result as SyncRecord | undefined;
          if (previous?.dirty && previous.writerId !== record.writerId && previous.mutationId !== record.mutationId) {
            tx.objectStore('recovery').add({ key: previous.key, snapshot: previous.current, archivedAt: new Date().toISOString() });
          }
          reading.put(record);
        };
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(new Error('Reading could not be saved on this device.', { cause: tx.error }));
      });
    },
    async recoveries(key: string) {
      const values = await transaction('recovery', 'readonly', store => store.getAll()) as { key: string; snapshot: WorkspaceSnapshot; archivedAt: string }[];
      return values.filter(value => value.key === key).map(({ snapshot, archivedAt }) => ({ snapshot, archivedAt }));
    },
    async clearOwner(ownerId: string) {
      const db = await database();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['reading', 'recovery'], 'readwrite');
        for (const name of ['reading', 'recovery']) {
          const cursor = tx.objectStore(name).openCursor();
          cursor.onsuccess = () => {
            const row = cursor.result;
            if (!row) return;
            try {
              const parts = JSON.parse(row.value.key) as unknown[];
              if (parts[0] === 'account' && parts[1] === ownerId) row.delete();
            } catch { /* Unrelated old keys remain untouched. */ }
            row.continue();
          };
        }
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(new Error('Device reading cache could not be cleared.'));
      });
    },
    async archive(key: string, snapshot: WorkspaceSnapshot) { await transaction('recovery', 'readwrite', store => store.add({ key, snapshot, archivedAt: new Date().toISOString() })); },
    async close() { if (connection) (await connection).close(); connection = undefined; },
  };
}
export async function loadDeviceReading(bookId: string, ownerId?: string) {
  const store = createSyncStore();
  let snapshot: WorkspaceSnapshot | null = null;
  try { snapshot = (await store.load(readingStorageKey(ownerId, bookId)))?.current ?? null; }
  finally { await store.close(); }
  if (!snapshot && !ownerId) {
    const legacy = createWorkspaceRepository();
    try { snapshot = await legacy.load(bookId); } finally { await legacy.close(); }
  }
  const footprints = createFootprintRepository(ownerId ? { databaseName: `eazo-reading-footprints:account:${ownerId}` } : {});
  try {
    const events = await footprints.list(bookId);
    if (!snapshot && !events.length) return null;
    return WorkspaceSnapshotSchema.parse({ schemaVersion: 1, id: bookId, bookId, savedAt: new Date().toISOString(), ...snapshot, footprints: mergeFootprints(snapshot?.footprints ?? [], events) });
  } finally { await footprints.close(); }
}

export const loadGuestReading = (bookId: string) => loadDeviceReading(bookId);

/** Remove this account's cached reading and recovery copies, preserving guest and other accounts. */
export async function clearAccountReading(ownerId: string) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(`eazo-book-library:account:${ownerId}`);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other Eazo tabs to clear this account’s cached books.'));
  });
  const store = createSyncStore();
  try { await store.clearOwner(ownerId); } finally { await store.close(); }
  for (const name of [`eazo-reading-footprints:account:${ownerId}`, `eazo-selection-activity:account:${ownerId}`]) {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        if (name.startsWith('eazo-reading-footprints:')) {
          const events = request.result.createObjectStore('generations', { keyPath: ['bookId', 'id'] });
          events.createIndex('bookId', 'bookId');
        } else {
          const events = request.result.createObjectStore('selections', { keyPath: 'sequence', autoIncrement: true });
          events.createIndex('bookId', 'bookId');
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        const names = [...db.objectStoreNames];
        if (!names.length) { db.close(); resolve(); return; }
        const tx = db.transaction(names, 'readwrite');
        for (const storeName of names) tx.objectStore(storeName).clear();
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = tx.onabort = () => { db.close(); reject(new Error('Account activity cache could not be cleared.')); };
      };
    });
  }
}

/** Surface an import conflict in the same explicit reader-resolution flow. */
export async function seedImportedReadingConflict(ownerId: string, sourceId: string, snapshot: WorkspaceSnapshot, head: SnapshotHead) {
  const store = createSyncStore();
  const key = readingStorageKey(ownerId, sourceId);
  try {
    const previous = await store.load(key);
    if (previous) await store.archive(key, previous.current);
    await store.save({ key, writerId: crypto.randomUUID(), current: WorkspaceSnapshotSchema.parse(snapshot), revision: 0, dirty: true, mutationId: crypto.randomUUID(), conflict: head });
  } finally { await store.close(); }
}
