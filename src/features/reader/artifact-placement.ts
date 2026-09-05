import { z } from 'zod';
import type { Artifact, SourceAnchor } from '../../shared/schemas';

export const ArtifactPlacementSchema = z.preprocess(value => {
  // Discard the retired visibility flag when loading older checkpoints.
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const placement = { ...value } as Record<string, unknown>;
    delete placement.collapsed;
    return placement;
  }
  return value;
}, z.object({
  artifactId: z.string().min(1), selectionId: z.string().min(1), anchorId: z.string().min(1),
  offset: z.number().int().nonnegative(), mode: z.literal('block_after_selection'),
  order: z.number().int().nonnegative(),
}).strict());
export type ArtifactPlacement = z.infer<typeof ArtifactPlacementSchema>;

/** Legacy checkpoints acquire placements only when their original TXT anchor exists. */
export function placementsFor(artifacts: Artifact[], anchors: SourceAnchor[], saved: ArtifactPlacement[] = []): ArtifactPlacement[] {
  return artifacts.flatMap((artifact, order) => {
    const existing = saved.find(p => p.artifactId === artifact.id);
    if (existing) return [existing];
    const anchor = anchors.find(a => artifact.anchorIds.includes(a.id) && a.locators.length === 1 && a.locators[0].kind === 'txt');
    const locator = anchor?.locators[0];
    return anchor && locator?.kind === 'txt' ? [{artifactId:artifact.id, selectionId:artifact.selectionId, anchorId:anchor.id, offset:locator.endOffset, mode:'block_after_selection' as const, order}] : [];
  });
}

export function splitSourceRange(start: number, end: number, offsets: number[]) {
  const cuts = [...new Set(offsets.filter(offset => offset > start && offset <= end))].sort((a,b)=>a-b);
  if (cuts.at(-1) !== end) cuts.push(end);
  let cursor = start;
  return cuts.map(endOffset => {const range={startOffset:cursor,endOffset};cursor=endOffset;return range;});
}
