'use client';

import { useRouter } from 'next/navigation';
import { SAMPLE_BOOKS, SAMPLE_SHELF_SIZE, sampleBook } from '@/shared/sample-books';
import { useEffect, useRef, useState, type PointerEvent, type FormEvent } from 'react';
import { REPUBLIC_EMBLEM, type BookEmblem } from '@/shared/book-emblem';
import { bookLibrary, type LibraryEntry } from './book-library-store';
import { BookSpine } from './book-spine';
import { cleanBookTitle, type ShelfPlacement } from './bookshelf-model';
import type { UploadedBook } from './upload-book';
import type { ImportState } from './pdf/import-model';
import styles from './book-library.module.css';

export function BookLibrary({ open, currentId, onSelect, onUpload, onClose, importState, revision, onCancel, onRetry, sampleEmblem, onRemoved }: {
  onRemoved: (id: string) => void;
  open: boolean;
  currentId: string;
  onSelect: (book: UploadedBook | null) => Promise<void>;
  onUpload: (file: File, placement?: ShelfPlacement) => Promise<void>;
  onClose: () => void;
  importState: ImportState | null;
  revision: number;
  onCancel: () => void;
  onRetry: () => void;
  sampleEmblem?: BookEmblem;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const shelf = useRef<HTMLDivElement>(null);
  const selectedSlot = useRef(1);
  const [draft, setDraft] = useState<{ file: File; slot: number } | null>(null);
  const [books, setBooks] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [opening, setBusy] = useState(false);
  const [manipulating, setManipulating] = useState(false);
  const busy = manipulating || opening || importState?.status === 'processing';
  const [attempt, setAttempt] = useState(0);
  const [capacity, setCapacity] = useState(2);
  const [scroll, setScroll] = useState({ left: false, right: false });
  const router = useRouter();
  const lastSlot = Math.max(SAMPLE_SHELF_SIZE - 1, ...books.map(book => book.shelf?.slot ?? 0));
  const slotCount = Math.max(capacity, lastSlot + 2);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
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
    let active = true;
    bookLibrary.list().then(entries => { if (active) setBooks(entries); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load your library.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, revision]);
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

  type Flight = { book: LibraryEntry; x: number; y: number; startX: number; startY: number; left: number; top: number; width: number; height: number; moved: boolean; pointer: number };
  const flightRef = useRef<Flight | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const [thrown, setThrown] = useState<LibraryEntry | null>(null);
  const suppressClick = useRef(false);
  const returning = useRef(false);

  function startDrag(event: PointerEvent<HTMLDivElement>, book: LibraryEntry) {
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
  async function moveBook(book: LibraryEntry, slot: number) {
    setManipulating(true); setError('');
    try { await bookLibrary.move(book.id, slot); setBooks(await bookLibrary.list()); flightRef.current = null; setFlight(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The book missed its landing. Try again.'); await returnBook(); }
    finally { setManipulating(false); }
  }
  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const value = flightRef.current;
    if (!value || value.pointer !== event.pointerId || thrown || returning.current) return;
    if (!value.moved) { flightRef.current = null; return; }
    const slot = document.elementsFromPoint(event.clientX, event.clientY).map(element => element.closest<HTMLElement>('[data-slot]')).find(Boolean);
    const target = Number(slot?.dataset.slot);
    if (slot && target >= SAMPLE_SHELF_SIZE && target !== value.book.shelf?.slot) void moveBook(value.book, target);
    else void returnBook();
  }
  async function removeBook() {
    if (!thrown) return;
    setBusy(true); setError('');
    try {
      await bookLibrary.remove(thrown.id);
      setBooks(previous => previous.filter(book => book.id !== thrown.id));
      onRemoved(thrown.id); setThrown(null); setFlight(null); flightRef.current = null; setManipulating(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not remove this book.'); await returnBook(); }
    finally { setBusy(false); }
  }

  async function openBook(id: string) {
    if (busy || !open) return;
    setBusy(true); setError('');
    try {
      if (sampleBook(id)) {
        if (id === currentId) onClose();
        else router.push(`/?book=${id}`);
        return;
      }
      await onSelect(await bookLibrary.load(id));
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not open this book.'); }
    finally { setBusy(false); }
  }
  function moveShelf(direction: number) {
    shelf.current?.scrollBy({ left: direction * Math.max(192, shelf.current.clientWidth * .65), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  async function placeBook(title: string) {
    if (!draft || busy) return;
    const { file, slot } = draft;
    setDraft(null); setBusy(true); setError('');
    try { await onUpload(file, { slot, title }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not open this book.'); }
    finally { setBusy(false); }
  }

  return <dialog ref={dialog} className={styles.library} aria-label="Library" aria-busy={busy} inert={!open} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className={styles.inner}>
      <a href="/cloud" style={{position:"absolute",top:24,right:32,zIndex:5}} aria-label="Open cloud library">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7.5 19H18a4.5 4.5 0 0 0 0-9h-1.26A7.5 7.5 0 1 0 7.5 19Z" />
        </svg>
      </a>
      <div className={styles.shelfArea}>
        <div ref={shelf} className={styles.shelfViewport} role="region" aria-label="Bookshelf" tabIndex={0} onKeyDown={event => {
          if (event.target === event.currentTarget && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); moveShelf(event.key === 'ArrowRight' ? 1 : -1); }
        }}>
          <div className={styles.shelfTrack}>
            <div className={styles.slots}>
              {Array.from({ length: slotCount }, (_, slot) => {
                const book = books.find(entry => entry.shelf?.slot === slot);
                const sample = SAMPLE_BOOKS.find(entry => entry.slot === slot);
                return <div className={styles.slot} key={slot} data-slot={slot} data-dragging={flight?.book.id === book?.id && !!book || undefined}
                  onPointerDown={event => { if (book) startDrag(event, book); else suppressClick.current = false; }} onPointerMove={drag} onPointerUp={endDrag}
                  onPointerCancel={() => { if (!thrown) void returnBook(); }}
                  onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}
                  onKeyDown={event => {
                    if (!book || busy) return;
                    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); setThrown(book); setManipulating(true); }
                    if (event.altKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); void moveBook(book, Math.max(SAMPLE_SHELF_SIZE, slot + (event.key === 'ArrowRight' ? 1 : -1))); }
                  }}>
                  {sample ? <BookSpine id={sample.id} title={sample.title} emblem={sample.id === 'plato-republic' ? sampleEmblem ?? REPUBLIC_EMBLEM : undefined} variant={sample.variant} current={currentId === sample.id} disabled={busy} note={`${sample.byline} · Included in your library`} onClick={() => void openBook(sample.id)}/>
                    : book ? <BookSpine id={book.id} title={cleanBookTitle(book.title)} emblem={book.emblem} variant={book.shelf?.variant} current={currentId === book.id} disabled={busy} note={book.note ?? (book.kind === 'pdf' && !book.ready ? 'Convert PDF to text' : undefined)} onClick={() => void openBook(book.id)}/>
                      : <button type="button" className={styles.emptySlot} disabled={busy || loading || !!error} aria-label={`Add a book in space ${slot + 1}`} onClick={() => { selectedSlot.current = slot; input.current?.click(); }}>
                        <svg className={styles.emptyOutline} viewBox="0 0 72 302" preserveAspectRatio="none" aria-hidden="true"><path d="M1 20V5Q1 1 5 1H20 M52 1H67Q71 1 71 5V20 M1 282V297Q1 301 5 301H20 M52 301H67Q71 301 71 297V282"/></svg>
                        <svg className={styles.plus} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V19 M5 12H19"/></svg>
                        <span className={styles.spaceCaption} aria-hidden="true">Place a book</span>
                      </button>}
                </div>;
              })}
            </div>
            <div className={styles.shelfEdge} aria-hidden="true"><svg viewBox="0 0 1200 24" preserveAspectRatio="none"><path d="M1 2Q300 0 600 2T1199 2L1194 18Q900 20 600 18T5 18Z M7 7Q300 5 600 7T1194 7 M22 10 27 16 M30 10 35 16 M38 10 43 16 M1158 10 1163 16 M1166 10 1171 16 M1174 10 1179 16"/></svg></div>
          </div>
        </div>
        <p className={styles.hint}>Drag to rearrange. Toss past the window’s edge to say goodbye.</p>
        <div className={styles.shelfDetails}>
          {(scroll.left || scroll.right) && <div className={styles.scrollControls}><button type="button" aria-label="Scroll shelf left" disabled={!scroll.left} onClick={() => moveShelf(-1)}>←</button><button type="button" aria-label="Scroll shelf right" disabled={!scroll.right} onClick={() => moveShelf(1)}>→</button></div>}
        </div>
        {loading && <p className={styles.hint} role="status">Opening your shelf…</p>}
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
    {flight && <div ref={ghost} className={styles.flyingBook} aria-hidden="true" inert style={{ left: flight.left + flight.x - flight.startX, top: flight.top + flight.y - flight.startY, width: flight.width, height: flight.height }}>
      <BookSpine id={flight.book.id} title={cleanBookTitle(flight.book.title)} emblem={flight.book.emblem} variant={flight.book.shelf?.variant} onClick={() => {}}/>
    </div>}
    {thrown && <ThrowCard title={cleanBookTitle(thrown.title)} busy={opening} onReturn={() => void returnBook()} onThrow={() => void removeBook()}/>}
    <input ref={input} hidden type="file" accept=".txt,text/plain,.pdf,application/pdf" onChange={event => {
      const file = event.target.files?.[0]; event.target.value = '';
      if (file && !busy) setDraft({ file, slot: selectedSlot.current });
    }}/>
    {draft && <SpineTitleCard file={draft.file} onCancel={() => setDraft(null)} onPlace={title => void placeBook(title)}/>}
  </dialog>;
}

function SpineTitleCard({ file, onCancel, onPlace }: { file: File; onCancel: () => void; onPlace: (title: string) => void }) {
  const card = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(cleanBookTitle(file.name).slice(0, 100));
  useEffect(() => { const element = card.current; element?.showModal(); return () => element?.close(); }, []);
  function submit(event: FormEvent) { event.preventDefault(); if (title.trim()) onPlace(title.trim()); }
  return <dialog ref={card} className={styles.titleCard} aria-labelledby="spine-title-heading" onCancel={event => { event.preventDefault(); event.stopPropagation(); onCancel(); }}>
    <form onSubmit={submit}>
      <svg className={styles.cardDrawing} viewBox="0 0 64 72" aria-hidden="true"><path d="M20 5Q31 3 44 5V64Q31 66 20 64Z M24 8V61 M25 14H40 M25 54H40 M30 23H36 M33 21V43 M15 67H49"/></svg>
      <h2 id="spine-title-heading">A name for the spine.</h2>
      <p>How would you like this book to appear on your shelf?</p>
      <label htmlFor="spine-title">Book title</label>
      <input id="spine-title" value={title} onChange={event => setTitle(event.target.value)} required maxLength={100} autoComplete="off"/>
      <span className={styles.fileName}>{file.name}</span>
      <div className={styles.cardActions}><button type="button" onClick={onCancel}>Cancel</button><button type="submit" disabled={!title.trim()}>Place on shelf <span aria-hidden="true">→</span></button></div>
    </form>
  </dialog>;
}

function ThrowCard({ title, busy, onReturn, onThrow }: { title: string; busy: boolean; onReturn: () => void; onThrow: () => void }) {
  const card = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = card.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={card} className={styles.titleCard} aria-labelledby="throw-heading" aria-describedby="throw-description" onCancel={event => { event.preventDefault(); event.stopPropagation(); if (!busy) onReturn(); }}>
    <svg className={styles.cardDrawing} viewBox="0 0 64 72" aria-hidden="true"><path d="M23 13 46 6 57 43 34 50Z M27 15 37 46 M9 28 20 25 M4 38 18 34 M12 46 23 43 M18 61Q30 54 43 59"/></svg>
    <h2 id="throw-heading">A one-way flight?</h2>
    <p id="throw-description">“{title}” is about to leave your local library. No return ticket, no secret shelf: this copy will be deleted. Want it back later? You’ll need to upload it again.</p>
    <div className={styles.cardActions}><button type="button" autoFocus disabled={busy} onClick={onReturn}>It was an accident!</button><button type="submit" disabled={busy} onClick={onThrow}>{busy ? 'Saying goodbye…' : 'Bon voyage, book ↗'}</button></div>
  </dialog>;
}
