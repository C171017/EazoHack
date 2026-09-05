import { z } from 'zod';
import { ArtifactSchema, SourceAnchorSchema, type Artifact, type RouteRun, type SourceAnchor } from '../../shared/schemas';
import { routeEnhancement, type EnhancementKind } from '../../shared/enhancements';

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

/** Exact generation count; density falloff is applied separately in 3D. */
export function heatCount(point: { events: ReadingFootprint[]; counts: Record<EnhancementKind, number> }, filter: HeatFilter) {
  return filter === 'all' ? point.events.length : point.counts[filter];
}
