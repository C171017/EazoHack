import { getBookPreview, getChineseBookPreview } from '@/features/reader/book-preview';
import { cookies } from 'next/headers';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { backend, cloudConfig, cloudUser } from './backend';
import { GraphSchema } from '@/shared/schemas';
import { validateHierarchy } from '@/shared/zoom-hierarchy';
import { validateGraphSource } from '../book-analysis/graph';
import { createMapStore, mapBootstrap, loadMapStore, isSampleBookId } from '../book-map/store';
async function object(bucket:string,path:string,token:string) {
 const {url,key}=cloudConfig();
 const response=await fetch(`${url}/storage/v1/object/authenticated/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`,{headers:{apikey:key,Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error('Could not download private book data.');
 const reader=response.body!.getReader();let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>50*1024*1024){await reader.cancel();throw new Error('Private object too large.');}chunks.push(value);}}finally{reader.releaseLock();}
 return Buffer.concat(chunks);
}
export const downloadSource=(path:string,token:string)=>object('eazo-sources',path,token);
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
export async function selectedCloudBook({refresh=true}:{refresh?:boolean}={}) {
 if(!process.env.SUPABASE_URL)return null;
 const id=(await cookies()).get('eazo-book')?.value;if(!id)return null;z.uuid().parse(id);
 const user=await cloudUser({refresh});
 const [source]=await backend<{id:string;book_id:string;source_object:string;file_hash:string;extraction_version:string;manifest:{sourceSha256:string}}[]>(`/rest/v1/book_sources?id=eq.${id}`,user.token);
 if(!source)throw new Error('Cloud source is unavailable for this account.');
 const [book]=await backend<{local_book_id:string;title:string}[]>(`/rest/v1/books?id=eq.${source.book_id}`,user.token);
 const bytes=await downloadSource(source.source_object,user.token);if(hash(bytes)!==source.manifest.sourceSha256)throw new Error('Source integrity check failed.');
 const sourceText=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 const preview={sourceText,text:sourceText.slice(0,6000),startOffset:0,totalCharacters:sourceText.length,fileHash:source.file_hash,extractionVersion:source.extraction_version};
 const [version]=await backend<{manifest_object:string;manifest_sha256:string}[]>(`/rest/v1/graph_versions?source_id=eq.${id}&order=created_at.desc&limit=1`,user.token);
 let store=null;
 if(version){
  const manifestBytes=await object('eazo-analysis',version.manifest_object,user.token);if(hash(manifestBytes)!==version.manifest_sha256)throw new Error('Manifest integrity check failed.');
  const manifest=z.object({graphSha256:z.string(),hierarchySha256:z.string(),sourceSha256:z.string()}).parse(JSON.parse(manifestBytes.toString()));
  if(manifest.sourceSha256!==source.manifest.sourceSha256)throw new Error('Map source mismatch.');
  const prefix=version.manifest_object.slice(0,-'manifest.json'.length);
  const [g,h]=await Promise.all([object('eazo-analysis',prefix+'graph.json',user.token),object('eazo-analysis',prefix+'hierarchy.json',user.token)]);
  if(hash(g)!==manifest.graphSha256||hash(h)!==manifest.hierarchySha256)throw new Error('Map integrity check failed.');
  const graph=validateGraphSource(GraphSchema.parse(JSON.parse(g.toString())),sourceText,source.file_hash,source.extraction_version);
  if(graph.bookId!==book.local_book_id)throw new Error('Map book mismatch.');
  const hierarchy=validateHierarchy(JSON.parse(h.toString()),graph);store=createMapStore(graph,hierarchy);
 }
 // Copying the public sample into an account retains its already-verified map.
 // Match the entire immutable source before sharing this public analysis.
 if(!store && isSampleBookId(book.local_book_id)) {
  try {
   const sample=await (book.local_book_id==='hong-lou-meng'?getChineseBookPreview():getBookPreview());
   if(sample.fileHash===source.file_hash && sample.extractionVersion===source.extraction_version && sample.sourceText===sourceText)store=await loadMapStore(book.local_book_id);
  } catch { /* Reading remains available when the optional public map is absent. */ }
 }
 return {sourceId:id,ownerId:user.id,title:book.title,preview,store,graph:store?mapBootstrap(store):{bookId:book.local_book_id,graphVersion:book.local_book_id,version:book.local_book_id,roots:[],depth:0,totalNodes:0,unplaced:0,territories:[],unavailable:true}};
}
