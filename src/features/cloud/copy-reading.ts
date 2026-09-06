import type {TextBook} from '../reader/upload-book';
import type {WorkspaceSnapshot} from '../persistence';
import {loadGuestReading,seedImportedReadingConflict,type SnapshotHead} from './sync-store';
import {cloudRequest,CloudRequestError} from './request';

export async function copyReadingToAccount(book:TextBook,owner:string,current?:WorkspaceSnapshot) {
 const bytes=new TextEncoder().encode(book.preview.sourceText);
 if(bytes.length>50*1024*1024)throw new Error('Cloud text files can be up to 50 MiB.');
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 const prepared=await cloudRequest('prepare',{localBookId:book.bookId,title:book.title,fileHash:book.preview.fileHash,extractionVersion:book.preview.extractionVersion,sourceSha256:digest,sourceBytes:bytes.length},owner);
 const response=await fetch(prepared.uploadUrl,{method:'PUT',headers:{'Content-Type':'text/plain'},body:bytes});
 if(!response.ok&&response.status!==409)throw new Error('Upload failed. Your local book is unchanged; try saving again.');
 const saved=current??await loadGuestReading(book.bookId);
 let message='Book saved to your private library.';
 if(saved){
  const device=localStorage.getItem('eazo-device')??crypto.randomUUID();localStorage.setItem('eazo-device',device);
  try {
   await cloudRequest('snapshot',{source:prepared.source.id,device,mutationId:crypto.randomUUID(),baseRevision:0,payload:saved},owner);
   message='Book and local reading progress saved to your account.';
  }catch(error){
   const head=error instanceof CloudRequestError?(error.details as {current?:SnapshotHead})?.current:undefined;
   if(error instanceof CloudRequestError&&error.status===409&&head){
    await seedImportedReadingConflict(owner,prepared.source.id,saved,head);
    message='Both versions were kept. Open this cloud book to choose which reading progress to continue.';
   }else throw new Error('Book saved, but reading progress could not be copied. Your local progress is safe; retry the copy.');
  }
 }
 return {sourceId:prepared.source.id,message};
}
