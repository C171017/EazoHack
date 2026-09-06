import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, open, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { readJson, writeJson } from './json-store';
import { GraphSchema } from '../../shared/schemas';
import { validateGraphSource } from './graph';
import { validateHierarchy } from '../../shared/zoom-hierarchy';
import { createMapStore } from '../book-map/store';

export const LocalSourceSchema = z.object({ bookId: z.string().min(1).max(160), sourceText: z.string().min(1).max(20 * 1024 * 1024), fileHash: z.string().regex(/^[a-f0-9]{64}$/), extractionVersion: z.string().min(1).max(160) });
export type LocalSource = z.infer<typeof LocalSourceSchema>;
export type LocalJob = { status: 'idle' | 'running' | 'ready' | 'failed'; stage: string; error?: string; updatedAt: number; pid?: number };
export function localJobKey(source: LocalSource) { return createHash('sha256').update(JSON.stringify(source)).digest('hex'); }
export function localJobRoot(key: string) {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid analysis identity.');
  return path.join(process.cwd(), '.local-dev/book-analysis', key);
}
export async function localJobStatus(key: string): Promise<LocalJob> {
  const job = await readJson(path.join(localJobRoot(key), 'status.json')) as LocalJob | null;
  if (!job) return { status: 'idle', stage: 'Map analysis has not started', updatedAt: Date.now() };
  if (job.status === 'running' && job.pid) {
    try { process.kill(job.pid, 0); } catch { return { ...job, status: 'failed', stage: 'Map analysis was interrupted', error: 'Retry to resume saved analysis steps.' }; }
  }
  return job;
}
export async function startLocalJob(source: LocalSource) {
  const key = localJobKey(source), root = localJobRoot(key);
  await mkdir(root, { recursive: true });
  const lockPath = path.join(root, 'start.lock');
  const lock = await open(lockPath, 'wx').catch(() => null);
  if (!lock) {
    const previous = await localJobStatus(key);
    if (previous.status === 'running' || previous.status === 'ready') return { key, ...previous };
    throw new Error('Book analysis is already being started. Please retry in a moment.');
  }
  try {
    const previous = await localJobStatus(key);
    if (previous.status === 'running' || previous.status === 'ready') return { key, ...previous };
    await writeJson(path.join(root, 'source.json'), source);
    const child = spawn(process.execPath, ['--import', 'tsx', path.join(process.cwd(), 'scripts/analyze-upload.ts'), key], { cwd: process.cwd(), env: process.env, detached: true, stdio: 'ignore' });
    await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    const status: LocalJob = { status: 'running', stage: 'Starting book analysis', updatedAt: Date.now(), pid: child.pid };
    // Worker waits for this initial status before reporting progress.
    await writeJson(path.join(root, 'status.json'), status);
    child.unref();
    return { key, ...status };
  } finally { await lock.close(); await unlink(lockPath); }
}
async function readLocalMap(key: string) {
  const root = localJobRoot(key);
  const source = LocalSourceSchema.parse(await readJson(path.join(root, 'source.json')));
  if (localJobKey(source) !== key) throw new Error('Stored source identity does not match this job.');
  const pointer = z.object({ version: z.string().regex(/^[a-z0-9-]+$/) }).parse(await readJson(path.join(root, 'current-map.json')));
  const directory = path.join(root, pointer.version);
  const graph = validateGraphSource(GraphSchema.parse(await readJson(path.join(directory, 'graph.json'))), source.sourceText, source.fileHash, source.extractionVersion);
  if (graph.bookId !== source.bookId) throw new Error('Map belongs to another book.');
  const hierarchy = validateHierarchy(await readJson(path.join(directory, 'hierarchy.json')), graph);
  hierarchy.version = `local:${key}:${hierarchy.version}`;
  return createMapStore(graph, hierarchy);
}

const mapCache = new Map<string, {stamp: string; promise: ReturnType<typeof readLocalMap>}>();
export async function loadLocalMap(key: string) {
  const root=localJobRoot(key);
  const [source,pointer]=await Promise.all([stat(path.join(root,'source.json')),stat(path.join(root,'current-map.json'))]);
  const stamp=`${source.mtimeMs}:${source.size}:${pointer.mtimeMs}:${pointer.size}`;
  const cached=mapCache.get(key);
  if(cached?.stamp===stamp)return cached.promise;
  const promise=readLocalMap(key);
  mapCache.set(key,{stamp,promise});
  while(mapCache.size>2)mapCache.delete(mapCache.keys().next().value!);
  promise.catch(()=>{if(mapCache.get(key)?.promise===promise)mapCache.delete(key);});
  return promise;
}
