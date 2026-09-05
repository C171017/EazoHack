import { z } from 'zod';
import { ArtifactSchema, SourceAnchorSchema, type Artifact, type RouteRun, type SourceAnchor } from '../../shared/schemas';
import { routeEnhancement, type EnhancementKind } from '../../shared/enhancements';
import { resolveTxtAnchor } from '../reader/source-anchor';

export const FootprintSchema = z.object({
  id: z.string().min(1), bookId: z.string().min(1), createdAt: z.string().datetime(),
  kind: z.enum(['explanation', 'diagram', 'interactive', 'illustration']),
  anchors: z.array(SourceAnchorSchema).min(1), artifacts: z.array(ArtifactSchema).min(1),
}).strict().superRefine((event, ctx) => {
  const ids = new Set(event.anchors.map(a => a.id));
  if (ids.size !== event.anchors.length
    || event.anchors.some(a => a.bookId !== event.bookId || a.resolution !== 'exact')
    || new Set(event.anchors.map(a => `${a.fileHash}:${a.extractionVersion}`)).size !== 1
    || new Set(event.artifacts.map(a => a.id)).size !== event.artifacts.length
    || new Set(event.artifacts.map(a => a.selectionId)).size !== 1
    || event.artifacts.some(a => a.bookId !== event.bookId || a.routeRunId !== event.id
      || routeEnhancement(a.kind) !== event.kind || a.anchorIds.some(id => !ids.has(id)))) {
    ctx.addIssue({ code: 'custom', message: 'Footprint does not match its generation and source.' });
  }
});
export type ReadingFootprint = z.infer<typeof FootprintSchema>;
export type HeatFilter = 'all' | EnhancementKind;
export type HeatSource = { bookId: string; sourceText: string; fileHash: string; extractionVersion: string };

/** One completed route run is one footprint, regardless of artifact count. */
export function completedFootprints(runs: RouteRun[], artifacts: Artifact[], anchors: SourceAnchor[]): ReadingFootprint[] {
  return runs.flatMap(run => {
    const kind = routeEnhancement(run.route);
    if (run.status !== 'complete' || !kind) return [];
    const outputs = artifacts.filter(a => a.routeRunId === run.id && run.artifactIds.includes(a.id));
    if (!outputs.length) return [];
    const ids = new Set(outputs.flatMap(a => a.anchorIds));
    return [FootprintSchema.parse({ id: run.id, bookId: outputs[0].bookId, kind,
      createdAt: outputs[0].createdAt, artifacts: outputs, anchors: anchors.filter(a => ids.has(a.id)) })];
  });
}

export function mergeFootprints(...groups: ReadingFootprint[][]): ReadingFootprint[] {
  return [...new Map(groups.flat().map(event => [event.id, event])).values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

export const HEAT_BIN_COUNT = 50;
export const HEAT_STEPS = [
  { min: 0, label: '0', color: '#242e3b' },
  { min: 1, label: '1', color: '#345e85' },
  { min: 2, label: '2', color: '#467ea7' },
  { min: 3, label: '3–5', color: '#619fc7' },
  { min: 6, label: '6–10', color: '#95c6e1' },
  { min: 11, label: '11+', color: '#dcf1fc' },
] as const;
export function heatColor(count: number) {
  return HEAT_STEPS.findLast(step => count >= step.min)?.color ?? HEAT_STEPS[0].color;
}
export type HeatBin = {
  index: number; start: number; end: number; events: ReadingFootprint[];
  counts: Record<EnhancementKind, number>;
};
export function heatCount(bin: HeatBin, filter: HeatFilter) {
  return filter === 'all' ? bin.events.length : bin.counts[filter];
}
export function binLabel(bin: HeatBin) {
  return `${Math.round(bin.start * 100)}–${Math.round(bin.end * 100)}% of book`;
}

/** Fixed source bins, never screen-space proximity. Multi-anchor runs get one
 * source-length-weighted midpoint; stale or unresolved source versions are excluded. */
export function readingHeat(events: ReadingFootprint[], source: HeatSource) {
  const bins: HeatBin[] = Array.from({ length: HEAT_BIN_COUNT }, (_, index) => ({
    index, start: index / HEAT_BIN_COUNT, end: (index + 1) / HEAT_BIN_COUNT,
    events: [], counts: { explanation: 0, diagram: 0, interactive: 0, illustration: 0 },
  }));
  let excluded = 0;
  for (const event of mergeFootprints(events)) {
    if (event.bookId !== source.bookId) continue;
    const ranges = event.anchors.map(a => resolveTxtAnchor(a, source));
    if (ranges.some(r => !r) || !ranges.length) { excluded++; continue; }
    let weighted = 0, length = 0;
    for (const r of ranges) if (r) {
      const span = r.endOffset - r.startOffset;
      weighted += (r.startOffset + r.endOffset) / 2 * span; length += span;
    }
    const index = Math.min(HEAT_BIN_COUNT - 1, Math.floor(weighted / length / source.sourceText.length * HEAT_BIN_COUNT));
    const bin = bins[index];
    bin.events.push(event); bin.counts[event.kind]++;
  }
  return { bins, excluded };
}
