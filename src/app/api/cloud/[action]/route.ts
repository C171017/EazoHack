import { cookies } from 'next/headers';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { backend, cloudConfig, cloudUser, sameOrigin, serviceKey, signOut, clearSession } from '@/server/cloud/backend';
import { readJson, requestError, RequestBodyError } from '@/server/http';
import { invokeBookAnalysis } from '@/server/book-analysis/cloud/invoke';
import { WorkspaceSnapshotSchema, type WorkspaceSnapshot } from '@/features/persistence';
import { assertAccountActive, accountSummary, exportAccount, exportAccountFile, deleteAccount } from '@/server/cloud/account';
import { validateSnapshotSource } from '@/server/cloud/snapshot';
import { sourceTextCache } from '@/server/cloud/source-cache';
export const runtime='nodejs';
const uuid=z.uuid();
const json=(body:unknown)=>Response.json(body,{headers:{'Cache-Control':'private, no-store'}});
type Source={id:string;book_id:string;owner_id:string;source_object:string;file_hash:string;extraction_version:string;manifest:{sourceSha256:string}};
export async function GET(request:Request,context:{params:Promise<{action:string}>}) {
 try {
  const {action}=await context.params;
  if(action==='session') {
   try {const user=await cloudUser();return json({email:user.email,id:user.id});}
   catch(error) {if(error instanceof RequestBodyError && error.status===401)return json({email:null,id:null});throw error;}
  }
  const user=await cloudUser();
  checkOwner(request,user.id);
  if(action==='account')return json(await accountSummary(user));
  if(action==='export')return Response.json(await exportAccount(user,new URL(request.url).searchParams.get('cursor')??undefined),{headers:{'Cache-Control':'private, no-store','Content-Disposition':'attachment; filename="eazo-account.json"'}});
  await assertAccountActive(user);
  if(action==='analysis-status') {
   const source=uuid.parse(new URL(request.url).searchParams.get('source'));
   const [owned]=await backend<Source[]>(`/rest/v1/book_sources?id=eq.${source}`,user.token);
   if(!owned)throw new RequestBodyError('Book not found.',404);
   const [version]=await backend<{id:string}[]>(`/rest/v1/graph_versions?source_id=eq.${source}&select=id&limit=1`,user.token);
   if(version)return json({status:'ready'});
   const [job]=await backend<{id:string;status:string;error_code:string|null}[]>(`/rest/v1/analysis_jobs?source_id=eq.${source}&select=id,status,error_code&order=created_at.desc&limit=1`,user.token);
   return json({status:job?.status??'idle',jobId:job?.id,...(job?.error_code?{error:`Book analysis failed (${job.error_code}). Retry to reconnect.`}:{})});
  }
  if(action==='books')return json(await backend('/rest/v1/books?select=*,book_sources(*)&order=created_at.desc&limit=100',user.token));
  if(action==='jobs')return json(await backend('/rest/v1/analysis_jobs?select=id,book_id,status,attempt,error_code,created_at&order=created_at.desc&limit=50',user.token));
  if(action==='snapshot') {
   const source=uuid.parse(new URL(request.url).searchParams.get('source'));
   return json(await backend('/rest/v1/rpc/eazo_snapshot_head',user.token,{method:'POST',body:JSON.stringify({p_source:source})}));
  }
  throw new RequestBodyError('Unknown cloud action.',404);
 }catch(error){return requestError(error);}
}
export async function POST(request:Request,context:{params:Promise<{action:string}>}) {
 try {
  sameOrigin(request);const {action}=await context.params;const body=await readJson(request,action==='snapshot'?3*1024*1024:128*1024);
  if(action==='login')throw new RequestBodyError('Use Continue with Google to sign in.',410);
  if(action==='logout') {
   if(request.headers.has('x-eazo-owner')) {
    try {checkOwner(request,(await cloudUser()).id);}catch(error){if(!(error instanceof RequestBodyError)||error.status!==401)throw error;}
   }
   return json({ok:true,...await signOut()});
  }
  const user=await cloudUser();
  checkOwner(request,user.id);
  if(action==='delete-account') {
   z.object({confirmation:z.literal('DELETE')}).parse(body);
   sourceTextCache.clearOwner(user.id);await deleteAccount(user);await clearSession();return json({ok:true});
  }
  await assertAccountActive(user);
  if(action==='export-file'){
   const input=z.object({kind:z.enum(['source','original','manifest','graph','hierarchy']),id:uuid}).parse(body);
   return json(await exportAccountFile(user,input));
  }
  if(action==='prepare') {
   const input=z.object({localBookId:z.string().min(1).max(200),title:z.string().min(1).max(1000),fileHash:z.string().regex(/^[a-f0-9]{64}$/),extractionVersion:z.string().min(1).max(160),sourceSha256:z.string().regex(/^[a-f0-9]{64}$/),sourceBytes:z.number().int().positive().max(50*1024*1024)}).parse(body);
   let books=await backend<{id:string}[]>(`/rest/v1/books?owner_id=eq.${user.id}&local_book_id=eq.${encodeURIComponent(input.localBookId)}&select=id`,user.token);
   if(!books.length)books=await backend('/rest/v1/books',user.token,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({owner_id:user.id,local_book_id:input.localBookId,title:input.title,format:'txt'})});
   const book=books[0];let sources=await backend<Source[]>(`/rest/v1/book_sources?book_id=eq.${book.id}&file_hash=eq.${encodeURIComponent(input.fileHash)}&extraction_version=eq.${encodeURIComponent(input.extractionVersion)}`,user.token);
   if(!sources.length){const id=crypto.randomUUID();sources=await backend('/rest/v1/book_sources',user.token,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({id,owner_id:user.id,book_id:book.id,file_hash:input.fileHash,extraction_version:input.extractionVersion,source_object:`${user.id}/${book.id}/${id}/source.txt`,manifest:{sourceSha256:input.sourceSha256,sourceBytes:input.sourceBytes}})});}
   const source=sources[0];if(source.manifest.sourceSha256!==input.sourceSha256)throw new RequestBodyError('Source identity conflicts with an existing version.',409);
   // A completed immutable upload can be reused. Source rows may also survive an
   // interrupted upload, so verify the object exists rather than trusting the row.
   try {
    await backend(`/storage/v1/object/sign/eazo-sources/${source.source_object}`,user.token,{method:'POST',body:JSON.stringify({expiresIn:60})});
    return json({source,alreadyUploaded:true});
   } catch(error) {
    if(!(error instanceof RequestBodyError)||error.status!==404)throw error;
   }
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
   const {source:id,payload,device,baseRevision,mutationId}=z.object({source:uuid,payload:WorkspaceSnapshotSchema,device:uuid,baseRevision:z.number().int().nonnegative(),mutationId:uuid}).parse(body);
   const [source]=await backend<Source[]>(`/rest/v1/book_sources?id=eq.${id}`,user.token);if(!source)throw new RequestBodyError('Book not found.',404);
   const [book]=await backend<{local_book_id:string}[]>(`/rest/v1/books?id=eq.${source.book_id}&select=local_book_id`,user.token);
   const {downloadSource}=await import('@/server/cloud/map');
   const sourceText=await sourceTextCache.get({ownerId:user.id,sourceId:source.id,fileHash:source.file_hash,extractionVersion:source.extraction_version,sourceSha256:source.manifest.sourceSha256},()=>downloadSource(source.source_object,user.token));
   validateSnapshotSource(payload,{bookId:book.local_book_id,fileHash:source.file_hash,extractionVersion:source.extraction_version,sourceText});
   const result=await backend<{status:'saved'|'conflict';revision:number;payload:WorkspaceSnapshot|null}>('/rest/v1/rpc/eazo_save_snapshot',user.token,{method:'POST',body:JSON.stringify({p_source:id,p_device:device,p_mutation:mutationId,p_base_revision:baseRevision,p_payload:payload})});
   if(result.status==='conflict')return Response.json({error:{code:'snapshot_conflict',message:'This book changed on another device. Both versions have been kept.'},current:{revision:result.revision,payload:result.payload}},{status:409,headers:{'Cache-Control':'private, no-store'}});
   return json({revision:result.revision,payload:result.payload});
  }
  if(action==='connection') {
   // Authenticate both cloud identities without starting a job or making a model call.
   const {vertexAccessToken}=await import('@/server/providers/vertex-gemini');
   const {bookAnalysisAccessToken}=await import('@/server/book-analysis/cloud/invoke');
   await Promise.all([vertexAccessToken(),bookAnalysisAccessToken()]);
   return json({ok:true});
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
   const {downloadSource}=await import('@/server/cloud/map');const bytes=await downloadSource(source.source_object,user.token,{maxBytes:1024*1024,message:'Invalid or oversized analysis source (maximum 1 MiB).'});
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

function checkOwner(request:Request,owner:string) {
 const expected=request.headers.get('x-eazo-owner');
 if(expected && expected!==owner)throw new RequestBodyError('Your account changed. Reopen your library before continuing.',403);
}
