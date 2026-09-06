'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { WorkspaceSnapshotSchema, type WorkspaceSnapshot } from '../persistence';
import { resolveTxtAnchor } from '../reader/source-anchor';
import type { BookPreview } from '../reader/book-preview';
import { createReadingImageTransport } from './reading-images';
import { cloudRequest, CloudRequestError } from './request';
import { ReadingSync, type SyncStatus } from './sync-engine';
import { createSyncStore, readingStorageKey, type SnapshotHead } from './sync-store';

export function validateReadingSnapshot(value: unknown, bookId: string, preview: BookPreview) {
  const parsed = WorkspaceSnapshotSchema.safeParse(value);
  if (!parsed.success) throw new Error('Reading data could not be saved or restored. Download a reading backup before retrying.');
  const saved = parsed.data;
  if (saved.bookId !== bookId || [...saved.anchors, ...saved.footprints.flatMap(event => event.anchors)].some(anchor => !resolveTxtAnchor(anchor, { ...preview, bookId }))) throw new Error('Saved passages do not match this source version.');
  const position = saved.readerPosition;
  if (position && (position.fileHash !== preview.fileHash || position.extractionVersion !== preview.extractionVersion || position.startOffset > preview.sourceText.length)) throw new Error('Saved position does not match this source version.');
  return saved;
}
export function useReadingSync({ ownerId, sourceId, bookId, preview, snapshot, restore }: {
  ownerId?: string; sourceId?: string; bookId: string; preview: BookPreview;
  snapshot: WorkspaceSnapshot; restore: (snapshot: WorkspaceSnapshot) => void;
}) {
  const [state, setState] = useState<{ status: SyncStatus; message?: string }>({ status: 'loading' });
  const [initialized, setInitialized] = useState(false);
  const engine = useRef<ReadingSync | null>(null);
  const [remoteSettled, setRemoteSettled] = useState(false);
  const interacted = useRef(false);
  const latestRestore = useRef(restore);
  const latestSnapshot = useRef(snapshot);
  useEffect(() => { latestRestore.current = restore; latestSnapshot.current = snapshot; }, [restore, snapshot]);
  useEffect(() => {
    let active = true;
    const store = createSyncStore();
    const key = readingStorageKey(ownerId, sourceId ?? bookId);
    function expired() {
      if (!active) return;
      engine.current?.stop();
      setState({ status: 'signed-out', message: 'Your session changed. Opening sign in…' });
      window.location.replace('/cloud');
    }
    const images = ownerId && sourceId ? createReadingImageTransport(ownerId, sourceId) : null;
    async function request(path: string, body?: unknown) {
      try {
        const result = await cloudRequest(path, body, ownerId);
        if (path.startsWith('snapshot') && result.payload && images) result.payload = await images.unpack(result.payload);
        return result;
      }
      catch (error) {
        if (error instanceof CloudRequestError) {
          if (error.status === 401 || error.status === 403) expired();
          const value = error.details as { current?: SnapshotHead } | undefined;
          if (error.status === 409 && value?.current) return { ...value.current, payload: value.current.payload && images ? await images.unpack(value.current.payload) : value.current.payload, conflict: true };
        }
        throw error;
      }
    }
    async function checkSession() {
      const session = await request('session');
      if (session.id !== ownerId) { expired(); throw new Error('The signed-in account changed.'); }
    }
    const sync = new ReadingSync(key, {
      load: () => store.load(key), save: record => store.save(record), archive: value => store.archive(key, value),
      async get() { await checkSession(); return await request(`snapshot?source=${encodeURIComponent(sourceId!)}`) as SnapshotHead; },
      async put(record) {
        await checkSession();
        let device = localStorage.getItem('eazo-device');
        if (!device) { device = crypto.randomUUID(); localStorage.setItem('eazo-device', device); }
        return await request('snapshot', { source: sourceId, device, mutationId: record.mutationId, baseRevision: record.revision, payload: images ? await images.pack(record.current) : record.current });
      },
      validate: value => validateReadingSnapshot(value, bookId, preview),
      restore: value => { if (active) latestRestore.current(value); },
      status: (status, message) => { if (active) setState({ status, message }); },
      uuid: () => crypto.randomUUID(), online: () => navigator.onLine,
      remote: !!ownerId && !!sourceId,
    });
    engine.current = sync;
    void sync.start(latestSnapshot.current, () => { if (active) setInitialized(true); }).then(() => {
      if (active) {
        setRemoteSettled(true);
        // A network failure still enables durable offline reading after local hydration.
        setInitialized(true);
      }
    });
    const refresh = () => { void sync.flush(); };
    const authChanged = () => { if (ownerId) void checkSession().catch(() => {}); };
    const storageChanged = (event: StorageEvent) => { if (event.key === 'eazo-auth-change') authChanged(); };
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('eazo-auth-changed', authChanged);
    window.addEventListener('storage', storageChanged);
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      active = false; sync.stop(); engine.current = null;
      window.clearInterval(timer);
      window.removeEventListener('online', refresh); window.removeEventListener('offline', refresh);
      window.removeEventListener('focus', refresh); window.removeEventListener('eazo-auth-changed', authChanged);
      window.removeEventListener('storage', storageChanged);
      // Open IndexedDB transactions finish even after unmount; never discard queued reading on navigation.
    };
  }, [ownerId, sourceId, bookId, preview]);
  useEffect(() => {
    if (!initialized || (sourceId && !remoteSettled && !interacted.current)) return;
    try { void engine.current?.update(snapshot); }
    catch (error) { queueMicrotask(() => setState({ status: 'error', message: error instanceof Error ? error.message : 'Could not save reading.' })); }
    const timer = window.setTimeout(() => { void engine.current?.flush(); }, 1_000);
    return () => window.clearTimeout(timer);
  }, [initialized, snapshot, sourceId, remoteSettled]);
  const retry = useCallback(() => { void engine.current?.flush(); }, []);
  const resolve = useCallback((choice: 'device' | 'cloud') => { void engine.current?.resolve(choice); }, []);
  const download = useCallback(async () => {
    const record = engine.current?.record;
    const store = createSyncStore();
    const recoveries = await store.recoveries(readingStorageKey(ownerId, sourceId ?? bookId)).catch(() => []);
    await store.close();
    const blob = new Blob([JSON.stringify({ device: record?.current ?? latestSnapshot.current, cloud: record?.conflict?.payload ?? null, recoveries }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = 'eazo-reading-recovery.json'; link.click(); URL.revokeObjectURL(url);
  }, [ownerId, sourceId, bookId]);
  const interact = useCallback(() => { interacted.current = true; }, []);
  return { ...state, retry, resolve, download, interact };
}
