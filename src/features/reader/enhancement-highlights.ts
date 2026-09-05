import { ENHANCEMENT_ORDER, type EnhancementKind } from '../../shared/enhancements';

export type EnhancementHighlight = { startOffset: number; endOffset: number; kind: EnhancementKind };
type Range = { startOffset: number; endOffset: number };

/** Partition without inserting text or changing canonical source offsets. */
export function highlightSegments(start: number, end: number, highlights: EnhancementHighlight[], active: Range | null) {
  const overlaps = (range: Range) => range.startOffset < end && range.endOffset > start;
  const matching = highlights.filter(overlaps);
  const ranges: Range[] = [...matching, ...(active && overlaps(active) ? [active] : [])];
  const cuts = [...new Set([start, end, ...ranges.flatMap(r => [Math.max(start, r.startOffset), Math.min(end, r.endOffset)])])].sort((a,b) => a-b);
  return cuts.slice(0,-1).map((startOffset,i) => ({
    startOffset, endOffset: cuts[i+1],
    kinds: ENHANCEMENT_ORDER.filter(kind => matching.some(r => r.kind === kind && r.startOffset <= startOffset && r.endOffset >= cuts[i+1])),
    active: !!active && active.startOffset <= startOffset && active.endOffset >= cuts[i+1],
  }));
}
