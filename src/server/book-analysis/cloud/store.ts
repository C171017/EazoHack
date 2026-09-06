import { createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import type { JsonStore } from '../json-store';

export const JobSchema = z.object({
  id: z.uuid(), book_id: z.string().min(1).max(200), owner_id: z.uuid(), cloud_book_id: z.uuid(),
  file_hash: z.string().min(1), extraction_version: z.string().min(1),
  source_path: z.string().min(1), source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  model: z.string().regex(/^[a-z0-9.-]+$/), pipeline_version: z.string().min(1),
});
export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
export function relativeKey(root: string, file: string) {
  const key = path.relative(root, file).split(path.sep).join('/');
  if (!key || key.startsWith('../') || key === '..' || path.isAbsolute(key)) throw new Error('Invalid checkpoint path');
  return key;
}
export class WorkerBackend {
  namespace: string;
  constructor(readonly url: string, private key: string, readonly jobId: string, readonly token: string,
    private transport: typeof fetch = fetch) {
    this.namespace = jobId;
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw new Error('SUPABASE_URL must be an HTTPS origin');
    if (!z.uuid().safeParse(jobId).success) throw new Error('Invalid job ID');
  }
  private async request(route: string, init: RequestInit = {}) {
    const response = await this.transport(`${this.url.replace(/\/$/, '')}${route}`, {
      ...init, signal: AbortSignal.timeout(30_000),
      headers: { apikey: this.key, ...(this.key.startsWith("sb_") ? {} : {authorization: `Bearer ${this.key}`}), ...init.headers },
    });
    // Never put response bodies (source text, keys, provider errors) in cloud logs.
    if (!response.ok) throw new Error(`Worker backend failed (${response.status})`);
    return response;
  }
  async rpc(action: string, payload: Record<string, unknown> = {}): Promise<unknown> {
    const result = await (await this.request('/rest/v1/rpc/eazo_worker', { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ p_action: action, p_job: this.jobId, p_token: this.token, p_payload: payload }),
    })).json();
    if (action === 'claim' && result && !result.busy) {
      const job = JobSchema.parse(result); this.namespace = `${job.owner_id}/${job.cloud_book_id}/${job.id}`;
    }
    return result;
  }
  async download(bucket: string, key: string): Promise<Buffer> {
    if (key.split('/').some(part => !part || part === '..' || part === '.')) throw new Error('Invalid object path');
    const response = await this.request(`/storage/v1/object/authenticated/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`);
    const reader = response.body?.getReader(); if (!reader) throw new Error('Missing object');
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const {value,done} = await reader.read(); if (done) break; size += value.length;
      if (size > 50 * 1024 * 1024) { await reader.cancel(); throw new Error('Object exceeds worker input limit'); } chunks.push(value);
    } } finally { reader.releaseLock(); }
    return Buffer.concat(chunks);
  }
  async upload(key: string, bytes: string, immutable = false) {
    if (Buffer.byteLength(bytes) > 50 * 1024 * 1024) throw new Error("Output exceeds storage limit");
    await this.request(`/storage/v1/object/eazo-analysis/${key}`, { method: 'POST',
      // The address includes the payload hash, so re-uploading identical bytes is safe.
      headers: { 'content-type': 'application/json', 'x-upsert': immutable ? 'false' : 'true' }, body: bytes,
    });
  }
}
export function durableStore(backend: WorkerBackend, root: string, assertLease: () => void): JsonStore {
  return {
    async read(file) {
      assertLease();
      const ref = await backend.rpc('read', { key: relativeKey(root, file) });
      if (ref === null) return null;
      const { object, hash } = z.object({ object: z.string(), hash: z.string() }).parse(ref);
      const bytes = await backend.download('eazo-analysis', object);
      if (sha256(bytes) !== hash) throw new Error('Checkpoint checksum mismatch');
      return JSON.parse(bytes.toString('utf8'));
    },
    async write(file, value) {
      assertLease();
      const bytes = JSON.stringify(value), hash = sha256(bytes);
      const object = `${backend.namespace}/checkpoints/${hash}.json`;
      await backend.upload(object, bytes);
      assertLease();
      await backend.rpc('write', { key: relativeKey(root, file), object, hash });
    },
    async list(directory) {
      assertLease();
      return z.array(z.string()).parse(await backend.rpc('list', { prefix: `${relativeKey(root, directory)}/` }));
    },
  };
}
