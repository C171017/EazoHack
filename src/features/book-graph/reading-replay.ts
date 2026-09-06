import type { MapView } from '../../shared/schemas';
import type { HeatPoint } from './heat-placement';
import type { ReadingFootprint } from './reading-heat';
import { baseScale, type Size } from './map-framing';
import { DEFAULT_CAMERA, project, sourceWorld } from './projection';
import { HEAT_RADIUS } from './heat-field';

export type ReplayVisit = { event: ReadingFootprint; point: HeatPoint };

/** Generation order, not source order. Revisiting the same leaf is a new stop. */
export function readingTrajectory(points: HeatPoint[]): ReplayVisit[] {
  const visits = new Map<string, ReplayVisit>();
  for (const point of points) for (const event of point.events) {
    if (!visits.has(event.id)) visits.set(event.id, { event, point });
  }
  return [...visits.values()].sort((a, b) => Date.parse(a.event.createdAt) - Date.parse(b.event.createdAt)
    || a.event.id.localeCompare(b.event.id));
}

export function replayHeat(visits: ReplayVisit[], count: number): HeatPoint[] {
  const points = new Map<string, HeatPoint>();
  for (const { event, point } of visits.slice(0, count)) {
    let accumulated = points.get(point.leaf.id);
    if (!accumulated) {
      accumulated = { ...point, events: [], counts: { explanation: 0, diagram: 0, interactive: 0, illustration: 0 } };
      points.set(point.leaf.id, accumulated);
    }
    accumulated.events.push(event);
    accumulated.counts[event.kind]++;
  }
  return [...points.values()];
}

// Compress idle gaps; timestamps determine order, not playback waiting time.
export function replayTiming(count: number) {
  const travel = Math.min(30000, Math.max(0, count - 1) * 700);
  return { travel, lead: 650, hold: 1500, fade: 450, total: 650 + travel + 1500 + 450 };
}

export function replayFrame(count: number, elapsed: number, reducedMotion = false) {
  const timing = replayTiming(count);
  const cursor = count <= 1 ? 0 : Math.max(0, Math.min(count - 1, (elapsed - timing.lead) / timing.travel * (count - 1)));
  return {
    cursor: reducedMotion ? Math.floor(cursor) : cursor,
    count: count ? Math.min(count, Math.floor(cursor) + 1) : 0,
    opacity: reducedMotion ? 1 : Math.max(0, Math.min(1, (timing.total - elapsed) / timing.fade)),
    done: elapsed >= timing.total,
  };
}

/** Temporary camera fits every visited leaf and its halo without saving a view. */
export function replayView(points: HeatPoint[], base: MapView, size: Size, progress: number): MapView {
  const pose = { ...base, ...DEFAULT_CAMERA, projection: '3d' as const, zoom: 1, x: 0, y: 0, selectedNodeId: null };
  const positions = points.map(point => sourceWorld(point.leaf.position, [0, 1], progress));
  if (!positions.length) return pose;
  const min = { x: Infinity, y: Infinity }, max = { x: -Infinity, y: -Infinity };
  for (const p of positions) {
    const q = project(p, pose);
    min.x = Math.min(min.x, q.x - HEAT_RADIUS); max.x = Math.max(max.x, q.x + HEAT_RADIUS);
    min.y = Math.min(min.y, q.y - HEAT_RADIUS); max.y = Math.max(max.y, q.y + HEAT_RADIUS);
  }
  const cx = (min.x + max.x) / 2, cy = (min.y + max.y) / 2;
  const { yaw, pitch } = pose;
  const center = { x: cx * Math.cos(yaw) - cy * Math.sin(yaw) * Math.sin(pitch),
    y: cx * Math.sin(yaw) + cy * Math.cos(yaw) * Math.sin(pitch), z: -cy * Math.cos(pitch) };
  const pixels = Math.min(Math.max(40, size.width - 100) / Math.max(220, max.x - min.x),
    Math.max(40, size.height - 160) / Math.max(300, max.y - min.y));
  return { ...pose, framing: { center, scale: pixels / baseScale(size) } };
}
