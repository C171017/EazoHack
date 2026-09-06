import type { TextBook } from '../reader/upload-book';
import { cloudRequest, CloudRequestError } from '../cloud/request';
import { copyReadingToAccount } from '../cloud/copy-reading';

export type HostedStatus = { status: 'idle' | 'queued' | 'running' | 'ready' | 'failed' | 'cancelled'; error?: string; jobId?: string };
export async function startHostedAnalysis(book: TextBook, existingSource?: string, retry = false) {
  const session = await cloudRequest('session');
  if (!session.id) throw new CloudRequestError('Sign in with Google to build this book’s map. Your text is saved on this device.', 401);
  const owner: string = session.id;
  const source = existingSource ?? (await copyReadingToAccount(book, owner)).sourceId;
  const status: HostedStatus = await cloudRequest(`analysis-status?source=${encodeURIComponent(source)}`, undefined, owner);
  if (status.status === 'idle' || (retry && ['failed', 'cancelled'].includes(status.status))) {
    const storageKey = `eazo-job:${owner}:${source}`;
    let key: string | null = null;
    try { key = localStorage.getItem(storageKey); } catch { /* Storage can be disabled. */ }
    if (!key || retry) key = crypto.randomUUID();
    try { localStorage.setItem(storageKey, key); } catch { /* Server also deduplicates active jobs. */ }
    await cloudRequest('analyze', { source, key }, owner);
  }
  if (retry && status.jobId && ['queued', 'running'].includes(status.status)) {
    await cloudRequest('resume', { job: status.jobId }, owner);
  }
  return { source, owner };
}
