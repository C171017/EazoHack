'use client';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { createDocumentText, documentCoverage, exportDocumentText, extractDocumentText, prepareDocumentPage, type DocumentText } from './document';
import { readDocumentPage, writeDocumentPage } from './document-cache';
import { readPageCache } from './cache';
import { extractNative, nativeItems } from './runtime';
import { repairNativeSpacing } from './geometry';
import { preparePage } from './model';
import { createPdfSelection, type PdfSelection } from './selection';

function download(name:string,body:string,type:string) {
  const url=URL.createObjectURL(new Blob([body],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function DocumentPanel({doc,hash,title,onSelection,onJump}:{doc:PDFDocumentProxy;hash:string;title:string;onSelection:(value:PdfSelection)=>void;onJump:(page:number)=>void}) {
  const [value,setValue]=useState(()=>createDocumentText(hash,doc.numPages));
  const latest=useRef<DocumentText>(value);
  const controller=useRef<AbortController|null>(null);
  const [notice,setNotice]=useState('');
  const [preview,setPreview]=useState(0);
  const text=useRef<HTMLDivElement>(null);
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();};},[]);
  const coverage=documentCoverage(value);
  const current=value.pages[preview];
  async function run() {
    if(controller.current)return;
    const abort=new AbortController();controller.current=abort;setNotice('');
    try {
      await extractDocumentText(latest.current,async(index,signal)=>{
        const cached=await readDocumentPage(hash,index).catch(()=>null);
        signal.throwIfAborted();
        if(cached)return cached;
        const page=await doc.getPage(index+1);
        const content=await page.getTextContent();
        signal.throwIfAborted();
        const native=extractNative(content,page);
        const repaired=repairNativeSpacing(native,nativeItems(content));
        const recognized=await readPageCache(hash,index,'eng').catch(()=>null);
        signal.throwIfAborted();
        const result=prepareDocumentPage(index,native,repaired,recognized);
        await writeDocumentPage(hash,result).catch(()=>{if(alive.current)setNotice('Local cache unavailable. Keep this tab open or download your results.');});
        // PDF.js shares page proxies with the reader; do not clean up a page
        // that may currently be rendering there.
        return result;
      },abort.signal,next=>{latest.current=next;if(alive.current)setValue(next);});
    } finally {controller.current=null;}
  }
  async function capture() {
    const selection=window.getSelection();
    if(!selection?.rangeCount||selection.isCollapsed||!text.current||!current.source)return;
    const range=selection.getRangeAt(0);
    if(!text.current.contains(range.startContainer)||!text.current.contains(range.endContainer))return;
    const before=range.cloneRange();before.selectNodeContents(text.current);before.setEnd(range.startContainer,range.startOffset);
    const from=before.toString().length,to=from+range.toString().length;
    try {
      const source=current.source;
      // Share the reader's version when source text matches. Content hashes in
      // extractionId prevent rebinding if OCR subsequently changes that text.
      const page=await preparePage({fileHash:hash,pageIndex:preview,language:'eng',native:source},async()=>source,new AbortController().signal);
      page.version=current.extractionVersion??value.version;
      page.reviewRequired=current.status!=='ready';
      if(current.method==='ocr'){page.method='ocr';page.ocr=source;}
      onSelection(await createPdfSelection(hash,[page],{page:preview,offset:from},{page:preview,offset:to}));
      selection.removeAllRanges();
    } catch(error) {setNotice(error instanceof Error?error.message:'Could not select text');}
  }
  function save(format:'txt'|'json') {
    const result=exportDocumentText(value);
    const suffix=coverage.ready===coverage.total?'':'-partial';
    const name=title.replace(/\.pdf$/i,'');
    download(`${name}${suffix}.${format}`,format==='txt'?result.text:JSON.stringify(result.manifest,null,2),format==='txt'?'text/plain;charset=utf-8':'application/json');
  }
  return <section className="pdf-document-tools" aria-label="Whole PDF text extraction">
    <h3>PDF to plain text</h3>
    <p>Extract all pages on this device. Embedded text comes first, then spacing repair. Pages needing OCR stay marked for later; previously recognized local text can be reused.</p>
    <div className="pdf-actions"><button disabled={value.status==='running'} onClick={()=>void run()}>{value.status==='idle'?'Extract all pages':'Resume / retry unresolved pages'}</button>{value.status==='running'&&<button onClick={()=>controller.current?.abort()}>Cancel extraction</button>}</div>
    <p role="status">{coverage.processed} / {coverage.total} pages checked · {coverage.ready} ready · {coverage.review} need review · {coverage.deferred} OCR deferred · {coverage.failed} failed{value.status==='cancelled'?' · Cancelled':''}</p>
    {notice&&<p role="status" className="pdf-warning">{notice}</p>}
    {coverage.processed>0&&<>
      <p className="pdf-small">{coverage.ready===coverage.total?'All pages have usable text by heuristic checks.':'Text is partial or needs review.'} Images are retained in the PDF; their content has not been analyzed. Download the coverage file alongside the text to retain page locations and missing-page status.</p>
      <div className="pdf-actions"><button onClick={()=>save('txt')}>Download text{coverage.ready<coverage.total?' (partial)':''}</button><button onClick={()=>save('json')}>Download coverage & sources</button></div>
      <label>Read extracted page <input aria-label="Extracted page number" type="number" min={1} max={doc.numPages} value={preview+1} onChange={e=>{const n=Number(e.target.value);if(Number.isInteger(n)&&n>=1&&n<=doc.numPages)setPreview(n-1);}} /></label>
      <p className="pdf-small">{current.status} · {current.method??'Not extracted'}{current.reasons.length?` · ${current.reasons.join('. ')}`:''}</p>
      <button onClick={()=>onJump(preview)}>Show original page</button>
      <div ref={text} className="pdf-reflow" tabIndex={0} aria-label={`Plain text of PDF page ${preview+1}`} onMouseUp={()=>void capture()} onKeyUp={e=>{if(e.shiftKey)void capture();}}>{current.source?.text||'No extracted text is available for this page.'}</div>
    </>}
  </section>;
}
