'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {bookLibrary,type LibraryEntry} from '../reader/book-library-store';
import {readUploadedBook,type TextBook} from '../reader/upload-book';
import {clearAccountReading} from './sync-store';
import {copyReadingToAccount} from './copy-reading';
import {cloudRequest,CloudRequestError,announceAccountChange} from './request';
import styles from './account-panel.module.css';
import {downloadAccountArchive} from './export';

type Session={id:string;email?:string};
type CloudBook={id:string;title:string;local_book_id:string;book_sources:{id:string}[]};
type Job={id:string;book_id:string;status:string};
type Account={status:string;books:number;sourceBytes:number;limits:{books:number;sourceBytes:number}};
const mib=(n:number)=>(n/(1024*1024)).toFixed(1);

export default function AccountPanel({session}:{session:Session}) {
 const [ready,setReady]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [local,setLocal]=useState<LibraryEntry[]>([]),[books,setBooks]=useState<CloudBook[]>([]),[jobs,setJobs]=useState<Job[]>([]),[account,setAccount]=useState<Account|null>(null);
 const [deleting,setDeleting]=useState(false),[confirmation,setConfirmation]=useState('');
 const generation=useRef(0);
 const refresh=useCallback(async()=>{
  const ticket=++generation.current;
  const next=await cloudRequest('session');
  if(next.id!==session.id){window.location.replace(new URL('/',window.location.origin).href);return;}
  const summary=next.id?await cloudRequest('account',undefined,next.id):null;
  const active=next.id&&summary?.status!=='deleting';
  const [localBooks,remoteBooks,remoteJobs]=await Promise.all([bookLibrary.list(),active?cloudRequest('books',undefined,next.id!):[],active?cloudRequest('jobs',undefined,next.id!):[]]);
  if(ticket!==generation.current)return;
  setLocal(localBooks);setBooks(remoteBooks);setJobs(remoteJobs);setAccount(summary);if(summary?.status==='deleting'){setDeleting(true);setMessage('Account deletion is in progress. Confirm deletion again below to finish removing remaining data.');}setReady(true);
 },[session.id]);
 useEffect(()=>{
  const update=()=>{void refresh().catch(error=>{setMessage(error.message);setReady(true);});};
  const changed=()=>{generation.current++;window.location.replace(new URL('/',window.location.origin).href);};
  const storage=(event:StorageEvent)=>{if(event.key==='eazo-auth-change')changed();};
  update();window.addEventListener('focus',update);window.addEventListener('eazo-auth-changed',changed);window.addEventListener('storage',storage);
  const invalidate=()=>{generation.current++;};
  return()=>{invalidate();window.removeEventListener('focus',update);window.removeEventListener('eazo-auth-changed',changed);window.removeEventListener('storage',storage);};
 },[refresh]);
 async function run(task:()=>Promise<void>){setBusy(true);setMessage('');try{await task();}catch(error){setMessage(error instanceof Error?error.message:'Please try again.');if(error instanceof CloudRequestError&&[401,403].includes(error.status)){setBooks([]);setJobs([]);setAccount(null);window.location.replace(new URL('/',window.location.origin).href);}}finally{setBusy(false);}}
 async function save(book:TextBook) {
  if(!session.id)throw new Error('Sign in first.');
  const result=await copyReadingToAccount(book,session.id);
  await refresh();setMessage(result.message);
 }
 async function signOut(){await cloudRequest('logout',{},session.id??undefined);announceAccountChange();window.location.replace(new URL('/',window.location.origin).href);}
 async function downloadExport(){await downloadAccountArchive(session.id!,setMessage);setMessage('Your account archive has been downloaded.');}
 return <main className={styles.page}><div className={styles.inner}>
  <header className={styles.header}><Link href="/">← Back to Library</Link><Link href="/privacy">Privacy & storage</Link></header>
  <h1>Your account</h1><p className={styles.muted}>Manage your private books and saved reading.</p>
  <div role="status" aria-live="polite">{message&&<p className={styles.notice}>{message}</p>}{!ready&&<p>Loading your account…</p>}</div>
   <section className={styles.card}><div className={styles.actions}><span>Signed in as <strong>{session.email}</strong></span><button className={styles.button} disabled={busy} onClick={()=>void run(signOut)}>Sign out</button></div>
    {account&&<p className={styles.muted}>{account.books} / {account.limits.books} books · {mib(account.sourceBytes)} / {mib(account.limits.sourceBytes)} MiB of source storage</p>}
   </section>
   <section className={styles.card}><h2>Your cloud books</h2>{books.length===0&&<p className={styles.muted}>Your library is ready. Copy a book from this device or upload a text file below.</p>}
    <ul className={styles.list}>{books.map(book=><li className={styles.item} key={book.id}><strong className={styles.title}>{book.title}</strong><div className={styles.actions}>{book.book_sources.map((source,index)=><button className={styles.primary} key={source.id} disabled={busy} onClick={()=>void run(async()=>{await cloudRequest('open',{source:source.id},session.id!);window.location.replace(new URL('/?book=cloud',window.location.origin).href);})}>{book.book_sources.length>1?`Read version ${index+1}`:'Read'}</button>)}
     {book.book_sources[0]&&<button className={styles.button} disabled={busy} onClick={()=>void run(async()=>{
      const source=book.book_sources[0].id;const storageKey=`eazo-job:${session.id}:${source}`;const terminal=jobs.find(job=>job.book_id===book.id);const key=terminal&&['failed','cancelled'].includes(terminal.status)?crypto.randomUUID():sessionStorage.getItem(storageKey)??crypto.randomUUID();sessionStorage.setItem(storageKey,key);
      await cloudRequest('analyze',{source,key},session.id!);await refresh();setMessage('Book map queued. Refresh to check progress.');
     })}>Create book map</button>}</div>
     {jobs.filter(job=>job.book_id===book.id).slice(0,1).map(job=><p className={styles.muted} key={job.id}>Map: {job.status} {['queued','running'].includes(job.status)&&<button className={styles.button} disabled={busy} onClick={()=>void run(async()=>{await cloudRequest('resume',{job:job.id},session.id!);await refresh();setMessage('Analysis connection checked.');})}>Resume if interrupted</button>}</p>)}
    </li>)}</ul><button className={styles.button} disabled={busy} onClick={()=>void run(refresh)}>Refresh library</button>
   </section>
   <section className={styles.card}><h2>Bring your local reading with you</h2><p className={styles.muted}>Copy a local book and its saved reading progress into this account. These local books belong to this browser; only copy the ones you want in your account. For PDFs, Eazo copies extracted text; original PDFs remain on this device.</p>
    <ul className={styles.list}>{local.map(book=><li className={styles.item} key={book.id}><div className={styles.actions}><span>{book.title}</span><button className={styles.button} disabled={busy} onClick={()=>void run(async()=>{const value=await bookLibrary.load(book.id);if(value.kind!=='txt')throw new Error('Open this PDF in the reader first to extract its text.');await save(value);})}>Copy to this account</button></div></li>)}</ul>
    <label>Upload a TXT file<input className={styles.field} disabled={busy} type="file" accept=".txt,text/plain" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void run(async()=>{const book=await readUploadedBook(file);if(book.kind==='txt')await save(book);});}}/></label><p className={styles.muted}>TXT uploads can be up to 20 MiB. Local extracted text can be up to 50 MiB. Book-map generation currently supports text up to 1 MiB.</p>
   </section>
   <section className={styles.card}><h2>Account & data</h2><p className={styles.muted}>Download your saved account data or permanently delete your account and cloud library.</p><div className={styles.actions}><button className={styles.button} disabled={busy} onClick={()=>void run(downloadExport)}>Export account data</button><button className={`${styles.button} ${styles.danger}`} disabled={busy} onClick={()=>setDeleting(!deleting)}>{deleting?'Cancel deletion':'Delete account…'}</button></div>
    {deleting&&<form onSubmit={event=>{event.preventDefault();void run(async()=>{await cloudRequest('delete-account',{confirmation},session.id!);let cleared=true;try{await clearAccountReading(session.id!);}catch{cleared=false;}announceAccountChange();window.location.replace(new URL(cleared?'/?deleted=1':'/?deleted=1&device_cache=retained',window.location.origin).href);});}}><p className={styles.danger}>This permanently removes this account’s cloud books, saved reading, and generated maps. Local guest books on this device remain. This cannot be undone.</p><label>Type DELETE to confirm<input className={styles.field} value={confirmation} onChange={event=>setConfirmation(event.target.value)} autoComplete="off"/></label><button className={`${styles.button} ${styles.danger}`} disabled={busy||confirmation!=='DELETE'}>Permanently delete my account</button></form>}
   </section>
  <footer className={styles.footer}><Link href="/">Back to bookshelf</Link><Link href="/privacy">Privacy & storage</Link></footer>
 </div></main>;
}
