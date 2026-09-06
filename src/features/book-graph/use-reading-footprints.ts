'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createFootprintRepository } from '../persistence/reading-footprints';
import { mergeFootprints, type ReadingFootprint } from './reading-heat';

export function useReadingFootprints(bookId: string, ownerId?: string) {
  const repository = useMemo(() => createFootprintRepository(ownerId ? { databaseName: `eazo-reading-footprints:account:${ownerId}` } : {}), [ownerId]);
  const [events, setEvents] = useState<ReadingFootprint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pending = useRef(new Map<string, ReadingFootprint>());
  const refresh = useCallback(() => repository.list(bookId).then(saved => {
    setEvents(current => mergeFootprints(saved, current)); setLoading(false);
  }).catch(() => { setError('Saved footprints could not be loaded.'); setLoading(false); }), [bookId, repository]);
  useEffect(() => {
    void refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);
  const retry = useCallback(async () => {
    try {
      const batch = [...pending.current.values()];
      await repository.record(batch);
      batch.forEach(event => pending.current.delete(event.id));
      setError(null); await refresh();
    } catch { setError('Footprints are visible for this visit, but could not be saved on this device.'); }
  }, [refresh, repository]);
  const record = useCallback((batch: ReadingFootprint[]) => {
    if (!batch.length) return;
    batch.forEach(event => pending.current.set(event.id, event));
    setEvents(current => mergeFootprints(current, batch));
    void retry();
  }, [retry]);
  return { events, error, loading, retry, record };
}
