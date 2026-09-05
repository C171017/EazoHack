'use client';

import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { resolveTxtAnchor } from './source-anchor';
import type { SourceAnchor } from '@/shared/schemas';
import { createTxtRenderChunks, findTxtBlock, type TxtRenderChunk } from './txt-document';

export type TxtSelectionRange = {
  startOffset: number;
  endOffset: number;
  quote: string;
  prefix: string;
  suffix: string;
};

export type ContinuousTxtReaderHandle = {
  getReadingPosition(): number;
  scrollToOffset(offset: number, behavior?: ScrollBehavior): void;
};

type HighlightRange = { startOffset: number; endOffset: number } | null;

const TxtChunk = memo(function TxtChunk({
  chunk,
  sourceText,
  highlight,
}: {
  chunk: TxtRenderChunk;
  sourceText: string;
  highlight: HighlightRange;
}) {
  return <section
    id={chunk.id}
    className="txt-render-chunk"
    style={highlight ? { contentVisibility: 'visible' } : undefined}
    data-txt-chunk
    data-txt-start={chunk.startOffset}
    data-txt-end={chunk.endOffset}
  >
    {chunk.blocks.map(block => {
      const text = sourceText.slice(block.startOffset, block.endOffset);
      const from = highlight ? Math.max(0, highlight.startOffset - block.startOffset) : 0;
      const to = highlight ? Math.min(text.length, highlight.endOffset - block.startOffset) : 0;
      return <span
        id={block.id}
        key={block.id}
        className={block.continuation ? 'txt-source-block txt-source-block-continuation' : 'txt-source-block'}
        data-txt-block
        data-txt-start={block.startOffset}
        data-txt-end={block.endOffset}
      >
        {highlight && to > from
          ? <>{text.slice(0, from)}<mark className="rounded-sm bg-highlight text-ink">{text.slice(from, to)}</mark>{text.slice(to)}</>
          : text}
      </span>;
    })}
  </section>;
});

function closestSourceBlock(node: Node): HTMLElement | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  return element?.closest<HTMLElement>('[data-txt-block]') ?? null;
}

