import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HeatPoint } from '../src/features/book-graph/heat-placement';
import type { ReadingFootprint } from '../src/features/book-graph/reading-heat';
import { readingTrajectory, replayFrame, replayHeat, replayTiming, replayView } from '../src/features/book-graph/reading-replay';
import { buildHeatVolume, fieldDensity, HEAT_RADIUS } from '../src/features/book-graph/heat-field';
import { initialView, sourceWorld } from '../src/features/book-graph/projection';
import { baseScale, screenWorld } from '../src/features/book-graph/map-framing';

function event(id: string, createdAt: string, kind: ReadingFootprint['kind'] = 'explanation'): ReadingFootprint {
  return { id, createdAt, kind, bookId: 'test', anchors: [], artifacts: [] };
}
function point(id: string, z: number, events: ReadingFootprint[]): HeatPoint {
  return { leaf: { id, label: id, position: { x: z, y: 4 * z, z }, ranges: [{ start: 0, end: 10 }] },
    events, counts: { explanation: events.filter(e => e.kind === 'explanation').length,
      diagram: events.filter(e => e.kind === 'diagram').length, interactive: 0, illustration: 0 }, nearest: 0 };
}
const early = event('first', '2026-09-01T00:00:00Z');
const middle = event('second', '2026-09-02T00:00:00Z', 'diagram');
const late = event('third', '2026-09-03T00:00:00Z');
const points = [point('start-of-book', .05, [middle]), point('end-of-book', .95, [late, early])];

test('chronology crosses source order and retains return visits without duplicate generations', () => {
  const before = structuredClone(points);
  const visits = readingTrajectory([...points, points[1]]);
  assert.deepEqual(visits.map(v => v.event.id), ['first', 'second', 'third']);
  assert.deepEqual(visits.map(v => v.point.leaf.id), ['end-of-book', 'start-of-book', 'end-of-book']);
  const tied = readingTrajectory([point('tie', .5, [event('b', '2026-09-01T00:00:00.000Z'), early, event('a', '2026-09-01T00:00:00Z')])]);
  assert.deepEqual(tied.map(v => v.event.id), ['a', 'b', 'first']);
  assert.deepEqual(points, before);
});

test('heat grows only when visits arrive, preserves method counts, and ends at the original density', () => {
  const before = structuredClone(points), visits = readingTrajectory(points);
  assert.deepEqual(replayHeat(visits, 0), []);
  const one = replayHeat(visits, 1);
  assert.equal(one.length, 1); assert.equal(one[0].events.length, 1);
  const two = replayHeat(visits, 2);
  assert.equal(two.find(p => p.leaf.id === 'start-of-book')!.counts.diagram, 1);
  const full = buildHeatVolume(points, 'all')!;
  const partial = buildHeatVolume(one, 'all', full)!;
  assert.deepEqual(partial.min, full.min); assert.deepEqual(partial.max, full.max);
  const end = buildHeatVolume(replayHeat(visits, visits.length), 'all', full)!;
  assert.deepEqual(end.data, full.data);
  const position = sourceWorld(points[1].leaf.position, [0, 1], 0);
  assert.equal(fieldDensity(position, partial.seeds), 1);
  assert.equal(fieldDensity(position, end.seeds), 2);
  assert.deepEqual(points, before);
});

test('one-shot playback holds the final state, finishes, and never wraps to the beginning', () => {
  for (const count of [0, 1, 3, 10000]) {
    const timing = replayTiming(count);
    assert.equal(replayFrame(count, 0).count, Math.min(count, 1));
    assert.equal(replayFrame(count, timing.lead + timing.travel + 1).count, count);
    assert.equal(replayFrame(count, timing.total - 1).done, false);
    assert.equal(replayFrame(count, timing.total).done, true);
    assert.equal(replayFrame(count, timing.total * 3).count, count);
    assert.ok(timing.total <= 32600);
  }
  assert.equal(replayFrame(3, 1000).count, 1);
  assert.equal(replayFrame(3, 1000).cursor, .5);
  assert.equal(replayFrame(3, 1000, true).cursor, 0);
});

test('temporary overview fits every visit and halo, independent of saved zoom and reader position', () => {
  const base = { ...initialView('test'), x: 500, y: -200, zoom: 8, selectedNodeId: 'chosen' };
  const before = structuredClone(base);
  for (const size of [{ width: 700, height: 720 }, { width: 320, height: 600 }]) {
    for (const progress of [0, .5, 1]) {
      const view = replayView(points, base, size, progress);
      const radius = HEAT_RADIUS * baseScale(size) * view.framing!.scale;
      for (const p of points) {
        const screen = screenWorld(sourceWorld(p.leaf.position, [0, 1], progress), view, size);
        assert.ok(screen.x - radius >= 49 && screen.x + radius <= size.width - 49);
        assert.ok(screen.y - radius >= 79 && screen.y + radius <= size.height - 79);
      }
      assert.equal(view.projection, '3d'); assert.equal(view.selectedNodeId, null);
    }
  }
  assert.deepEqual(base, before);
});
