'use client';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { BookPreview } from '../reader/book-preview';
import { readUploadedBook, type UploadedBook } from '../reader/upload-book';
import { PdfWorkspace } from '../reader/pdf/pdf-workspace';
import { Button } from '@/ui/components/button';
import { SelectionSchema, SourceAnchorSchema, ArtifactSchema, RouteRunSchema, type Selection, type SourceAnchor, type RouteKind } from '@/shared/schemas';
import type { WorkspaceSnapshot } from '../persistence';
import { recordSelectionActivity, selectionTimestamp } from '../persistence/selection-activity';
import type { MapBootstrap } from '@/shared/zoom-hierarchy';
import { resolveTxtAnchor } from '../reader/source-anchor';
import { artifactEnhancement, routeEnhancement } from '@/shared/enhancements';
import type { EnhancementHighlight } from '../reader/enhancement-highlights';
import { enhancementHistoryReducer, emptyEnhancementHistory } from './enhancement-history';
import { ArtifactView } from './artifact-view';
import { ContinuousTxtReader, type ContinuousTxtReaderHandle, type TxtSelectionRange, type ReaderSlot } from '../reader/continuous-txt-reader';
import { placementsFor } from '../reader/artifact-placement';
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
  const [mapAnchor,setMapAnchor] = useState<SourceAnchor|null>(null);
  const [mapView,setMapView] = useState<WorkspaceSnapshot['mapView']>(null);
  const reader = useRef<ContinuousTxtReaderHandle>(null);
  const [readingPosition, setReadingPosition] = useState(0);
  const scrollReader = useCallback((delta: number) => reader.current?.scrollBy(delta), []);
  const [selection,setSelection] = useState<Selection|null>(null);
  const [selections,setSelections] = useState<Selection[]>([]);
  const [history, dispatchEnhancements] = useReducer(enhancementHistoryReducer, emptyEnhancementHistory);
  const { artifacts, placements, interactionState } = history.present;
  const setInteractionState = useCallback((update: (current: WorkspaceSnapshot['interactionState']) => WorkspaceSnapshot['interactionState']) => dispatchEnhancements({ type: 'update', update: state => ({ ...state, interactionState: update(state.interactionState) }) }), []);
  const [anchors,setAnchors] = useState<SourceAnchor[]>([]);
  const [requests,setRequests]=useState<Record<string,{routes:RouteKind[];message:string;failed:boolean}>>({});
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState('Select a passage to begin.');
  const activeRequest = useRef(0);
  const sourceRequest = useRef(0);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.repeat || event.altKey || !(event.metaKey || event.ctrlKey)) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"]'))) return;
      const key = event.key.toLowerCase();
      const undo = key === 'z' && !event.shiftKey;
      const redo = (key === 'z' && event.shiftKey) || (key === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey);
      if (!(undo ? history.past.length : redo ? history.future.length : 0)) return;
      event.preventDefault();
      dispatchEnhancements({ type: undo ? 'undo' : 'redo' });
      setNotice(undo ? 'Undid the latest enhancement generation.' : 'Restored the enhancement generation.');
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [history.past.length, history.future.length]);
  const captureSelection = useCallback((range:TxtSelectionRange) => {
    const selectedAt = selectionTimestamp();
    const record = (selected: Selection, sourceAnchors: SourceAnchor[]) => {
      void recordSelectionActivity(selected, sourceAnchors, selectedAt).catch(() => {
        setNotice('Passage selected, but its selection time could not be saved on this device.');
      });
    };
    const existing=anchors.find(anchor=>selection?.anchorIds.includes(anchor.id));
    const locator=existing?.locators[0];
    if(selection&&existing&&resolveTxtAnchor(existing,preview)&&locator?.kind==='txt'&&locator.startOffset===range.startOffset&&locator.endOffset===range.endOffset){record(selection,[existing]);return;}
    try {
      const anchor=SourceAnchorSchema.parse({id:crypto.randomUUID(),bookId,fileHash:preview.fileHash,extractionVersion:preview.extractionVersion,locators:[{kind:'txt',startOffset:range.startOffset,endOffset:range.endOffset}],quote:range.quote,prefix:range.prefix,suffix:range.suffix,resolution:'exact'});
      const next=SelectionSchema.parse({id:crypto.randomUUID(),bookId,anchorIds:[anchor.id],selectedText:range.quote,contextSnapshot:`Book: ${title}\nBefore selection: ${range.prefix}\nAfter selection: ${range.suffix}`,createdAt:selectedAt});
      sourceRequest.current++;setMapAnchor(null);setMapView(current=>current?{...current,readerAnchorId:null}:null);setSelection(next);setSelections(current=>[next,...current]);setAnchors(current=>[...current,anchor]);
      setNotice('Passage selected. Choose an enhancement beside the selection.');
      record(next,[anchor]);
    } catch {
      setNotice('Select a non-empty passage shorter than 20,000 characters.');
    }
  },[preview,selection,anchors,bookId,title]);
  const exercise = useCallback(async (target:Selection|null, kinds:RouteKind[]) => {
    if(!target||!kinds.length||busy)return;
    const frozen=target, ticket=++activeRequest.current;
    setRequests(current=>({...current,[frozen.id]:{routes:kinds,message:'Generating assistance…',failed:false}}));
    setBusy(true);setNotice(kinds.includes('generated_image') ? 'Creating an illustration of the selected passage…' : 'Reading the selected passage…');
    try {
      const planResponse=await fetch('/api/route-plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({selection:frozen,routes:kinds,mode:'real'})});
      const planBody=await planResponse.json();if(!planResponse.ok)throw new Error(planBody.error?.message??'Route plan rejected');
      const response=await fetch('/api/assist/all',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({selection:frozen,plan:planBody.plan,mode:'real'})});
      const body=await response.json();if(!response.ok)throw new Error(body.error?.message??'Generation request failed');
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
  }, [anchors,busy]);
  const enhanceSelection = useCallback((route:RouteKind) => {
    void exercise(selection,[route]);
  }, [exercise,selection]);
  function readMapSource(anchor:SourceAnchor) {
    const ticket=++sourceRequest.current;
    const locator=resolveTxtAnchor(anchor,{...preview,bookId:graph.bookId});
    if(!locator){setNotice('This note’s passage could not be located in this source version.');return;}
    setMapAnchor(anchor);
    setNotice('Showing the note’s source passage.');
    requestAnimationFrame(()=>{if(ticket===sourceRequest.current)reader.current?.scrollToOffset(locator.startOffset,window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth');});
  }
  const activeAnchor=mapAnchor??anchors.find(a=>selection?.anchorIds.includes(a.id));
  const enhancements = useMemo(() => {
    const marks: EnhancementHighlight[] = [];
    for (const artifact of artifacts) {
      const kind = artifactEnhancement(artifact);
      if (!kind) continue;
      for (const id of artifact.anchorIds) {
        const range = resolveTxtAnchor(anchors.find(a => a.id === id), {...preview, bookId});
        if (range) marks.push({...range, kind});
      }
    }
    for (const [id, request] of Object.entries(requests)) {
      if (request.failed) continue;
      const selected = selections.find(s => s.id === id);
      for (const anchorId of selected?.anchorIds ?? []) {
        const range = resolveTxtAnchor(anchors.find(a => a.id === anchorId), {...preview, bookId});
        if (!range) continue;
        for (const route of request.routes) {
          const kind = routeEnhancement(route);
          if (kind) marks.push({...range, kind});
        }
      }
    }
    return marks;
  }, [artifacts, anchors, preview, bookId, requests, selections]);

  // Camera updates must not rebuild reader props. Keep every assistance input
  // in the dependency list so selection, retry and undo stay current.
  const slots = useMemo(() => {
    const slots:ReaderSlot[]=[];
    for(const placement of [...placements].sort((a,b)=>a.order-b.order)){
      const artifact=artifacts.find(a=>a.id===placement.artifactId);
      const anchor=anchors.find(a=>a.id===placement.anchorId);
      const locator=resolveTxtAnchor(anchor,{...preview,bookId});
      if(!artifact||!locator||locator.endOffset!==placement.offset)continue;
      slots.push({id:artifact.id,offset:placement.offset,content:<ArtifactView artifact={artifact} state={interactionState[artifact.id]??{}} onStateChange={state=>setInteractionState(current=>({...current,[artifact.id]:state}))}/>});
    }
    for(const [id,status] of Object.entries(requests)){
      const selected=selections.find(s=>s.id===id),anchor=anchors.find(a=>selected?.anchorIds.includes(a.id));
      const locator=resolveTxtAnchor(anchor,{...preview,bookId});
      if(!locator||!selected)continue;
      slots.push({id:`request-${id}`,offset:locator.endOffset,content:<div role="status" className="rounded-lg border border-line p-3 text-xs">{status.message}{status.failed&&<Button disabled={busy} onClick={()=>void exercise(selected,status.routes)}>Retry failed routes</Button>}</div>});
    }
    return slots;
  }, [placements,artifacts,anchors,preview,bookId,interactionState,setInteractionState,requests,selections,busy,exercise]);
  const unresolvedArtifacts=useMemo(()=>artifacts.filter(a=>!slots.some(s=>s.id===a.id)),[artifacts,slots]);

  return <main className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <section data-timeline-navigation={!graph.unavailable} className="txt-reader-pane flex min-h-0 flex-col border-b border-line lg:w-[45%] lg:border-r lg:border-b-0" aria-label="Book reader">
        {!!unresolvedArtifacts.length&&<details className="p-4 text-xs"><summary>{unresolvedArtifacts.length} results could not be placed in this source version</summary>{unresolvedArtifacts.map(artifact=><ArtifactView key={artifact.id} artifact={artifact} state={interactionState[artifact.id]??{}} onStateChange={state=>setInteractionState(current=>({...current,[artifact.id]:state}))}/>)}</details>}
        <p role="status" className="sr-only">{notice}</p>
        <ContinuousTxtReader ref={reader} onReadingPosition={setReadingPosition} title={title} bookId={bookId} onUpload={onUpload} onReset={onReset} sourceText={preview.sourceText} fileHash={preview.fileHash} extractionVersion={preview.extractionVersion} activeAnchor={activeAnchor??null} onSelection={captureSelection} onEnhance={enhanceSelection} enhancementBusy={busy} slots={slots} enhancements={enhancements}/>
      </section>
      <section className="exploration-space relative min-h-[960px] flex-1 overflow-hidden lg:min-h-0" aria-label="Exploration workspace">
        <div className="absolute inset-0">{graph.unavailable?<div className="p-8 text-sm text-muted" role="status"><h2 className="mb-3 font-reading text-xl text-ink">The book map is not ready</h2><p>You can read and explore selected passages. A whole-book map requires separate analysis of this book.</p>{bookId === "plato-republic" && <button className="mt-4 underline" onClick={()=>window.location.reload()}>Reload map</button>}</div>:<BookMap key={graph.version} graph={graph} view={mapView} readingProgress={readingPosition / Math.max(1, preview.sourceText.length)} onScrollSource={scrollReader} onViewChange={setMapView} onSource={readMapSource}/>}</div>

      </section>
    </div>
  </main>;
}
