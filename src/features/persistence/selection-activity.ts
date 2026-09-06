import { z } from 'zod';
import { SelectionSchema, SourceAnchorSchema, type Selection, type SourceAnchor } from '../../shared/schemas';
import { PersistenceError } from './index';

/** Device-clock UTC time, recorded when the gesture completes, to the second. */
export function selectionTimestamp(now = new Date()): string {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

const ActivityInputSchema = z.object({
  schemaVersion: z.literal(1),
  bookId: z.string().min(1),
  selectedAt: z.string().datetime({ precision: 0 }),
  selection: SelectionSchema,
  anchors: z.array(SourceAnchorSchema).min(1).max(100),
}).strict().superRefine((event, context) => {
  const ids = new Set(event.anchors.map(anchor => anchor.id));
  if (event.selection.bookId !== event.bookId
    || event.anchors.some(anchor => anchor.bookId !== event.bookId || anchor.resolution !== 'exact')
    || ids.size !== event.anchors.length
    || ids.size !== event.selection.anchorIds.length
    || event.selection.anchorIds.some(id => !ids.has(id))
    || new Set(event.anchors.map(anchor => anchor.fileHash)).size !== 1) {
    context.addIssue({ code: 'custom', message: 'Selection activity requires exact anchors from the same book and file.' });
  }
});

export type SelectionActivity = z.infer<typeof ActivityInputSchema> & { sequence: number };

/** Separate from manual checkpoints: restoring/overwriting one cannot erase activity. */
export function createSelectionActivityRepository(options: { indexedDB?: IDBFactory; databaseName?: string } = {}) {
  let connection: Promise<IDBDatabase> | undefined;
  function database(): Promise<IDBDatabase> {
    if (connection) return connection;
    const factory = options.indexedDB ?? globalThis.indexedDB;
    if (!factory) return Promise.reject(new PersistenceError('Local selection history is unavailable.'));
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false;
      const request = factory.open(options.databaseName ?? 'eazo-selection-activity', 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('selections', { keyPath: 'sequence', autoIncrement: true });
        store.createIndex('bookId', 'bookId');
      };
      request.onsuccess = () => {
        if (settled) { request.result.close(); return; }
        settled = true;
        request.result.onversionchange = () => { request.result.close(); connection = undefined; };
        resolve(request.result);
      };
      request.onerror = () => {
        settled = true;
        reject(new PersistenceError('Could not open local selection history.', { cause: request.error }));
      };
      request.onblocked = () => {
        settled = true;
        reject(new PersistenceError('Local selection history is blocked by another tab.'));
      };
    }).catch((error: unknown) => { connection = undefined; throw error; });
    return connection;
  }

  async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    try {
      const db = await database();
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction('selections', mode);
        const request = operation(tx.objectStore('selections'));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = tx.onabort = () => reject(new PersistenceError('Selection time could not be saved locally.', { cause: tx.error ?? request.error }));
      });
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError('Local selection history operation failed.', { cause: error });
    }
  }

  return {
    async record(selection: Selection, anchors: SourceAnchor[], selectedAt = selectionTimestamp(new Date(selection.createdAt))): Promise<SelectionActivity> {
      // Parse before opening storage; the event is a snapshot, never live React state.
      const event = ActivityInputSchema.parse({ schemaVersion: 1, bookId: selection.bookId, selectedAt, selection, anchors });
      const key = await transaction('readwrite', store => store.add(event));
      return { ...event, sequence: Number(key) };
    },
    async list(bookId: string): Promise<SelectionActivity[]> {
      const rows: unknown[] = await transaction('readonly', store => store.index('bookId').getAll(bookId));
      return rows.map(row => {
        const { sequence, ...event } = z.object({ sequence: z.number().int().positive() }).passthrough().parse(row);
        return { ...ActivityInputSchema.parse(event), sequence };
      }).sort((a, b) => a.selectedAt.localeCompare(b.selectedAt) || a.sequence - b.sequence);
    },
    async close() {
      const pending = connection;
      connection = undefined;
      if (pending) (await pending).close();
    },
  };
}

// SSR-safe and shared across readers; it opens only after a user selection.
const activity = createSelectionActivityRepository();
const accounts = new Map<string, ReturnType<typeof createSelectionActivityRepository>>();
export function recordSelectionActivity(selection: Selection, anchors: SourceAnchor[], selectedAt?: string, ownerId?: string) {
  if (!ownerId) return activity.record(selection, anchors, selectedAt);
  let repository = accounts.get(ownerId);
  if (!repository) {
    repository = createSelectionActivityRepository({ databaseName: `eazo-selection-activity:account:${ownerId}` });
    accounts.set(ownerId, repository);
  }
  return repository.record(selection, anchors, selectedAt);
}
