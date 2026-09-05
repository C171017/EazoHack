import { PDF_PIPELINE_VERSION, TextSourceSchema, type PageText } from './model';

const DB = 'eazo-pdf-v1';
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('pages');
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
const key = (hash: string, page: number, language: string) => `${PDF_PIPELINE_VERSION}:${hash}:${page}:${language}`;
export async function readPageCache(hash: string, page: number, language: string): Promise<PageText | null> {
  const db = await open();
  try {
    const value = await new Promise<PageText | undefined>((resolve, reject) => {
      const r = db.transaction('pages').objectStore('pages').get(key(hash, page, language));
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    if (!value || value.version !== PDF_PIPELINE_VERSION || value.fileHash !== hash || value.pageIndex !== page || value.language !== language) return null;
    if (!TextSourceSchema.safeParse(value.source).success || !TextSourceSchema.safeParse(value.native).success) return null;
    return value;
  } finally { db.close(); }
}
export async function writePageCache(value: PageText): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('pages', 'readwrite');
      tx.objectStore('pages').put(value, key(value.fileHash, value.pageIndex, value.language));
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error('Save aborted'));
    });
  } finally { db.close(); }
}
