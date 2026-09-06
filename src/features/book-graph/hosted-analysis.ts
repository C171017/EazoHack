import type { TextBook } from '../reader/upload-book';
import { cloudRequest, CloudRequestError } from '../cloud/request';
import { copyReadingToAccount } from '../cloud/copy-reading';
import type { CloudBook } from '../cloud/library';
import { throwIfAborted } from '../browser/abort';

export class MapAccountRequiredError extends Error {}
type HostedOptions = { owner?: string; allowUpload?: boolean; signal?: AbortSignal };

export type HostedStatus = { status: 'idle' | 'queued' | 'running' | 'ready' | 'failed' | 'cancelled'; error?: string; jobId?: string };
export async function startHostedAnalysis(book: TextBook, existingSource?: string, retry = false, options: HostedOptions = {}) {
  const request = (action: string, body?: unknown, owner?: string) => cloudRequest(action, body, owner, { signal: options.signal });
  const session = await request('session');
  if (!session.id) throw new CloudRequestError('Sign in with Google to build this book’s map. Your text is saved on this device.', 401);
  const owner: string = session.id;
  if (options.owner && options.owner !== owner) throw new CloudRequestError('Your account changed. Reopen your library before continuing.', 403);
  let source = existingSource;
  if (!source) {
    // A device/cache tile does not carry a cloud source ID. Recover only the
    // exact immutable source, never another extraction with the same title.
    const books: CloudBook[] = await request('books', undefined, owner);
    source = books.find(value => value.local_book_id === book.bookId)?.book_sources.find(value =>
      value.file_hash === book.preview.fileHash && value.extraction_version === book.preview.extractionVersion)?.id;
    if (!source) {
      if (options.allowUpload === false) throw new MapAccountRequiredError('Add this device copy to your account to build its map. Your text and saved reading will be kept.');
      throwIfAborted(options.signal);
      source = (await copyReadingToAccount(book, owner, undefined, !options.owner)).sourceId;
    }
  }
  if (!source) throw new Error('The account source could not be opened. Please retry saving this book.');
  throwIfAborted(options.signal);
  const status: HostedStatus = await request(`analysis-status?source=${encodeURIComponent(source)}`, undefined, owner);
  if (status.status === 'idle' || (retry && ['failed', 'cancelled'].includes(status.status))) {
    const storageKey = `eazo-job:${owner}:${source}`;
    let key: string | null = null;
    try { key = localStorage.getItem(storageKey); } catch { /* Storage can be disabled. */ }
    if (!key || retry) key = crypto.randomUUID();
    try { localStorage.setItem(storageKey, key); } catch { /* Server also deduplicates active jobs. */ }
    await request('analyze', { source, key }, owner);
  }
  if (retry && status.jobId && ['queued', 'running'].includes(status.status)) {
    await request('resume', { job: status.jobId }, owner);
  }
  return { source, owner };
}
