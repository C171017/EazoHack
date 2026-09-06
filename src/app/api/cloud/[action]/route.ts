import { cookies } from 'next/headers';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { backend, cloudConfig, cloudUser, sameOrigin, serviceKey, setSession } from '@/server/cloud/backend';
import { readJson, requestError, RequestBodyError } from '@/server/http';
import { invokeBookAnalysis } from '@/server/book-analysis/cloud/invoke';
import { WorkspaceSnapshotSchema } from '@/features/persistence';
export const runtime='nodejs';
const uuid=z.uuid();
const json=(body:unknown)=>Response.json(body,{headers:{'Cache-Control':'private, no-store'}});
type Source={id:string;book_id:string;owner_id:string;source_object:string;file_hash:string;extraction_version:string;manifest:{sourceSha256:string}};
export async function GET(request:Request,context:{params:Promise<{action:string}>}) {
 try {
  const {action}=await context.params;
  if(action==='session') {
   try {const user=await cloudUser();return json({email:user.email,id:user.id});}catch {
    const refresh=(await cookies()).get('eazo-refresh')?.value;
    if(!refresh)return json({email:null});
    try {
     const session=await backend<{access_token:string;refresh_token:string;expires_in:number}>('/auth/v1/token?grant_type=refresh_token',cloudConfig().key,{method:'POST',body:JSON.stringify({refresh_token:refresh})});
     await setSession(session);const user=await cloudUser();return json({email:user.email,id:user.id});
    }catch{return json({email:null});}
   }
  }
  const user=await cloudUser();
  if(action==='books')return json(await backend('/rest/v1/books?select=*,book_sources(*)&order=created_at.desc&limit=100',user.token));
  if(action==='jobs')return json(await backend('/rest/v1/analysis_jobs?select=id,book_id,status,attempt,error_code,created_at&order=created_at.desc&limit=50',user.token));
  if(action==='snapshot') {
   const source=uuid.parse(new URL(request.url).searchParams.get('source'));
   const rows=await backend<{payload:unknown}[]>(`/rest/v1/reading_snapshots?source_id=eq.${source}&order=created_at.desc&limit=1&select=payload`,user.token);
   return json(rows[0]?.payload??null);
  }
  throw new RequestBodyError('Unknown cloud action.',404);
 }catch(error){return requestError(error);}
}
export async function POST(request:Request,context:{params:Promise<{action:string}>}) {
 try {
  sameOrigin(request);const {action}=await context.params;const body=await readJson(request,action==='snapshot'?3*1024*1024:128*1024);
  if(action==='login') {
   const input=z.object({email:z.email(),password:z.string().min(1).max(1000)}).parse(body);
   const session=await backend<{access_token:string;refresh_token:string;expires_in:number}>('/auth/v1/token?grant_type=password',cloudConfig().key,{method:'POST',body:JSON.stringify(input)});
   await setSession(session);return json({ok:true});
  }
  if(action==='logout') {
   const jar=await cookies();const token=jar.get('eazo-access')?.value;
   try {if(token)await backend('/auth/v1/logout',token,{method:'POST'});}catch { /* Expired sessions must still sign out locally. */ }
   jar.delete('eazo-access');jar.delete('eazo-refresh');jar.delete('eazo-book');return json({ok:true});
  }
  const user=await cloudUser();
  if(action==='prepare') {
   const input=z.object({localBookId:z.string().min(1).max(200),title:z.string().min(1).max(1000),fileHash:z.string().regex(/^[a-f0-9]{64}$/),extractionVersion:z.string().min(1).max(160),sourceSha256:z.string().regex(/^[a-f0-9]{64}$/)}).parse(body);
   let books=await backend<{id:string}[]>(`/rest/v1/books?owner_id=eq.${user.id}&local_book_id=eq.${encodeURIComponent(input.localBookId)}&select=id`,user.token);
   if(!books.length)books=await backend('/rest/v1/books',user.token,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({owner_id:user.id,local_book_id:input.localBookId,title:input.title,format:'txt'})});
   const book=books[0];let sources=await backend<Source[]>(`/rest/v1/book_sources?book_id=eq.${book.id}&file_hash=eq.${encodeURIComponent(input.fileHash)}&extraction_version=eq.${encodeURIComponent(input.extractionVersion)}`,user.token);
   if(!sources.length){const id=crypto.randomUUID();sources=await backend('/rest/v1/book_sources',user.token,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({id,owner_id:user.id,book_id:book.id,file_hash:input.fileHash,extraction_version:input.extractionVersion,source_object:`${user.id}/${book.id}/${id}/source.txt`,manifest:{sourceSha256:input.sourceSha256}})});}
   const source=sources[0];if(source.manifest.sourceSha256!==input.sourceSha256)throw new RequestBodyError('Source identity conflicts with an existing version.',409);
   const upload=await backend<{url:string}>(`/storage/v1/object/upload/sign/eazo-sources/${source.source_object}`,user.token,{method:'POST',body:'{}'});
   return json({source,uploadUrl:cloudConfig().url+'/storage/v1'+upload.url});
  }
  if(action==='open') {
   const {source}=z.object({source:uuid.nullable()}).parse(body);
   const jar=await cookies();
   if(source){const rows=await backend<Source[]>(`/rest/v1/book_sources?id=eq.${source}`,user.token);if(!rows.length)throw new RequestBodyError('Book not found.',404);jar.set('eazo-book',source,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/'});}
   else jar.delete('eazo-book');return json({ok:true});
  }
  if(action==='download') {
   const {source:id}=z.object({source:uuid}).parse(body);
   const sources=await backend<Source[]>(`/rest/v1/book_sources?id=eq.${id}`,user.token);if(!sources[0])throw new RequestBodyError('Book not found.',404);
   const result=await backend<{signedURL:string}>(`/storage/v1/object/sign/eazo-sources/${sources[0].source_object}`,user.token,{method:'POST',body:JSON.stringify({expiresIn:60})});
   return json({url:cloudConfig().url+'/storage/v1'+result.signedURL,source:sources[0]});
  }
  if(action==='snapshot') {
   const {source:id,payload,device}=z.object({source:uuid,payload:WorkspaceSnapshotSchema,device:uuid}).parse(body);
   const [source]=await backend<Source[]>(`/rest/v1/book_sources?id=eq.${id}`,user.token);if(!source)throw new RequestBodyError('Book not found.',404);
   const [book]=await backend<{local_book_id:string}[]>(`/rest/v1/books?id=eq.${source.book_id}&select=local_book_id`,user.token);
   if(payload.bookId!==book.local_book_id||payload.anchors.some(a=>a.fileHash!==source.file_hash||a.extractionVersion!==source.extraction_version))throw new RequestBodyError('Saved reading does not match this source.',400);
   await backend('/rest/v1/reading_snapshots',user.token,{method:'POST',body:JSON.stringify({owner_id:user.id,book_id:source.book_id,source_id:id,checkpoint_id:payload.id,device_id:device,payload})});return json({ok:true});
  }
  if(action==='resume') {
   if(process.env.EAZO_ENABLE_ANALYSIS!=='1')throw new RequestBodyError('Hosted analysis is not enabled yet.',503);
   const {job:id}=z.object({job:uuid}).parse(body);
   const [job]=await backend<{id:string;status:string;attempt:number;lease_expires_at:string|null}[]>(`/rest/v1/analysis_jobs?id=eq.${id}`,user.token);
   if(!job)throw new RequestBodyError('Job not found.',404);
   if(job.attempt>=3||!['queued','running'].includes(job.status))throw new RequestBodyError('This job has finished its retries.',409);
   if(job.status==='running'&&job.lease_expires_at&&Date.parse(job.lease_expires_at)>Date.now())return json({id,active:true});
   const reserved=await backend<boolean>('/rest/v1/rpc/eazo_reserve_dispatch',serviceKey(),{method:'POST',body:JSON.stringify({p_job:id,p_owner:user.id})});
   if(!reserved)return json({id,dispatchPending:true});
   const operation=await invokeBookAnalysis(id);
   await backend(`/rest/v1/analysis_jobs?id=eq.${id}`,serviceKey(),{method:'PATCH',body:JSON.stringify({execution_name:operation})});return json({id});
  }
  if(action==='analyze') {
   if(process.env.EAZO_ENABLE_ANALYSIS!=='1')throw new RequestBodyError('Hosted analysis is not enabled yet.',503);
   const {source:id,key}=z.object({source:uuid,key:uuid}).parse(body);
   const [source]=await backend<Source[]>(`/rest/v1/book_sources?id=eq.${id}`,user.token);if(!source)throw new RequestBodyError('Book not found.',404);
   const {downloadSource}=await import('@/server/cloud/map');const bytes=await downloadSource(source.source_object,user.token);
   if(bytes.length>1024*1024||createHash('sha256').update(bytes).digest('hex')!==source.manifest.sourceSha256)throw new RequestBodyError('Invalid or oversized analysis source (maximum 1 MiB).',400);
   const pipeline=process.env.EAZO_PIPELINE_VERSION;if(!pipeline)throw new RequestBodyError('Worker is not configured.',503);
   const jobId=await backend<string>('/rest/v1/rpc/eazo_submit_job',serviceKey(),{method:'POST',body:JSON.stringify({p_owner:user.id,p_source:id,p_key:key,p_model:process.env.GEMINI_MODEL??'gemini-3.8-flash',p_pipeline:pipeline})});
   // A queued record survives a dispatch outage. Retrying with the same key retries dispatch.
   const reserved=await backend<boolean>('/rest/v1/rpc/eazo_reserve_dispatch',serviceKey(),{method:'POST',body:JSON.stringify({p_job:jobId,p_owner:user.id})});
   if(!reserved)return json({id:jobId,dispatchPending:true});
   const operation=await invokeBookAnalysis(jobId);
   await backend(`/rest/v1/analysis_jobs?id=eq.${jobId}`,serviceKey(),{method:'PATCH',body:JSON.stringify({execution_name:operation})});return json({id:jobId});
  }
  throw new RequestBodyError('Unknown cloud action.',404);
 }catch(error){return requestError(error);}
}
