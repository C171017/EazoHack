const segmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, { granularity: 'word' })
  : null;

/** Expand only the two boundary words, preserving exact UTF-16 source offsets. */
export function snapSelectionToWords(text: string, startOffset: number, endOffset: number) {
  if (startOffset < 0 || endOffset > text.length || endOffset <= startOffset) return null;
  while (startOffset < endOffset && /\s/u.test(text[startOffset])) startOffset++;
  while (endOffset > startOffset && /\s/u.test(text[endOffset - 1])) endOffset--;
  if (startOffset === endOffset) return null;

  function wordAt(offset: number) {
    // Segment a local whitespace-delimited run, never the entire book. This
    // also gives unspaced languages their native word boundaries.
    let from = offset, to = offset + 1;
    while (from > 0 && !/\s/u.test(text[from - 1])) from--;
    while (to < text.length && !/\s/u.test(text[to])) to++;
    const run = text.slice(from, to);
    if (segmenter) {
      const part = segmenter.segment(run).containing(offset - from);
      if (part?.isWordLike) return { start: from + part.index, end: from + part.index + part.segment.length };
    } else {
      for (const match of run.matchAll(/[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu)) {
        const start = from + match.index, end = start + match[0].length;
        if (start <= offset && offset < end) return { start, end };
      }
    }
    return null;
  }

  const first = wordAt(startOffset), last = wordAt(endOffset - 1);
  return { startOffset: first?.start ?? startOffset, endOffset: last?.end ?? endOffset };
}
