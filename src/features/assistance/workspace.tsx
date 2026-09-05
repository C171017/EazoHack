'use client';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { BookPreview } from '../reader/book-preview';
import { readUploadedBook, type UploadedBook } from '../reader/upload-book';
import { PdfWorkspace } from '../reader/pdf/pdf-workspace';
import { Button } from '@/ui/components/button';
import { SelectionSchema, SourceAnchorSchema, ArtifactSchema, RouteRunSchema, type Selection, type SourceAnchor, type RouteKind } from '@/shared/schemas';
import { createWorkspaceRepository, type WorkspaceSnapshot } from '../persistence';
import type { MapBootstrap } from '@/shared/zoom-hierarchy';
import { readMap } from '../book-graph/map-data';
import { initialView } from '../book-graph/projection';
import { resolveTxtAnchor } from '../reader/source-anchor';
import { enhancementHistoryReducer, emptyEnhancementHistory } from './enhancement-history';
import { ArtifactView, artifactLabel } from './artifact-view';
import { ContinuousTxtReader, type ContinuousTxtReaderHandle, type TxtSelectionRange, type ReaderSlot } from '../reader/continuous-txt-reader';
import { placementsFor, type ArtifactPlacement } from '../reader/artifact-placement';
const BookMap = dynamic(()=>import('../book-graph/book-map').then(m=>m.BookMap),{ssr:false});

export function Workspace({preview,graph}:{preview:BookPreview;graph:MapBootstrap}) {
  const [uploaded, setUploaded] = useState<UploadedBook | null>(null);
  async function upload(file: File) { setUploaded(await readUploadedBook(file)); }
  if (uploaded?.kind === 'pdf') return <PdfWorkspace key={uploaded.hash} initialInput={{ id: 1, title: uploaded.title, hash: uploaded.hash, data: uploaded.data }} onReturn={() => setUploaded(null)} />;
  const activeGraph: MapBootstrap = uploaded ? { bookId: uploaded.bookId, graphVersion: uploaded.bookId, version: uploaded.bookId, roots: [], depth: 0, totalNodes: 0, unplaced: 0, territories: [], unavailable: true } : graph;
  return <TextWorkspace key={uploaded?.bookId ?? graph.bookId} preview={uploaded?.preview ?? preview} graph={activeGraph} title={uploaded?.title ?? 'The Republic of Plato.'} onUpload={upload} onReset={uploaded ? () => setUploaded(null) : undefined} />;
}

