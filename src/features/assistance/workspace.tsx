'use client';
import { useBookAnalysis } from '../book-graph/use-book-analysis';
import { sampleBook } from '@/shared/sample-books';
import { copyReadingToAccount } from '../cloud/copy-reading';
import type { CloudBook } from '../cloud/library';
import { cloudRequest } from '../cloud/request';
import { useReadingSync } from '../cloud/use-reading-sync';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { BookPreview } from '../reader/book-preview';
import { readUploadedBook, type UploadedBook, type TextBook } from '../reader/upload-book';
import { BookLibrary } from '../reader/book-library';
import libraryStyles from '../reader/book-library.module.css';
import { ensureBookEmblem } from '../reader/book-emblem-client';
import type { ShelfPlacement } from '../reader/bookshelf-model';
import { libraryForOwner, uploadedBookId } from '../reader/book-library-store';
import { IncompatiblePdfError, PDF_IMPORT_VERSION, pdfImportNote, type ImportState } from '../reader/pdf/import-model';
import { Button } from '@/ui/components/button';
import { SelectionSchema, SourceAnchorSchema, ArtifactSchema, RouteRunSchema, type Selection, type SourceAnchor, type RouteKind } from '@/shared/schemas';
import { type WorkspaceSnapshot } from '../persistence';
import { recordSelectionActivity, selectionTimestamp } from '../persistence/selection-activity';
import type { MapBootstrap } from '@/shared/zoom-hierarchy';
import { resolveTxtAnchor } from '../reader/source-anchor';
import { readingBookmark } from '../reader/reading-bookmark';
import { artifactEnhancement, routeEnhancement } from '@/shared/enhancements';
import type { EnhancementHighlight } from '../reader/enhancement-highlights';
import { enhancementHistoryReducer, emptyEnhancementHistory } from './enhancement-history';
import { ArtifactView } from './artifact-view';
import { ContinuousTxtReader, type ContinuousTxtReaderHandle, type TxtSelectionRange, type ReaderSlot } from '../reader/continuous-txt-reader';
import { placementsFor } from '../reader/artifact-placement';
import { completedFootprints } from '../book-graph/reading-heat';
import { useReadingFootprints } from '../book-graph/use-reading-footprints';
import { useHeatPlacement } from '../book-graph/use-heat-placement';
import { useMapActive } from '../book-graph/use-map-active';
const BookMap = dynamic(()=>import('../book-graph/book-map').then(m=>m.BookMap),{ssr:false});

const libraryGraph: MapBootstrap = { bookId: '', graphVersion: 'library', version: 'library', roots: [], depth: 0, totalNodes: 0, unplaced: 0, territories: [], unavailable: true };

