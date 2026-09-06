import {Zip,ZipPassThrough} from 'fflate';
import {cloudRequest,CloudRequestError} from './request';

type ExportPage={table:string;records:Record<string,unknown>[];nextCursor:string|null;complete:boolean;account:unknown;exportedAt:string};
type FileRequest={kind:'source'|'original'|'manifest'|'graph'|'hierarchy';id:string};

/** Stream each authorized download into an uncompressed ZIP, without base64 expansion. */
export async function downloadAccountArchive(owner:string,notice:(value:string)=>void) {
 const chunks:Uint8Array<ArrayBuffer>[]=[];
 let zipError:Error|undefined;
 const zip=new Zip((error,chunk)=>{if(error)zipError=error;else chunks.push(new Uint8Array(chunk));});
 const encoder=new TextEncoder();
 const add=(name:string,bytes:Uint8Array)=>{const file=new ZipPassThrough(name);zip.add(file);file.push(bytes,true);};
 let cursor:string|undefined;
 let index=0;const files:FileRequest[]=[];const missing:FileRequest[]=[];
 do {
  notice(`Preparing account data (${++index})…`);
  const page:ExportPage=await cloudRequest('export'+(cursor?'?cursor='+encodeURIComponent(cursor):''),undefined,owner);
  if(index===1)add('account.json',encoder.encode(JSON.stringify({account:page.account,exportedAt:page.exportedAt,schema:'eazo-account-archive-v1'},null,2)));
  add(`data/${String(index).padStart(6,'0')}-${page.table}.json`,encoder.encode(JSON.stringify(page.records)));
  if(page.table==='book_sources')for(const record of page.records){files.push({kind:'source',id:String(record.id)});if(record.original_object)files.push({kind:'original',id:String(record.id)});}
  if(page.table==='graph_versions')for(const record of page.records)for(const kind of ['manifest','graph','hierarchy'] as const)files.push({kind,id:String(record.id)});
  cursor=page.nextCursor??undefined;
 }while(cursor);
 for(let i=0;i<files.length;i++){
  notice(`Downloading private files (${i+1} of ${files.length})…`);
  let descriptor:{url:string;path:string;bucket:string};
  try {descriptor=await cloudRequest('export-file',files[i],owner);}
  catch(error){if(error instanceof CloudRequestError&&error.status===404){missing.push(files[i]);continue;}throw error;}
  const response=await fetch(descriptor.url,{cache:'no-store'});
  if(response.status===404){missing.push(files[i]);continue;}
  if(!response.ok)throw new Error('An account file could not be downloaded. Please retry your export.');
  const file=new ZipPassThrough(`files/${descriptor.bucket}/${descriptor.path}`);zip.add(file);
  const reader=response.body?.getReader();if(!reader)throw new Error('File download is unavailable. Please retry.');
  try {for(;;){const {done,value}=await reader.read();if(done)break;file.push(value);}}finally{reader.releaseLock();}
  file.push(new Uint8Array(),true);
  if(zipError)throw zipError;
 }
 if(missing.length)add('missing-files.json',encoder.encode(JSON.stringify(missing,null,2)));
 add('README.txt',encoder.encode('Eazo account export\n\naccount.json identifies the account. data/ contains paginated database records, including saved reading revisions and current heads. files/ contains original source text and published map files at the paths referenced by those records. missing-files.json, when present, lists registered files whose upload is missing. This archive contains private reading data.\n'));
 zip.end();if(zipError)throw zipError;
 const url=URL.createObjectURL(new Blob(chunks,{type:'application/zip'}));
 const link=document.createElement('a');link.href=url;link.download='eazo-account.zip';link.click();
 setTimeout(()=>URL.revokeObjectURL(url),30_000);
}
