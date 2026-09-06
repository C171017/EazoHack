import type { WorkspaceSnapshot } from '../persistence';
import type { SnapshotHead, SyncRecord } from './sync-store';

export type SyncStatus = 'loading' | 'saving' | 'saved' | 'local' | 'offline' | 'error' | 'conflict' | 'signed-out';
export function sameReading(a: WorkspaceSnapshot | null, b: WorkspaceSnapshot | null) {
  if (!a || !b) return a === b;
  return JSON.stringify({ ...a, savedAt: '' }) === JSON.stringify({ ...b, savedAt: '' });
}
export type SyncDependencies = {
  load: () => Promise<SyncRecord | null>;
  save: (record: SyncRecord) => Promise<void>;
  archive: (snapshot: WorkspaceSnapshot) => Promise<void>;
  get: () => Promise<SnapshotHead>;
  put: (record: SyncRecord) => Promise<SnapshotHead & { conflict?: boolean }>;
  validate: (snapshot: WorkspaceSnapshot) => WorkspaceSnapshot;
  restore: (snapshot: WorkspaceSnapshot) => void;
  status: (status: SyncStatus, message?: string) => void;
  uuid: () => string;
  online: () => boolean;
  remote: boolean;
};

/** Serialized durability + optimistic writes. Device clocks never decide which reading wins. */
export class ReadingSync {
  record: SyncRecord | null = null;
  ready = false;
  private stopped = false;
  private chain: Promise<unknown> = Promise.resolve();
  private writes: Promise<void> = Promise.resolve();
  private writerId: string;
  private persist(record: SyncRecord) {
    const pending = this.writes.then(() => this.deps.save(record));
    this.writes = pending.catch(() => {});
    return pending;
  }
  constructor(private key: string, private deps: SyncDependencies) { this.writerId = deps.uuid(); }
  private serial(task: () => Promise<void>) {
    const next = this.chain.then(async () => { if (!this.stopped) await task(); });
    this.chain = next.catch(error => {
      if (!this.stopped) this.deps.status(this.deps.online() ? 'error' : 'offline', error instanceof Error ? error.message : 'Could not synchronize reading.');
    });
    return this.chain;
  }
  async start(initial?: WorkspaceSnapshot, hydrated?: () => void) {
    return this.serial(async () => {
      this.record = await this.deps.load();
      if (this.record) this.deps.restore(this.deps.validate(this.record.current));
      else if (initial) {
        this.record = { key: this.key, writerId: this.writerId, revision: 0, current: this.deps.validate(initial), dirty: false, mutationId: this.deps.uuid(), conflict: null };
        await this.persist(this.record);
      }
      this.ready = true;
      hydrated?.();
      if (!this.deps.remote) { this.deps.status('local'); return; }
      await this.reconcile();
    });
  }
  update(snapshot: WorkspaceSnapshot) {
    if (!this.ready || this.stopped || sameReading(this.record?.current ?? null, snapshot)) return this.chain;
    this.record = { key: this.key, writerId: this.writerId, revision: this.record?.revision ?? 0, current: this.deps.validate(snapshot), dirty: true, mutationId: this.deps.uuid(), conflict: this.record?.conflict ?? null };
    const changed = this.record;
    // Device durability must not wait behind a slow or disconnected network request.
    return this.persist(changed).then(() => {
      if (this.stopped || !this.record) return;
      this.deps.status(this.record.conflict ? 'conflict' : !this.deps.remote ? 'local' : this.deps.online() ? 'saving' : 'offline');
    }).catch(error => {
      if (!this.stopped) this.deps.status('error', error instanceof Error ? error.message : 'Reading could not be saved on this device.');
    });
  }
  flush() { return this.serial(() => this.reconcile()); }
  private async reconcile() {
    if (!this.deps.remote) {
      if (this.record) { await this.persist(this.record); this.deps.status('local'); }
      return;
    }
    if (!this.deps.online()) { this.deps.status('offline'); return; }
    const head = await this.deps.get();
    if (this.stopped) return;
    if (head.payload) head.payload = this.deps.validate(head.payload);
    if (this.record?.conflict) {
      this.record = { ...this.record, conflict: head };
      await this.persist(this.record);
      this.deps.status('conflict'); return;
    }
    if (this.record?.dirty) {
      if (sameReading(this.record.current, head.payload)) {
        this.record = { ...this.record, revision: head.revision, dirty: false };
        await this.persist(this.record); this.deps.status('saved'); return;
      }
      if (head.revision !== this.record.revision) {
        this.record = { ...this.record, conflict: head };
        await this.persist(this.record); this.deps.status('conflict'); return;
      }
      const sent = this.record;
      await this.persist(sent);
      this.deps.status('saving');
      const result = await this.deps.put(sent);
      if (this.stopped) return;
      if (result.payload) result.payload = this.deps.validate(result.payload);
      if (result.conflict) {
        this.record = { ...this.record, conflict: result };
        await this.persist(this.record); this.deps.status('conflict'); return;
      }
      this.record = { ...this.record, revision: result.revision, dirty: this.record.mutationId !== sent.mutationId };
      await this.persist(this.record); this.deps.status(this.record.dirty ? 'saving' : 'saved'); return;
    }
    if (head.payload && (!this.record || head.revision !== this.record.revision)) {
      this.record = { key: this.key, writerId: this.writerId, revision: head.revision, current: head.payload, dirty: false, mutationId: this.deps.uuid(), conflict: null };
      const restored = this.record;
      await this.persist(restored);
      if (!this.stopped && this.record === restored) this.deps.restore(head.payload);
    }
    this.deps.status('saved');
  }
  resolve(choice: 'device' | 'cloud') {
    return this.serial(async () => {
      if (!this.record?.conflict) return;
      const remote = this.record.conflict;
      await this.deps.archive(this.record.current);
      if (remote.payload) await this.deps.archive(remote.payload);
      if (choice === 'cloud' && remote.payload) {
        this.record = { ...this.record, current: remote.payload, revision: remote.revision, dirty: false, conflict: null, mutationId: this.deps.uuid() };
        await this.persist(this.record); this.deps.restore(remote.payload);
      } else {
        this.record = { ...this.record, revision: remote.revision, conflict: null, dirty: true, mutationId: this.deps.uuid() };
        await this.persist(this.record);
      }
      await this.reconcile();
    });
  }
  stop() { this.stopped = true; }
}
