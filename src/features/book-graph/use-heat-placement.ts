'use client';
import { useEffect, useMemo, useState } from 'react';
import { HeatIndexPageSchema, placeFootprints, type HeatIndex } from './heat-placement';
import { readMap } from './map-data';
import type { HeatSource, ReadingFootprint } from './reading-heat';

export function useHeatPlacement(version: string, events: ReadingFootprint[], source: HeatSource, available: boolean) {
  const [state, setState] = useState<{ version: string; index?: HeatIndex; error?: string }>({ version: '' });
  const [attempt, setAttempt] = useState(0);
  const needed = available && events.length > 0;
  useEffect(() => {
    if (!needed) return;
    const controller = new AbortController();
    async function load() {
      try {
        let offset = 0, index: HeatIndex | undefined;
        do {
          const page = HeatIndexPageSchema.parse(await readMap(version, { kind: 'heat-index', offset: String(offset) }, controller.signal));
          if (controller.signal.aborted) return;
          if (page.offset !== offset || (offset < page.total && !page.leaves.length)) throw new Error('Incomplete heat source index');
          if (index && (index.fileHash !== page.fileHash || index.extractionVersion !== page.extractionVersion)) throw new Error('Source changed');
          index ??= { ...page, leaves: [] };
          index.leaves.push(...page.leaves); offset += page.leaves.length;
          if (offset >= page.total) break;
        } while (!controller.signal.aborted);
        if (!controller.signal.aborted) setState({ version, index });
      } catch { if (!controller.signal.aborted) setState({ version, error: 'Could not match footprints to book notes.' }); }
    }
    void load();
    return () => controller.abort();
  }, [version, needed, attempt]);
  const index = state.version === version ? state.index ?? null : null;
  const placed = useMemo(() => placeFootprints(events, source, index), [events, source, index]);
  return { ...placed, loading: needed && state.version !== version,
    error: state.version === version ? state.error ?? null : null,
    retry: () => { setState({ version: '' }); setAttempt(n => n + 1); } };
}
