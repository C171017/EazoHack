import { createHash } from 'node:crypto';
import { RequestBodyError } from '../http';

export type SourceCacheIdentity = {
  ownerId: string;
  sourceId: string;
  fileHash: string;
  extractionVersion: string;
  sourceSha256: string;
};
type Entry = {
  ownerId: string;
  pending: boolean;
  invalidated: boolean;
  bytes: number;
  expiresAt: number;
  promise: Promise<string>;
  timer?: ReturnType<typeof setTimeout>;
};

/** Process-local immutable text cache, never an authorization decision.
 * Callers must authenticate and query the owned source row before every get.
 * Size measures UTF-8 source bytes; JavaScript string allocation may be larger.
 */
export class SourceTextCache {
  private readonly entries = new Map<string, Entry>();
  private storedBytes = 0;
  private readonly maxBytes: number;
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor({ maxBytes = 64 * 1024 * 1024, maxEntries = 4, ttlMs = 5 * 60_000, now = Date.now }: {
    maxBytes?: number; maxEntries?: number; ttlMs?: number; now?: () => number;
  } = {}) {
    if (![maxBytes,maxEntries,ttlMs].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('Invalid source cache limits.');
    this.maxBytes = maxBytes; this.maxEntries = maxEntries; this.ttlMs = ttlMs; this.now = now;
  }

  private remove(key: string, entry: Entry) {
    if (this.entries.get(key) !== entry) return;
    this.entries.delete(key); this.storedBytes -= entry.bytes;
    if (entry.timer) clearTimeout(entry.timer);
  }
  private prune() {
    for (const [key,entry] of this.entries) if (!entry.pending && entry.expiresAt <= this.now()) this.remove(key,entry);
  }
  private evictReady() {
    for (const [key,entry] of this.entries) if (!entry.pending) { this.remove(key,entry); return true; }
    return false;
  }
  stats() {
    this.prune();
    return { entries:this.entries.size, bytes:this.storedBytes, pending:[...this.entries.values()].filter(entry => entry.pending).length };
  }

  get(identity: SourceCacheIdentity, load: () => Promise<Uint8Array>): Promise<string> {
    this.prune();
    const key = JSON.stringify([identity.ownerId,identity.sourceId,identity.fileHash,identity.extractionVersion,identity.sourceSha256]);
    const existing = this.entries.get(key);
    if (existing) {
      if (existing.invalidated) return Promise.reject(new RequestBodyError('The source changed. Please retry shortly.',503));
      this.entries.delete(key); this.entries.set(key,existing);
      return existing.promise;
    }
    while (this.entries.size >= this.maxEntries) {
      if (!this.evictReady()) return Promise.reject(new RequestBodyError('Reading synchronization is busy. Your local changes are safe; please retry.',503));
    }
    // Set the pending entry synchronously before invoking load, so same-source
    // requests coalesce and distinct in-flight loads count against the entry cap.
    const entry: Entry = { ownerId:identity.ownerId,pending:true,invalidated:false,bytes:0,expiresAt:0,promise:Promise.resolve('') };
    this.entries.set(key,entry);
    entry.promise = Promise.resolve().then(load).then(bytes => {
      if (bytes.byteLength > this.maxBytes) throw new RequestBodyError('Source exceeds the synchronization text limit.',413);
      if (createHash('sha256').update(bytes).digest('hex') !== identity.sourceSha256) throw new RequestBodyError('Source integrity check failed.',409);
      let text: string;
      try { text = new TextDecoder('utf-8',{fatal:true}).decode(bytes); }
      catch { throw new RequestBodyError('Source text is not valid UTF-8.',409); }
      if (entry.invalidated) {
        this.remove(key,entry);
        throw new RequestBodyError('The account changed while its source was loading. Please reopen your library.',409);
      }
      while (this.storedBytes + bytes.byteLength > this.maxBytes) {
        if (!this.evictReady()) throw new RequestBodyError('Reading synchronization is busy. Please retry.',503);
      }
      entry.pending = false; entry.bytes = bytes.byteLength; entry.expiresAt = this.now() + this.ttlMs;
      this.storedBytes += entry.bytes;
      // Expiry also removes idle data, even if no further cache request arrives.
      entry.timer = setTimeout(() => this.remove(key,entry),this.ttlMs);
      entry.timer.unref?.();
      return text;
    }).catch(error => { this.remove(key,entry); throw error; });
    return entry.promise;
  }

  clearOwner(ownerId: string) {
    for (const [key,entry] of this.entries) if (entry.ownerId === ownerId) {
      if (entry.pending) entry.invalidated = true;
      else this.remove(key,entry);
    }
  }
}

export const sourceTextCache = new SourceTextCache();
