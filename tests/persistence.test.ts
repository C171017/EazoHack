import assert from "node:assert/strict";
import { test } from "node:test";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { fixtureAnchors, fixtureBook, fixtureSelection, makeMockArtifact } from "../src/shared/fixtures";
import { ROUTE_KINDS } from "../src/shared/schemas";
import {
  createWorkspaceRepository,
  PersistenceError,
  WorkspaceSnapshotSchema,
  type WorkspaceSnapshot,
} from "../src/features/persistence";

function checkpoint(): WorkspaceSnapshot {
  return WorkspaceSnapshotSchema.parse({
    schemaVersion: 1,
    id: "reading-session",
    bookId: "plato-republic",
    savedAt: "2026-09-05T00:00:00.000Z",
    anchors: [{
      id: "anchor-1",
      bookId: "plato-republic",
      fileHash: "a".repeat(64),
      extractionVersion: "fixture-1",
      locators: [{ kind: "txt", startOffset: 0, endOffset: 18 }],
      quote: "What is justice?",
      prefix: "",
      suffix: "",
      resolution: "exact",
    }],
    selections: [{
      id: "selection-1",
      bookId: "plato-republic",
      anchorIds: ["anchor-1"],
      selectedText: "What is justice?",
      contextSnapshot: "A small test passage.",
      createdAt: "2026-09-05T00:00:00.000Z",
    }],
    graphViewport: { x: 12, y: -30, zoom: 1.5 },
    readerPosition: {
      fileHash: "a".repeat(64),
      extractionVersion: "fixture-1",
      startOffset: 4_200,
    },
    bookmarks: ["anchor-1"],
  });
}

test("a checkpoint restores anchors, selections, bookmarks and viewport after reopening", async () => {
  const indexedDB = new IDBFactory();
  const first = createWorkspaceRepository({ indexedDB });
  const expected = checkpoint();
  assert.equal(await first.load(expected.id), null);
  assert.deepEqual(await first.save(expected), expected);
  await first.close();
  const reopened = createWorkspaceRepository({ indexedDB });
  assert.deepEqual(await reopened.load(expected.id), expected);
  await reopened.remove(expected.id);
  assert.equal(await reopened.load(expected.id), null);
  await reopened.close();
});

test("a graph or artifact is not required to save a reading checkpoint", async () => {
  const repository = createWorkspaceRepository({ indexedDB: new IDBFactory() });
  const snapshot = { ...checkpoint(), graphViewport: null };
  await repository.save(snapshot);
  assert.deepEqual(await repository.load(snapshot.id), snapshot);
  await repository.close();
});

test("reader positions reject invalid source offsets", () => {
  assert.equal(WorkspaceSnapshotSchema.safeParse({
    ...checkpoint(),
    readerPosition: { ...checkpoint().readerPosition!, startOffset: -1 },
  }).success, false);
});

test("invalid bindings and duplicate IDs are rejected before overwriting a good checkpoint", async () => {
  const repository = createWorkspaceRepository({ indexedDB: new IDBFactory() });
  const good = checkpoint();
  await repository.save(good);
  await assert.rejects(repository.save({ ...good, anchors: [] }), /Missing saved anchor/);
  await assert.rejects(repository.save({ ...good, anchors: [...good.anchors, ...good.anchors] }), /Duplicate ID/);
  await assert.rejects(repository.save({ ...good, bookId: "different-book" }), /cannot mix books/);
  await assert.rejects(repository.save({ ...good, interactionState: { missing: { value: 3 } } }), /missing artifact/);
  assert.deepEqual(await repository.load(good.id), good);
  await repository.close();
});

test("write failures are exposed and preserve the previous saved checkpoint", async () => {
  const repository = createWorkspaceRepository({ indexedDB: new IDBFactory() });
  const good = checkpoint();
  await repository.save(good);
  const originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function () {
    throw new DOMException("Simulated storage quota exhaustion", "QuotaExceededError");
  };
  try {
    await assert.rejects(repository.save({ ...good, bookmarks: [] }), PersistenceError);
  } finally {
    IDBObjectStore.prototype.put = originalPut;
  }
  assert.deepEqual(await repository.load(good.id), good);
  await repository.close();
});

test("corrupt persisted data is exposed as a restore failure", async () => {
  const indexedDB = new IDBFactory();
  const repository = createWorkspaceRepository({ indexedDB });
  await repository.save(checkpoint());
  await repository.close();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("eazo-local-workspace", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("workspaces", "readwrite");
      transaction.objectStore("workspaces").put({ id: "reading-session", schemaVersion: 999 });
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
  });
  await assert.rejects(repository.load("reading-session"), /incompatible or damaged/);
  await repository.close();
});

test("an aborted transaction is never reported as saved", async () => {
  const repository = createWorkspaceRepository({ indexedDB: new IDBFactory() });
  const good = checkpoint();
  await repository.save(good);
  const originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    const request = originalPut.apply(this, args);
    this.transaction.abort();
    return request;
  };
  try {
    await assert.rejects(repository.save({ ...good, bookmarks: [] }), PersistenceError);
  } finally {
    IDBObjectStore.prototype.put = originalPut;
  }
  assert.deepEqual(await repository.load(good.id), good);
  await repository.close();
});

test("all four mock artifact variants restore with their interaction state and selection binding", async () => {
  const indexedDB = new IDBFactory();
  const repository = createWorkspaceRepository({ indexedDB });
  const artifacts = ROUTE_KINDS.map((kind) => makeMockArtifact(kind, fixtureSelection, `run-${kind}`));
  const interactiveArtifact = artifacts.find((artifact) => artifact.kind === "interactive_ui")!;
  const snapshot = WorkspaceSnapshotSchema.parse({
    schemaVersion: 1,
    id: "all-artifacts",
    bookId: fixtureBook.id,
    anchors: fixtureAnchors,
    selections: [fixtureSelection],
    artifacts,
    interactionState: { [interactiveArtifact.id]: { detailLevel: 4, expanded: true } },
    bookmarks: [fixtureAnchors[0].id],
    savedAt: "2026-09-05T00:00:00.000Z",
  });
  await repository.save(snapshot);
  await repository.close();
  const reopened = createWorkspaceRepository({ indexedDB });
  assert.deepEqual(await reopened.load(snapshot.id), snapshot);
  await assert.rejects(reopened.save({ ...snapshot, selections: [] }), /Missing saved selection/);
  await assert.rejects(reopened.save({
    ...snapshot,
    anchors: [...fixtureAnchors, { ...fixtureAnchors[0], id: "unrelated-anchor" }],
    artifacts: [{ ...interactiveArtifact, anchorIds: ["unrelated-anchor"] }],
  }), /does not belong to its selection/);
  await reopened.close();
});
