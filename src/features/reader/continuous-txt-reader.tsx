'use client';

import { Fragment, forwardRef, memo, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { readingLine, readingOffset } from './reading-position';
import { splitSourceRange } from './artifact-placement';
import { resolveTxtAnchor } from './source-anchor';
import { highlightSegments, type EnhancementHighlight } from './enhancement-highlights';
import { ENHANCEMENTS } from '@/shared/enhancements';
import { snapSelectionToWords } from './word-selection';
import { EnhancementPicker, type PickerPosition } from './enhancement-picker';
import type { RouteKind, SourceAnchor } from '@/shared/schemas';
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
  scrollBy(delta: number): void;
  scrollToOffset(offset: number, behavior?: ScrollBehavior): void;
};

type HighlightRange = { startOffset: number; endOffset: number } | null;
export type ReaderSlot = { id: string; offset: number; content: ReactNode };
const EMPTY_SLOTS: ReaderSlot[] = [];
const EMPTY_HIGHLIGHTS: EnhancementHighlight[] = [];

const TxtChunk = memo(function TxtChunk({
  chunk,
  sourceText,
  highlight,
  slots,
  enhancements,
}: {
  chunk: TxtRenderChunk;
  sourceText: string;
  highlight: HighlightRange;
  slots: ReaderSlot[];
  enhancements: EnhancementHighlight[];
}) {
  return <section
    id={chunk.id}
    className="txt-render-chunk"
    style={highlight ? { contentVisibility: 'visible' } : undefined}
    data-txt-chunk
    data-txt-start={chunk.startOffset}
    data-txt-end={chunk.endOffset}
  >
    {chunk.blocks.map(block => <div id={block.id} key={block.id}
      data-txt-kind={block.kind}
      className={`txt-source-block${block.continuation ? ' txt-source-block-continuation' : ''}`}>
      {splitSourceRange(block.startOffset, block.endOffset, slots.map(s=>s.offset)).map(part=>{
      return <Fragment key={part.startOffset}><span
        className="txt-source-content"
        role={['title', 'heading', 'subheading'].includes(block.kind) ? 'heading' : undefined}
        aria-level={block.kind === 'subheading' ? 3 : ['title', 'heading'].includes(block.kind) ? 2 : undefined}
        data-txt-block
        data-txt-start={part.startOffset}
        data-txt-end={part.endOffset}
      >
        {highlightSegments(part.startOffset, part.endOffset, enhancements, highlight).map(segment => {
          const text = sourceText.slice(segment.startOffset, segment.endOffset);
          if (!segment.kinds.length && !segment.active) return text;
          const colors = segment.kinds.map(kind => ENHANCEMENTS[kind].ink);
          const style = colors.length ? {
            backgroundColor: colors.length === 1 ? `color-mix(in srgb, ${colors[0]} 24%, transparent)` : 'var(--color-highlight)',
            backgroundImage: `linear-gradient(to right, ${colors.map((color,i) => `${color} ${i*100/colors.length}% ${(i+1)*100/colors.length}%`).join(', ')})`,
          } : undefined;
          return <mark key={segment.startOffset} className="txt-passage-highlight" data-enhancements={segment.kinds.join(' ') || undefined}
            aria-label={segment.kinds.length ? segment.kinds.map(kind => ENHANCEMENTS[kind].label).join(' and ') : 'Selected passage'} style={style}>{text}</mark>;
        })}
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

type NativeSourceSelection = TxtSelectionRange & { backward: boolean };

function restoreSourceSelection(root: HTMLElement, saved: NativeSourceSelection) {
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
  if (start && end) {
    const selection = window.getSelection();
    if (saved.backward) selection?.setBaseAndExtent(end.node, end.offset, start.node, start.offset);
    else selection?.setBaseAndExtent(start.node, start.offset, end.node, end.offset);
  }
}

const ContinuousTxtReaderInner = forwardRef<ContinuousTxtReaderHandle, {
  title?: string;
  bookId?: string;
  onUpload: (file: File) => Promise<void>;
  onReset?: () => void;
  sourceText: string;
  fileHash: string;
  extractionVersion: string;
  activeAnchor: SourceAnchor | null;
  onSelection: (selection: TxtSelectionRange) => void;
  slots?: ReaderSlot[];
  enhancements?: EnhancementHighlight[];
  onReadingPosition?: (offset: number) => void;
  onEnhance: (route: RouteKind) => void;
  enhancementBusy: boolean;
}>(function ContinuousTxtReader({ title = "The Republic of Plato.", bookId = "plato-republic", onUpload, onReset, sourceText, fileHash, extractionVersion, activeAnchor, onSelection, onEnhance, enhancementBusy, slots=EMPTY_SLOTS, enhancements=EMPTY_HIGHLIGHTS, onReadingPosition }, ref) {
  const chunks = useMemo(() => createTxtRenderChunks(sourceText, undefined, title), [sourceText, title]);
  const chunkEnhancements = useMemo(() => chunks.map(chunk => {
    const matches = enhancements.filter(h => h.startOffset < chunk.endOffset && h.endOffset > chunk.startOffset);
    return matches.length ? matches : EMPTY_HIGHLIGHTS;
  }), [chunks, enhancements]);
  const scroller = useRef<HTMLDivElement>(null);
  const documentRoot = useRef<HTMLDivElement>(null);
  const [pickerPosition, setPickerPosition] = useState<PickerPosition | null>(null);
  const nativeSelection = useRef<NativeSourceSelection|null>(null);
  const lastCapturedRange = useRef<string|null>(null);
  // Source spans can split when a slot appears. Rebind the native range to the
  // same source offsets so copying and Shift-selection survive that render.
  useLayoutEffect(()=>{
    const saved=nativeSelection.current,root=documentRoot.current;
    if(!saved||!root)return;
    nativeSelection.current=null;
    restoreSourceSelection(root, saved);
  });
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
    const root = scroller.current, content = documentRoot.current;
    if (!root || !content || !onReadingPosition) return;
    let frame: number | null = null;
    const report = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        onReadingPosition(readingOffset(root, content, sourceText.length));
      });
    };
    root.addEventListener('scroll', report, {passive: true});
    const observer = new ResizeObserver(report);
    observer.observe(root); observer.observe(content);
    report();
    return () => {
      root.removeEventListener('scroll', report); observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [sourceText.length, onReadingPosition]);

  useEffect(() => () => {
    if (alignmentFrame.current !== null) cancelAnimationFrame(alignmentFrame.current);
  }, []);

  useImperativeHandle(ref, () => ({
    getReadingPosition() {
      const root = scroller.current, content = documentRoot.current;
      return root && content ? Math.floor(readingOffset(root, content, sourceText.length)) : 0;
    },
    scrollBy(delta) {
      if (alignmentFrame.current !== null) cancelAnimationFrame(alignmentFrame.current);
      alignmentFrame.current = null;
      scroller.current?.scrollBy({top: delta, behavior: 'instant'});
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
        const targetTop = readingLine(root);
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
  }), [chunks, sourceText.length]);

  function selectedSource() {
    const selection = window.getSelection();
    const root = documentRoot.current;
    if (!root || !selection?.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
    const rawStart = boundaryOffset(range.startContainer, range.startOffset, 'start', root);
    const rawEnd = boundaryOffset(range.endContainer, range.endOffset, 'end', root);
    if (rawStart === null || rawEnd === null) return;
    const snapped = snapSelectionToWords(sourceText, rawStart, rawEnd);
    if (!snapped) return;
    const { startOffset, endOffset } = snapped;
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
  function captureSelection(fromKeyboard = false) {
    const range=selectedSource();
    if(range && range.quote.length <= 20000){
      const key=`${range.startOffset}:${range.endOffset}`;
      // Releasing Shift after a pointer selection (or without adjusting it)
      // is not a second selection gesture. New pointer selections still count.
      if(fromKeyboard && lastCapturedRange.current===key)return;
      lastCapturedRange.current=key;
      const selection = window.getSelection();
      const original = selection?.getRangeAt(0);
      const backward = !!original && selection?.anchorNode === original.endContainer && selection.anchorOffset === original.endOffset;
      const saved = { ...range, backward };
      if (documentRoot.current) restoreSourceSelection(documentRoot.current, saved);
      const nativeRange=selection?.getRangeAt(0);
      const bounds=scroller.current?.getBoundingClientRect();
      const rect=nativeRange?.getClientRects()[0];
      if(rect&&bounds){
        const left=Math.max(bounds.left+8,Math.min(rect.left+rect.width/2-104,bounds.right-216,window.innerWidth-216));
        const top=rect.top-62>Math.max(bounds.top+64,8)?rect.top-62:Math.min(rect.bottom+10,window.innerHeight-64);
        setPickerPosition({left,top});
      }
      nativeSelection.current=saved;onSelection(range);
    }else setPickerPosition(null);
  }
  useEffect(() => {
    const dismiss = () => setPickerPosition(null);
    const pointer = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('[aria-label="Reading enhancements"]')) dismiss();
    };
    const keyboard = (event: KeyboardEvent) => { if(event.key==='Escape') dismiss(); };
    document.addEventListener('pointerdown', pointer);
    document.addEventListener('keydown', keyboard);
    window.addEventListener('resize', dismiss);
    const scroll=scroller.current;
    scroll?.addEventListener('scroll',dismiss,{passive:true});
    window.addEventListener('scroll',dismiss,{passive:true});
    return () => {
      document.removeEventListener('pointerdown', pointer);
      document.removeEventListener('keydown', keyboard);
      window.removeEventListener('resize', dismiss);
      scroll?.removeEventListener('scroll',dismiss);
      window.removeEventListener('scroll',dismiss);
    };
  }, []);
  useEffect(() => {
    const keyboardSelection = (event: KeyboardEvent) => {
      // Keep native adjustment while Shift is held; snapping every arrow key
      // would prevent shrinking a selection by less than a whole word.
      if (event.key === 'Shift') captureSelection(true);
      else if (window.getSelection()?.isCollapsed) setPickerPosition(null);
    };
    document.addEventListener('keyup', keyboardSelection);
    const clear = () => { if(window.getSelection()?.isCollapsed)lastCapturedRange.current=null; };
    document.addEventListener('selectionchange',clear);
    return () => {
      document.removeEventListener('keyup', keyboardSelection);
      document.removeEventListener('selectionchange',clear);
    };
  });
  // Native document selections need not focus the reader, so copy can target
  // document/body rather than bubble through the reading element.
  useEffect(()=>{
    const copy=(event:ClipboardEvent)=>{const range=selectedSource();if(range&&event.clipboardData){event.preventDefault();event.clipboardData.setData('text/plain',range.quote);}};
    document.addEventListener('copy',copy);
    return()=>document.removeEventListener('copy',copy);
  });

  return <div
    ref={scroller}
    id="book-source-scroll"
    className="txt-reader-scroll min-h-0 flex-1 overflow-y-auto"
    data-english-font={fonts.english}
    data-chinese-font={fonts.chinese}
    style={{ '--font-reading': `${englishFonts.find(font => font.id === fonts.english)!.family}, ${chineseFonts.find(font => font.id === fonts.chinese)!.family}, serif` } as CSSProperties}
  >
    <EnhancementPicker position={pickerPosition} busy={enhancementBusy} onChoose={route=>{setPickerPosition(null);nativeSelection.current=null;window.getSelection()?.removeAllRanges();onEnhance(route);}}/>
    <div className="txt-reader-masthead">
      <ReadingMenu fonts={fonts} onChange={changeFonts} onUpload={onUpload} onReset={onReset}/>
    </div>
    <div className="txt-reader-page">
    <header className="txt-reader-heading">
      <p className="txt-reader-eyebrow">{bookId === "plato-republic" ? "Plato · Translated by Benjamin Jowett" : "Your uploaded book"}</p>
      <h1>{title}</h1>
      <p className="txt-reader-edition">{bookId === "plato-republic" ? "Third edition · Complete text" : "Complete text"}</p>
      <p className="txt-reader-hint">Select a passage to explore it.</p>
    </header>
    <div
      ref={documentRoot}
      onPointerUp={event=>{if(!(event.target as Element).closest('[data-reader-artifact]'))captureSelection();}}
      onCopy={event=>{const range=selectedSource();if(range){event.preventDefault();event.clipboardData.setData('text/plain',range.quote);}}}
      className="txt-reader-body"
      data-testid="book-text"
      role="document"
      aria-label="Complete TXT source"
    >
      {chunks.map((chunk, index) => {
        const chunkHighlight = highlight
          && highlight.startOffset < chunk.endOffset
          && highlight.endOffset > chunk.startOffset
            ? highlight
            : null;
        const chunkSlots=slots.filter(s=>s.offset>chunk.startOffset&&s.offset<=chunk.endOffset);
        return <TxtChunk key={chunk.id} chunk={chunk} sourceText={sourceText} highlight={chunkHighlight} enhancements={chunkEnhancements[index]} slots={chunkSlots.length?chunkSlots:EMPTY_SLOTS}/>;
      })}
    </div>
    <div className="txt-reader-end">End of complete text</div>
    </div>
  </div>;
});

export const ContinuousTxtReader = memo(ContinuousTxtReaderInner);
