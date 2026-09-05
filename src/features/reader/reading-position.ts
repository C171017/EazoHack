// Use the same reading line for live tracking and explicit source jumps.
export function readingLine(root: HTMLElement) {
  const rect = root.getBoundingClientRect();
  return rect.top + Math.min(150, rect.height * .24);
}

/** Read source offsets, not scroll-height percentages (which include artifacts
 * and estimated content-visibility chunks). Only inspect the current chunk. */
export function readingOffset(root: HTMLElement, content: HTMLElement, length: number) {
  if (root.scrollTop <= 0) return 0;
  if (root.scrollTop + root.clientHeight >= root.scrollHeight - 2) return length;
  const line = readingLine(root);
  const chunks = content.children;
  let low = 0, high = chunks.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (chunks[mid].getBoundingClientRect().bottom <= line) low = mid + 1;
    else high = mid;
  }
  const chunk = chunks[Math.min(low, chunks.length - 1)];
  if (!chunk) return 0;
  let position = Number((chunk as HTMLElement).dataset.txtStart);
  for (const span of chunk.querySelectorAll<HTMLElement>('[data-txt-block]')) {
    const rect = span.getBoundingClientRect();
    const start = Number(span.dataset.txtStart), end = Number(span.dataset.txtEnd);
    if (rect.top > line) return position;
    if (rect.bottom <= line) { position = end; continue; }
    const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
    const nodes: {node: Node; start: number; end: number}[] = [];
    let count = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const size = node.textContent?.length ?? 0;
      if (size) nodes.push({node, start: count, end: count + size});
      count += size;
    }
    if (!count) return start;
    const range = document.createRange();
    const at = (offset: number) => {
      const entry = nodes.find(n => offset < n.end)!;
      range.setStart(entry.node, offset - entry.start);
      range.setEnd(entry.node, offset - entry.start + 1);
      return range.getBoundingClientRect();
    };
    // Find the source line at the reading plane, including highlight splits.
    let a = 0, b = count - 1;
    while (a < b) {
      const mid = (a + b) >>> 1;
      if (at(mid).bottom <= line) a = mid + 1; else b = mid;
    }
    const first = a, glyph = at(first);
    a = first; b = count;
    while (a < b) {
      const mid = (a + b) >>> 1;
      if (at(mid).top <= glyph.top + 1) a = mid + 1; else b = mid;
    }
    const fraction = Math.max(0, Math.min(1, (line - glyph.top) / Math.max(1, glyph.height)));
    return Math.min(end, start + first + (a - first) * fraction);
  }
  return position;
}
