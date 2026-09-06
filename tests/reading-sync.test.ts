import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { WorkspaceSnapshotSchema, type WorkspaceSnapshot } from '../src/features/persistence';
import { ReadingSync, type SyncDependencies, type SyncStatus } from '../src/features/cloud/sync-engine';
import { createSyncStore, readingStorageKey, type SnapshotHead, type SyncRecord } from '../src/features/cloud/sync-store';

function snapshot(position = 0) {
  return WorkspaceSnapshotSchema.parse({ schemaVersion: 1, id: 'book', bookId: 'book', readerPosition: { fileHash: 'hash', extractionVersion: 'v1', startOffset: position }, savedAt: '2026-09-06T00:00:00Z' });
}
function setup(overrides: Partial<SyncDependencies> = {}) {
  let saved: SyncRecord | null = null, head: SnapshotHead = { revision: 0, payload: null };
  let online = true, nextId = 0;
  const statuses: SyncStatus[] = [], restores: WorkspaceSnapshot[] = [], archives: WorkspaceSnapshot[] = [], writes: SyncRecord[] = [];
  const deps: SyncDependencies = {
    load: async () => saved, save: async record => { saved = structuredClone(record); },
    archive: async value => { archives.push(value); }, get: async () => head,
    put: async record => { writes.push(structuredClone(record)); if (head.revision !== record.revision) return { ...head, conflict: true }; head = { revision: head.revision + 1, payload: record.current }; return head; },
    validate: value => WorkspaceSnapshotSchema.parse(value), restore: value => { restores.push(value); }, status: value => { statuses.push(value); },
    uuid: () => `mutation-${++nextId}`, online: () => online, remote: true, ...overrides,
  };
  return { engine: new ReadingSync('account-source', deps), deps, statuses, restores, archives, writes,
    offline() { online = false; }, online() { online = true; }, setHead(value: SnapshotHead) { head = value; }, get saved() { return saved; } };
}

test('offline queue survives reload and resumes with the original optimistic revision', async () => {
  const a = setup(); await a.engine.start(); a.offline(); await a.engine.update(snapshot(12)); await a.engine.flush();
  assert.equal(a.statuses.at(-1), 'offline'); assert.equal(a.saved?.dirty, true); assert.equal(a.writes.length, 0);
  const recovered = setup({ load: async () => a.saved }); await recovered.engine.start();
  assert.equal(recovered.restores[0].readerPosition?.startOffset, 12);
  assert.equal(recovered.writes[0].revision, 0); assert.equal(recovered.saved?.dirty, false);
});

test('old offline progress cannot replace newer cloud reading without an explicit choice', async () => {
  const a = setup(); await a.engine.start(); a.offline(); await a.engine.update(snapshot(20));
  a.setHead({ revision: 3, payload: snapshot(80) }); a.online(); await a.engine.flush();
  assert.equal(a.statuses.at(-1), 'conflict'); assert.equal(a.writes.length, 0);
  assert.equal(a.saved?.current.readerPosition?.startOffset, 20);
  assert.equal(a.saved?.conflict?.payload?.readerPosition?.startOffset, 80);
  await a.engine.resolve('device');
  assert.deepEqual(a.archives.map(value => value.readerPosition?.startOffset), [20, 80]);
  assert.equal(a.writes[0].revision, 3); assert.equal(a.writes[0].current.readerPosition?.startOffset, 20);
});

test('choosing cloud archives local changes and restores the selected cloud version', async () => {
  const a = setup(); await a.engine.start(); await a.engine.update(snapshot(10));
  a.setHead({ revision: 2, payload: snapshot(90) }); await a.engine.flush(); await a.engine.resolve('cloud');
  assert.equal(a.restores.at(-1)?.readerPosition?.startOffset, 90);
  assert.equal(a.writes.length, 0); assert.equal(a.saved?.dirty, false);
  assert.deepEqual(a.archives.map(value => value.readerPosition?.startOffset), [10, 90]);
});

test('a write committed before a lost response is recognized on retry without duplicate revision', async () => {
  const a = setup(); await a.engine.start(); await a.engine.update(snapshot(22));
  a.setHead({ revision: 1, payload: snapshot(22) }); await a.engine.flush();
  assert.equal(a.writes.length, 0); assert.equal(a.saved?.revision, 1); assert.equal(a.saved?.dirty, false);
});

