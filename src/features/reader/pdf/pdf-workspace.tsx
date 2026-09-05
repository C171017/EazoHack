'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { z } from 'zod';
import { SelectionSchema, SourceAnchorSchema, ArtifactSchema, type Artifact } from '@/shared/schemas';
import { ArtifactView } from '@/features/assistance/artifact-view';
import { PdfReader } from './pdf-reader';
import { DocumentPanel } from './document-panel';
import { loadPdfRuntime } from './runtime';
import { validateLayout, type PageText } from './model';
import { writePageCache } from './cache';
import { extractionId, type PdfSelection } from './selection';
import { recordSelectionActivity } from '../../persistence/selection-activity';
import './pdf.css';

type Input = { id:number; title:string; hash:string; data?:Uint8Array };
const SAMPLE:Input = {id:0,title:'The Republic · Jowett, 1888',hash:'8ec6c7f6a61e5697251515ec55bf746f45837c1527c4a663a020d0e171b21401'};
const SavedSchema=z.object({hash:z.string(),page:z.number().int().nonnegative(),selection:SelectionSchema.nullable(),anchors:z.array(SourceAnchorSchema),provenance:z.array(z.object({pageIndex:z.number().int().nonnegative(),method:z.string(),reviewRequired:z.boolean()}))});

export function PdfWorkspace({initialInput = SAMPLE, onReturn, onLibrary}: {initialInput?: Input; onReturn?: () => void; onLibrary?: () => void}) {
  const [input,setInput]=useState<Input>(initialInput);
  const [notice,setNotice]=useState('');
  const ticket=useRef(0);
  async function open(file:File|undefined) {
    if(!file)return;
    const id=++ticket.current;
    if(file.size>100*1024*1024){setNotice('This reader currently accepts PDFs up to 100 MB.');return;}
    setNotice('Opening PDF on this device…');
    try {
      const bytes=new Uint8Array(await file.arrayBuffer());
      if(!new TextDecoder().decode(bytes.slice(0,1024)).includes('%PDF-'))throw new Error('Choose a PDF file.');
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      if(id!==ticket.current)return;
      setInput({id,title:file.name,hash,data:bytes});setNotice('');
    }catch(e){if(id===ticket.current)setNotice(e instanceof Error?e.message:'Could not open PDF.');}
  }
  return <main className="pdf-workspace">
    <header className="pdf-header">{onReturn ? <button onClick={onReturn}>← Text workspace</button> : <Link href="/">← Text workspace</Link>}<h1>{input.title}</h1>{onLibrary && <button onClick={onLibrary}>Library ↗</button>}
      <label className="pdf-file-button">Open PDF<input type="file" accept="application/pdf,.pdf" onChange={e=>{void open(e.target.files?.[0]);e.target.value='';}}/></label>
      <button onClick={()=>{ticket.current++;setInput({...SAMPLE,id:ticket.current});setNotice('');}}>Open Republic</button>
    </header>
    {notice&&<p role="status" className="pdf-banner">{notice}</p>}
    <PdfSession key={input.id} input={input}/>
  </main>;
}