export function Workspace({preview,graph = libraryGraph,initialTitle,cloudSourceId,cloudOwnerId,initialLibraryOpen = false}:{preview?:BookPreview;graph?:MapBootstrap;initialTitle?:string;cloudSourceId?:string;cloudOwnerId?:string;initialLibraryOpen?:boolean}) {
  const [uploadedCloud, setUploadedCloud] = useState<{ owner: string; source?: string } | null>(null);
  const [sampleCloud, setSampleCloud] = useState<{ owner: string; source: string } | null>(null);
  const [sampleStatus, setSampleStatus] = useState<'checking' | 'ready' | 'error'>(preview && sampleBook(graph.bookId) && !cloudOwnerId ? 'checking' : 'ready');
  const [sampleError, setSampleError] = useState('');
  const [sampleAttempt, setSampleAttempt] = useState(0);
  useEffect(() => {
    if (!preview || !sampleBook(graph.bookId) || cloudOwnerId) return;
    let active = true;
    async function connect() {
      const session = await cloudRequest('session');
      if (!session.id) { if (active) setSampleStatus('ready'); return; }
      const books: CloudBook[] = await cloudRequest('books', undefined, session.id);
      const source = books.find(book => book.local_book_id === graph.bookId)?.book_sources.find(source => source.file_hash === preview!.fileHash && source.extraction_version === preview!.extractionVersion);
      const sourceId = source?.id ?? (await copyReadingToAccount({ kind: 'txt', bookId: graph.bookId, preview: preview!, title: initialTitle ?? sampleBook(graph.bookId)!.title }, session.id, undefined, false)).sourceId;
      if (active) { setSampleCloud({ owner: session.id, source: sourceId }); setSampleStatus('ready'); }
    }
    void connect().catch(error => { if (active) { setSampleError(error.message); setSampleStatus('error'); } });
    return () => { active = false; };
  }, [preview, graph.bookId, cloudOwnerId, initialTitle, sampleAttempt]);
  const [uploaded, setUploaded] = useState<TextBook | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(initialLibraryOpen);
  const [reopenVersion, setReopenVersion] = useState(0);
  const [importState, setImportState] = useState<ImportState | null>(null);
  const [libraryRevision, setLibraryRevision] = useState(0);
  const importing = useRef<AbortController | null>(null);
  const retryInput = useRef<File | UploadedBook | null>(null);
  const retryOwner = useRef<string | undefined>(undefined);
  const retryPlacement = useRef<ShelfPlacement | undefined>(undefined);
  useEffect(() => () => importing.current?.abort(), []);
  async function processBook(input: File | UploadedBook, placement?: ShelfPlacement, ownerHint?: string) {
    if (importing.current) return;
    const controller = new AbortController();
    importing.current = controller;
    retryInput.current = input;
    retryOwner.current = ownerHint;
    retryPlacement.current = placement;
    const title = placement?.title ?? (input instanceof File ? input.name : input.title);
    setLibraryOpen(true);
    setImportState({ title, status: 'processing', percent: 0, stage: 'Preparing book' });
    const update = (progress: Pick<ImportState, 'percent' | 'stage' | 'completed' | 'total'>) => {
      if (!controller.signal.aborted) setImportState({ ...progress, title, status: 'processing' });
    };
    try {
      const session = input instanceof File && !placement?.localOnly ? await cloudRequest('session') : null;
      const owner: string | undefined = session?.id ?? ownerHint;
      const sourceLibrary = libraryForOwner(owner);
      let book = input instanceof File ? await readUploadedBook(input) : input;
      if (placement) book = { ...book, title: placement.title };
      if (book.kind === 'txt' && book.originalPdf && book.originalPdf.manifest.version !== PDF_IMPORT_VERSION) {
        book = { kind: 'pdf', title: book.title, hash: book.originalPdf.hash, data: book.originalPdf.data };
      }
      controller.signal.throwIfAborted();
      if (book.kind === 'pdf') {
        // Save the original before conversion, including on failed/cancelled imports.
        // Avoid replacing an existing ready conversion on a duplicate upload.
        const saved = await sourceLibrary.load(uploadedBookId(book)).catch(() => null);
        controller.signal.throwIfAborted();
        if (saved?.kind === 'txt' && saved.originalPdf?.manifest.version === PDF_IMPORT_VERSION) book = saved;
        else {
          await sourceLibrary.save(book, placement?.slot);
          setLibraryRevision(value => value + 1);
          const { importPdfBook } = await import('../reader/pdf/import-book');
          book = await importPdfBook(book, controller.signal, update);
        }
      }
      controller.signal.throwIfAborted();
      update({ percent: 99, stage: 'Saving book' });
      if (placement) book = { ...book, title: placement.title };
      await sourceLibrary.save(book, placement?.slot);
      controller.signal.throwIfAborted();
      let accountCopy: { owner: string; source: string } | null = null;
      if (owner) {
          update({ percent: 99, stage: 'Saving book and reading to your account' });
          const result = await copyReadingToAccount(book, owner);
          controller.signal.throwIfAborted();
          accountCopy = { owner, source: result.sourceId };
      }
      setUploadedCloud(accountCopy); setUploaded(book);
      setImportState({ title, status: 'ready', percent: 100, stage: 'Text ready · 100%', note: [book.originalPdf ? pdfImportNote(book.originalPdf.manifest) : '', accountCopy ? 'Book, enhanced reading, and heatmap activity sync with your account.' : 'Saved on this device. Add it to your account to sync reading across devices.'].filter(Boolean).join(' ') });
      setLibraryRevision(value => value + 1);
      if (!owner) void ensureBookEmblem(book).then(() => setLibraryRevision(value => value + 1)).catch(() => {
        // The built-in line emblem remains usable if the provider is unavailable.
      });
    } catch (error) {
      const cancelled = controller.signal.aborted;
      setImportState(previous => ({ title, percent: previous?.percent ?? 0, status: cancelled ? 'cancelled' : 'failed',
        stage: cancelled ? 'Processing cancelled' : error instanceof IncompatiblePdfError ? 'PDF not compatible' : 'Could not prepare book',
        error: cancelled ? 'You can retry when you’re ready.' : error instanceof Error ? error.message : 'Processing failed. Please retry.',
      }));
    } finally { importing.current = null; }
  }
  async function upload(file: File, placement?: ShelfPlacement) {
    await processBook(file, placement);
  }
  async function selectBook(book: UploadedBook | null, owner?: string) {
    if (importing.current) return;
    if (!book && cloudSourceId) {
      await cloudRequest('open', {source: null});
      window.location.replace(new URL('/?book=plato-republic', window.location.origin).href);
      return;
    }
    if (book?.kind === 'pdf' || (book?.originalPdf && book.originalPdf.manifest.version !== PDF_IMPORT_VERSION)) { await processBook(book, undefined, owner); return; }
    setUploadedCloud(owner ? { owner } : null); setUploaded(book); setLibraryOpen(false); setImportState(null);
  }
  const activeGraph: MapBootstrap = uploaded?.kind === 'txt' ? { bookId: uploaded.bookId, graphVersion: uploaded.bookId, version: uploaded.bookId, roots: [], depth: 0, totalNodes: 0, unplaced: 0, territories: [], unavailable: true } : graph;
  const activePreview = uploaded?.preview ?? preview;
  const activeOwner = uploaded ? uploadedCloud?.owner : cloudOwnerId ?? sampleCloud?.owner;
  const activeSource = uploaded ? uploadedCloud?.source : cloudSourceId ?? sampleCloud?.source;
  return <>
    <div className={libraryStyles.readerSurface} data-library-open={libraryOpen || undefined}>
    {!uploaded && sampleStatus === 'checking' && <p role="status" className="p-8">Opening your saved reading…</p>}
    {!uploaded && sampleStatus === 'error' && <div role="alert" className="p-8"><p>{sampleError}</p><button onClick={() => { setSampleStatus('checking'); setSampleAttempt(value => value + 1); }}>Retry account sync</button> · <button onClick={() => setSampleStatus('ready')}>Read on this device only</button></div>}
    {activePreview && (uploaded || sampleStatus === 'ready') && <TextWorkspace reopenVersion={reopenVersion} covered={libraryOpen} cloudOwnerId={activeOwner} analyzeUploaded={!!uploaded} cloudSourceId={activeSource} key={`${activeOwner ?? "guest"}:${activeSource ?? uploaded?.bookId ?? graph.bookId}`} preview={activePreview} graph={activeGraph} title={uploaded?.title ?? initialTitle ?? 'The Republic of Plato.'} onLibrary={() => setLibraryOpen(true)} />}
    </div>
    <BookLibrary initialOpen={initialLibraryOpen} onReopen={() => { setReopenVersion(value => value + 1); setLibraryOpen(false); setImportState(null); }} onRemoved={id => { if (uploaded && uploadedBookId(uploaded) === id) setUploaded(null); setImportState(null); }} open={libraryOpen} currentId={activeSource ? `cloud:${activeSource}` : uploaded ? uploadedBookId(uploaded) : graph.bookId} onUpload={upload} onSelect={selectBook} onClose={() => { if (!importing.current && activePreview) { setLibraryOpen(false); setImportState(null); } }}
      importState={importState} revision={libraryRevision} sampleEmblem={graph.bookId === 'plato-republic' ? graph.bookEmblem : undefined} onCancel={() => importing.current?.abort()} onRetry={() => { if (retryInput.current) void processBook(retryInput.current, retryPlacement.current, retryOwner.current); }} />
  </>;
}

