'use client';
import { useState } from 'react';
import type { SourceAnchor } from '../../shared/schemas';
import { ENHANCEMENTS, ENHANCEMENT_ORDER } from '../../shared/enhancements';
import { ArtifactView } from '../assistance/artifact-view';
import { ORIGIN } from './map-grid';
import { sourceHeight, type Point3 } from './projection';
import { binLabel, heatColor, heatCount, HEAT_STEPS, type HeatBin, type HeatFilter } from './reading-heat';
import styles from './reading-heat.module.css';

type HeatData = { bins: HeatBin[]; excluded: number; error: string | null; loading: boolean; retry: () => void };
export type ReadingHeatData = HeatData;

export function HeatRibbon({ bins, filter, readingProgress, screen, onSelect }: {
  bins: HeatBin[]; filter: HeatFilter; readingProgress: number;
  screen: (point: Point3) => { x: number; y: number }; onSelect: (index: number) => void;
}) {
  // A screen-width ribbon follows Z without pretending to have X/Y ratings.
  const top = screen({ ...ORIGIN, z: sourceHeight(0, readingProgress) });
  const bottom = screen({ ...ORIGIN, z: sourceHeight(1, readingProgress) });
  const length = Math.hypot(bottom.x - top.x, bottom.y - top.y);
  if (length < 24) return null; // The complete-book strip remains available in XY.
  const nx = (bottom.y - top.y) / length, ny = -(bottom.x - top.x) / length;
  return <g aria-label="Generation heat along book progress" data-heat-ribbon>
    {bins.map(bin => {
      const count = heatCount(bin, filter);
      const a = screen({ ...ORIGIN, z: sourceHeight(bin.start, readingProgress) });
      const b = screen({ ...ORIGIN, z: sourceHeight(bin.end, readingProgress) });
      const points = ([{ point: a, offset: 34 }, { point: a, offset: 46 }, { point: b, offset: 46 }, { point: b, offset: 34 }])
        .map(({ point, offset }) => `${point.x + nx * offset},${point.y + ny * offset}`).join(' ');
      const label = `${binLabel(bin)}: ${count} ${filter === 'all' ? '' : ENHANCEMENTS[filter].label + ' '}generation${count === 1 ? '' : 's'}`;
      return <polygon key={bin.index} data-heat-bin={bin.index} data-count={count} points={points}
        fill={heatColor(count)} stroke="#121519" strokeWidth=".7" className={styles.segment}
        role={count ? 'button' : undefined} tabIndex={-1} aria-label={label}
        onPointerDown={e => e.stopPropagation()} onClick={() => { if (count) onSelect(bin.index); }}>
        <title>{label}</title>
      </polygon>;
    })}
  </g>;
}

export function HeatControls({ data, enabled, onEnabled, filter, onFilter, onSelect }: {
  data: HeatData; enabled: boolean; onEnabled: (enabled: boolean) => void;
  filter: HeatFilter; onFilter: (filter: HeatFilter) => void; onSelect: (index: number) => void;
}) {
  const total = data.bins.reduce((sum, bin) => sum + heatCount(bin, filter), 0);
  return <section className={styles.controls} aria-label="Reading heat controls" onKeyDown={e => e.stopPropagation()}>
    <div className={styles.header}>
      <label><input type="checkbox" checked={enabled} onChange={e => onEnabled(e.target.checked)} /> Reading heat</label>
      <span role="status">{data.loading ? 'Loading…' : `${total} generation${total === 1 ? '' : 's'}`}</span>
    </div>
    {enabled && <>
      <div className={styles.filters} role="group" aria-label="Filter reading footprints">
        {(['all', ...ENHANCEMENT_ORDER] as const).map(kind => <button key={kind} aria-pressed={filter === kind}
          onClick={() => onFilter(kind)}>{kind !== 'all' && <i aria-hidden="true" style={{ background: ENHANCEMENTS[kind].dark }} />}
          {kind === 'all' ? 'All' : ENHANCEMENTS[kind].label}</button>)}
      </div>
      <div className={styles.strip} role="group" aria-label="Whole-book generation heat, beginning to end">
        {data.bins.map(bin => {
          const count = heatCount(bin, filter), label = `${binLabel(bin)}: ${count} generation${count === 1 ? '' : 's'}`;
          return <button key={bin.index} style={{ background: heatColor(count) }} disabled={!count}
            aria-label={label} title={label} onClick={() => onSelect(bin.index)} />;
        })}
      </div>
      <div className={styles.legend}><span>Start → End</span><div aria-label="Generations per 2% of book">{HEAT_STEPS.map(step =>
        <span key={step.min}><i style={{ background: step.color }} />{step.label}</span>)}</div></div>
      <p className={styles.hint}>{!total && !data.loading ? (filter === 'all' ? 'Generate an enhancement to leave your first footprint. ' : 'No footprints for this method yet. ') : ''}Brighter = more generations per 2% of book.</p>
    </>}
    {data.excluded > 0 && <p>{data.excluded} footprints belong to a different source version and are not placed.</p>}
    {data.error && <p role="alert">{data.error} <button className={styles.link} onClick={data.retry}>Retry saving / loading</button></p>}
  </section>;
}

export function HeatInspector({ bin, filter, onClose, onSource }: {
  bin: HeatBin; filter: HeatFilter; onClose: () => void; onSource: (anchor: SourceAnchor) => void;
}) {
  const [states, setStates] = useState<Record<string, Record<string, string | number | boolean | null>>>({});
  const events = bin.events.filter(event => filter === 'all' || event.kind === filter);
  return <section className={styles.inspector} aria-label="Reading footprint details" onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') onClose(); }}>
    <div className={styles.header}><h3>{binLabel(bin)}</h3><button onClick={onClose} aria-label="Close footprint details">×</button></div>
    <p>{events.length} matching generations · {bin.events.length} total</p>
    <div className={styles.breakdown}>{ENHANCEMENT_ORDER.map(kind => <span key={kind}>
      <i style={{ background: ENHANCEMENTS[kind].dark }} />{ENHANCEMENTS[kind].label} {bin.counts[kind]}
    </span>)}</div>
    <p className={styles.hint}>Completed generations on this device. Undoing a result does not erase its footprint. Each generation is placed by its passage midpoint.</p>
    {!events.length && <p>No generations match this filter in this section.</p>}
    {events.map(event => <details key={event.id} className={styles.event}>
      <summary>{ENHANCEMENTS[event.kind].label} · <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></summary>
      {event.anchors.map(anchor => <div key={anchor.id}><blockquote>{anchor.quote}</blockquote>
        <button className={styles.link} onClick={() => onSource(anchor)}>Read original passage ↗</button></div>)}
      {event.artifacts.map(artifact => <ArtifactView key={artifact.id} artifact={artifact} state={states[artifact.id] ?? {}}
        onStateChange={state => setStates(current => ({ ...current, [artifact.id]: state }))} />)}
    </details>)}
  </section>;
}
