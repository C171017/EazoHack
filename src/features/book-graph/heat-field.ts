import { sourceWorld, type Point3 } from './projection';
import { heatCount, type HeatFilter } from './reading-heat';
import type { HeatPoint } from './heat-placement';

export const HEAT_SIGMA = 32;
export const HEAT_RADIUS = HEAT_SIGMA * 3;
export const HEAT_MAX = 12;
export const HEAT_GRID = [64, 48, 96] as const;
export const HEAT_COLORS = [
  { value: 1, label: '1', rgb: [38, 189, 91] },
  { value: 4, label: '4', rgb: [255, 224, 65] },
  { value: 8, label: '8', rgb: [255, 137, 43] },
  { value: 12, label: '12+', rgb: [239, 53, 53] },
] as const;
export type HeatSeed = { position: Point3; weight: number };
export type HeatVolume = { data: Uint8Array; min: Point3; max: Point3; dimensions: typeof HEAT_GRID; seeds: HeatSeed[] };
const tail = Math.exp(-4.5);

/** Truncated, smoothly vanishing 3D Gaussian; peak of one generation is one. */
export function heatKernel(distanceSquared: number) {
  return distanceSquared >= HEAT_RADIUS ** 2 ? 0 : (Math.exp(-distanceSquared / (2 * HEAT_SIGMA ** 2)) - tail) / (1 - tail);
}
export function fieldDensity(point: Point3, seeds: HeatSeed[]) {
  return seeds.reduce((sum, seed) => sum + seed.weight * heatKernel(
    (point.x - seed.position.x) ** 2 + (point.y - seed.position.y) ** 2 + (point.z - seed.position.z) ** 2), 0);
}
export function heatRgb(value: number): number[] {
  if (value <= 1) return [...HEAT_COLORS[0].rgb];
  for (let i = 1; i < HEAT_COLORS.length; i++) {
    const a = HEAT_COLORS[i - 1], b = HEAT_COLORS[i];
    if (value <= b.value) {
      const t = (value - a.value) / (b.value - a.value);
      return a.rgb.map((v, j) => Math.round(v + (b.rgb[j] - v) * t));
    }
  }
  return [...HEAT_COLORS.at(-1)!.rgb];
}

/** Rebuild only when activity/filter changes. Bounded grid, and each seed touches
 * only its local sphere. Reading/rotation affect the camera, never this density. */
export function buildHeatVolume(points: HeatPoint[], filter: HeatFilter): HeatVolume | null {
  const seeds = points.flatMap(point => {
    const weight = heatCount(point, filter);
    return weight ? [{ weight, position: sourceWorld(point.leaf.position, [0, 1], 0) }] : [];
  });
  if (!seeds.length) return null;
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const seed of seeds) for (const axis of ['x', 'y', 'z'] as const) {
    min[axis] = Math.min(min[axis], seed.position[axis] - HEAT_RADIUS);
    max[axis] = Math.max(max[axis], seed.position[axis] + HEAT_RADIUS);
  }
  const [nx, ny, nz] = HEAT_GRID, step = { x: (max.x - min.x) / nx, y: (max.y - min.y) / ny, z: (max.z - min.z) / nz };
  const values = new Float32Array(nx * ny * nz);
  for (const { position: p, weight } of seeds) {
    const x0 = Math.max(0, Math.floor((p.x - HEAT_RADIUS - min.x) / step.x)), x1 = Math.min(nx - 1, Math.ceil((p.x + HEAT_RADIUS - min.x) / step.x));
    const y0 = Math.max(0, Math.floor((p.y - HEAT_RADIUS - min.y) / step.y)), y1 = Math.min(ny - 1, Math.ceil((p.y + HEAT_RADIUS - min.y) / step.y));
    const z0 = Math.max(0, Math.floor((p.z - HEAT_RADIUS - min.z) / step.z)), z1 = Math.min(nz - 1, Math.ceil((p.z + HEAT_RADIUS - min.z) / step.z));
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d2 = (min.x + (x + .5) * step.x - p.x) ** 2 + (min.y + (y + .5) * step.y - p.y) ** 2 + (min.z + (z + .5) * step.z - p.z) ** 2;
      values[(z * ny + y) * nx + x] += weight * heatKernel(d2);
    }
  }
  const data = Uint8Array.from(values, value => Math.round(Math.min(1, value / HEAT_MAX) * 255));
  return { data, min, max, dimensions: HEAT_GRID, seeds };
}
