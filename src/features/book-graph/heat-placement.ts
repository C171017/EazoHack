import { z } from 'zod';
import type { Graph } from '../../shared/schemas';
import type { EnhancementKind } from '../../shared/enhancements';
import { resolveTxtAnchor } from '../reader/source-anchor';
import { mergeFootprints, type HeatSource, type ReadingFootprint } from './reading-heat';

const RangeSchema = z.object({ start: z.number().int().nonnegative(), end: z.number().int().positive() })
  .refine(r => r.end > r.start);
export const HeatLeafSchema = z.object({
  id: z.string(), label: z.string(),
  position: z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().min(0).max(1) }).nullable(),
  ranges: z.array(RangeSchema).min(1),
});
export type HeatLeaf = z.infer<typeof HeatLeafSchema>;
export const HeatIndexPageSchema = z.object({
  version: z.string(), bookId: z.string(), fileHash: z.string(), extractionVersion: z.string(),
  sourceLength: z.number().int().positive(), offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(), leaves: z.array(HeatLeafSchema).max(512),
});
export type HeatIndex = Pick<z.infer<typeof HeatIndexPageSchema>, 'bookId' | 'fileHash' | 'extractionVersion' | 'sourceLength' | 'leaves'>;
export type SourceRange = z.infer<typeof RangeSchema>;
export type HeatPoint = {
  leaf: HeatLeaf & { position: NonNullable<HeatLeaf['position']> };
  events: ReadingFootprint[]; counts: Record<EnhancementKind, number>; nearest: number;
};

/** Compact metadata only: no summaries, artifacts, relations, or source quotes. */
export function heatSourceIndex(graph: Graph): HeatIndex {
  const anchors = new Map(graph.anchors.map(a => [a.id, a]));
  const leaves: HeatLeaf[] = graph.nodes.flatMap(node => {
    const ranges = node.anchorIds.flatMap(id => {
      const anchor = anchors.get(id);
      if (!anchor || anchor.resolution !== 'exact' || anchor.fileHash !== graph.fileHash
        || anchor.extractionVersion !== graph.extractionVersion || anchor.bookId !== graph.bookId) return [];
      return anchor.locators.flatMap(r => r.kind === 'txt' ? [{ start: r.startOffset, end: r.endOffset }] : []);
    });
    const { x, y, z } = node.position;
    return ranges.length ? [{ id: node.id, label: node.label, ranges: unionRanges(ranges),
      position: x === null || y === null || z === null ? null : { x, y, z } }] : [];
  });
  return { bookId: graph.bookId, fileHash: graph.fileHash, extractionVersion: graph.extractionVersion, sourceLength: graph.sourceLength,
    leaves: leaves.sort((a, b) => a.ranges[0].start - b.ranges[0].start || a.id.localeCompare(b.id)) };
}

export function unionRanges(ranges: SourceRange[]): SourceRange[] {
  const result: SourceRange[] = [];
  for (const range of [...ranges].sort((a, b) => a.start - b.start || a.end - b.end)) {
    const previous = result.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else result.push({ ...range });
  }
  return result;
}

/** Rank by overlap, then text gap, then midpoint distance, then stable ID.
 * Never choose by screen distance, theme identity, cluster position, or camera. */
export function nearestHeatLeaf(ranges: SourceRange[], leaves: HeatLeaf[]) {
  let best: { leaf: HeatLeaf; overlap: number; gap: number; midpoint: number } | null = null;
  for (const leaf of leaves) {
    let overlap = 0, gap = Infinity, midpoint = Infinity;
    for (const a of ranges) for (const b of leaf.ranges) {
      overlap += Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
      gap = Math.min(gap, Math.max(0, a.start - b.end, b.start - a.end));
      midpoint = Math.min(midpoint, Math.abs(a.start + a.end - b.start - b.end));
    }
    if (!best || overlap > best.overlap || (overlap === best.overlap && (gap < best.gap
      || (gap === best.gap && (midpoint < best.midpoint || (midpoint === best.midpoint && leaf.id < best.leaf.id)))))) {
      best = { leaf, overlap, gap, midpoint };
    }
  }
  return best;
}

export function placeFootprints(events: ReadingFootprint[], source: HeatSource, index: HeatIndex | null) {
  const groups = new Map<string, HeatPoint>(), matches = new Map<string, ReturnType<typeof nearestHeatLeaf>>();
  let excluded = 0, unmapped = 0;
  const compatible = index && index.bookId === source.bookId && index.fileHash === source.fileHash
    && index.extractionVersion === source.extractionVersion && index.sourceLength === source.sourceText.length;
  for (const event of mergeFootprints(events)) {
    if (event.bookId !== source.bookId) continue;
    const resolved = event.anchors.map(anchor => resolveTxtAnchor(anchor, source));
    if (!resolved.length || resolved.some(r => !r)) { excluded++; continue; }
    if (!compatible) { unmapped++; continue; }
    const ranges = unionRanges(resolved.flatMap(r => r ? [{ start: r.startOffset, end: r.endOffset }] : []));
    const key = JSON.stringify(ranges);
    if (!matches.has(key)) matches.set(key, nearestHeatLeaf(ranges, index.leaves));
    const match = matches.get(key);
    // An unplaced nearest leaf remains unplaced; do not silently jump to a less relevant note.
    if (!match?.leaf.position) { unmapped++; continue; }
    let group = groups.get(match.leaf.id);
    if (!group) {
      group = { leaf: { ...match.leaf, position: match.leaf.position }, events: [],
        counts: { explanation: 0, diagram: 0, interactive: 0, illustration: 0 }, nearest: 0 };
      groups.set(match.leaf.id, group);
    }
    group.events.push(event); group.counts[event.kind]++;
    if (!match.overlap) group.nearest++;
  }
  return { points: [...groups.values()].sort((a, b) => a.leaf.position.z - b.leaf.position.z || a.leaf.id.localeCompare(b.leaf.id)), excluded, unmapped };
}
