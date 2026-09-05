'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { REPUBLIC_EMBLEM, type BookEmblem } from '@/shared/book-emblem';
import { bookLibrary, type LibraryEntry } from './book-library-store';
import { BookSpine } from './book-spine';
import { cleanBookTitle, type ShelfPlacement } from './bookshelf-model';
import type { UploadedBook } from './upload-book';
import type { ImportState } from './pdf/import-model';
import styles from './book-library.module.css';

export function BookLibrary({ currentId, onSelect, onUpload, onClose, importState, revision, onCancel, onRetry, sampleEmblem }: {
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
  const busy = opening || importState?.status === 'processing';
  const [attempt, setAttempt] = useState(0);
  const [capacity, setCapacity] = useState(2);
  const [scroll, setScroll] = useState({ left: false, right: false });
  const lastSlot = Math.max(0, ...books.map(book => book.shelf?.slot ?? 0));
  const slotCount = Math.max(capacity, lastSlot + 2);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
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

  async function openBook(id: string) {
    setBusy(true); setError('');
    try { await onSelect(id === 'plato-republic' ? null : await bookLibrary.load(id)); }
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

  return <dialog ref={dialog} className={styles.library} aria-label="Library" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <button type="button" className={styles.close} onClick={onClose} disabled={busy} aria-label="Close library"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6 18 18 M18 6 6 18"/></svg></button>
    <div className={styles.inner}>
      <div className={styles.shelfArea}>
        <div ref={shelf} className={styles.shelfViewport} role="region" aria-label="Bookshelf" tabIndex={0} onKeyDown={event => {
          if (event.target === event.currentTarget && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); moveShelf(event.key === 'ArrowRight' ? 1 : -1); }
        }}>
          <div className={styles.shelfTrack}>
            <div className={styles.slots}>
              {Array.from({ length: slotCount }, (_, slot) => {
                const book = books.find(entry => entry.shelf?.slot === slot);
                return <div className={styles.slot} key={slot} data-slot={slot}>
                  {slot === 0 ? <BookSpine id="plato-republic" title="The Republic of Plato" emblem={sampleEmblem ?? REPUBLIC_EMBLEM} variant={0} current={currentId === 'plato-republic'} disabled={busy} note="Plato · Included in your library" onClick={() => void openBook('plato-republic')}/>
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
        <div className={styles.shelfDetails}>
          <h1>Your library <span>{books.length + 1} {books.length ? 'books' : 'book'}</span></h1>
          {(scroll.left || scroll.right) && <div className={styles.scrollControls}><button type="button" aria-label="Scroll shelf left" disabled={!scroll.left} onClick={() => moveShelf(-1)}>←</button><button type="button" aria-label="Scroll shelf right" disabled={!scroll.right} onClick={() => moveShelf(1)}>→</button></div>}
        </div>
        <p className={styles.hint} role={loading ? 'status' : undefined}>{loading ? 'Opening your shelf…' : <>Choose a book to read. <span>Choose a space to add one.</span></>}</p>
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
