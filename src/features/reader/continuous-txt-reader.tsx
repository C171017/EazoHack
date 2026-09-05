'use client';

import { Fragment, forwardRef, memo, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { splitSourceRange } from './artifact-placement';
import { resolveTxtAnchor } from './source-anchor';
import type { SourceAnchor } from '@/shared/schemas';
import { createTxtRenderChunks, findTxtBlock, type TxtRenderChunk } from './txt-document';
import { ReadingMenu } from './reading-menu';
import { chineseFonts, defaultReadingFonts, englishFonts, parseReadingFonts, type ReadingFonts } from './reading-fonts';

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
export type ReaderSlot = { id: string; offset: number; content: ReactNode };
const EMPTY_SLOTS: ReaderSlot[] = [];

const TxtChunk = memo(function TxtChunk({
  chunk,
  sourceText,
  highlight,
  slots,
}: {
  chunk: TxtRenderChunk;
  sourceText: string;
  highlight: HighlightRange;
  slots: ReaderSlot[];
}) {
  return <section
    id={chunk.id}
    className="txt-render-chunk"
    style={highlight ? { contentVisibility: 'visible' } : undefined}
    data-txt-chunk
    data-txt-start={chunk.startOffset}
    data-txt-end={chunk.endOffset}
  >
    {chunk.blocks.map(block => <div id={block.id} key={block.id} className={block.continuation ? 'txt-source-block txt-source-block-continuation' : 'txt-source-block'}>
      {splitSourceRange(block.startOffset, block.endOffset, slots.map(s=>s.offset)).map(part=>{
      const text = sourceText.slice(part.startOffset, part.endOffset);
      const from = highlight ? Math.max(0, highlight.startOffset - part.startOffset) : 0;
      const to = highlight ? Math.min(text.length, highlight.endOffset - part.startOffset) : 0;
      return <Fragment key={part.startOffset}><span
        data-txt-block
        data-txt-start={part.startOffset}
        data-txt-end={part.endOffset}
      >
        {highlight && to > from
          ? <>{text.slice(0, from)}<mark className="rounded-sm bg-highlight text-ink">{text.slice(from, to)}</mark>{text.slice(to)}</>
          : text}
      </span>{slots.filter(s=>s.offset===part.endOffset).map(slot=><aside key={slot.id} data-reader-artifact={slot.id} className="reader-artifact" aria-label="Passage assistance">{slot.content}</aside>)}</Fragment>;
    })}</div>)}
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
  slots?: ReaderSlot[];
}>(function ContinuousTxtReader({ sourceText, fileHash, extractionVersion, activeAnchor, onSelection, slots=EMPTY_SLOTS }, ref) {
  const chunks = useMemo(() => createTxtRenderChunks(sourceText), [sourceText]);
  const scroller = useRef<HTMLDivElement>(null);
  const documentRoot = useRef<HTMLDivElement>(null);
  const nativeSelection = useRef<TxtSelectionRange|null>(null);
  // Source spans can split when a slot appears. Rebind the native range to the
  // same source offsets so copying and Shift-selection survive that render.
  useLayoutEffect(()=>{
    const saved=nativeSelection.current,root=documentRoot.current;
    if(!saved||!root)return;
    nativeSelection.current=null;
    const boundary=(offset:number,end:boolean)=>{
      const spans=[...root.querySelectorAll<HTMLElement>('[data-txt-block]')];
      const span=spans.find(s=>end?Number(s.dataset.txtStart)<offset&&Number(s.dataset.txtEnd)>=offset:Number(s.dataset.txtStart)<=offset&&Number(s.dataset.txtEnd)>offset);
      if(!span)return null;
      let remaining=offset-Number(span.dataset.txtStart);
      const walker=document.createTreeWalker(span,NodeFilter.SHOW_TEXT);
      for(let node=walker.nextNode();node;node=walker.nextNode()){
        const length=node.textContent?.length??0;
        if(remaining<=length)return {node,offset:remaining};
        remaining-=length;
      }
      return null;
    };
    const start=boundary(saved.startOffset,false),end=boundary(saved.endOffset,true);
    if(start&&end){const range=document.createRange();range.setStart(start.node,start.offset);range.setEnd(end.node,end.offset);const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range);}
  });
  const currentChunkRef = useRef(0);
  const alignmentFrame = useRef<number | null>(null);
  const [fonts, setFonts] = useState<ReadingFonts>(defaultReadingFonts);
  const fontPosition = useRef<{ element: HTMLElement; top: number } | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try { setFonts(parseReadingFonts(localStorage.getItem('eazo-reading-fonts'))); } catch { /* Storage is optional. */ }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useLayoutEffect(() => {
    const position = fontPosition.current;
    if (!position) return;
    let active = true;
    const align = () => {
      if (active && scroller.current && position.element.isConnected) {
        scroller.current.scrollTop += position.element.getBoundingClientRect().top - position.top;
      }
    };
    align();
    void document.fonts.ready.then(align);
    return () => { active = false; };
  }, [fonts]);

  function changeFonts(next: ReadingFonts) {
    if (fonts.english === next.english && fonts.chinese === next.chinese) return;
    const root = scroller.current;
    if (root && root.scrollTop > 0) {
      const top = root.getBoundingClientRect().top + 110;
      const block = [...root.querySelectorAll<HTMLElement>('[data-txt-block]')]
        .find(element => element.getBoundingClientRect().bottom > top);
      fontPosition.current = block ? { element: block, top: block.getBoundingClientRect().top } : null;
    } else fontPosition.current = null;
    setFonts(next);
    try { localStorage.setItem('eazo-reading-fonts', JSON.stringify(next)); } catch { /* Reading still works without storage. */ }
  }

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
      const container = block ? document.getElementById(block.id) : null;
      const element = [...(container?.querySelectorAll<HTMLElement>('[data-txt-block]')??[])].find(e=>Number(e.dataset.txtStart)<=offset&&Number(e.dataset.txtEnd)>offset)??container;
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
        let remaining = Math.max(0, offset - Number(element.dataset.txtStart??block!.startOffset));
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

  function selectedSource() {
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
    return {
      startOffset,
      endOffset,
      quote,
      prefix: sourceText.slice(Math.max(0, startOffset - 40), startOffset),
      suffix: sourceText.slice(endOffset, endOffset + 40),
    };
  }
  function captureSelection() {
    const range=selectedSource();
    if(range){nativeSelection.current=range;onSelection(range);}
  }
  // Native document selections need not focus the reader, so copy can target
  // document/body rather than bubble through the reading element.
  useEffect(()=>{
    const copy=(event:ClipboardEvent)=>{const range=selectedSource();if(range&&event.clipboardData){event.preventDefault();event.clipboardData.setData('text/plain',range.quote);}};
    document.addEventListener('copy',copy);
    return()=>document.removeEventListener('copy',copy);
  });

  return <div
    ref={scroller}
    className="txt-reader-scroll min-h-0 flex-1 overflow-y-auto"
    data-english-font={fonts.english}
    data-chinese-font={fonts.chinese}
    style={{ '--font-reading': `${englishFonts.find(font => font.id === fonts.english)!.family}, ${chineseFonts.find(font => font.id === fonts.chinese)!.family}, serif` } as CSSProperties}
  >
    <div className="txt-reader-masthead">
      <ReadingMenu fonts={fonts} onChange={changeFonts}/>
    </div>
    <div className="txt-reader-page">
    <header className="txt-reader-heading">
      <p className="txt-reader-eyebrow">Plato · Translated by Benjamin Jowett</p>
      <h1>The Republic of Plato.</h1>
      <p className="txt-reader-edition">Third edition · Complete text</p>
      <p className="txt-reader-hint">Select a passage to explore it.</p>
    </header>
    <div
      ref={documentRoot}
      onMouseUp={event=>{if(!(event.target as Element).closest('[data-reader-artifact]'))captureSelection();}}
      onKeyUp={event=>{if(event.shiftKey&&!(event.target as Element).closest('[data-reader-artifact]'))captureSelection();}}
      onCopy={event=>{const range=selectedSource();if(range){event.preventDefault();event.clipboardData.setData('text/plain',range.quote);}}}
      className="txt-reader-body"
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
        const chunkSlots=slots.filter(s=>s.offset>chunk.startOffset&&s.offset<=chunk.endOffset);
        return <TxtChunk key={chunk.id} chunk={chunk} sourceText={sourceText} highlight={chunkHighlight} slots={chunkSlots.length?chunkSlots:EMPTY_SLOTS}/>;
      })}
    </div>
    <div className="txt-reader-end">End of complete text</div>
    </div>
  </div>;
});

export const ContinuousTxtReader = memo(ContinuousTxtReaderInner);
