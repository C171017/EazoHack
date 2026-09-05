import { z } from 'zod';
import { TextSourceSchema } from './model';
import { DOCUMENT_TEXT_VERSION, type DocumentPage } from './document';

const PageSchema = z.object({
  pageIndex:z.number().int().nonnegative(),status:z.enum(['pending','ready','needs-review','ocr-deferred','failed']),
  method:z.enum(['embedded','geometry','ocr']).optional(),native:TextSourceSchema.optional(),source:TextSourceSchema.optional(),
  extractionVersion:z.string().optional(),reasons:z.array(z.string()),
}).strict();
function open():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('eazo-pdf-document-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('pages');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
const key=(hash:string,page:number)=>`${DOCUMENT_TEXT_VERSION}:${hash}:${page}`;
export async function readDocumentPage(hash:string,page:number):Promise<DocumentPage|null> {
  const db=await open();
  try {
    const value=await new Promise<unknown>((resolve,reject)=>{
      const request=db.transaction('pages').objectStore('pages').get(key(hash,page));
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    const result=PageSchema.safeParse(value);
    return result.success&&result.data.pageIndex===page&&result.data.status==='ready'&&result.data.source?result.data:null;
  } finally {db.close();}
}
export async function writeDocumentPage(hash:string,page:DocumentPage) {
  const checked=PageSchema.parse(page),db=await open();
  try {
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('pages','readwrite');
      tx.objectStore('pages').put(checked,key(hash,page.pageIndex));
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('Save aborted'));
    });
  } finally {db.close();}
}
