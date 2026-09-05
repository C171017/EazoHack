'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { BookPreview } from '../reader/book-preview';
import { Button } from '@/ui/components/button';
import { SelectionSchema, SourceAnchorSchema, ArtifactSchema, RouteRunSchema, type Selection, type SourceAnchor, type Artifact, type RouteKind, type RouteRun } from '@/shared/schemas';
import { createWorkspaceRepository, type WorkspaceSnapshot } from '../persistence';
import { ArtifactView } from './artifact-view';
const BookMap = dynamic(()=>import('../book-graph/book-map').then(m=>m.BookMap),{ssr:false});
const routes: {kind:RouteKind;label:string;symbol:string}[] = [
  {kind:'interactive_ui',label:'Interactive UI',symbol:'↔'},
  {kind:'generated_image',label:'Image',symbol:'▧'},
  {kind:'concept_diagram',label:'Concept diagram',symbol:'◇'},
  {kind:'source_discovery',label:'Sources',symbol:'⌕'},
];
const workspaceId = 'republic-scaffold-v1';
export function Workspace({preview}:{preview:BookPreview}) {
  const reader = useRef<HTMLDivElement>(null);
  const [selection,setSelection] = useState<Selection|null>(null);
  const [anchors,setAnchors] = useState<SourceAnchor[]>([]);
  const [selectedRoutes,setSelectedRoutes] = useState<RouteKind[]>(['interactive_ui','concept_diagram']);
  const [runs,setRuns] = useState<RouteRun[]>([]);
  const [artifacts,setArtifacts] = useState<Artifact[]>([]);
  const [saved,setSaved] = useState<WorkspaceSnapshot|null>(null);
  const [busy,setBusy] = useState(false);
  const [,setNotice] = useState('Select a passage to begin.');
  const [failImage,setFailImage] = useState(false);
  const [viewport,setViewport] = useState<WorkspaceSnapshot['graphViewport']>(null);
  const [interactionState,setInteractionState] = useState<WorkspaceSnapshot['interactionState']>({});
  const [ready,setReady] = useState(false);
  const [panelOpen,setPanelOpen] = useState(false);
  const activeRequest = useRef(0);
  useEffect(()=>{
    const repository = createWorkspaceRepository();
    let alive=true;
    repository.load(workspaceId).then(snapshot=>{
      if (!alive) return;
      if (snapshot) {
        setSaved(snapshot);setSelection(snapshot.selections[0]??null);setAnchors(snapshot.anchors);
        setArtifacts(snapshot.artifacts);setViewport(snapshot.graphViewport);setInteractionState(snapshot.interactionState);
        setNotice('Restored your saved passage and mock results.');
      }
      setReady(true);
    }).catch(error=>{if(alive){setNotice(`Local restore failed: ${error.message}`);setReady(true);}});
    return ()=>{alive=false;void repository.close();};
  },[]);
  function captureSelection() {
    const domSelection=window.getSelection();
    const container=reader.current;
    if (!container || !domSelection?.rangeCount || domSelection.isCollapsed) return;
    const range=domSelection.getRangeAt(0);
    if(!container.contains(range.startContainer)||!container.contains(range.endContainer)) return;
    const before=range.cloneRange();before.selectNodeContents(container);before.setEnd(range.startContainer,range.startOffset);
    const relativeStart=before.toString().length;
    const text=range.toString();
    if(!text.trim()) return;
    const startOffset=preview.startOffset+relativeStart;
    const anchor=SourceAnchorSchema.parse({id:crypto.randomUUID(),bookId:'plato-republic',fileHash:preview.fileHash,extractionVersion:preview.extractionVersion,locators:[{kind:'txt',startOffset,endOffset:startOffset+text.length}],quote:text,prefix:preview.text.slice(Math.max(0,relativeStart-40),relativeStart),suffix:preview.text.slice(relativeStart+text.length,relativeStart+text.length+40),resolution:'exact'});
    const next=SelectionSchema.parse({id:crypto.randomUUID(),bookId:'plato-republic',anchorIds:[anchor.id],selectedText:text,contextSnapshot:'Book I opening excerpt; Benjamin Jowett third edition.',createdAt:new Date().toISOString()});
    activeRequest.current++;setBusy(false);setSelection(next);setAnchors([anchor]);setArtifacts([]);setRuns([]);setInteractionState({});
    setPanelOpen(true);
    setNotice('Passage selected. Mock controls below exercise the scaffold only.');
    domSelection.removeAllRanges();
  }
  async function exercise() {
    if(!selection||!selectedRoutes.length)return;
    const frozen=selection, ticket=++activeRequest.current;
    setBusy(true);setArtifacts([]);setRuns([]);setInteractionState({});setNotice('Running explicit mock fixtures…');
    try {
      const planResponse=await fetch('/api/route-plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({selection:frozen,routes:selectedRoutes,mode:'mock'})});
      const planBody=await planResponse.json();if(!planResponse.ok)throw new Error(planBody.error?.message??'Route plan rejected');
      const response=await fetch('/api/assist/all',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({selection:frozen,plan:planBody.plan,mode:'mock',failKinds:failImage?['generated_image']:[]})});
      const body=await response.json();if(!response.ok)throw new Error(body.error?.message??'Mock request failed');
      const nextArtifacts=ArtifactSchema.array().parse(body.artifacts);
      if(nextArtifacts.some(artifact=>artifact.selectionId!==frozen.id))throw new Error('Result selection mismatch');
      if(ticket!==activeRequest.current)return;
      setRuns(RouteRunSchema.array().parse(body.runs));setArtifacts(nextArtifacts);
      setNotice('Mock exercise complete. No model, image, or search service was called.');
    }catch(error){if(ticket===activeRequest.current)setNotice(error instanceof Error?error.message:'Request failed');}
    finally{if(ticket===activeRequest.current)setBusy(false);}
  }
  async function save() {
    if(!selection)return;
    const repository=createWorkspaceRepository();
    try {
      const snapshot=await repository.save({schemaVersion:1,id:workspaceId,bookId:selection.bookId,selections:[selection],anchors,artifacts:artifacts.map(artifact=>({...artifact,savedAt:new Date().toISOString()})),interactionState,graphViewport:viewport,bookmarks:selection.anchorIds,savedAt:new Date().toISOString()});
      setSaved(snapshot);setNotice('Saved in this browser. Refresh to restore the passage and mock results.');
    }catch(error){setNotice(`Not saved: ${error instanceof Error?error.message:'Storage error'}`);}
    finally{await repository.close();}
  }
  const activeAnchor=anchors[0];
  const offset=activeAnchor?.locators[0].kind==='txt'?activeAnchor.locators[0].startOffset-preview.startOffset:-1;
  const validHighlight=activeAnchor?.fileHash===preview.fileHash&&activeAnchor?.extractionVersion===preview.extractionVersion&&offset>=0&&preview.text.slice(offset,offset+(activeAnchor?.quote.length??0))===activeAnchor?.quote;
  return <main className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <section className="flex min-h-0 flex-col border-b border-line lg:w-[45%] lg:border-r lg:border-b-0" aria-label="Book reader">
        <div className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto px-8 py-9 lg:px-12 xl:px-16">
          <div className="mb-8 flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-muted"><span className="h-px w-8 bg-line"/>The Republic / Book I</div>
          <h1 className="font-reading text-4xl">A conversation begins.</h1>
          <p className="mt-3 mb-9 text-xs leading-6 text-muted">Opening excerpt · Stephanus 327 onward<br/>Select any part of the original text to hold it in context.</p>
          <div ref={reader} onMouseUp={captureSelection} onKeyUp={captureSelection} className="font-reading text-[17px] leading-[1.95] selection:bg-highlight" data-testid="book-text">
            {preview.text.split(/(?<=\n\n)/).map((paragraph,index,all)=>{
              const start=all.slice(0,index).reduce((sum,text)=>sum+text.length,0);
              const from=Math.max(0,offset-start),to=Math.min(paragraph.length,offset+(activeAnchor?.quote.length??0)-start);
              return <span key={index} className="mb-6 block">{validHighlight&&to>from?<>{paragraph.slice(0,from)}<mark className="rounded-sm bg-highlight text-ink">{paragraph.slice(from,to)}</mark>{paragraph.slice(to)}</>:paragraph}</span>;
            })}
          </div>
          <div className="mt-10 border-t border-line pt-5 text-xs leading-6 text-muted">End of reading preview. The complete source is preserved locally; full-book navigation and analysis are not implemented.</div>
        </div>
      </section>
      <section className="relative min-h-[65vh] flex-1 overflow-hidden bg-paper lg:min-h-0" aria-label="Exploration workspace">
        <div className="absolute inset-0">{ready&&<BookMap onViewportChange={setViewport} viewport={viewport}/>}</div>
        {!panelOpen&&<button type="button" aria-expanded="false" aria-controls="passage-panel" onClick={()=>setPanelOpen(true)} className="absolute right-5 bottom-5 z-10 flex items-center gap-3 rounded-full border border-line bg-paper/95 px-4 py-3 text-xs font-medium text-ink shadow-panel backdrop-blur-sm transition hover:bg-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moss"><span className="text-moss">⌃</span><span>Open passage panel</span><span className="text-[10px] font-normal text-muted">{selection?`${selection.selectedText.length} characters`:'No selection'}</span></button>}
        {panelOpen&&<div id="passage-panel" className="absolute inset-x-4 bottom-4 z-10 flex max-h-[62%] flex-col overflow-hidden rounded-panel border border-line bg-paper/95 shadow-panel backdrop-blur-md xl:inset-x-7 xl:bottom-7">
          <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
            <div><h2 className="text-xs font-semibold uppercase tracking-widest text-moss">A passage to explore</h2><p className="mt-1 text-[10px] text-muted">{selection?`${selection.selectedText.length} characters selected`:'Nothing selected'}</p></div>
            <button type="button" aria-expanded="true" aria-controls="passage-panel" onClick={()=>setPanelOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium text-muted transition hover:bg-mist hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moss"><span>Hide panel</span><span aria-hidden="true">⌄</span></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <div>
              {selection?<blockquote className="max-h-24 overflow-auto border-l-2 border-moss pl-3 font-reading text-sm leading-6">{selection.selectedText}</blockquote>:<p className="font-reading text-lg text-muted">Every question starts somewhere.<br/><span className="text-sm">Highlight a passage in the book to get started.</span></p>}
              {selection&&!validHighlight&&<p className="mt-3 text-xs text-warning">The saved quote could not be located in this source version. Original selected text is preserved.</p>}<div className="mt-5 border-t border-line pt-4"><p className="mb-3 text-[11px] text-muted">Mock test controls · routing and trigger policy remain open</p>
                <div className="flex flex-wrap gap-2">{routes.map(route=><label key={route.kind} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-mist px-2.5 py-2 text-[11px]"><input type="checkbox" checked={selectedRoutes.includes(route.kind)} onChange={()=>setSelectedRoutes(current=>current.includes(route.kind)?current.filter(kind=>kind!==route.kind):[...current,route.kind])} className="accent-moss"/><span className="text-moss">{route.symbol}</span>{route.label}</label>)}</div>
                <div className="mt-4 flex flex-wrap items-center gap-2"><Button variant="primary" disabled={!ready||!selection||!selectedRoutes.length||busy} onClick={exercise}>{busy?'Running fixtures…':'Run mock exercise'} <span>↗</span></Button><Button disabled={!ready||!selection||busy} onClick={save}>Save locally</Button><label className="ml-auto flex items-center gap-1.5 text-[10px] text-muted"><input type="checkbox" checked={failImage} onChange={e=>setFailImage(e.target.checked)} className="accent-moss"/>Simulate image failure</label></div>
              </div>
            </div>
            <div className="mt-4 space-y-3">{runs.filter(run=>run.status==='failed'||run.status==='cancelled').map(run=><div key={run.id} className="rounded-xl border border-line bg-mist p-4 text-xs text-warning"><strong>{routes.find(route=>route.kind===run.route)?.label}: {run.status}</strong><p className="mt-1">{run.error?.message}</p></div>)}{artifacts.map(artifact=><ArtifactView key={artifact.id} artifact={artifact} state={interactionState[artifact.id]??{}} onStateChange={state=>setInteractionState(current=>({...current,[artifact.id]:state}))}/>)}</div>
            {saved&&<div className="mt-5 flex items-center justify-between border-t border-line pt-4 text-[11px] text-muted"><span>One local reading checkpoint · {saved.artifacts.length} mock results</span><Button variant="ghost" onClick={()=>{activeRequest.current++;setBusy(false);setSelection(saved.selections[0]??null);setAnchors(saved.anchors);setArtifacts(saved.artifacts);setInteractionState(saved.interactionState);setRuns([]);setNotice('Opened the saved checkpoint.');reader.current?.scrollIntoView({block:'start',behavior:'smooth'});}}>Revisit ↗</Button></div>}
          </div>
        </div>}
      </section>
    </div>
  </main>;
}
