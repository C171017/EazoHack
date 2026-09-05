'use client';

import { useEffect, useRef, useState } from 'react';
import { bookLibrary, type LibraryEntry } from './book-library-store';
import type { UploadedBook } from './upload-book';
import styles from './book-library.module.css';

export function BookLibrary({ currentId, onSelect, onUpload, onClose }: {
  currentId: string;
  onSelect: (book: UploadedBook | null) => void;
  onUpload: (file: File) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [books, setBooks] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
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
  }, [attempt]);
  async function openBook(id: string) {
    setBusy(true); setError('');
    try { onSelect(await bookLibrary.load(id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not open this book.'); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className={styles.library} aria-label="Library" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className={styles.inner}>
      <header className={styles.header}><button className={styles.close} onClick={onClose} disabled={busy} aria-label="Close library">×</button></header>
      <div className={styles.toolbar}>
        <button className={styles.upload} disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Opening…' : '+ Upload a book'}</button>
      </div>
      <input ref={input} hidden type="file" accept=".txt,text/plain,.pdf,application/pdf" onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (!file || busy) return;
        setBusy(true); setError('');
        try { await onUpload(file); onClose(); }
        catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not open this book.'); }
        finally { setBusy(false); }
      }}/>
      {error && <p role="alert" className={styles.error}>{error} <button onClick={() => { setError(''); setLoading(true); setAttempt(value => value + 1); }}>Retry library</button></p>}
      <div className={styles.sectionTitle}><h2>Your uploads</h2><span>{books.length} {books.length === 1 ? 'book' : 'books'}</span></div>
      {loading ? <p role="status" className={styles.empty}>Opening your shelves…</p> : !books.length ? <div className={styles.empty}><h3>Your next read starts here.</h3><p>Upload a TXT or PDF and it will be waiting here next time.</p></div> : <div className={styles.grid}>
        {books.map(book => <button key={book.id} className={styles.book} disabled={busy} onClick={() => void openBook(book.id)}>
          <span className={styles.format}>{book.kind.toUpperCase()}</span><span className={styles.bookTitle}>{book.title.replace(/\.(txt|pdf)$/i, '')}</span><span className={styles.bookAction}>{currentId === book.id ? 'Currently reading' : 'Open book'} <span aria-hidden="true">↗</span></span>
        </button>)}
      </div>}
      <div className={styles.sample}><button disabled={busy} onClick={() => onSelect(null)}>The Republic of Plato <span aria-hidden="true">↗</span></button></div>
    </div>
  </dialog>;
}
