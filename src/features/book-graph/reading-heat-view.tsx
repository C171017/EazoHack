'use client';
import { useState } from 'react';
import type { SourceAnchor } from '../../shared/schemas';
import { ENHANCEMENTS, ENHANCEMENT_ORDER } from '../../shared/enhancements';
import { ArtifactView } from '../assistance/artifact-view';
import { type HeatFilter } from './reading-heat';
import type { HeatPoint } from './heat-placement';
import styles from './reading-heat.module.css';

type HeatData = { points: HeatPoint[]; excluded: number; unmapped: number; error: string | null; loading: boolean; retry: () => void };
export type ReadingHeatData = HeatData;

export function HeatInspector({ point, filter, onClose, onSource, onLocate }: {
  point: HeatPoint; onLocate: (id: string) => void; filter: HeatFilter; onClose: () => void; onSource: (anchor: SourceAnchor) => void;
}) {
  const [states, setStates] = useState<Record<string, Record<string, string | number | boolean | null>>>({});
  const events = point.events.filter(event => filter === 'all' || event.kind === filter);
  return <section className={styles.inspector} aria-label="Reading footprint details" onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') onClose(); }}>
    <div className={styles.header}><h3>{point.leaf.label}</h3><button onClick={onClose} aria-label="Close footprint details">×</button></div>
    <p>{events.length} matching generations · {point.events.length} total</p>
    <div className={styles.breakdown}>{ENHANCEMENT_ORDER.map(kind => <span key={kind}>
      <i style={{ background: ENHANCEMENTS[kind].dark }} />{ENHANCEMENTS[kind].label} {point.counts[kind]}
    </span>)}</div>
    <p className={styles.hint}>Completed generations on this device. Undoing a result does not erase its footprint. Each generation is matched to the closest source passage assigned to this leaf.</p>
    <button className={styles.link} onClick={() => onLocate(point.leaf.id)}>Show this leaf in the graph ↗</button>
    {point.nearest > 0 && <p className={styles.hint}>{point.nearest} generations use the nearest text section because their selections do not overlap a leaf passage.</p>}
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