function boundaryOffset(node: Node, offset: number, edge: 'start' | 'end', root: HTMLElement): number | null {
  const directBlock = closestSourceBlock(node);
  if (directBlock && root.contains(directBlock)) {
    const local = document.createRange();
    local.selectNodeContents(directBlock);
    try {
      local.setEnd(node, offset);
    } catch {
      return null;
    }
    return Number(directBlock.dataset.txtStart) + local.toString().length;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const element = node as Element;
  const childIndex = edge === 'start'
    ? Math.min(offset, element.childNodes.length - 1)
    : Math.max(0, Math.min(offset - 1, element.childNodes.length - 1));
  const child = element.childNodes[childIndex];
  if (!child) return null;
  const block = closestSourceBlock(child)
    ?? (child.nodeType === Node.ELEMENT_NODE
      ? (child as Element).querySelector<HTMLElement>('[data-txt-block]')
      : null);
  if (!block || !root.contains(block)) return null;
  return Number(edge === 'start' ? block.dataset.txtStart : block.dataset.txtEnd);
}

const ContinuousTxtReaderInner = forwardRef<ContinuousTxtReaderHandle, {
  sourceText: string;
  fileHash: string;
  extractionVersion: string;
  activeAnchor: SourceAnchor | null;
  onSelection: (selection: TxtSelectionRange) => void;
}>(function ContinuousTxtReader({ sourceText, fileHash, extractionVersion, activeAnchor, onSelection }, ref) {
  const chunks = useMemo(() => createTxtRenderChunks(sourceText), [sourceText]);
  const scroller = useRef<HTMLDivElement>(null);
  const documentRoot = useRef<HTMLDivElement>(null);
  const currentChunkRef = useRef(0);
  const alignmentFrame = useRef<number | null>(null);
  const [currentChunk, setCurrentChunk] = useState(0);

  const highlight = resolveTxtAnchor(activeAnchor, { sourceText, fileHash, extractionVersion });

  useEffect(() => {
    const root = scroller.current;
    const content = documentRoot.current;
    if (!root || !content || !chunks.length || typeof IntersectionObserver === 'undefined') return;
    const visible = new Map<Element, IntersectionObserverEntry>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.set(entry.target, entry);
        else visible.delete(entry.target);
      }
      if (!visible.size) return;
      const rootTop = root.getBoundingClientRect().top + 72;
      const ordered = [...visible.values()].sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      const entry = ordered.filter(candidate => candidate.boundingClientRect.top <= rootTop).at(-1) ?? ordered[0];
      const next = Number((entry.target as HTMLElement).dataset.txtChunkIndex);
      if (Number.isInteger(next) && next !== currentChunkRef.current) {
        currentChunkRef.current = next;
        setCurrentChunk(next);
      }
    }, { root, rootMargin: '-56px 0px -60% 0px' });
    content.querySelectorAll('[data-txt-chunk]').forEach((element, index) => {
      (element as HTMLElement).dataset.txtChunkIndex = String(index);
      observer.observe(element);
    });
    return () => observer.disconnect();
  }, [chunks]);

  useEffect(() => () => {
    if (alignmentFrame.current !== null) cancelAnimationFrame(alignmentFrame.current);
  }, []);

  useImperativeHandle(ref, () => ({
    getReadingPosition() {
      const root = scroller.current;
      const chunk = chunks[currentChunkRef.current] ?? chunks[0];
      if (!root || !chunk) return 0;
      const line = root.getBoundingClientRect().top + 88;
      const chunkElement = document.getElementById(chunk.id);
      let position = chunk.startOffset;
      for (const element of chunkElement?.querySelectorAll<HTMLElement>('[data-txt-block]') ?? []) {
        if (element.getBoundingClientRect().top > line) break;
        position = Number(element.dataset.txtStart);
      }
      return position;
    },
    scrollToOffset(offset, behavior = 'auto') {
      const root = scroller.current;
      const block = findTxtBlock(chunks, offset);
      const element = block ? document.getElementById(block.id) : null;
      if (!root || !element) return;
      if (alignmentFrame.current !== null) cancelAnimationFrame(alignmentFrame.current);
      let attempt = 0;
      let stableFrames = 0;
      const align = () => {
        const rootRect = root.getBoundingClientRect();
        // A passage can begin well inside a long paragraph, including after a
        // mark split. Align its text position rather than the paragraph's top.
        let targetRect = element.getBoundingClientRect();
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let remaining = Math.max(0, offset - block!.startOffset);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const length = node.textContent?.length ?? 0;
          if (remaining < length) {
            const range = document.createRange();
            range.setStart(node, remaining);
            range.setEnd(node, remaining + 1);
            const rect = range.getClientRects()[0];
            if (rect) targetRect = rect;
            break;
          }
          remaining -= length;
        }
        const targetTop = rootRect.top + Math.min(150, rootRect.height * 0.24);
        const delta = targetRect.top - targetTop;
        if (Math.abs(delta) > 2) {
          stableFrames = 0;
          root.scrollBy({
            top: delta,
            behavior: attempt === 0 && Math.abs(delta) < root.clientHeight * 2 ? behavior : 'auto',
          });
        } else stableFrames += 1;
        attempt += 1;
        if (attempt < 90 && stableFrames < 4) alignmentFrame.current = requestAnimationFrame(align);
        else alignmentFrame.current = null;
      };
      align();
    },
  }), [chunks]);

  function captureSelection() {
    const selection = window.getSelection();
    const root = documentRoot.current;
    if (!root || !selection?.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
    const startOffset = boundaryOffset(range.startContainer, range.startOffset, 'start', root);
    const endOffset = boundaryOffset(range.endContainer, range.endOffset, 'end', root);
    if (startOffset === null || endOffset === null || endOffset <= startOffset) return;
    const quote = sourceText.slice(startOffset, endOffset);
    if (!quote.trim()) return;
    onSelection({
      startOffset,
      endOffset,
      quote,
      prefix: sourceText.slice(Math.max(0, startOffset - 40), startOffset),
      suffix: sourceText.slice(endOffset, endOffset + 40),
    });
    selection.removeAllRanges();
  }

  const progress = sourceText.length
    ? Math.round(((chunks[currentChunk]?.startOffset ?? 0) / sourceText.length) * 100)
    : 0;

  return <div
    ref={scroller}
    className="txt-reader-scroll min-h-0 flex-1 overflow-y-auto px-8 py-9 lg:px-12 xl:px-16"
  >
    <div className="mb-8 flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-muted"><span className="h-px w-8 bg-line"/>The Republic / Complete TXT source</div>
    <h1 className="font-reading text-4xl">The Republic of Plato.</h1>
    <p className="mt-3 mb-4 text-xs leading-6 text-muted">Complete supplied text · Benjamin Jowett, third edition<br/>Select any part of the original text to hold it in context.</p>
    <div className="txt-reader-progress" aria-hidden="true">{progress}% · complete source</div>
    <div
      ref={documentRoot}
      onMouseUp={captureSelection}
      onKeyUp={captureSelection}
      className="font-reading text-[17px] leading-[1.95] selection:bg-highlight"
      data-testid="book-text"
      role="document"
      aria-label="Complete TXT source"
    >
      {chunks.map(chunk => {
        const chunkHighlight = highlight
          && highlight.startOffset < chunk.endOffset
          && highlight.endOffset > chunk.startOffset
            ? highlight
            : null;
        return <TxtChunk key={chunk.id} chunk={chunk} sourceText={sourceText} highlight={chunkHighlight}/>;
      })}
    </div>
    <div className="mt-10 border-t border-line pt-5 text-xs leading-6 text-muted">End of complete TXT source.</div>
  </div>;
});

export const ContinuousTxtReader = memo(ContinuousTxtReaderInner);