test('reading changed while a save is in flight remains queued against the acknowledged revision', async () => {
  let finish!: (value: SnapshotHead) => void;
  const a = setup({ put: () => new Promise(resolve => { finish = resolve; }) });
  await a.engine.start(); await a.engine.update(snapshot(10));
  const saving = a.engine.flush();
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  await a.engine.update(snapshot(20));
  assert.equal(a.saved?.current.readerPosition?.startOffset, 20, 'Local durability does not wait for the network');
  finish({ revision: 1, payload: snapshot(10) });
  await saving;
  assert.equal(a.saved?.revision, 1); assert.equal(a.saved?.dirty, true);
  assert.equal(a.saved?.current.readerPosition?.startOffset, 20);
});

test('account and guest storage keys are isolated and conflicting tab queues are retained', async () => {
  const store = createSyncStore(new IDBFactory());
  const guest = readingStorageKey(undefined, 'book'), alice = readingStorageKey('alice', 'book'), bob = readingStorageKey('bob', 'book');
  const record: SyncRecord = { key: alice, current: snapshot(10), revision: 0, dirty: true, mutationId: 'm1', writerId: 'tab-a', conflict: null };
  await store.save(record);
  assert.equal(await store.load(guest), null); assert.equal(await store.load(bob), null);
  await store.save({ ...record, writerId: 'tab-b', mutationId: 'm2', current: snapshot(80) });
  assert.equal((await store.load(alice))?.current.readerPosition?.startOffset, 80);
  assert.equal((await store.recoveries(alice))[0].snapshot.readerPosition?.startOffset, 10);
  assert.deepEqual(await store.recoveries(bob), []);
  await store.save({ ...record, key: guest });
  await store.save({ ...record, key: bob });
  await store.clearOwner('alice');
  assert.equal(await store.load(alice), null);
  assert.deepEqual(await store.recoveries(alice), []);
  assert.ok(await store.load(guest)); assert.ok(await store.load(bob));
  await store.close();
});

test('queued local durability completes when the reader unmounts', async () => {
  const a = setup(); await a.engine.start();
  const pending = a.engine.update(snapshot(123)); a.engine.stop(); await pending;
  assert.equal(a.saved?.current.readerPosition?.startOffset, 123);
});

test('storage failure is visible and never reported as cloud saved', async () => {
  const a = setup({ save: async () => { throw new Error('disk unavailable'); } });
  await a.engine.start(); await a.engine.update(snapshot(1));
  assert.equal(a.statuses.at(-1), 'error'); assert.equal(a.writes.length, 0);
  await a.engine.flush();
  assert.equal(a.statuses.at(-1), 'error'); assert.equal(a.writes.length, 0);
});

test('local hydration becomes ready before network, and a clean new-device baseline cannot overwrite cloud reading', async () => {
  let finish!: (value: SnapshotHead) => void;
  let hydrated = false;
  const a = setup({ get: () => new Promise(resolve => { finish = resolve; }) });
  const starting = a.engine.start(snapshot(), () => { hydrated = true; });
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  assert.equal(hydrated, true);
  assert.equal(a.saved?.dirty, false);
  finish({ revision: 4, payload: snapshot(50) });
  await starting;
  assert.equal(a.restores.at(-1)?.readerPosition?.startOffset, 50);
  assert.equal(a.writes.length, 0); assert.equal(a.statuses.at(-1), 'saved');
});

test('a user edit during initial remote loading stays durable and conflicts with newer cloud reading', async () => {
  let finish!: (value: SnapshotHead) => void;
  const a = setup({ get: () => new Promise(resolve => { finish = resolve; }) });
  const starting = a.engine.start(snapshot());
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  await a.engine.update(snapshot(20));
  assert.equal(a.saved?.current.readerPosition?.startOffset, 20);
  finish({ revision: 4, payload: snapshot(50) });
  await starting;
  assert.equal(a.saved?.current.readerPosition?.startOffset, 20);
  assert.equal(a.saved?.conflict?.payload?.readerPosition?.startOffset, 50);
  assert.equal(a.writes.length, 0); assert.equal(a.statuses.at(-1), 'conflict');
});
