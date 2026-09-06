type Point = { x: number; y: number };
export type ReplayCurve = { path: string; length: number; stops: number[] };
const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const knot = (a: Point, b: Point, c: Point): Point => ({ x: (a.x + 4 * b.x + c.x) / 6, y: (a.y + 4 * b.y + c.y) / 6 });

/** A C2-continuous approximating B-spline, rendered as exact cubic Beziers.
 * The bowed intermediate controls also soften two-point paths and reversals.
 * Consecutive coincident visits share a location, without a pause or marker.
 */
export function replayCurve(points: Point[]): ReplayCurve {
  const distinct: Point[] = [], indices: number[] = [];
  for (const p of points) {
    const last = distinct.at(-1);
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > .01) distinct.push(p);
    indices.push(distinct.length - 1);
  }
  if (distinct.length < 2) return { path: '', length: 0, stops: points.map(() => 0) };
  const controls = [distinct[0], distinct[0], distinct[0]];
  for (let i = 1; i < distinct.length; i++) {
    const a = distinct[i - 1], b = distinct[i], d = Math.hypot(b.x - a.x, b.y - a.y);
    const bow = Math.min(24, d * .16), middle = mix(a, b, .5);
    controls.push({ x: middle.x - (b.y - a.y) / d * bow, y: middle.y + (b.x - a.x) / d * bow }, b);
  }
  controls.push(distinct.at(-1)!, distinct.at(-1)!);
  let path = `M ${distinct[0].x} ${distinct[0].y}`, length = 0;
  const distances = [0];
  for (let i = 0; i < controls.length - 3; i++) {
    const [a, b, c, d] = controls.slice(i, i + 4);
    const start = knot(a, b, c), c1 = mix(b, c, 1 / 3), c2 = mix(b, c, 2 / 3), end = knot(b, c, d);
    path += ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`;
    // Measure once, outside the RAF. Canvas dashing reveals actual arc length,
    // so speed does not depend on Bezier parameters or distances between stops.
    const polygon = Math.hypot(c1.x - start.x, c1.y - start.y) + Math.hypot(c2.x - c1.x, c2.y - c1.y) + Math.hypot(end.x - c2.x, end.y - c2.y);
    const steps = Math.min(256, Math.max(16, Math.ceil(polygon / 2)));
    let previous = start;
    for (let j = 1; j <= steps; j++) {
      const t = j / steps;
      const p = mix(mix(mix(start, c1, t), mix(c1, c2, t), t), mix(mix(c1, c2, t), mix(c2, end, t), t), t);
      length += Math.hypot(p.x - previous.x, p.y - previous.y); previous = p;
    }
    if (i > 0 && i % 2 === 0) distances[i / 2] = length;
  }
  distances[distinct.length - 1] = length;
  return { path, length, stops: indices.map(i => distances[i]) };
}

/** Brief, smooth launch and landing; constant distance per second in between. */
export function replayProgress(value: number): number {
  const t = Math.max(0, Math.min(1, value)), ramp = .12;
  const integral = (x: number) => x * x * x - .5 * x * x * x * x;
  if (t < ramp) return ramp * integral(t / ramp) / (1 - ramp);
  if (t > 1 - ramp) return 1 - ramp * integral((1 - t) / ramp) / (1 - ramp);
  return (t - ramp / 2) / (1 - ramp);
}
