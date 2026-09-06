'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {bookLibrary,type LibraryEntry} from '../reader/book-library-store';
import {readUploadedBook,type TextBook} from '../reader/upload-book';
import {clearAccountReading} from './sync-store';
import {copyReadingToAccount} from './copy-reading';
import {cloudRequest,CloudRequestError,announceAccountChange} from './request';
import styles from './library.module.css';
import {downloadAccountArchive} from './export';
export {cloudRequest} from './request';

type Session={id:string|null;email:string|null};
type CloudBook={id:string;title:string;local_book_id:string;book_sources:{id:string}[]};
type Job={id:string;book_id:string;status:string};
type Account={status:string;books:number;sourceBytes:number;limits:{books:number;sourceBytes:number}};
const mib=(n:number)=>(n/(1024*1024)).toFixed(1);
const loginErrors:Record<string,string>={cancelled:'Google sign-in was cancelled. You can try again.',expired:'That sign-in attempt expired. Please try again.',unavailable:'Google sign-in is unavailable right now. Please try again shortly.'};

export default function CloudLibrary() {
 const [session,setSession]=useState<Session>({id:null,email:null});
 const [ready,setReady]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [local,setLocal]=useState<LibraryEntry[]>([]),[books,setBooks]=useState<CloudBook[]>([]),[jobs,setJobs]=useState<Job[]>([]),[account,setAccount]=useState<Account|null>(null);
 const [deleting,setDeleting]=useState(false),[confirmation,setConfirmation]=useState('');
 const generation=useRef(0);
 const refresh=useCallback(async()=>{
  const ticket=++generation.current;
  const next:Session=await cloudRequest('session');
  const summary=next.id?await cloudRequest('account',undefined,next.id):null;
  const active=next.id&&summary?.status!=='deleting';
  const [localBooks,remoteBooks,remoteJobs]=await Promise.all([bookLibrary.list(),active?cloudRequest('books',undefined,next.id!):[],active?cloudRequest('jobs',undefined,next.id!):[]]);
  if(ticket!==generation.current)return;
  setSession(next);setLocal(localBooks);setBooks(remoteBooks);setJobs(remoteJobs);setAccount(summary);if(summary?.status==='deleting'){setDeleting(true);setMessage('Account deletion is in progress. Confirm deletion again below to finish removing remaining data.');}setReady(true);
 },[]);
 useEffect(()=>{
  const query=new URLSearchParams(window.location.search);
  const error=query.get('auth_error');
  if(query.has('deleted'))queueMicrotask(()=>setMessage(query.has('device_cache')?'Your account was deleted. Some cached reading remains on this device; clear this site’s browser storage to remove it.':'Your account and cloud library were deleted.'));
  if(error)queueMicrotask(()=>setMessage(loginErrors[error]??'Sign-in did not finish. Please try again.'));
  const update=()=>{void refresh().catch(error=>{setMessage(error.message);setReady(true);});};
  const changed=()=>{setSession({id:null,email:null});setBooks([]);setJobs([]);setAccount(null);setDeleting(false);setConfirmation('');update();};
  const storage=(event:StorageEvent)=>{if(event.key==='eazo-auth-change')changed();};
  update();window.addEventListener('focus',update);window.addEventListener('eazo-auth-changed',changed);window.addEventListener('storage',storage);
  const invalidate=()=>{generation.current++;};
  return()=>{invalidate();window.removeEventListener('focus',update);window.removeEventListener('eazo-auth-changed',changed);window.removeEventListener('storage',storage);};
 },[refresh]);
 async function run(task:()=>Promise<void>){setBusy(true);setMessage('');try{await task();}catch(error){setMessage(error instanceof Error?error.message:'Please try again.');if(error instanceof CloudRequestError&&[401,403].includes(error.status)){setBooks([]);setJobs([]);setSession({id:null,email:null});setAccount(null);}}finally{setBusy(false);}}
 async function save(book:TextBook) {
  if(!session.id)throw new Error('Sign in first.');
  const result=await copyReadingToAccount(book,session.id);
  await refresh();setMessage(result.message);
 }
 async function signOut(){await cloudRequest('logout',{},session.id??undefined);announceAccountChange();window.location.replace(new URL('/cloud',window.location.origin).href);}
 async function downloadExport(){await downloadAccountArchive(session.id!,setMessage);setMessage('Your account archive has been downloaded.');}
 return <main className={styles.page}><div className={styles.inner}>
  <header className={styles.header}><Link href="/">← Back to reading</Link><Link href="/privacy">Privacy & storage</Link></header>
  <h1>Your reading, wherever you are.</h1><p className={styles.muted}>Keep your books, highlights, and place together across devices.</p>
  <div role="status" aria-live="polite">{message&&<p className={styles.notice}>{message}</p>}{!ready&&<p>Loading your account…</p>}</div>
  {ready&&!session.id?<section className={`${styles.card} ${styles.signin}`}>
   <h2>Welcome to Eazo</h2><p>Sign in to create your private library and pick up where you left off.</p>
   <a className={styles.button} href="/auth/google?next=/cloud"><GoogleIcon/>Continue with Google</a>
   <p className={styles.muted}>Local books stay on this device until you choose to copy them to your account.</p>
   <p className={styles.muted}>Need help accessing your account? Recover your Google account through <a href="https://accounts.google.com/signin/recovery" target="_blank" rel="noreferrer">Google account recovery</a>, then return here.</p>
  </section>:session.id?<>
   <section className={styles.card}><div className={styles.actions}><span>Signed in as <strong>{session.email}</strong></span><button className={styles.button} disabled={busy} onClick={()=>void run(signOut)}>Sign out</button></div>
    {account&&<p className={styles.muted}>{account.books} / {account.limits.books} books · {mib(account.sourceBytes)} / {mib(account.limits.sourceBytes)} MiB of source storage</p>}
   </section>
   <section className={styles.card}><h2>Your cloud books</h2>{books.length===0&&<p className={styles.muted}>Your library is ready. Copy a book from this device or upload a text file below.</p>}
    <ul className={styles.list}>{books.map(book=><li className={styles.item} key={book.id}><strong className={styles.title}>{book.title}</strong><div className={styles.actions}>{book.book_sources.map((source,index)=><button className={styles.primary} key={source.id} disabled={busy} onClick={()=>void run(async()=>{await cloudRequest('open',{source:source.id},session.id!);window.location.replace(new URL('/',window.location.origin).href);})}>{book.book_sources.length>1?`Read version ${index+1}`:'Read'}</button>)}
     {book.book_sources[0]&&<button className={styles.button} disabled={busy} onClick={()=>void run(async()=>{
      const source=book.book_sources[0].id;const storageKey=`eazo-job:${session.id}:${source}`;const terminal=jobs.find(job=>job.book_id===book.id);const key=terminal&&['failed','cancelled'].includes(terminal.status)?crypto.randomUUID():sessionStorage.getItem(storageKey)??crypto.randomUUID();sessionStorage.setItem(storageKey,key);
      await cloudRequest('analyze',{source,key},session.id!);await refresh();setMessage('Book map queued. Refresh to check progress.');
     })}>Create book map</button>}</div>
     {jobs.filter(job=>job.book_id===book.id).slice(0,1).map(job=><p className={styles.muted} key={job.id}>Map: {job.status} {['queued','running'].includes(job.status)&&<button className={styles.button} disabled={busy} onClick={()=>void run(async()=>{await cloudRequest('resume',{job:job.id},session.id!);await refresh();setMessage('Analysis connection checked.');})}>Resume if interrupted</button>}</p>)}
    </li>)}</ul><button className={styles.button} disabled={busy} onClick={()=>void run(refresh)}>Refresh library</button>
   </section>
   <section className={styles.card}><h2>Bring your local reading with you</h2><p className={styles.muted}>Copy a local book and its saved reading progress into this account. These local books belong to this browser; only copy the ones you want in your account. For PDFs, Eazo copies extracted text; original PDFs remain on this device.</p>
    <ul className={styles.list}>{local.map(book=><li className={styles.item} key={book.id}><div className={styles.actions}><span>{book.title}</span><button className={styles.button} disabled={busy} onClick={()=>void run(async()=>{const value=await bookLibrary.load(book.id);if(value.kind!=='txt')throw new Error('Open this PDF in the reader first to extract its text.');await save(value);})}>Copy to this account</button></div></li>)}</ul>
    <label>Upload a TXT file<input className={styles.field} disabled={busy} type="file" accept=".txt,text/plain" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void run(async()=>{const book=await readUploadedBook(file);if(book.kind==='txt')await save(book);});}}/></label><p className={styles.muted}>Up to 50 MiB per text file. Book-map generation currently supports text up to 1 MiB.</p>
   </section>
   <section className={styles.card}><h2>Account & data</h2><p className={styles.muted}>Download your saved account data or permanently delete your account and cloud library.</p><div className={styles.actions}><button className={styles.button} disabled={busy} onClick={()=>void run(downloadExport)}>Export account data</button><button className={`${styles.button} ${styles.danger}`} disabled={busy} onClick={()=>setDeleting(!deleting)}>{deleting?'Cancel deletion':'Delete account…'}</button></div>
    {deleting&&<form onSubmit={event=>{event.preventDefault();void run(async()=>{await cloudRequest('delete-account',{confirmation},session.id!);let cleared=true;try{await clearAccountReading(session.id!);}catch{cleared=false;}announceAccountChange();window.location.replace(cleared?'/cloud?deleted=1':'/cloud?deleted=1&device_cache=retained');});}}><p className={styles.danger}>This permanently removes this account’s cloud books, saved reading, and generated maps. Local guest books on this device remain. This cannot be undone.</p><label>Type DELETE to confirm<input className={styles.field} value={confirmation} onChange={event=>setConfirmation(event.target.value)} autoComplete="off"/></label><button className={`${styles.button} ${styles.danger}`} disabled={busy||confirmation!=='DELETE'}>Permanently delete my account</button></form>}
   </section>
  </>:null}
  <footer className={styles.footer}><Link href="/">Read without an account</Link><Link href="/privacy">Privacy & storage</Link></footer>
 </div></main>;
}
function GoogleIcon(){return <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.9 6.1-15z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.1c-1.8 1.2-4.1 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20.4 20.4 0 0 0 24 44z"/><path fill="#FBBC05" d="M12.6 27.5a12.2 12.2 0 0 1 0-7.8v-5.3H5.8a20.2 20.2 0 0 0 0 18.4z"/><path fill="#EA4335" d="M24 11.3c3 0 5.6 1 7.7 3l5.8-5.8A19.5 19.5 0 0 0 24 3.2 20.4 20.4 0 0 0 5.8 14.4l6.8 5.3A12 12 0 0 1 24 11.3z"/></svg>;}
