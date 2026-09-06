'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import { SAMPLE_BOOKS } from '@/shared/sample-books';
import {useRouter} from 'next/navigation';
import {bookLibrary,type LibraryEntry} from '../reader/book-library-store';
import {readUploadedBook,type TextBook} from '../reader/upload-book';
export async function cloudRequest(action:string,body?:unknown) {
 const response=await fetch('/api/cloud/'+action,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const result=await response.json();if(!response.ok)throw new Error(result.error?.message??'Cloud request failed.');return result;
}
type CloudBook={id:string;title:string;book_sources:{id:string}[]};
export default function CloudLibrary() {
 const router=useRouter();
 const [email,setEmail]=useState<string|null>(null),[ready,setReady]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [local,setLocal]=useState<LibraryEntry[]>([]),[books,setBooks]=useState<CloudBook[]>([]),[jobs,setJobs]=useState<{id:string;book_id:string;status:string}[]>([]);
 async function refresh(){const session=await cloudRequest('session');setEmail(session.email);if(session.email){setBooks(await cloudRequest('books'));setJobs(await cloudRequest('jobs'));}else{setBooks([]);setJobs([]);}setLocal(await bookLibrary.list());setReady(true);}
 useEffect(()=>{let active=true;void cloudRequest('session').then(async session=>{const [localBooks,remoteBooks,remoteJobs]=await Promise.all([bookLibrary.list(),session.email?cloudRequest('books'):[],session.email?cloudRequest('jobs'):[]]);if(active){setEmail(session.email);setLocal(localBooks);setBooks(remoteBooks);setJobs(remoteJobs);setReady(true);}}).catch(e=>{if(active){setMessage(e.message);setReady(true);}});return()=>{active=false;};},[]);
 async function run(task:()=>Promise<void>){setBusy(true);setMessage('');try{await task();}catch(e){setMessage(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}}
 async function save(book:TextBook){
  const bytes=new TextEncoder().encode(book.preview.sourceText);
  if(bytes.length>1024*1024)throw new Error('This initial cloud reader supports text up to 1 MiB. Your local book is unchanged.');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  const prepared=await cloudRequest('prepare',{localBookId:book.bookId,title:book.title,fileHash:book.preview.fileHash,extractionVersion:book.preview.extractionVersion,sourceSha256:digest});
  const response=await fetch(prepared.uploadUrl,{method:'PUT',headers:{'Content-Type':'text/plain'},body:bytes});
  if(!response.ok&&response.status!==409)throw new Error('Upload failed. Your local book is unchanged; try saving again.');
  await refresh();setMessage('Text saved privately to your cloud library.');
 }
 return <main className="mx-auto max-w-3xl p-8 space-y-6"><Link className="underline" href="/">Back to reading</Link><h1 className="text-3xl font-reading">Cloud library</h1>
 <p role="status">{message||(!ready?'Loading…':email?`Signed in as ${email}`:'Sign in to access your private books.')}</p>
 {!email?<form className="space-y-3" onSubmit={e=>{e.preventDefault();const form=e.currentTarget;const data=new FormData(form);void run(async()=>{await cloudRequest('login',{email:data.get('email'),password:data.get('password')});form.reset();await refresh();});}}>
 <label className="block">Email<input className="block border rounded p-2 w-full" name="email" type="email" autoComplete="email" required/></label>
 <label className="block">Password<input className="block border rounded p-2 w-full" name="password" type="password" autoComplete="current-password" required/></label><button disabled={busy} className="border rounded px-4 py-2">Sign in</button>
 <p className="text-sm">Registration is invitation-only while cloud setup is being completed.</p></form>:<>
 <div className="flex gap-4"><button disabled={busy} onClick={()=>void run(refresh)}>Refresh</button><button disabled={busy} onClick={()=>void run(async()=>{await cloudRequest('logout',{});await refresh();})}>Sign out</button></div>
 <h2 className="text-xl">Your cloud books</h2><ul className="space-y-4">{books.map(book=><li key={book.id} className="border rounded p-4"><strong>{book.title}</strong>{book.book_sources.map(source=><div className="flex gap-4 mt-2" key={source.id}>
 <button disabled={busy} onClick={()=>void run(async()=>{await cloudRequest('open',{source:source.id});router.push('/');router.refresh();})}>Read</button>
 <button disabled={busy} onClick={()=>void run(async()=>{const storageKey=`eazo-job:${source.id}`;const terminal=jobs.find(job=>job.book_id===book.id);const key=terminal&&['failed','cancelled'].includes(terminal.status)?crypto.randomUUID():sessionStorage.getItem(storageKey)??crypto.randomUUID();sessionStorage.setItem(storageKey,key);await cloudRequest('analyze',{source:source.id,key});await refresh();setMessage('Analysis queued. Refresh to check progress.');})}>Create book map</button></div>)}
 {jobs.filter(job=>job.book_id===book.id).slice(0,1).map(job=><div key={job.id} className="text-sm mt-2">Map: {job.status}{['queued','running'].includes(job.status)&&<button className="underline ml-3" disabled={busy} onClick={()=>void run(async()=>{await cloudRequest('resume',{job:job.id});await refresh();setMessage('Analysis connection checked.');})}>Resume if interrupted</button>}</div>)}</li>)}</ul>
 <h2 className="text-xl">Save text from this device</h2><p className="text-sm">Choose a local book to copy its extracted text to your private account. Original PDFs remain on this device.</p>
 <ul className="space-y-2">{local.map(book=><li key={book.id}><button className="underline" disabled={busy} onClick={()=>void run(async()=>{const value=await bookLibrary.load(book.id);if(value.kind!=='txt')throw new Error('Open this PDF in the reader first to extract its text.');await save(value);})}>{book.title}</button></li>)}</ul>
 <label className="block">Or save a TXT file<input disabled={busy} type="file" accept=".txt,text/plain" className="block mt-2" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void run(async()=>{const book=await readUploadedBook(file);if(book.kind==='txt'){await bookLibrary.save(book);await save(book);}});}}/></label>
 <div className="flex gap-4" aria-label="Example books">{SAMPLE_BOOKS.map(book => <Link className="underline" key={book.id} href={`/?book=${book.id}`}>{book.title}</Link>)}</div>
 </>}
 </main>;
}
