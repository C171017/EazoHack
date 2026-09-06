import assert from 'node:assert/strict';
import { test } from 'node:test';
import { replayCurve, replayProgress } from '../src/features/book-graph/replay-curve';

test('curves remain continuous through corners, reversals and repeated visits', () => {
  for (const points of [
    [{ x: 0, y: 0 }, { x: 300, y: 0 }],
    [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 0, y: 0 }],
    [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }],
  ]) {
    const curve = replayCurve(points);
    assert.ok(curve.length > 0);
    assert.equal(curve.stops[0], 0);
    assert.equal(curve.stops.at(-1), curve.length);
    assert.ok(curve.stops.every((d, i) => Number.isFinite(d) && (!i || d >= curve.stops[i - 1])));
    const values = curve.path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!.map(Number);
    let start = values.slice(0, 2), previous: number[] | undefined;
    for (let i = 2; i < values.length; i += 6) {
      const segment = values.slice(i, i + 6);
      if (previous) for (let axis = 0; axis < 2; axis++) {
        assert.ok(Math.abs((segment[axis] - start[axis]) - (previous[axis + 4] - previous[axis + 2])) < 1e-8, 'continuous tangent');
        assert.ok(Math.abs((segment[axis + 2] - 2 * segment[axis] + start[axis]) - (previous[axis + 4] - 2 * previous[axis + 2] + previous[axis])) < 1e-8, 'continuous curvature parameter');
      }
      previous = segment; start = segment.slice(4);
    }
    assert.deepEqual(start, [points.at(-1)!.x, points.at(-1)!.y]);
  }
  assert.equal(replayCurve([{ x: 1, y: 1 }, { x: 1, y: 1 }]).path, '');
  assert.equal(replayCurve([]).length, 0);
});

test('distance playback has gentle endpoints and constant cruising speed', () => {
  assert.equal(replayProgress(0), 0); assert.equal(replayProgress(1), 1);
  let last = 0;
  for (let i = 1; i <= 1000; i++) {
    const current = replayProgress(i / 1000);
    assert.ok(current >= last && current <= 1); last = current;
  }
  const speed = (t: number) => (replayProgress(t + .00001) - replayProgress(t - .00001)) / .00002;
  assert.ok(speed(0) < .00001 && speed(1) < .00001);
  assert.ok(Math.abs(speed(.25) - speed(.75)) < 1e-8);
  for (const t of [.12, .88]) assert.ok(Math.abs(speed(t - .0001) - speed(t + .0001)) < .00001);
});
