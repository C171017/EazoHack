'use client';
import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask, TextLayer } from 'pdfjs-dist';
import type { TextContent } from 'pdfjs-dist/types/src/display/api';
import type { SourceAnchor } from '@/shared/schemas';
import { preparePage, type PageText } from './model';
import { readPageCache, writePageCache } from './cache';
import { displayRect, extractNative, nativeItems, loadPdfRuntime, type LocalOcr } from './runtime';
import { repairNativeSpacing } from './geometry';
import { extractionId } from './selection';

export const PdfPage = memo(function PdfPage({ doc, hash, index, width, ocr, recognize, retry, highlight, onReady, onSize }: {
  doc: PDFDocumentProxy; hash:string; index:number; width:number; ocr:LocalOcr; recognize:boolean; retry:number; highlight:SourceAnchor|undefined;
  onReady:(page:PageText)=>void; onSize:(page:number,ratio:number)=>void;
}) {
  const canvas=useRef<HTMLCanvasElement>(null), layer=useRef<HTMLDivElement>(null);
  const [loaded,setLoaded]=useState<{page:PDFPageProxy;content:TextContent}|null>(null);
  const [text,setText]=useState<PageText|null>(null);
  const [status,setStatus]=useState('Loading page…');
  const [marks,setMarks]=useState<number[][]>([]);
  useEffect(()=>{
    let alive=true; let page:PDFPageProxy|undefined;
    void (async()=>{
      page=await doc.getPage(index+1);
      const v=page.getViewport({scale:1});
      if(alive) onSize(index,v.height/v.width);
      const content=await page.getTextContent();
      if(alive) setLoaded({page,content});
    })().catch(e=>{if(alive)setStatus(`Could not load page: ${e.message}`);});
    return()=>{alive=false;page?.cleanup();};
  },[doc,index,onSize]);
  useEffect(()=>{
    if(!loaded||!canvas.current) return;
    const natural=loaded.page.getViewport({scale:1});
    const ratio=Math.min(window.devicePixelRatio||1,2,Math.sqrt(3_000_000/(width*width*natural.height/natural.width)));
    const viewport=loaded.page.getViewport({scale:width/natural.width});
    const target=canvas.current;
    target.width=Math.ceil(viewport.width*ratio);target.height=Math.ceil(viewport.height*ratio);
    const render:RenderTask=loaded.page.render({canvas:target,viewport,transform:ratio===1?undefined:[ratio,0,0,ratio,0,0]});
    void render.promise.catch(e=>{if(e.name!=='RenderingCancelledException')setStatus(`Page display failed: ${e.message}`);});
    return()=>{render.cancel();target.width=target.height=0;};
  },[loaded,width]);
  useEffect(()=>{
    if(!loaded) return;
    const abort=new AbortController();
    let timer:ReturnType<typeof setTimeout>|undefined;
    void (async()=>{
      {
        const cached=await readPageCache(hash,index,'eng').catch(()=>null);
        if(abort.signal.aborted)return;
        if(cached&&(!retry||cached.retryToken===retry)){setText(cached);onReady(cached);setStatus(cached.reviewRequired?'Text needs review':cached.method==='ocr'?'Recognized text':'Selectable text');return;}
      }
      const raw=extractNative(loaded.content,loaded.page);
      const native=repairNativeSpacing(raw,nativeItems(loaded.content));
      const prepared=await preparePage({fileHash:hash,pageIndex:index,language:'eng',native,forceOcr:retry>0}, async signal=>{
        if(!recognize) throw new Error('Text recognition will start when this page is in view.');
        await new Promise<void>((resolve,reject)=>{
          timer=setTimeout(resolve,650);
          signal.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason);},{once:true});
        });
        signal.throwIfAborted();setStatus('Recognizing text on this device…');
        return ocr.recognize(loaded.page,signal);
      },abort.signal);
      const result={...prepared,...(retry?{retryToken:retry}:{})};
      if(abort.signal.aborted)return;
      setText(result);onReady(result);setStatus(result.reviewRequired?'Text needs review':result.method==='ocr'?'Recognized text':'Selectable text');
      await writePageCache(result).catch(()=>{if(!abort.signal.aborted)setStatus('Text ready · local cache unavailable');});
    })().catch(e=>{if(!abort.signal.aborted)setStatus(e.message??'Text recognition failed. Retry this page.');});
    return()=>{abort.abort();if(timer)clearTimeout(timer);};
  },[loaded,hash,index,ocr,recognize,retry,onReady]);
  useEffect(()=>{
    const container=layer.current;
    if(!loaded||!text||!container)return;
    const natural=loaded.page.getViewport({scale:1});
    const viewport=loaded.page.getViewport({scale:width/natural.width});
    const base=loaded.page.getViewport({scale:1,rotation:0});
    let alive=true, nativeLayer:TextLayer|undefined;
    container.replaceChildren();
    if(text.method==='embedded') {
      void loadPdfRuntime().then(async pdfjs=>{
        if(!alive)return;
        nativeLayer=new pdfjs.TextLayer({textContentSource:loaded.content,container,viewport});
        await nativeLayer.render();
        nativeLayer.textDivs.forEach((span,i)=>{const fragment=text.native.fragments[i];if(fragment)span.dataset.pdfStart=String(fragment.start);});
      }).catch(e=>{if(alive)setStatus(`Selection layer failed: ${e.message}`);});
    } else {
      const measure=document.createElement('canvas').getContext('2d');
      const nodes=document.createDocumentFragment();
      for(const f of text.source.fragments) {
        if(!f.text)continue;
        const [x,y,w,h]=displayRect(f.rect,base,viewport);
        const span=document.createElement('span');
        span.dataset.pdfStart=String(f.start);span.textContent=f.text;
        const font=Math.max(1,h);
        if(measure)measure.font=`${font}px serif`;
        const advance=measure?.measureText(f.text).width||w;
        Object.assign(span.style,{left:`${x}px`,top:`${y}px`,fontSize:`${font}px`,fontFamily:'serif',transform:`scaleX(${w/Math.max(1,advance)})`});
        nodes.append(span);
      }
      container.append(nodes);
    }
    return()=>{alive=false;nativeLayer?.cancel();container.replaceChildren();};
  },[loaded,text,width]);
  useEffect(()=>{
    let alive=true;
    void (async()=>{
      const l=highlight?.locators[0];
      if(!loaded||!text||!highlight||highlight.fileHash!==hash||l?.kind!=='pdf'||l.pageIndex!==index||highlight.extractionVersion!==await extractionId(text)||text.source.text.slice(l.startOffset,l.endOffset)!==highlight.quote) {if(alive)setMarks([]);return;}
      const v=loaded.page.getViewport({scale:width/loaded.page.getViewport({scale:1}).width});
      const base=loaded.page.getViewport({scale:1,rotation:0});
      if(alive)setMarks((l.rects??[]).map(r=>displayRect(r,base,v)));
    })();
    return()=>{alive=false;};
  },[loaded,text,highlight,hash,index,width]);
  const scale=loaded?width/loaded.page.getViewport({scale:1}).width:1;
  return <>
    <canvas ref={canvas} className="pdf-canvas" aria-label={`Original PDF page ${index+1}`} />
    <div ref={layer} className={`pdf-text-layer ${text?.method==='ocr'?'pdf-ocr-layer':''}`} style={{'--total-scale-factor':scale} as CSSProperties} />
    <div className="pdf-marks" aria-hidden="true">{marks.map(([x,y,w,h],i)=><span key={i} style={{left:x,top:y,width:w,height:h}} />)}</div>
    <p className="pdf-page-status" role="status">{status}</p>
  </>;
});
