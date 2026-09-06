type Point = { x: number; y: number; z?: number };
type Segment = { start: Point; c1: Point; c2: Point; end: Point; samples: { t: number; distance: number }[] };
export type ReplayCurve = { path: string; length: number; stops: number[]; segments: Segment[] };
const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * t });
const knot = (a: Point, b: Point, c: Point): Point => ({ x: (a.x + 4 * b.x + c.x) / 6, y: (a.y + 4 * b.y + c.y) / 6, z: ((a.z ?? 0) + 4 * (b.z ?? 0) + (c.z ?? 0)) / 6 });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

/** A C2-continuous approximating B-spline, rendered as exact cubic Beziers.
 * The bowed intermediate controls also soften two-point paths and reversals.
 * Consecutive coincident visits share a location, without a pause or marker.
 */
export function replayCurve(points: Point[]): ReplayCurve {
  const distinct: Point[] = [], indices: number[] = [];
  for (const p of points) {
    const last = distinct.at(-1);
    if (!last || distance(p, last) > .01) distinct.push(p);
    indices.push(distinct.length - 1);
  }
  if (distinct.length < 2) return { path: '', length: 0, stops: points.map(() => 0), segments: [] };
  const controls = [distinct[0], distinct[0], distinct[0]];
  for (let i = 1; i < distinct.length; i++) {
    const a = distinct[i - 1], b = distinct[i], d = distance(a, b);
    const bow = Math.min(24, d * .16), middle = mix(a, b, .5);
    const horizontal = Math.hypot(b.x - a.x, b.y - a.y);
    controls.push({ ...middle, x: middle.x + (horizontal > .01 ? -(b.y - a.y) / horizontal : 1) * bow,
      y: middle.y + (horizontal > .01 ? (b.x - a.x) / horizontal : 0) * bow }, b);
  }
  controls.push(distinct.at(-1)!, distinct.at(-1)!);
  let path = `M ${distinct[0].x} ${distinct[0].y}`, length = 0;
  const distances = [0], segments: Segment[] = [];
  for (let i = 0; i < controls.length - 3; i++) {
    const [a, b, c, d] = controls.slice(i, i + 4);
    const start = knot(a, b, c), c1 = mix(b, c, 1 / 3), c2 = mix(b, c, 2 / 3), end = knot(b, c, d);
    path += ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`;
    // Measure once in world space, outside the RAF. Camera changes cannot
    // change playback speed, arrival times, or the revealed curve endpoint.
    const polygon = distance(c1, start) + distance(c2, c1) + distance(end, c2);
    const steps = Math.min(256, Math.max(16, Math.ceil(polygon / 2)));
    let previous = start;
    const samples = [{ t: 0, distance: length }];
    for (let j = 1; j <= steps; j++) {
      const t = j / steps;
      const p = mix(mix(mix(start, c1, t), mix(c1, c2, t), t), mix(mix(c1, c2, t), mix(c2, end, t), t), t);
      length += distance(p, previous); previous = p;
      samples.push({ t, distance: length });
    }
    segments.push({ start, c1, c2, end, samples });
    if (i > 0 && i % 2 === 0) distances[i / 2] = length;
  }
  distances[distinct.length - 1] = length;
  return { path, length, stops: indices.map(i => distances[i]), segments };
}

/** Brief, smooth launch and landing; constant distance per second in between. */
export function replayProgress(value: number): number {
  const t = Math.max(0, Math.min(1, value)), ramp = .12;
  const integral = (x: number) => x * x * x - .5 * x * x * x * x;
  if (t < ramp) return ramp * integral(t / ramp) / (1 - ramp);
  if (t > 1 - ramp) return 1 - ramp * integral((1 - t) / ramp) / (1 - ramp);
  return (t - ramp / 2) / (1 - ramp);
}

/** Reveal in world distance, then project the same geometry through the live camera. */
export function projectReplayCurve(curve: ReplayCurve, distance: number, screen: (p: { x: number; y: number; z: number }) => Point): string {
  const project = (p: Point) => screen({ ...p, z: p.z ?? 0 });
  let path = '';
  for (const segment of curve.segments) {
    const { start, c1, c2, end, samples } = segment;
    if (distance <= samples[0].distance) break;
    if (!path) { const p = project(start); path = `M ${p.x} ${p.y}`; }
    let t = 1;
    if (distance < samples.at(-1)!.distance) {
      const index = samples.findIndex(s => s.distance >= distance);
      const a = samples[index - 1], b = samples[index];
      t = a.t + (b.t - a.t) * (distance - a.distance) / Math.max(Number.EPSILON, b.distance - a.distance);
    }
    const a = mix(start, c1, t), b = mix(c1, c2, t), c = mix(c2, end, t);
    const d = mix(a, b, t), e = mix(b, c, t);
    const p1 = project(a), p2 = project(d), p3 = project(mix(d, e, t));
    path += ` C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`;
    if (t < 1) break;
  }
  return path;
}