function TextWorkspace({preview, graph: initialGraph, title, onLibrary, cloudSourceId, cloudOwnerId, analyzeUploaded, covered, reopenVersion}: {reopenVersion:number;covered:boolean;analyzeUploaded?:boolean;cloudSourceId?:string;cloudOwnerId?:string;preview: BookPreview; graph: MapBootstrap; title: string; onLibrary: () => void}) {
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const mapActive = useMapActive(mobileMapOpen, covered);
  const analyzing = !!analyzeUploaded || !!cloudSourceId;
  const analysis = useBookAnalysis(initialGraph.bookId, preview, analyzing && !!initialGraph.unavailable, title, cloudSourceId);
  const graph = analysis.graph ?? initialGraph;
  const bookId = graph.bookId;
  const footprints = useReadingFootprints(bookId, cloudOwnerId, preview);
  const recordFootprints = footprints.record;
  const heatSource = useMemo(() => ({ ...preview, bookId }), [preview, bookId]);
  const heat = useHeatPlacement(graph.version, footprints.events, heatSource, !graph.unavailable, mapActive);
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
  const snapshot = useMemo<WorkspaceSnapshot>(() => ({
    schemaVersion: 1, id: bookId, bookId, selections, anchors, artifacts, placements, interactionState, mapView,
    graphViewport: null, readerPosition: { fileHash: preview.fileHash, extractionVersion: preview.extractionVersion, startOffset: Math.max(0, Math.min(preview.sourceText.length, Math.floor(readingPosition))) },
    footprints: footprints.events, bookmarks: [], savedAt: new Date().toISOString(),
  }), [bookId, selections, anchors, artifacts, placements, interactionState, mapView, preview.fileHash, preview.extractionVersion, preview.sourceText.length, readingPosition, footprints.events]);
  const restoreReading = useCallback((saved: WorkspaceSnapshot) => {
    activeRequest.current++; sourceRequest.current++;
    setSelection(null); setMapAnchor(null); setRequests({}); setBusy(false);
    setSelections(saved.selections); setAnchors(saved.anchors);
    dispatchEnhancements({ type: 'reset', state: saved }); setMapView(saved.mapView);
    recordFootprints(saved.footprints);
    const bookmark = readingBookmark(saved, { ...preview, bookId });
    if (bookmark !== null) {
      setReadingPosition(bookmark);
      requestAnimationFrame(() => reader.current?.scrollToOffset(bookmark, 'instant'));
    }
  }, [recordFootprints, preview, bookId]);
  const sync = useReadingSync({ ownerId: cloudOwnerId, sourceId: cloudSourceId, bookId, preview, snapshot, restore: restoreReading });
  const lastReopenVersion = useRef(reopenVersion);
  useEffect(() => {
    if (lastReopenVersion.current === reopenVersion) return;
    lastReopenVersion.current = reopenVersion;
    // The active book stays mounted behind the Library. Explicitly opening it
    // again must apply the same bookmark as device/cloud hydration, using the
    // live outputs so a just-finished generation does not wait for persistence.
    const bookmark = readingBookmark(snapshot, { ...preview, bookId });
    if (bookmark !== null) reader.current?.scrollToOffset(bookmark, 'instant');
  }, [reopenVersion, snapshot, preview, bookId]);


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
      void recordSelectionActivity(selected, sourceAnchors, selectedAt, cloudOwnerId).catch(() => {
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
  },[preview,selection,anchors,bookId,title,cloudOwnerId]);
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
      const runs=RouteRunSchema.array().parse(body.runs);
      const failures=runs.filter(run=>run.status==='failed'||run.status==='cancelled');
      dispatchEnhancements({type:'generate',artifacts:nextArtifacts,placements:placementsFor(nextArtifacts,anchors)});
      recordFootprints(completedFootprints(runs,nextArtifacts,anchors));
      setRequests(current=>{
        if(failures.length)return {...current,[frozen.id]:{routes:failures.map(r=>r.route),message:failures.map(r=>`${r.route}: ${r.error?.message??r.status}`).join(' '),failed:true}};
        const next={...current};delete next[frozen.id];return next;
      });
      setNotice('Results added to their original passage.');
    }catch(error){if(ticket===activeRequest.current){const message=error instanceof Error?error.message:'Request failed';setNotice(message);setRequests(current=>({...current,[frozen.id]:{routes:kinds,message,failed:true}}));}}
    finally{if(ticket===activeRequest.current)setBusy(false);}
  }, [anchors,busy,recordFootprints]);
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
      slots.push({id:`request-${id}`,offset:locator.endOffset,centerUnder:status.failed ? undefined : locator,content:status.failed
        ? <div role="status" className="rounded-lg border border-line p-3 text-xs">{status.message}<Button disabled={busy} onClick={()=>void exercise(selected,status.routes)}>Retry failed routes</Button></div>
        : <div role="status" className="flex items-center py-3 text-ink">
            <span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />
            <span className="sr-only">{status.message}</span>
          </div>});
    }
    return slots;
  }, [placements,artifacts,anchors,preview,bookId,interactionState,setInteractionState,requests,selections,busy,exercise]);
  const unresolvedArtifacts=useMemo(()=>artifacts.filter(a=>!slots.some(s=>s.id===a.id)),[artifacts,slots]);

  return <main data-mobile-map-open={mobileMapOpen} onPointerDownCapture={sync.interact} onWheelCapture={sync.interact} onKeyDownCapture={sync.interact} onTouchStartCapture={sync.interact} className="reading-workspace flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
    <div className="reading-workspace-panes flex min-h-0 flex-1 flex-col lg:flex-row">
      <section data-timeline-navigation={!graph.unavailable} className="txt-reader-pane flex min-h-0 flex-col border-b border-line lg:w-[45%] lg:border-r lg:border-b-0" aria-label="Book reader">
        {!!unresolvedArtifacts.length&&<details className="p-4 text-xs"><summary>{unresolvedArtifacts.length} results could not be placed in this source version</summary>{unresolvedArtifacts.map(artifact=><ArtifactView key={artifact.id} artifact={artifact} state={interactionState[artifact.id]??{}} onStateChange={state=>setInteractionState(current=>({...current,[artifact.id]:state}))}/>)}</details>}
        <p role="status" className="sr-only">{notice}</p>
        {sync.status === 'error' && <div className="px-6 py-2 text-xs" role="alert">
          {sync.message ?? 'Reading could not be synced.'} <button className="underline" onClick={sync.retry}>Retry</button> · <button className="underline" onClick={sync.download}>Download reading backup</button>
        </div>}
        {sync.status === 'conflict' && <div className="mx-6 mb-3 rounded border border-line p-3 text-sm" role="alert">
          <p>Both versions are kept. Choose which reading to continue; the other version is saved as a recovery copy on this device.</p>
          <div className="mt-2 flex flex-wrap gap-3"><button className="underline" onClick={() => sync.resolve('device')}>Continue this device’s reading</button><button className="underline" onClick={() => sync.resolve('cloud')}>Use cloud reading</button><button className="underline" onClick={sync.download}>Download both versions</button></div>
        </div>}
        <ContinuousTxtReader ref={reader} onReadingPosition={setReadingPosition} title={title} bookId={bookId} onLibrary={onLibrary} sourceText={preview.sourceText} fileHash={preview.fileHash} extractionVersion={preview.extractionVersion} activeAnchor={activeAnchor??null} onSelection={captureSelection} onEnhance={enhanceSelection} enhancementBusy={busy} slots={slots} enhancements={enhancements}/>
      </section>
      <section id="reading-exploration-space" className="exploration-space relative min-h-[960px] flex-1 overflow-hidden lg:min-h-0" aria-label="Exploration workspace">
        <div className="absolute inset-0 overflow-auto">{graph.unavailable?<div className="mx-auto max-w-xl p-8 text-sm text-muted" role="status" aria-live="polite">
          <p className="mb-3 text-xs uppercase tracking-widest">Text ready to read</p>
          <h2 className="mb-3 font-reading text-xl text-ink">{analyzing ? analysis.status === 'unavailable' ? 'Book map unavailable' : analysis.status === 'failed' ? 'Book map needs attention' : analysis.status === 'ready' ? 'Opening book map' : 'Building your book map' : cloudSourceId ? 'Book map pending' : 'Map is unavailable'}</h2>
          <p>{analyzing ? analysis.stage : cloudSourceId ? 'Check your account for this book’s analysis status. You can keep reading here.' : 'The saved map could not be loaded. Reading and passage enhancements are available.'}</p>
          {analyzing && (analysis.status==='running'||analysis.status==='starting') && <><progress aria-label="Book map analysis in progress" className="my-5 w-full"/><p>Extraction is complete. We’re now finding concepts, checking source evidence, and arranging the map. Long books can take a while. You can keep reading; the map opens automatically when ready.</p><p className="mt-3">{process.env.NODE_ENV === 'production' || cloudSourceId ? 'Analysis continues in your account if you close the reader. Reopen this book to reconnect.' : 'Analysis continues on this computer if you close the reader. Reopen this book to reconnect.'}</p></>}
          {analysis.error && analyzing && <p className="mt-4" role="alert">{analysis.error}</p>}
          {analyzing && (analysis.status==='failed'||analysis.status==='idle'||analysis.status==='unavailable') && <button className="mt-4 underline" onClick={analysis.retry}>Retry book map</button>}
          {(analysis.status==='unavailable' || analysis.status==='failed' || cloudSourceId) && <a className="mt-4 block underline" href="/account">Open your account</a>}
          {bookId === 'hong-lou-meng' && <p className="mt-4 text-xs">Text from <a className="underline" href="https://zh.wikisource.org/zh-hans/紅樓夢" target="_blank" rel="noreferrer">Wikisource contributors</a> · <a className="underline" href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>. Formatted for reading; editorial footnotes omitted.</p>}
          {!analyzeUploaded && <button className="mt-4 underline" onClick={()=>window.location.reload()}>Check map again</button>}
        </div>:mapActive ? <BookMap key={graph.version} graph={graph} view={mapView} heat={{...heat,error:footprints.error??heat.error,loading:footprints.loading||heat.loading,retry:()=>{void footprints.retry();heat.retry();}}} readingProgress={readingPosition / Math.max(1, preview.sourceText.length)} onScrollSource={scrollReader} onViewChange={setMapView} onSource={readMapSource}/> : null}</div>

      </section>
    </div>
    <div className="mobile-map-controls">
      <button type="button" aria-label={mobileMapOpen ? 'Close 3D space' : 'Open 3D space'} aria-expanded={mobileMapOpen} aria-controls="reading-exploration-space" onClick={() => setMobileMapOpen(open => !open)}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={mobileMapOpen ? 'm6 9 6 6 6-6' : 'm6 15 6-6 6 6'} />
        </svg>
      </button>
    </div>
  </main>;
}
