'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapView } from '../../shared/schemas';
import { buildHeatVolume } from './heat-field';
import type { HeatPoint } from './heat-placement';
import { screenWorld, type Size } from './map-framing';
import { SOURCE_Z_SPAN, sourceWorld } from './projection';
import { SpatialHeat } from './spatial-heat';
import { readingTrajectory, replayFrame, replayHeat, type ReplayVisit } from './reading-replay';
import styles from './reading-replay.module.css';
import { projectReplayCurve, replayCurve, replayProgress } from './replay-curve';

export function ReadingReplay({ points, loading, error, view, size, readingProgress }: {
  points: HeatPoint[]; loading?: boolean; error?: string | null; view: MapView; size: Size;
  readingProgress: number;
}) {
  const visits = useMemo(() => readingTrajectory(points), [points]);
  const [run, setRun] = useState<{ visits: ReplayVisit[] } | null>(null);
  // A changed source/history invalidates the snapshot; unmount cancels its RAF.
  const active = run?.visits === visits ? run : null;
  const restingField = useMemo(() => buildHeatVolume(points, 'all'), [points]);
  const finish = useMemo(() => () => setRun(null), []);
  const title = active ? 'Replaying reading trajectory' : loading ? 'Loading reading history…'
    : error ? 'Reading history is unavailable' : visits.length ? 'Replay reading trajectory · oldest to newest'
    : 'Complete an enhanced reading to replay your trajectory';
  return <>
    {!active && restingField && <SpatialHeat field={restingField} view={view} size={size} readingProgress={readingProgress} />}
    {active && <ReplayScene visits={active.visits} view={view} size={size} progress={readingProgress} onFinish={finish} />}
    <button className={styles.control} type="button" aria-label="Replay reading trajectory" title={title}
      data-playing={!!active} disabled={!!active || !visits.length || loading || !!error}
      onClick={() => { setRun({ visits }); }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5.2 6.2A8.5 8.5 0 1 1 3.5 13M5.2 2.8v3.8H9" />
        <path d="m10 9 5 3-5 3Z" fill="currentColor" strokeWidth=".7" />
      </svg>
    </button>
    <span className={styles.status} role="status">{active ? 'Replaying enhanced readings from oldest to newest.' : ''}</span>
  </>;
}

function ReplayScene({ visits, view, size, progress, onFinish }: {
  visits: ReplayVisit[]; view: MapView; size: Size; progress: number; onFinish: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const started = useRef<number | null>(null);
  const [count, setCount] = useState(1);
  const allPoints = useMemo(() => replayHeat(visits, visits.length), [visits]);
  const fullField = useMemo(() => buildHeatVolume(allPoints, 'all')!, [allPoints]);
  const field = useMemo(() => count === visits.length ? fullField : buildHeatVolume(replayHeat(visits, count), 'all', fullField), [visits, count, fullField]);
  const curve = useMemo(() => replayCurve(visits.map(visit => sourceWorld(visit.point.leaf.position, [0, 1], 0))), [visits]);
  useEffect(() => {
    const element = canvas.current!, ctx = element.getContext('2d');
    if (!ctx) { const timer = setTimeout(onFinish, 0); return () => clearTimeout(timer); }
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    element.width = Math.max(1, Math.round(size.width * ratio)); element.height = Math.max(1, Math.round(size.height * ratio));
    ctx.scale(ratio, ratio);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0, lastHeatUpdate = -Infinity;
    const draw = (now: number) => {
      started.current ??= now;
      const elapsed = now - started.current;
      const state = replayFrame(visits.length, elapsed, reduced);
      if (state.done) { onFinish(); return; }
      const distance = curve.length * replayProgress(state.cursor / Math.max(1, visits.length - 1));
      let arrived = 1;
      if (curve.length > 0) {
        while (arrived < visits.length && curve.stops[arrived] <= distance) arrived++;
      } else arrived = state.count;
      // Heat uploads are capped at 8 Hz for long histories; the trail stays smooth.
      if (now - lastHeatUpdate >= 125 || arrived === visits.length) { setCount(arrived); lastHeatUpdate = now; }
      ctx.clearRect(0, 0, size.width, size.height);
      ctx.globalAlpha = state.opacity;
      if (curve.length > 0 && (reduced || distance > .01)) {
        // One translucent milk-white ribbon, without an outline or stop/head dots.
        const path = new Path2D(projectReplayCurve(curve, reduced ? curve.length : distance,
          p => screenWorld({ ...p, z: p.z + progress * SOURCE_Z_SPAN }, view, size)));
        ctx.strokeStyle = 'rgba(255, 252, 242, 0.62)';
        ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(255, 252, 242, 0.24)'; ctx.shadowBlur = 5;
        ctx.stroke(path);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [curve, visits, view, progress, size, onFinish]);
  const event = visits[count - 1]?.event;
  return <div className={styles.overlay} data-reading-replay data-replay-count={count} data-replay-total={visits.length}>
    {field && <SpatialHeat transitionMs={650} field={field} view={view} size={size} readingProgress={progress} />}
    <canvas ref={canvas} className={styles.trail} aria-hidden="true" />
    <div className={styles.caption}><span>{count} / {visits.length}</span><span aria-hidden="true">·</span>
      {event && <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>}
    </div>
  </div>;
}
