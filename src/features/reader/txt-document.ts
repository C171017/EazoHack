export const TXT_RENDER_CHUNK_TARGET = 16_000;

export type TxtBlock = {
  id: string;
  startOffset: number;
  endOffset: number;
  continuation: boolean;
};

export type TxtRenderChunk = {
  id: string;
  startOffset: number;
  endOffset: number;
  blocks: TxtBlock[];
};

function paragraphBlocks(text: string, targetSize: number): TxtBlock[] {
  const blocks: TxtBlock[] = [];
  let start = 0;
  const separator = /\n{2,}/g;

  function addBlock(blockStart: number, blockEnd: number) {
    let cursor = blockStart;
    let continuation = false;
    while (blockEnd - cursor > targetSize * 2) {
      const preferredEnd = cursor + targetSize;
      const newline = text.lastIndexOf('\n', preferredEnd);
      const split = newline > cursor ? newline + 1 : preferredEnd;
      blocks.push({
        id: `txt-block-${cursor}`,
        startOffset: cursor,
        endOffset: split,
        continuation,
      });
      cursor = split;
      continuation = true;
    }
    if (cursor < blockEnd) {
      blocks.push({
        id: `txt-block-${cursor}`,
        startOffset: cursor,
        endOffset: blockEnd,
        continuation,
      });
    }
  }

  for (const match of text.matchAll(separator)) {
    const end = (match.index ?? start) + match[0].length;
    addBlock(start, end);
    start = end;
  }
  if (start < text.length) addBlock(start, text.length);
  return blocks;
}

/**
 * Groups exact source ranges into moderate render islands. Every character is
 * covered exactly once; blank lines remain part of the preceding text block.
 */
export function createTxtRenderChunks(
  text: string,
  targetSize = TXT_RENDER_CHUNK_TARGET,
): TxtRenderChunk[] {
  if (!text.length) return [];
  if (!Number.isSafeInteger(targetSize) || targetSize < 1_000) {
    throw new Error('TXT render chunk target must be an integer of at least 1,000 characters.');
  }

  const chunks: TxtRenderChunk[] = [];
  let current: TxtBlock[] = [];
  let currentSize = 0;

  const flush = () => {
    if (!current.length) return;
    const startOffset = current[0].startOffset;
    const endOffset = current[current.length - 1].endOffset;
    chunks.push({
      id: `txt-chunk-${startOffset}`,
      startOffset,
      endOffset,
      blocks: current,
    });
    current = [];
    currentSize = 0;
  };

  for (const block of paragraphBlocks(text, targetSize)) {
    const size = block.endOffset - block.startOffset;
    if (current.length && currentSize + size > targetSize) flush();
    current.push(block);
    currentSize += size;
  }
  flush();
  return chunks;
}

export function findTxtChunkIndex(chunks: TxtRenderChunk[], offset: number): number {
  if (!chunks.length) return -1;
  const bounded = Math.max(chunks[0].startOffset, Math.min(offset, chunks[chunks.length - 1].endOffset - 1));
  let low = 0;
  let high = chunks.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const chunk = chunks[middle];
    if (bounded < chunk.startOffset) high = middle - 1;
    else if (bounded >= chunk.endOffset) low = middle + 1;
    else return middle;
  }
  return Math.max(0, Math.min(low, chunks.length - 1));
}

export function findTxtBlock(chunks: TxtRenderChunk[], offset: number): TxtBlock | null {
  const chunkIndex = findTxtChunkIndex(chunks, offset);
  if (chunkIndex < 0) return null;
  const chunk = chunks[chunkIndex];
  const bounded = Math.max(chunk.startOffset, Math.min(offset, chunk.endOffset - 1));
  let low = 0;
  let high = chunk.blocks.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const block = chunk.blocks[middle];
    if (bounded < block.startOffset) high = middle - 1;
    else if (bounded >= block.endOffset) low = middle + 1;
    else return block;
  }
  return chunk.blocks[Math.max(0, Math.min(low, chunk.blocks.length - 1))] ?? null;
}
