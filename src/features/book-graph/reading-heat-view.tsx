'use client';
import { useState } from 'react';
import type { SourceAnchor } from '../../shared/schemas';
import { ENHANCEMENTS, ENHANCEMENT_ORDER } from '../../shared/enhancements';
import { ArtifactView } from '../assistance/artifact-view';
import { heatCount, type HeatFilter } from './reading-heat';
import { HEAT_COLORS } from './heat-field';
import type { HeatPoint } from './heat-placement';
import styles from './reading-heat.module.css';

type HeatData = { points: HeatPoint[]; excluded: number; unmapped: number; error: string | null; loading: boolean; retry: () => void };
export type ReadingHeatData = HeatData;

export function HeatControls({ data, enabled, onEnabled, filter, onFilter, onSelect }: {
  data: HeatData; enabled: boolean; onEnabled: (enabled: boolean) => void;
  filter: HeatFilter; onFilter: (filter: HeatFilter) => void; onSelect: (id: string) => void;
}) {
  const total = data.points.reduce((sum, point) => sum + heatCount(point, filter), 0);
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
      <div className={styles.legend}>
        <span>Local heat</span><div className={styles.gradient} aria-hidden="true" />
        <div aria-label="Heat intensity from overlapping generations">{HEAT_COLORS.map(step =>
          <span key={step.value}><i style={{ background: `rgb(${step.rgb.join(',')})` }} />{step.label}</span>)}</div>
      </div>
      <div className={styles.notePicker}><select aria-label="Inspect a heated note" value="" onChange={e => { if (e.target.value) onSelect(e.target.value); }} disabled={!total}>
        <option value="">{total ? 'Inspect a heated note…' : 'No heated notes yet'}</option>
        {data.points.filter(point => heatCount(point, filter)).map(point => <option key={point.leaf.id} value={point.leaf.id}>
          {point.leaf.label} · {heatCount(point, filter)} generations
        </option>)}
      </select></div>
      <p className={styles.hint}>{!total && !data.loading ? (filter === 'all' ? 'Generate an enhancement to leave a footprint. ' : 'No footprints for this method yet. ') : ''}Green → yellow → red as nearby generations accumulate.</p>
    </>}
    {data.unmapped > 0 && !data.loading && <p>{data.unmapped} footprints have no matching source version or positioned leaf yet.</p>}
    {data.excluded > 0 && <p>{data.excluded} footprints belong to a different source version and are not placed.</p>}
    {data.error && <p role="alert">{data.error} <button className={styles.link} onClick={data.retry}>Retry saving / loading</button></p>}
  </section>;
}

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