function PdfSession({input}:{input:Input}) {
  const [doc,setDoc]=useState<PDFDocumentProxy|null>(null);
  const [error,setError]=useState('');
  const [password,setPassword]=useState('');
  const [passwordNeeded,setPasswordNeeded]=useState(false);
  const passwordCallback=useRef<((value:string)=>void)|null>(null);
  const [pageResult,setPage]=useState<PageText|null>(null);
  const [currentPage,setCurrentPage]=useState(0);
  const page=pageResult?.pageIndex===currentPage?pageResult:null;
  const [anchorWarning,setAnchorWarning]=useState('');
  const [chosen,setChosen]=useState<PdfSelection|null>(null);
  const [notice,setNotice]=useState('Select a passage from the PDF to begin.');
  const [jump,setJump]=useState<{page:number;ticket:number}|null>(null);
  const [retry,setRetry]=useState<{page:number;ticket:number}|null>(null);
  const [layoutConfig,setLayoutConfig]=useState<{available:boolean;label:string|null}>({available:false,label:null});
  const [layoutBusy,setLayoutBusy]=useState(false);
  const [artifacts,setArtifacts]=useState<Artifact[]>([]);
  const [assistBusy,setAssistBusy]=useState(false);
  const generation=useRef(0);
  const requests=useRef(new Set<AbortController>());
  useEffect(()=>{
    let alive=true;
    void (async()=>{
      const selected=chosen?.anchors.filter(a=>a.locators.some(l=>l.kind==='pdf'&&l.pageIndex===currentPage))??[];
      const version=page?await extractionId(page):null;
      const mismatch=page&&selected.some(a=>{const l=a.locators[0];return l.kind!=='pdf'||a.extractionVersion!==version||page.source.text.slice(l.startOffset,l.endOffset)!==a.quote;});
      if(alive)setAnchorWarning(mismatch?'This page’s extraction changed. Your saved quotation is preserved; select it again to refresh the highlight.':'');
    })();
    return()=>{alive=false;};
  },[page,chosen,currentPage]);
  useEffect(()=>{
    let alive=true;
    let task:ReturnType<Awaited<ReturnType<typeof loadPdfRuntime>>['getDocument']>|undefined;
    const pending=requests.current;
    void loadPdfRuntime().then(async pdfjs=>{
      if(!alive)return;
      task=pdfjs.getDocument({...(input.data?{data:input.data.slice()}:{url:'/api/pdf/source'}),
        cMapUrl:'/api/pdf/assets/cmaps/',cMapPacked:true,standardFontDataUrl:'/api/pdf/assets/standard_fonts/',wasmUrl:'/api/pdf/assets/wasm/',
        enableXfa:false,disableAutoFetch:true,disableStream:true });
      task.onPassword=(update:(value:string)=>void)=>{if(alive){passwordCallback.current=update;setPasswordNeeded(true);}};
      const loaded=await task.promise;
      if(loaded.numPages>10000){await task.destroy();throw new Error('This reader currently supports up to 10,000 pages.');}
      if(alive)setDoc(loaded);
    }).catch(e=>{if(alive)setError(e.message??'Could not open PDF.');});
    void fetch('/api/pdf/layout').then(r=>r.json()).then(c=>{if(alive)setLayoutConfig(c);}).catch(()=>{});
    return()=>{alive=false;for(const c of pending)c.abort();void task?.destroy();};
  },[input]);
  const updatePage=useCallback((p:PageText)=>setPage(p),[]);
  const select=useCallback((value:PdfSelection)=>{
    generation.current++;setChosen(value);setArtifacts([]);setAssistBusy(false);
    setNotice(value.provenance.some(p=>p.reviewRequired)?'Check the recognized quotation against the page before using it.':'Passage selected.');
    void recordSelectionActivity(value.selection,value.anchors).catch(()=>setNotice('Passage selected, but its selection time could not be saved on this device.'));
  },[]);
  function save() {
    try {
      localStorage.setItem(`eazo-pdf-checkpoint:${input.hash}`,JSON.stringify({hash:input.hash,page:currentPage,selection:chosen?.selection??null,anchors:chosen?.anchors??[],provenance:chosen?.provenance??[]}));
      setNotice('Reading position and passage saved on this device.');
    }catch{setNotice('Could not save locally. Your passage is still available in this session.');}
  }
  function restore() {
    try {
      const raw=localStorage.getItem(`eazo-pdf-checkpoint:${input.hash}`);
      if(!raw){setNotice('No saved passage for this PDF yet.');return;}
      const saved=SavedSchema.parse(JSON.parse(raw));
      if(saved.hash!==input.hash||saved.page>=(doc?.numPages??0)||saved.anchors.some(a=>a.fileHash!==input.hash||a.bookId!==`pdf:${input.hash}`)||saved.selection?.anchorIds.some(id=>!saved.anchors.some(a=>a.id===id)))throw new Error('Source binding mismatch');
      generation.current++;setArtifacts([]);
      setChosen(saved.selection?{selection:saved.selection,anchors:saved.anchors,provenance:saved.provenance}:null);
      setJump({page:saved.page,ticket:Date.now()});setNotice('Saved position restored. Highlights appear when matching page text is ready.');
    }catch{setNotice('The saved checkpoint could not be verified for this PDF.');}
  }
  async function suggestLayout() {
    if(!page||layoutBusy||!layoutConfig.available)return;
    const original=page,controller=new AbortController();requests.current.add(controller);setLayoutBusy(true);
    try {
      const response=await fetch('/api/pdf/layout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(original.source),signal:controller.signal});
      const result=await response.json();if(!response.ok)throw new Error(result.error?.message??'Layout request failed');
      const proposed={...original,layout:{proposal:validateLayout(original.source,result.proposal),provider:String(result.provider)}};
      await writePageCache(proposed);
      setPage(current=>current?.pageIndex===original.pageIndex?proposed:current);
      setNotice('A suggested reading order is available below. Original page text and quote anchors are retained.');
    }catch(e){if(!controller.signal.aborted)setNotice(e instanceof Error?e.message:'Layout request failed.');}
    finally{requests.current.delete(controller);setLayoutBusy(false);}
  }
  async function assist() {
    if(!chosen||assistBusy)return;
    const selection=chosen.selection,ticket=++generation.current,controller=new AbortController();requests.current.add(controller);setAssistBusy(true);
    try {
      const r=await fetch('/api/route-plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({selection,routes:['interactive_ui'],mode:'mock'}),signal:controller.signal});
      const p=await r.json();if(!r.ok)throw new Error(p.error?.message??'Plan failed');
      const response=await fetch('/api/assist/all',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({selection,plan:p.plan,mode:'mock',failKinds:[]}),signal:controller.signal});
      const body=await response.json();if(!response.ok)throw new Error(body.error?.message??'Assistance failed');
      const checked=ArtifactSchema.array().parse(body.artifacts);
      if(checked.some(a=>a.selectionId!==selection.id||a.anchorIds.some(id=>!selection.anchorIds.includes(id))))throw new Error('Result source mismatch');
      if(ticket===generation.current){setArtifacts(checked);setNotice('Mock assistance complete; no model was called.');}
    }catch(e){if(ticket===generation.current)setNotice(e instanceof Error?e.message:'Assistance failed.');}
    finally{requests.current.delete(controller);if(ticket===generation.current)setAssistBusy(false);}
  }
  if(error)return <p role="alert" className="pdf-banner">{error}</p>;
  if(!doc)return <div className="pdf-banner">{passwordNeeded?<form onSubmit={e=>{e.preventDefault();passwordCallback.current?.(password);setPasswordNeeded(false);setPassword('');}}><label>PDF password <input autoComplete="off" type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button>Unlock</button></form>:<p role="status">Opening original PDF pages…</p>}</div>;
  return <div className="pdf-body">
    <PdfReader doc={doc} fileHash={input.hash} onSelection={select} onPageText={updatePage} onPageChange={setCurrentPage} anchors={chosen?.anchors} jumpTo={jump} retryPage={retry} onNotice={setNotice}/>
    <aside className="pdf-inspector" aria-label="PDF passage and text tools">
      <DocumentPanel doc={doc} hash={input.hash} title={input.title} onSelection={select} onJump={page=>setJump({page,ticket:Date.now()})}/>
      <p className="pdf-eyebrow">Read · Select · Explore</p><h2>A passage to hold</h2>
      <p role="status">{notice}</p>
      {anchorWarning&&<p className="pdf-warning">{anchorWarning}</p>}
      {chosen?<><blockquote>{chosen.selection.selectedText}</blockquote><p className="pdf-small">Pages {chosen.provenance.map(p=>p.pageIndex+1).join(', ')} · {chosen.provenance.some(p=>p.method==='ocr')?'Includes recognized text':'Embedded PDF text'}</p></>:<p>Select directly over the words on the page. Covers, notes, illustrations and every supplied page remain available.</p>}
      <div className="pdf-actions"><button onClick={save}>Save position & passage</button><button onClick={restore}>Reopen saved</button>{chosen&&<button onClick={()=>{const l=chosen.anchors[0].locators[0];if(l.kind==='pdf')setJump({page:l.pageIndex,ticket:Date.now()});}}>Return to passage</button>}</div>
      {chosen&&<button disabled={assistBusy} onClick={()=>void assist()}>{assistBusy?'Running…':'Try mock assistance'}</button>}
      {artifacts.map(a=><ArtifactView key={a.id} artifact={a} state={{}} onStateChange={()=>{}}/>)}
      <details open className="pdf-tools"><summary>Text on this page</summary>
        <p className="pdf-small">{page?`Page ${page.pageIndex+1} · ${page.method==='ocr'?'Local OCR (English)':'Embedded PDF text'}`:'Text is being prepared for the visible page.'}</p>
        {page?.reviewRequired&&<p className="pdf-warning">Recognition needs review. {page.quality.reasons.join('. ')}. The original page is always available.</p>}
        {page?.quality.ambiguousLayout&&<p>Columns or marginal notes may make the reading order ambiguous.</p>}
        <button onClick={()=>{setRetry({page:currentPage,ticket:Date.now()});setNotice('Retrying this page with local English OCR.');}}>Retry with OCR</button>
        {page&&<details><summary>Extracted text</summary><pre>{page.source.text||'No text recognized. This may be an illustration or blank page.'}</pre></details>}
        {page?.ocr&&<><details><summary>Raw OCR output</summary><pre>{page.ocr.rawText??page.ocr.text}</pre></details><details><summary>Original embedded text</summary><pre>{page.native.text||'No embedded text.'}</pre></details></>}
        {page&&<div className="pdf-layout"><p>Optional reading order & headings</p><p className="pdf-small">{layoutConfig.available?`Sends this page’s text and positions to ${layoutConfig.label}.`:'No external layout service is configured. Reading and local OCR work without one.'}</p><button disabled={!layoutConfig.available||layoutBusy} onClick={()=>void suggestLayout()}>{layoutBusy?'Requesting suggestion…':'Suggest layout'}</button>
          {page.layout&&<details open><summary>Suggested order · {page.layout.provider}</summary><div className="pdf-derived">{page.layout.proposal.order.map(id=>{const f=page.source.fragments.find(f=>f.id===id);const h=page.layout?.proposal.headings.find(h=>h.fragmentId===id);return h?<strong key={id}>{f?.text} </strong>:<span key={id}>{f?.text} </span>;})}</div></details>}
        </div>}
      </details>
      <p className="pdf-small">Opening PDFs and OCR happen on this device. Mock assistance sends your selected passage to this app’s server. Optional layout sends the current page’s text to your configured service.</p>
    </aside>
  </div>;
}
