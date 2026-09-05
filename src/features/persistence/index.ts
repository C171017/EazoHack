import { z } from "zod";
import {
  ArtifactSchema,
  MapViewSchema,
  SelectionSchema,
  SourceAnchorSchema,
} from "../../shared/schemas";

const interactionValue = z.union([
  z.string().max(10_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

/** A local checkpoint, independent of unfinished activity/route policy. */
export const WorkspaceSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1).max(200),
  bookId: z.string().min(1).max(200),
  selections: z.array(SelectionSchema).max(2_000).default([]),
  anchors: z.array(SourceAnchorSchema).max(10_000).default([]),
  artifacts: z.array(ArtifactSchema).max(2_000).default([]),
  interactionState: z.record(z.string(), z.record(z.string(), interactionValue)).default({}),
  graphViewport: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    zoom: z.number().positive().finite(),
  }).strict().nullable().default(null),
  mapView: MapViewSchema.nullable().default(null),
  bookmarks: z.array(z.string().min(1)).max(10_000).default([]),
  savedAt: z.string().datetime(),
}).strict().superRefine((snapshot, context) => {
  const issue = (path: (string | number)[], message: string) => {
    context.addIssue({ code: "custom", path, message });
  };
  for (const key of ["anchors", "selections", "artifacts"] as const) {
    const ids = new Set<string>();
    snapshot[key].forEach((item, index) => {
      if (ids.has(item.id)) issue([key, index, "id"], "Duplicate ID in checkpoint");
      ids.add(item.id);
      if (item.bookId !== snapshot.bookId) {
        issue([key, index, "bookId"], "Checkpoint cannot mix books");
      }
    });
  }
  const anchors = new Set(snapshot.anchors.map((anchor) => anchor.id));
  const selections = new Map(snapshot.selections.map((selection) => [selection.id, selection]));
  const artifacts = new Set(snapshot.artifacts.map((artifact) => artifact.id));
  snapshot.selections.forEach((selection, index) => {
    selection.anchorIds.forEach((id, anchorIndex) => {
      if (!anchors.has(id)) issue(["selections", index, "anchorIds", anchorIndex], "Missing saved anchor");
    });
  });
  snapshot.artifacts.forEach((artifact, index) => {
    const selection = selections.get(artifact.selectionId);
    if (!selection) issue(["artifacts", index, "selectionId"], "Missing saved selection");
    artifact.anchorIds.forEach((id, anchorIndex) => {
      if (!anchors.has(id)) issue(["artifacts", index, "anchorIds", anchorIndex], "Missing saved anchor");
      if (selection && !selection.anchorIds.includes(id)) {
        issue(["artifacts", index, "anchorIds", anchorIndex], "Artifact anchor does not belong to its selection");
      }
    });
  });
  snapshot.bookmarks.forEach((id, index) => {
    if (!anchors.has(id)) issue(["bookmarks", index], "Bookmark references a missing anchor");
  });
  Object.keys(snapshot.interactionState).forEach((id) => {
    if (!artifacts.has(id)) issue(["interactionState", id], "Interaction state references a missing artifact");
  });
});

export type WorkspaceSnapshot = z.infer<typeof WorkspaceSnapshotSchema>;

export class PersistenceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PersistenceError";
  }
}

export interface WorkspaceRepository {
  save(snapshot: unknown): Promise<WorkspaceSnapshot>;
  load(id: string): Promise<WorkspaceSnapshot | null>;
  remove(id: string): Promise<void>;
  close(): Promise<void>;
}

const STORE_NAME = "workspaces";
const DATABASE_VERSION = 1;

/** Factory is SSR-safe: browser storage is accessed only when an operation runs. */
export function createWorkspaceRepository(options: {
  indexedDB?: IDBFactory;
  databaseName?: string;
} = {}): WorkspaceRepository {
  let connection: Promise<IDBDatabase> | undefined;

  function database(): Promise<IDBDatabase> {
    if (connection) return connection;
    const factory = options.indexedDB ?? globalThis.indexedDB;
    if (!factory) return Promise.reject(new PersistenceError("Local storage is unavailable in this browser."));
    const pending = new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false;
      const request = factory.open(options.databaseName ?? "eazo-local-workspace", DATABASE_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => {
        if (settled) {
          request.result.close();
          return;
        }
        settled = true;
        request.result.onversionchange = () => {
          request.result.close();
          connection = undefined;
        };
        resolve(request.result);
      };
      request.onerror = () => {
        settled = true;
        reject(new PersistenceError("Could not open local storage.", { cause: request.error }));
      };
      request.onblocked = () => {
        settled = true;
        reject(new PersistenceError("Local storage is blocked. Close other Eazo tabs and try again."));
      };
    });
    connection = pending.catch((error: unknown) => {
      connection = undefined;
      throw error;
    });
    return connection;
  }

  async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    try {
      const db = await database();
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const request = operation(tx.objectStore(STORE_NAME));
        // A successful request is not a successful save until the transaction commits.
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(new PersistenceError("Local storage operation failed; changes were not saved.", { cause: tx.error ?? request.error }));
        tx.onabort = () => reject(new PersistenceError("Local storage operation was aborted; changes were not saved.", { cause: tx.error ?? request.error }));
      });
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError("Local storage operation failed; changes were not saved.", { cause: error });
    }
  }

  return {
    async save(input) {
      const snapshot = WorkspaceSnapshotSchema.parse(input);
      await transaction("readwrite", (store) => store.put(snapshot));
      return snapshot;
    },
    async load(id) {
      const value: unknown = await transaction("readonly", (store) => store.get(id));
      if (value === undefined) return null;
      const result = WorkspaceSnapshotSchema.safeParse(value);
      if (!result.success) {
        throw new PersistenceError("Saved workspace is incompatible or damaged and could not be restored.", { cause: result.error });
      }
      return result.data;
    },
    async remove(id) {
      await transaction("readwrite", (store) => store.delete(id));
    },
    async close() {
      const pending = connection;
      connection = undefined;
      if (pending) (await pending).close();
    },
  };
}