function TextWorkspace({preview, graph, title, onUpload, onReset}: {preview: BookPreview; graph: MapBootstrap; title: string; onUpload: (file: File) => Promise<void>; onReset?: () => void}) {
  const bookId = graph.bookId;
  const workspaceId = bookId === 'plato-republic' ? 'republic-scaffold-v1' : `reading:${bookId}`;
  const [mapAnchor,setMapAnchor] = useState<SourceAnchor|null>(null);
  const [mapView,setMapView] = useState<WorkspaceSnapshot['mapView']>(null);
  const reader = useRef<ContinuousTxtReaderHandle>(null);
  const [selection,setSelection] = useState<Selection|null>(null);
  const [selections,setSelections] = useState<Selection[]>([]);
  const [history, dispatchEnhancements] = useReducer(enhancementHistoryReducer, emptyEnhancementHistory);
  const { artifacts, placements, interactionState } = history.present;
  const setPlacements = (update: (current: ArtifactPlacement[]) => ArtifactPlacement[]) => dispatchEnhancements({ type: 'update', update: state => ({ ...state, placements: update(state.placements) }) });
  const setInteractionState = (update: (current: WorkspaceSnapshot['interactionState']) => WorkspaceSnapshot['interactionState']) => dispatchEnhancements({ type: 'update', update: state => ({ ...state, interactionState: update(state.interactionState) }) });
  const [anchors,setAnchors] = useState<SourceAnchor[]>([]);
  const [requests,setRequests]=useState<Record<string,{routes:RouteKind[];message:string;failed:boolean}>>({});
  const [saved,setSaved] = useState<WorkspaceSnapshot|null>(null);
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState('Select a passage to begin.');
  const [ready,setReady] = useState(false);
  const activeRequest = useRef(0);
  const sourceRequest = useRef(0);
  useEffect(()=>{
    const repository = createWorkspaceRepository();
    let alive=true;const sourceTicket=++sourceRequest.current;
    repository.load(workspaceId).then(snapshot=>{
      if (!alive) return;
      if (snapshot) {
        setSelections(snapshot.selections);setSaved(snapshot);setSelection(snapshot.selections[0]??null);setAnchors(snapshot.anchors);
        dispatchEnhancements({type:'reset',state:{artifacts:snapshot.artifacts,placements:placementsFor(snapshot.artifacts,snapshot.anchors,snapshot.placements),interactionState:snapshot.interactionState}});setMapView(snapshot.mapView?.graphVersion===graph.graphVersion?snapshot.mapView:null);setMapAnchor(null);if(snapshot.mapView?.graphVersion===graph.graphVersion&&snapshot.mapView.readerAnchorId)void readMap<{anchor:SourceAnchor}>(graph.version,{kind:'anchor',id:snapshot.mapView.readerAnchorId}).then(result=>{if(alive&&sourceTicket===sourceRequest.current)setMapAnchor(result.anchor);}).catch(()=>{});
        setNotice('Restored your saved view, passage and results.');
        if (snapshot.readerPosition?.fileHash===preview.fileHash&&snapshot.readerPosition.extractionVersion===preview.extractionVersion) {
          requestAnimationFrame(()=>reader.current?.scrollToOffset(snapshot.readerPosition!.startOffset));
        }
      }
      setReady(true);
    }).catch(error=>{if(alive){setNotice(`Local restore failed: ${error.message}`);setReady(true);}});
    return ()=>{alive=false;void repository.close();};
  },[graph.graphVersion,graph.version,preview.extractionVersion,preview.fileHash,workspaceId]);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.repeat || event.altKey || !(event.metaKey || event.ctrlKey)) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"]'))) return;
      const key = event.key.toLowerCase();
      const undo = key === 'z' && !event.shiftKey;
      const redo = (key === 'z' && event.shiftKey) || (key === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey);
      if (!ready || !(undo ? history.past.length : redo ? history.future.length : 0)) return;
      event.preventDefault();
      dispatchEnhancements({ type: undo ? 'undo' : 'redo' });
      setNotice(undo ? 'Undid the latest enhancement generation.' : 'Restored the enhancement generation.');
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [history.past.length, history.future.length, ready]);
  const captureSelection = useCallback((range:TxtSelectionRange) => {
    const existing=anchors.find(anchor=>selection?.anchorIds.includes(anchor.id));
    const locator=existing?.locators[0];
    if(locator?.kind==='txt'&&locator.startOffset===range.startOffset&&locator.endOffset===range.endOffset){return;}
    try {
      const anchor=SourceAnchorSchema.parse({id:crypto.randomUUID(),bookId,fileHash:preview.fileHash,extractionVersion:preview.extractionVersion,locators:[{kind:'txt',startOffset:range.startOffset,endOffset:range.endOffset}],quote:range.quote,prefix:range.prefix,suffix:range.suffix,resolution:'exact'});
      const next=SelectionSchema.parse({id:crypto.randomUUID(),bookId,anchorIds:[anchor.id],selectedText:range.quote,contextSnapshot:`Complete TXT source: ${title}`,createdAt:new Date().toISOString()});
      sourceRequest.current++;setMapAnchor(null);setMapView(current=>current?{...current,readerAnchorId:null}:null);setSelection(next);setSelections(current=>[next,...current]);setAnchors(current=>[...current,anchor]);
      setNotice('Passage selected. Choose an enhancement beside the selection.');
    } catch {
      setNotice('Select a non-empty passage shorter than 20,000 characters.');
    }
  },[preview.extractionVersion,preview.fileHash,selection,anchors,bookId,title]);
  async function exercise(target:Selection|null=selection, kinds:RouteKind[]=[]) {
    if(!target||!kinds.length||busy)return;
    const frozen=target, ticket=++activeRequest.current;
    setRequests(current=>({...current,[frozen.id]:{routes:kinds,message:'Generating assistance…',failed:false}}));
    setBusy(true);setNotice('Gemini 3.8 Flash is reading the selected passage…');
    try {
      const planResponse=await fetch('/api/route-plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({selection:frozen,routes:kinds,mode:'real'})});
      const planBody=await planResponse.json();if(!planResponse.ok)throw new Error(planBody.error?.message??'Route plan rejected');
      const response=await fetch('/api/assist/all',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({selection:frozen,plan:planBody.plan,mode:'real'})});
      const body=await response.json();if(!response.ok)throw new Error(body.error?.message??'Gemini request failed');
      const nextArtifacts=ArtifactSchema.array().parse(body.artifacts);
      if(nextArtifacts.some(artifact=>artifact.selectionId!==frozen.id||artifact.bookId!==frozen.bookId||artifact.anchorIds.some(id=>!frozen.anchorIds.includes(id))))throw new Error('Result selection mismatch');
      if(ticket!==activeRequest.current)return;
      const failures=RouteRunSchema.array().parse(body.runs).filter(run=>run.status==='failed'||run.status==='cancelled');
      dispatchEnhancements({type:'generate',artifacts:nextArtifacts,placements:placementsFor(nextArtifacts,anchors)});
      setRequests(current=>{
        if(failures.length)return {...current,[frozen.id]:{routes:failures.map(r=>r.route),message:failures.map(r=>`${r.route}: ${r.error?.message??r.status}`).join(' '),failed:true}};
        const next={...current};delete next[frozen.id];return next;
      });
      setNotice('Results added to their original passage.');
    }catch(error){if(ticket===activeRequest.current){const message=error instanceof Error?error.message:'Request failed';setNotice(message);setRequests(current=>({...current,[frozen.id]:{routes:kinds,message,failed:true}}));}}
    finally{if(ticket===activeRequest.current)setBusy(false);}
  }
  async function save() {
    const repository=createWorkspaceRepository();
    try {
      const snapshot=await repository.save({schemaVersion:1,id:workspaceId,bookId,selections,anchors,placements,artifacts:artifacts.map(artifact=>({...artifact,savedAt:new Date().toISOString()})),interactionState,graphViewport:null,mapView:mapView?.graphVersion===graph.graphVersion&&(!mapView.hierarchyVersion||mapView.hierarchyVersion===graph.version)?{...mapView,hierarchyVersion:graph.version}:{...initialView(graph.graphVersion),hierarchyVersion:graph.version,sourceScope:graph.analysis?'book':'excerpt'},readerPosition:{fileHash:preview.fileHash,extractionVersion:preview.extractionVersion,startOffset:reader.current?.getReadingPosition()??0},bookmarks:selection?.anchorIds??[],savedAt:new Date().toISOString()});
      setSaved(snapshot);setNotice('Saved locally · view, passage and results.');
    }catch(error){setNotice(`Not saved: ${error instanceof Error?error.message:'Storage error'}`);}
    finally{await repository.close();}
  }
  function readMapSource(anchor:SourceAnchor) {
    const ticket=++sourceRequest.current;
    const locator=resolveTxtAnchor(anchor,{...preview,bookId:graph.bookId});
    if(!locator){setNotice('This note’s passage could not be located in this source version.');return;}
    setMapAnchor(anchor);
    setNotice('Showing the note’s source passage.');
    requestAnimationFrame(()=>{if(ticket===sourceRequest.current)reader.current?.scrollToOffset(locator.startOffset,window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth');});
  }
  const activeAnchor=mapAnchor??anchors.find(a=>selection?.anchorIds.includes(a.id));

  const slots:ReaderSlot[]=[];
  for(const placement of [...placements].sort((a,b)=>a.order-b.order)){
    const artifact=artifacts.find(a=>a.id===placement.artifactId);
    const anchor=anchors.find(a=>a.id===placement.anchorId);
    const locator=resolveTxtAnchor(anchor,{...preview,bookId:graph.bookId});
    if(!artifact||!locator||locator.endOffset!==placement.offset)continue;
    slots.push({id:artifact.id,offset:placement.offset,content:<>
      <div className="mb-2 flex gap-3 text-xs"><button aria-expanded={!placement.collapsed} onClick={()=>setPlacements(current=>current.map(p=>p.artifactId===artifact.id?{...p,collapsed:!p.collapsed}:p))}>{placement.collapsed?'Expand':'Collapse'} {artifactLabel(artifact)}</button></div>
      <div hidden={placement.collapsed}><ArtifactView artifact={artifact} state={interactionState[artifact.id]??{}} onStateChange={state=>setInteractionState(current=>({...current,[artifact.id]:state}))}/></div>
    </>});
  }
  for(const [id,status] of Object.entries(requests)){
    const selected=selections.find(s=>s.id===id),anchor=anchors.find(a=>selected?.anchorIds.includes(a.id));
    const locator=resolveTxtAnchor(anchor,{...preview,bookId:graph.bookId});
    if(!locator||!selected)continue;
    slots.push({id:`request-${id}`,offset:locator.endOffset,content:<div role="status" className="rounded-lg border border-line p-3 text-xs">{status.message}{status.failed&&<Button disabled={busy} onClick={()=>void exercise(selected,status.routes)}>Retry failed routes</Button>}</div>});
  }
  const unresolvedArtifacts=artifacts.filter(a=>!slots.some(s=>s.id===a.id));

  return <main className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <section className="txt-reader-pane flex min-h-0 flex-col border-b border-line lg:w-[45%] lg:border-r lg:border-b-0" aria-label="Book reader">
        {!!unresolvedArtifacts.length&&<details className="p-4 text-xs"><summary>{unresolvedArtifacts.length} saved results could not be placed in this source version</summary>{unresolvedArtifacts.map(artifact=><ArtifactView key={artifact.id} artifact={artifact} state={interactionState[artifact.id]??{}} onStateChange={state=>setInteractionState(current=>({...current,[artifact.id]:state}))}/>)}</details>}
        <details className="px-5 py-2 text-xs text-muted"><summary className="cursor-pointer">Reading session</summary>
          <p role="status" className="py-2">{notice}</p>
          <p className="pb-2">Explanation and Diagram send the selected passage to Google Vertex AI. Interactive panel and Illustration are not connected yet.</p>
          <Button disabled={!ready||busy} onClick={save}>Save locally</Button>
          {saved&&<Button variant="ghost" onClick={()=>{activeRequest.current++;setBusy(false);const sourceTicket=++sourceRequest.current;setMapAnchor(null);if(saved.mapView?.graphVersion===graph.graphVersion&&saved.mapView.readerAnchorId)void readMap<{anchor:SourceAnchor}>(graph.version,{kind:'anchor',id:saved.mapView.readerAnchorId}).then(result=>{if(sourceTicket===sourceRequest.current)setMapAnchor(result.anchor);}).catch(()=>{});setMapView(saved.mapView?.graphVersion===graph.graphVersion?saved.mapView:null);setSelections(saved.selections);setSelection(saved.selections[0]??null);setAnchors(saved.anchors);dispatchEnhancements({type:'reset',state:{artifacts:saved.artifacts,placements:placementsFor(saved.artifacts,saved.anchors,saved.placements),interactionState:saved.interactionState}});setRequests({});setNotice('Opened the saved checkpoint.');const position=saved.readerPosition?.fileHash===preview.fileHash&&saved.readerPosition.extractionVersion===preview.extractionVersion?saved.readerPosition.startOffset:0;reader.current?.scrollToOffset(position,'smooth');}}>Reopen saved checkpoint</Button>}
        </details>
        <ContinuousTxtReader ref={reader} title={title} bookId={bookId} onUpload={onUpload} onReset={onReset} sourceText={preview.sourceText} fileHash={preview.fileHash} extractionVersion={preview.extractionVersion} activeAnchor={activeAnchor??null} onSelection={captureSelection} onEnhance={route=>void exercise(selection,[route])} enhancementBusy={busy||!ready} slots={slots}/>
      </section>
      <section className="relative min-h-[960px] flex-1 overflow-hidden bg-paper lg:min-h-0" aria-label="Exploration workspace">
        <div className="absolute inset-0">{ready&&(graph.unavailable?<div className="p-8 text-sm text-muted" role="status"><h2 className="mb-3 font-reading text-xl text-ink">The book map is not ready</h2><p>You can read and explore selected passages. A whole-book map requires separate analysis of this book.</p>{bookId === "plato-republic" && <button className="mt-4 underline" onClick={()=>window.location.reload()}>Reload map</button>}</div>:<BookMap key={graph.version} graph={graph} view={mapView} onViewChange={setMapView} onSource={readMapSource}/>)}</div>

      </section>
    </div>
  </main>;
}
