'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfPage } from './pdf-page';
import { LocalOcr, sourceRect } from './runtime';
import { createPdfSelection, selectionEndpoint, type PdfSelection } from './selection';
import { selectionTimestamp } from '../../persistence/selection-activity';
import type { PageText, Rect } from './model';
import type { SourceAnchor } from '@/shared/schemas';

/** TXT-independent integration surface: source fingerprint in, existing Selection/SourceAnchor contracts out. */
export function PdfReader({doc,fileHash,onSelection,onPageText,onPageChange,anchors=[],jumpTo=null,retryPage=null,onNotice}: {
  doc:PDFDocumentProxy;fileHash:string;onSelection:(value:PdfSelection)=>void;onPageText:(page:PageText)=>void;
  onPageChange:(page:number)=>void;anchors?:SourceAnchor[];jumpTo?:{page:number;ticket:number}|null;retryPage?:{page:number;ticket:number}|null;onNotice:(message:string)=>void;
}) {
  const root=useRef<HTMLDivElement>(null);
  const data=useRef(new Map<number,PageText>());
  const inSelection=useRef(false);
  const [width,setWidth]=useState(500);
  const measuredWidth=useRef(500);
  const resizeAnchor=useRef<{page:number;fraction:number}|null>(null);
  const [ratios,setRatios]=useState<Record<number,number>>({});
  const [foreground,setForeground]=useState(true);
  const [visible,setVisible]=useState({page:0,near:[0,1]});
  const [ocr]=useState(()=>new LocalOcr());
  const noticeRef=useRef(onNotice);
  useEffect(()=>{noticeRef.current=onNotice;},[onNotice]);
  useEffect(()=>{ocr.activate();return()=>ocr.dispose();},[ocr]);
  useEffect(()=>{
    const visibility=()=>setForeground(document.visibilityState==='visible');
    document.addEventListener('visibilitychange',visibility);
    return()=>document.removeEventListener('visibilitychange',visibility);
  },[]);
  useEffect(()=>{
    const container=root.current;if(!container)return;
    const resize=new ResizeObserver(entries=>{
      const next=Math.max(160,Math.min(1100,entries[0].contentRect.width-32));
      if(next===measuredWidth.current)return;
      const top=container.getBoundingClientRect().top;
      const first=[...container.querySelectorAll<HTMLElement>('[data-pdf-page]')].find(p=>p.getBoundingClientRect().bottom>top);
      if(first){const r=first.getBoundingClientRect();resizeAnchor.current={page:Number(first.dataset.pdfPage),fraction:(top-r.top)/r.height};}
      measuredWidth.current=next;setWidth(next);
    });
    resize.observe(container);
    const near=new Map<number,Element>();
    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries){const n=Number((entry.target as HTMLElement).dataset.pdfPage);if(entry.isIntersecting)near.set(n,entry.target);else near.delete(n);}
      if(inSelection.current)return;
      const center=container.getBoundingClientRect().top+container.clientHeight/2;
      const ordered=[...near].sort((a,b)=>Math.abs(a[1].getBoundingClientRect().top+a[1].getBoundingClientRect().height/2-center)-Math.abs(b[1].getBoundingClientRect().top+b[1].getBoundingClientRect().height/2-center));
      if(!ordered.length)return;
      const next={page:ordered[0][0],near:ordered.slice(0,8).map(([n])=>n).sort((a,b)=>a-b)};
      setVisible(old=>old.page===next.page&&old.near.join()===next.near.join()?old:next);
    },{root:container,rootMargin:'650px 0px',threshold:[0,0.25,0.5,0.75,1]});
    container.querySelectorAll('[data-pdf-page]').forEach(p=>observer.observe(p));
    const selection=()=>{
      const s=window.getSelection();
      const was=inSelection.current;
      inSelection.current=!!s&&!s.isCollapsed&&!!s.anchorNode&&container.contains(s.anchorNode);
      if(was&&!inSelection.current) {
        // Refresh intersections after releasing a pinned cross-page selection.
        container.querySelectorAll('[data-pdf-page]').forEach(p=>{observer.unobserve(p);observer.observe(p);});
      }
    };
    document.addEventListener('selectionchange',selection);
    return()=>{resize.disconnect();observer.disconnect();document.removeEventListener('selectionchange',selection);};
  },[doc]);
  useLayoutEffect(()=>{
    const container=root.current,anchor=resizeAnchor.current;
    if(!container||!anchor)return;
    const node=container.querySelector<HTMLElement>(`[data-pdf-page="${anchor.page}"]`);
    if(node){const r=node.getBoundingClientRect();container.scrollTop+=r.top+anchor.fraction*r.height-container.getBoundingClientRect().top;}
    resizeAnchor.current=null;
  },[width]);
  const size=useCallback((index:number,ratio:number)=>setRatios(old=>old[index]===ratio?old:{...old,[index]:ratio}),[]);
  const ready=useCallback((page:PageText)=>{
    data.current.delete(page.pageIndex);data.current.set(page.pageIndex,page);
    if(data.current.size>24)data.current.delete(data.current.keys().next().value!);
    if(page.pageIndex===visible.page)onPageText(page);
  },[onPageText,visible.page]);
  useEffect(()=>{onPageChange(visible.page);const p=data.current.get(visible.page);if(p)onPageText(p);},[visible.page,onPageText,onPageChange]);
  useEffect(()=>{
    if(!jumpTo)return;
    window.getSelection()?.removeAllRanges();
    const page=Math.max(0,Math.min(doc.numPages-1,jumpTo.page));
    root.current?.querySelector(`[data-pdf-page="${page}"]`)?.scrollIntoView({block:'start',behavior:'instant'});
  },[jumpTo,doc]);
  const capture=async()=>{
    const selectedAt=selectionTimestamp();
    const selection=window.getSelection();
    if(!selection?.rangeCount||selection.isCollapsed)return;
    const range=selection.getRangeAt(0).cloneRange();
    if(!root.current?.contains(range.startContainer)||!root.current.contains(range.endContainer))return;
    const start=selectionEndpoint(range.startContainer,range.startOffset),end=selectionEndpoint(range.endContainer,range.endOffset);
    if(!start||!end){onNotice('Select words inside the PDF text layer.');return;}
    try {
      const rectangles=new Map<number,Rect[]>();
      for(let i=start.page;i<=end.page;i++) {
        const node=root.current?.querySelector<HTMLElement>(`[data-pdf-page="${i}"]`);
        if(!node)throw new Error('Selected page is unavailable.');
        const rect=node.getBoundingClientRect(),pdfPage=await doc.getPage(i+1);
        const viewport=pdfPage.getViewport({scale:rect.width/pdfPage.getViewport({scale:1}).width});
        const base=pdfPage.getViewport({scale:1,rotation:0});
        const selected=[...node.querySelectorAll('[data-pdf-start]')].filter(span=>range.intersectsNode(span)).flatMap(span=>{
          const part=document.createRange();part.selectNodeContents(span);
          if(span.contains(range.startContainer))part.setStart(range.startContainer,range.startOffset);
          if(span.contains(range.endContainer))part.setEnd(range.endContainer,range.endOffset);
          return [...part.getClientRects()];
        }).filter(r=>r.width>0&&r.height>0&&r.top>=rect.top-1&&r.bottom<=rect.bottom+1&&r.left>=rect.left-1&&r.right<=rect.right+1);
        // Browser ranges can report the same rectangle for an element and its text node.
        const unique=new Map(selected.map(r=>[`${r.x},${r.y},${r.width},${r.height}`,r]));
        rectangles.set(i,[...unique.values()].map(r=>sourceRect(viewport,base,[r.left-rect.left,r.top-rect.top,r.right-rect.left,r.bottom-rect.top])));
      }
      const result=await createPdfSelection(fileHash,[...data.current.values()],start,end,rectangles,selectedAt);
      onSelection(result);window.getSelection()?.removeAllRanges();
    }catch(e){onNotice(e instanceof Error?e.message:'Could not capture selection.');}
  };
  return <div className="pdf-reader-column">
    <div className="pdf-navigation">
      <form onSubmit={e=>{e.preventDefault();const value=new FormData(e.currentTarget).get('page');const n=Number(value);if(Number.isInteger(n)&&n>=1&&n<=doc.numPages)root.current?.querySelector(`[data-pdf-page="${n-1}"]`)?.scrollIntoView({block:'start'});}}>
        <label>Page <input key={visible.page} name="page" type="number" aria-label="Go to PDF page" min={1} max={doc.numPages} defaultValue={visible.page+1}/></label><span> / {doc.numPages}</span><button type="submit">Go</button>
      </form>
      <button onMouseDown={e=>e.preventDefault()} onClick={()=>void capture()}>Use selected passage</button>
    </div>
    <div ref={root} className="pdf-scroll" tabIndex={0} aria-label="Continuous PDF reader" onMouseUp={()=>void capture()} onKeyUp={e=>{if(e.key==='Shift')void capture();}}>
      {Array.from({length:doc.numPages},(_,index)=><div key={index} className="pdf-page" data-pdf-page={index} style={{width,height:width*(ratios[index]??1.65)}}>
        {visible.near.includes(index)?<PdfPage doc={doc} hash={fileHash} index={index} width={width} ocr={ocr} recognize={foreground&&index===visible.page} retry={retryPage?.page===index?retryPage.ticket:0} highlight={anchors.find(a=>a.locators[0]?.kind==='pdf'&&a.locators[0].pageIndex===index)} onReady={ready} onSize={size}/>:<span className="pdf-placeholder" aria-hidden="true">Page {index+1}</span>}
      </div>)}
    </div>
  </div>;
}
