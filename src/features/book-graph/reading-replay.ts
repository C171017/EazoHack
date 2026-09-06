import type { HeatPoint } from './heat-placement';
import type { ReadingFootprint } from './reading-heat';

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
