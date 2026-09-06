import type { Extraction, Passage, TextChunk } from './contracts';

// This is text segmentation, not PDF extraction. UTF-16 positions match the reader.
export function prepareText(text: string, maxChunkCharacters = 36_000): TextChunk[] {
  if (!text.trim()) throw new Error('Text input is empty.');
  if (maxChunkCharacters < 2400) throw new Error('Chunk size must be at least 2400 characters.');
  const passages: Passage[] = [];
  // Uploaded essays, stories and PDFs need not contain our sample-book headings.
  // Absence of a recognized heading says nothing about a passage's source role.
  let section = 'Source text', role: Passage['role'] = 'unknown';
  for (const match of text.matchAll(/\S(?:[\s\S]*?\S)?(?=\n\s*\n|\s*$)/g)) {
    const block = match[0];
    if (/^INTRODUCTION AND ANALYSIS\.\s*$/.test(block)) { section = 'Introduction and analysis'; role = 'commentary'; }
    else if (/^PREFACE\.\s*$/.test(block)) { section = 'Preface'; role = 'commentary'; }
    else if (/^BOOK [IVX]+\.?\s*$/.test(block)) { section = block.trim().replace(/\.$/, ''); role = 'dialogue'; }
    else if (/^第[一二三四五六七八九十百零〇两0-9]+回(?:[\s　]|$)/.test(block) && !block.includes('\n')) { section = block.trim(); role = 'narrative'; }
    else if (/^INDEX\.\s*$/.test(block)) { section = 'Index and editorial apparatus'; role = 'paratext'; }
    // Keep every substantive character, including unusually long paragraphs.
    for (let offset = 0; offset < block.length;) {
      let end = Math.min(block.length, offset + 2200);
      if (end < block.length) {
        const boundary = block.lastIndexOf(' ', end);
        if (boundary > offset + 1000) end = boundary + 1;
        if (/[\uD800-\uDBFF]/.test(block[end - 1])) end--;
      }
      const start = match.index + offset;
      passages.push({ id: `p-${start}`, start, end: match.index + end, text: block.slice(offset, end), section, role });
      offset = end;
    }
  }
  const groups: Passage[][] = [];
  for (const passage of passages) {
    const last = groups.at(-1);
    if (!last || last[0].section !== passage.section || passage.end - last[0].start > maxChunkCharacters) groups.push([passage]);
    else last.push(passage);
  }
  return groups.map((core, index) => ({
    id: `chunk-${String(index + 1).padStart(3, '0')}`,
    start: index === 0 ? 0 : core[0].start,
    end: groups[index + 1]?.[0].start ?? text.length,
    passages: core,
    context: [...(groups[index - 1]?.slice(-2) ?? []), ...(groups[index + 1]?.slice(0, 2) ?? [])],
    section: core[0].section,
  }));
}

export function validateExtraction(value: Extraction, chunk: TextChunk) {
  const allowed = new Set([...chunk.passages, ...chunk.context].map(p => p.id));
  const core = new Set(chunk.passages.map(p => p.id));
  for (const node of value.nodes) {
    if (!core.has(node.passageIds[0])) throw new Error('First node passage must belong to the core chunk.');
    if (new Set(node.passageIds).size !== node.passageIds.length || node.passageIds.some(id => !allowed.has(id))) throw new Error('Node has duplicate or unknown passages.');
  }
  for (const edge of value.edges) {
    if (!value.nodes[edge.sourceIndex] || !value.nodes[edge.targetIndex] || edge.sourceIndex === edge.targetIndex) throw new Error('Invalid local edge endpoints.');
    if (edge.passageIds.some(id => !allowed.has(id))) throw new Error('Edge cites unknown passage.');
  }
  return value;
}
