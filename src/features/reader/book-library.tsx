'use client';

import { useRouter } from 'next/navigation';
import { SAMPLE_SHELF_SIZE, sampleBook } from '@/shared/sample-books';
import { useEffect, useRef, useState, useTransition, type PointerEvent, type FormEvent } from 'react';
import { REPUBLIC_EMBLEM, type BookEmblem } from '@/shared/book-emblem';
import { libraryForOwner } from './book-library-store';
import { BookSpine } from './book-spine';
import { cleanBookTitle, type ShelfPlacement } from './bookshelf-model';
import type { UploadedBook } from './upload-book';
import type { ImportState } from './pdf/import-model';
import styles from './book-library.module.css';
import { readShelf, type ShelfBook } from '../cloud/library';
import { cloudRequest } from '../cloud/request';
import { persistShelfMove, placeShelfBook } from '../cloud/shelf-move';
import { CloudMenu } from './cloud-menu';
import { ShelfLoading } from './shelf-loading';

export function BookLibrary({ initialOpen = false, open, currentId, onSelect, onUpload, onClose, onReopen, importState, revision, onCancel, onRetry, sampleEmblem, onRemoved }: {
  onRemoved: (id: string) => void;
  initialOpen?: boolean;
  open: boolean;
  currentId: string;
  onSelect: (book: UploadedBook | null, owner?: string) => Promise<void>;
  onUpload: (file: File, placement?: ShelfPlacement) => Promise<void>;
  onClose: () => void;
  onReopen: () => void;
  importState: ImportState | null;
  revision: number;
  onCancel: () => void;
  onRetry: () => void;
  sampleEmblem?: BookEmblem;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const firstDisplay = useRef(initialOpen);
  const input = useRef<HTMLInputElement>(null);
  const shelf = useRef<HTMLDivElement>(null);
  const selectedSlot = useRef(1);
  const [draft, setDraft] = useState<{ file: File; slot: number } | null>(null);
  const [books, setBooks] = useState<ShelfBook[]>([]);
  const shelfVersion = useRef(0);
  const savingMove = useRef(false);
  const [owner, setOwner] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [opening, setBusy] = useState(false);
  const [navigating, startNavigation] = useTransition();
  const [openingBook, setOpeningBook] = useState(false);
  const turningPages = navigating || openingBook;
  const [manipulating, setManipulating] = useState(false);
  const busy = manipulating || opening || turningPages || importState?.status === 'processing';
  const [attempt, setAttempt] = useState(0);
  const [capacity, setCapacity] = useState(2);
  const [scroll, setScroll] = useState({ left: false, right: false });
  const router = useRouter();
  const lastSlot = Math.max(SAMPLE_SHELF_SIZE - 1, ...books.map(book => book.shelf?.slot ?? 0));
  const slotCount = Math.max(capacity, lastSlot + 2);

  type Flight = { book: ShelfBook; x: number; y: number; startX: number; startY: number; left: number; top: number; width: number; height: number; moved: boolean; pointer: number };
  const flightRef = useRef<Flight | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const [thrown, setThrown] = useState<ShelfBook | null>(null);
  const suppressClick = useRef(false);
  const returning = useRef(false);


  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (firstDisplay.current) {
      firstDisplay.current = false;
      // The Library is already visible in server HTML; promote it without a fade.
      element.close();
      if (open) element.showModal();
      return;
    }
    if (open && !element.open) element.showModal();
    if (!element.open) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timing = { duration: reduced ? 0 : 420, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' as const };
    const fade = element.animate(open ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], timing);
    const content = element.querySelector(`.${styles.inner}`);
    const movement = content?.animate(open
      ? [{ transform: 'translateY(20px) scale(.975)' }, { transform: 'translateY(0) scale(1)' }]
      : [{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-14px) scale(1.025)' }], timing);
    let active = true;
    void fade.finished.then(() => {
      if (!active) return;
      if (!open) element.close();
      fade.cancel();
      movement?.cancel();
    }).catch(() => { /* A reversed transition cancels the previous animation. */ });
    return () => { active = false; fade.cancel(); movement?.cancel(); };
  }, [open]);
  useEffect(() => () => dialog.current?.close(), []);
  useEffect(() => {
    let active = true, generation = 0;
    const refresh = async () => {
      if (savingMove.current) return;
      const ticket = ++generation;
      const version = shelfVersion.current;
      const result = await readShelf();
      if (!active || ticket !== generation || version !== shelfVersion.current || savingMove.current) return;
      setBooks(result.books); setOwner(result.owner); setError(result.error ?? ''); setLoading(false);
    };
    const update = () => { void refresh().catch(reason => { if (active) { setError(reason.message); setLoading(false); } }); };
    const changed = () => { generation++; shelfVersion.current++; savingMove.current = false; setLoading(true); setManipulating(false); flightRef.current = null; setFlight(null); setBooks(previous => previous.filter(book => !book.cloud && !book.deviceOwner)); setOwner(undefined); update(); };
    const storage = (event: StorageEvent) => { if (event.key === 'eazo-auth-change') changed(); };
    update();
    window.addEventListener('focus', update); window.addEventListener('online', update);
    window.addEventListener('eazo-auth-changed', changed); window.addEventListener('storage', storage);
    return () => { active = false; window.removeEventListener('focus', update); window.removeEventListener('online', update); window.removeEventListener('eazo-auth-changed', changed); window.removeEventListener('storage', storage); };
  }, [attempt, revision, open]);
  useEffect(() => {
    const element = shelf.current;
    if (!element) return;
    const measure = () => {
      setCapacity(Math.max(2, Math.floor((element.clientWidth - 40) / 96)));
      setScroll({ left: element.scrollLeft > 4, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 4 });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.addEventListener('scroll', measure, { passive: true });
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY) || element.scrollWidth <= element.clientWidth) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1);
      if ((delta > 0 && element.scrollLeft + element.clientWidth < element.scrollWidth - 1) || (delta < 0 && element.scrollLeft > 0)) {
        event.preventDefault(); element.scrollLeft += delta;
      }
    };
    element.addEventListener('wheel', wheel, { passive: false });
    measure();
    return () => { observer.disconnect(); element.removeEventListener('scroll', measure); element.removeEventListener('wheel', wheel); };
  }, [slotCount]);


  function startDrag(event: PointerEvent<HTMLDivElement>, book: ShelfBook) {
    if (busy || event.button !== 0 || !event.isPrimary) return;
    const rect = event.currentTarget.querySelector('button')!.getBoundingClientRect();
    suppressClick.current = false;
    flightRef.current = { book, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, width: rect.width, height: rect.height, moved: false, pointer: event.pointerId };
  }
  function drag(event: PointerEvent<HTMLDivElement>) {
    const value = flightRef.current;
    if (!value || value.pointer !== event.pointerId || thrown || returning.current) return;
    value.x = event.clientX; value.y = event.clientY;
    if (!value.moved && Math.hypot(value.x - value.startX, value.y - value.startY) < 7) return;
    if (!value.moved) event.currentTarget.setPointerCapture(event.pointerId);
    value.moved = true; suppressClick.current = true;
    setManipulating(true); setFlight({ ...value });
    const viewport = shelf.current;
    if (viewport) {
      const rect = viewport.getBoundingClientRect();
      if (value.y > rect.top && value.y < rect.bottom) {
        if (value.x < rect.left + 35) viewport.scrollLeft -= 18;
        if (value.x > rect.right - 35) viewport.scrollLeft += 18;
      }
    }
    // Capture the throw at the window edge: release events outside the browser are not reliable.
    if (value.x <= 2 || value.y <= 2 || value.x >= window.innerWidth - 2 || value.y >= window.innerHeight - 2) {
      if (value.x <= 2) value.x = value.startX - value.left - value.width - 30;
      else if (value.x >= window.innerWidth - 2) value.x = value.startX + window.innerWidth - value.left + 30;
      if (value.y <= 2) value.y = value.startY - value.top - value.height - 30;
      else if (value.y >= window.innerHeight - 2) value.y = value.startY + window.innerHeight - value.top + 30;
      setFlight({ ...value }); setThrown(value.book);
    }
  }
  async function returnBook() {
    if (returning.current) return;
    returning.current = true;
    setThrown(null);
    const value = flightRef.current;
    const element = ghost.current;
    if (value && element) {
      const home = shelf.current?.querySelector(`[data-slot="${value.book.shelf!.slot}"] button`)?.getBoundingClientRect();
      const rect = { left: parseFloat(element.style.left), top: parseFloat(element.style.top) };
      await element.animate([{ transform: 'translate(0, 0) rotate(-8deg)' }, { transform: `translate(${(home?.left ?? value.left) - rect.left}px, ${(home?.top ?? value.top) - rect.top}px) rotate(0deg)` }],
        { duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' }).finished.catch(() => {});
    }
    flightRef.current = null; setFlight(null); setManipulating(false); returning.current = false;
    requestAnimationFrame(() => shelf.current?.querySelector<HTMLButtonElement>(`[data-slot="${value?.book.shelf?.slot}"] button`)?.focus({ preventScroll: true }));
  }
  async function moveBook(book: ShelfBook, slot: number) {
    if (savingMove.current) return;
    const before = books;
    const version = ++shelfVersion.current;
    savingMove.current = true;
    setManipulating(true); setError('');
    try {
      const after = placeShelfBook(before, book.id, slot);
      setBooks(after); flightRef.current = null; setFlight(null);
      await persistShelfMove(before, after);
      // No account/session round trip is needed to render a known local change.
    }
    catch (reason) {
      if (version === shelfVersion.current) {
        setBooks(before); flightRef.current = null; setFlight(null);
        setError(reason instanceof Error ? reason.message : 'The book missed its landing. Try again.');
        // Reconcile a possible partial swap on the next refresh, without delaying recovery.
        setAttempt(value => value + 1);
      }
    }
    finally {
      if (version === shelfVersion.current) { savingMove.current = false; setManipulating(false); }
    }
  }
  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const value = flightRef.current;
    if (!value || value.pointer !== event.pointerId || thrown || returning.current) return;
    if (!value.moved) { flightRef.current = null; return; }
    const slot = document.elementsFromPoint(event.clientX, event.clientY).map(element => element.closest<HTMLElement>('[data-slot]')).find(Boolean);
    const target = Number(slot?.dataset.slot);
    if (slot && target >= 0 && target !== value.book.shelf?.slot) void moveBook(value.book, target);
    else void returnBook();
  }
  async function removeBook() {
    if (!thrown) return;
    if (opening) return;
    if (sampleBook(thrown.id) && !thrown.cloud) { await returnBook(); return; }
    setBusy(true); setError('');
    try {
      if (thrown.cloud) {
        await cloudRequest('delete-book', { book: thrown.cloud.book }, thrown.cloud.owner);
        for (const entry of books.filter(book => book.cloud?.book === thrown.cloud!.book)) {
          if (entry.localId) await libraryForOwner(entry.deviceOwner).remove(entry.localId);
          onRemoved(entry.id);
        }
        // Reload to release the deleted source and any active reading sync.
        window.location.replace(new URL('/', window.location.origin).href);
        return;
      }
      await libraryForOwner(thrown.deviceOwner).remove(thrown.localId ?? thrown.id);
      setBooks(previous => previous.filter(book => book.id !== thrown.id));
      onRemoved(thrown.id); setThrown(null); setFlight(null); flightRef.current = null; setManipulating(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not remove this book.'); await returnBook(); }
    finally { setBusy(false); }
  }

  async function openBook(id: string) {
    if (busy || !open) return;
    const entry = books.find(book => book.id === id);
    if (entry?.cloud ? currentId === `cloud:${entry.cloud.source}` : id === currentId) { onReopen(); return; }
    if (entry?.cloud) {
      setBusy(true); setOpeningBook(true); setError('');
      try {
        await cloudRequest('open', { source: entry.cloud.source }, entry.cloud.owner);
        window.location.replace(new URL('/?book=cloud', window.location.origin).href);
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not open account book.'); setBusy(false); setOpeningBook(false); }
      return;
    }
    if (sampleBook(id)) {
      setError('');
      // router.push returns immediately; React keeps this pending until the reader commits.
      startNavigation(() => router.push(`/?book=${id}`));
      return;
    }
    setBusy(true); setOpeningBook(true); setError('');
    try {
      if (entry?.deviceOwner && (await cloudRequest('session')).id !== entry.deviceOwner) throw new Error('Your account changed. Reopen the library.');
      const book = await libraryForOwner(entry?.deviceOwner).load(id);
      // PDF conversion retains its own progress and recovery controls.
      setOpeningBook(false);
      await onSelect(book, entry?.deviceOwner);
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not open this book.'); }
    finally { setBusy(false); setOpeningBook(false); }
  }
  function moveShelf(direction: number) {
    shelf.current?.scrollBy({ left: direction * Math.max(192, shelf.current.clientWidth * .65), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  async function placeBook(title: string, localOnly: boolean) {
    if (!draft || busy) return;
    const { file, slot } = draft;
    setDraft(null); setBusy(true); setError('');
    try { await onUpload(file, { slot, title, localOnly }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not open this book.'); }
    finally { setBusy(false); }
  }

  return <dialog open={initialOpen} ref={dialog} className={styles.library} aria-label="Library" aria-busy={busy || loading} inert={!open} onCancel={event => { event.preventDefault(); if (!busy && !loading) onClose(); }}>
    <div className={styles.inner} data-loading={loading || undefined} data-opening={turningPages || undefined} inert={turningPages || loading}>
      <CloudMenu key={String(open)} />
      <div className={styles.shelfArea}>
        <div ref={shelf} className={styles.shelfViewport} role="region" aria-label="Bookshelf" tabIndex={0} onKeyDown={event => {
          if (event.target === event.currentTarget && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); moveShelf(event.key === 'ArrowRight' ? 1 : -1); }
        }}>
          <div className={styles.shelfTrack}>
            <div className={styles.slots}>
              {Array.from({ length: slotCount }, (_, slot) => {
                const book = books.find(entry => entry.shelf?.slot === slot);
                const sample = book && sampleBook(book.id);
                return <div className={styles.slot} key={slot} data-slot={slot} data-dragging={flight?.book.id === book?.id && !!book || undefined}
                  onPointerDown={event => { if (book) startDrag(event, book); else suppressClick.current = false; }} onPointerMove={drag} onPointerUp={endDrag}
                  onPointerCancel={() => { if (!thrown) void returnBook(); }}
                  onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}
                  onKeyDown={event => {
                    if (!book || busy) return;
                    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); setThrown(book); setManipulating(true); }
                    if (event.altKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); void moveBook(book, Math.max(0, slot + (event.key === 'ArrowRight' ? 1 : -1))); }
                  }}>
                  {sample ? <BookSpine id={sample.id} title={sample.title} emblem={sample.id === 'plato-republic' ? sampleEmblem ?? REPUBLIC_EMBLEM : undefined} variant={sample.variant} current={currentId === sample.id || currentId === `cloud:${book?.cloud?.source}`} disabled={busy} note={`${sample.byline} · ${book?.cloud ? 'Saved to your account' : 'Included in your library'}`} onClick={() => void openBook(sample.id)}/>
                    : book ? <BookSpine id={book.id} title={cleanBookTitle(book.title)} emblem={book.emblem} variant={book.shelf?.variant} current={currentId === book.id || currentId === `cloud:${book.cloud?.source}`} disabled={busy} note={book.cloud ? 'Saved to your account · Reading syncs across devices' : book.note ?? (book.kind === 'pdf' && !book.ready ? 'Convert PDF to text' : undefined)} onClick={() => void openBook(book.id)}/>
                      : <button type="button" className={styles.emptySlot} disabled={busy || loading || !!error} aria-label={`Add a book in space ${slot + 1}`} onClick={() => { selectedSlot.current = slot; input.current?.click(); }}>
                        <svg className={styles.emptyOutline} viewBox="0 0 72 302" preserveAspectRatio="none" aria-hidden="true"><path d="M1 20V5Q1 1 5 1H20 M52 1H67Q71 1 71 5V20 M1 282V297Q1 301 5 301H20 M52 301H67Q71 301 71 297V282"/></svg>
                        <svg className={styles.plus} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V19 M5 12H19"/></svg>
                      </button>}
                </div>;
              })}
            </div>
            <div className={styles.shelfEdge} aria-hidden="true"><svg viewBox="0 0 1200 24" preserveAspectRatio="none"><path d="M1 2Q300 0 600 2T1199 2L1194 18Q900 20 600 18T5 18Z M7 7Q300 5 600 7T1194 7 M22 10 27 16 M30 10 35 16 M38 10 43 16 M1158 10 1163 16 M1166 10 1171 16 M1174 10 1179 16"/></svg></div>
          </div>
        </div>
        <div className={styles.shelfDetails}>
          {(scroll.left || scroll.right) && <div className={styles.scrollControls}><button type="button" aria-label="Scroll shelf left" disabled={!scroll.left} onClick={() => moveShelf(-1)}>←</button><button type="button" aria-label="Scroll shelf right" disabled={!scroll.right} onClick={() => moveShelf(1)}>→</button></div>}
        </div>
        {owner && books.some(book => book.localId && !book.cloud) && <p className={styles.hint}>Some books are saved only on this device. <a href="/account">Add them to your account</a> to sync their reading.</p>}
      </div>
      {importState && <section className={styles.processing} aria-label={`Import ${importState.title}`}>
        <div className={styles.progressRing} role="progressbar" aria-label="Book processing progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={importState.percent} aria-valuetext={`${importState.stage}, ${importState.percent}% complete`}>
          <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="27" className={styles.ringTrack}/><circle cx="32" cy="32" r="27" className={styles.ringFill} pathLength="100" strokeDasharray="100" strokeDashoffset={100 - importState.percent}/></svg>
          <span>{importState.status === 'ready' ? '✓' : `${importState.percent}%`}</span>
        </div>
        <div className={styles.processingText}>
          <h2>{cleanBookTitle(importState.title)}</h2>
          <p role="status">{importState.stage}{importState.total !== undefined ? ` · ${importState.completed} of ${importState.total} pages` : ''}</p>
          {importState.status === 'processing' && <p className={styles.processingNote}>Keep this tab open while your book is prepared.</p>}
          {importState.error && <p role="alert" className={styles.error}>{importState.error}</p>}
          {importState.note && <p className={styles.processingNote}>{importState.note}</p>}
          <div className={styles.importActions}>
            {importState.status === 'processing' && <button type="button" onClick={onCancel}>Cancel</button>}
            {(importState.status === 'failed' || importState.status === 'cancelled') && <button type="button" disabled={busy} onClick={onRetry}>Try again</button>}
            {importState.status === 'ready' && <button type="button" onClick={onClose}>Read book <span aria-hidden="true">↗</span></button>}
          </div>
        </div>
      </section>}
      {error && <p role="alert" className={styles.error}>{error} <button type="button" onClick={() => { setError(''); setLoading(true); setAttempt(value => value + 1); }}>Retry library</button></p>}
    </div>
    {loading && !turningPages && <ShelfLoading />}
    {turningPages && <div className={styles.openingScene} role="progressbar" aria-label="Opening book" aria-valuetext="Preparing the reader">
      <svg className={styles.openingDrawing} viewBox="0 0 240 180" fill="none" aria-hidden="true">
        <ellipse className={styles.openingShadow} cx="120" cy="148" rx="72" ry="5"/>
        <g className={styles.openingVolume}>
          <path className={styles.openingUnderlay} d="M120 131Q82 113 38 124V54Q79 44 120 63Q161 44 202 54V124Q158 113 120 131Z"/>
          <path d="M120 125Q82 107 42 118V49Q83 39 120 58Q157 39 198 49V118Q158 107 120 125Z"/>
          <path className={styles.openingDetails} d="M46 124Q84 115 116 130M124 130Q158 115 194 124M120 59V125"/>
          <path className={styles.turningLeaf} d="M120 124Q157 106 196 117V48Q155 39 120 58Z"/>
          <path className={styles.turningLeaf} d="M120 124Q157 106 196 117V48Q155 39 120 58Z"/>
          <path className={styles.turningLeaf} d="M120 124Q157 106 196 117V48Q155 39 120 58Z"/>
        </g>
        <path className={styles.openingRule} d="M86 164H154"/>
        <path className={styles.openingSweep} pathLength="100" d="M86 164H154"/>
      </svg>
    </div>}
    {flight && <div ref={ghost} className={styles.flyingBook} aria-hidden="true" inert style={{ left: flight.left + flight.x - flight.startX, top: flight.top + flight.y - flight.startY, width: flight.width, height: flight.height }}>
      <BookSpine id={flight.book.id} title={cleanBookTitle(flight.book.title)} emblem={flight.book.id === 'plato-republic' ? sampleEmblem ?? REPUBLIC_EMBLEM : flight.book.emblem} variant={flight.book.shelf?.variant} onClick={() => {}}/>
    </div>}
    {thrown && <ThrowCard included={!!sampleBook(thrown.id)} cloud={!!thrown.cloud} example={!thrown.cloud && !!sampleBook(thrown.id)} title={cleanBookTitle(thrown.title)} busy={opening} onReturn={() => void returnBook()} onThrow={() => void removeBook()}/>}
    <input ref={input} hidden type="file" accept=".txt,text/plain,.pdf,application/pdf" onChange={event => {
      const file = event.target.files?.[0]; event.target.value = '';
      if (file && !busy) setDraft({ file, slot: selectedSlot.current });
    }}/>
    {draft && <SpineTitleCard signedIn={!!owner} file={draft.file} onCancel={() => setDraft(null)} onPlace={(title, localOnly) => void placeBook(title, localOnly)}/>}
  </dialog>;
}

function SpineTitleCard({ file, signedIn, onCancel, onPlace }: { file: File; signedIn: boolean; onCancel: () => void; onPlace: (title: string, localOnly: boolean) => void }) {
  const card = useRef<HTMLDialogElement>(null);
  const [localOnly, setLocalOnly] = useState(false);
  const [title, setTitle] = useState(cleanBookTitle(file.name).slice(0, 100));
  useEffect(() => { const element = card.current; element?.showModal(); return () => element?.close(); }, []);
  function submit(event: FormEvent) { event.preventDefault(); if (title.trim()) onPlace(title.trim(), localOnly || !signedIn); }
  return <dialog ref={card} className={styles.titleCard} aria-labelledby="spine-title-heading" onCancel={event => { event.preventDefault(); event.stopPropagation(); onCancel(); }}>
    <form onSubmit={submit}>
      <svg className={styles.cardDrawing} viewBox="0 0 64 72" aria-hidden="true"><path d="M20 5Q31 3 44 5V64Q31 66 20 64Z M24 8V61 M25 14H40 M25 54H40 M30 23H36 M33 21V43 M15 67H49"/></svg>
      <h2 id="spine-title-heading">A name for the spine.</h2>
      <p>How would you like this book to appear on your shelf?</p>
      <label htmlFor="spine-title">Book title</label>
      <input id="spine-title" value={title} onChange={event => setTitle(event.target.value)} required maxLength={100} autoComplete="off"/>
      <span className={styles.fileName}>{file.name}</span>
      {signedIn && <label className={styles.saveChoice}><input type="checkbox" checked={localOnly} onChange={event => setLocalOnly(event.target.checked)}/> Keep on this device only</label>}
      <p>{signedIn && !localOnly ? "Book and reading will sync with your account." : "Saved in this browser."}</p>
      <div className={styles.cardActions}><button type="button" onClick={onCancel}>Cancel</button><button type="submit" disabled={!title.trim()}>Place on shelf <span aria-hidden="true">→</span></button></div>
    </form>
  </dialog>;
}

function ThrowCard({ title, included, cloud, example, busy, onReturn, onThrow }: { title: string; included: boolean; cloud: boolean; example: boolean; busy: boolean; onReturn: () => void; onThrow: () => void }) {
  const card = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = card.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={card} className={styles.titleCard} aria-labelledby="throw-heading" aria-describedby="throw-description" onCancel={event => { event.preventDefault(); event.stopPropagation(); if (!busy) onReturn(); }}>
    <svg className={styles.cardDrawing} viewBox="0 0 64 72" aria-hidden="true"><path d="M23 13 46 6 57 43 34 50Z M27 15 37 46 M9 28 20 25 M4 38 18 34 M12 46 23 43 M18 61Q30 54 43 59"/></svg>
    <h2 id="throw-heading">{cloud ? 'Throw away this account book?' : example ? 'Nice throw. Wrong book.' : 'A one-way flight?'}</h2>
    <p id="throw-description">{cloud ? <>“{title}” is saved in the cloud in your account. Throwing it away permanently deletes the account book, all its versions, saved reading, and generated maps across your devices, plus its downloaded copy in this browser. You’ll need to upload it again to get it back.{included && " The included example will stay on your shelf."}</> : example ? <>“{title}” is an example book—it came with the shelf, and it’s staying. Consider it a very well-read boomerang.</> : <>“{title}” is saved locally in this browser, not in your cloud account. It is about to leave your local library. No return ticket, no secret shelf: this copy will be deleted. Want it back later? You’ll need to upload it again.</>}</p>
    <div className={styles.cardActions}><button type="button" autoFocus disabled={busy} onClick={onReturn}>{example ? 'All right, back you come.' : 'It was an accident!'}</button>{!example && <button type="submit" disabled={busy} onClick={onThrow}>{busy ? 'Saying goodbye…' : 'Bon voyage, book ↗'}</button>}</div>
  </dialog>;
}
