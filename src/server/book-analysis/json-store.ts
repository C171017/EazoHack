import { mkdir, readFile, rename, writeFile, readdir } from 'node:fs/promises';
import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { measurePipeline, countPipeline } from './telemetry';
export interface JsonStore {
  read(file: string): Promise<unknown | null>;
  write(file: string, value: unknown): Promise<void>;
  list(directory: string): Promise<string[]>;
}
const stores = new AsyncLocalStorage<JsonStore>();
export function withJsonStore<T>(store: JsonStore, task: () => Promise<T>): Promise<T> {
  return stores.run(store, task);
}
export function listJson(directory: string): Promise<string[]> {
  return measurePipeline('storage.list', () => listJsonImpl(directory));
}
async function listJsonImpl(directory: string): Promise<string[]> {
  const store = stores.getStore();
  if (store) return store.list(directory);
  try { return await readdir(directory); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
}
export function writeJson(file: string, value: unknown) {
  return measurePipeline('storage.write', () => writeJsonImpl(file, value));
}
async function writeJsonImpl(file: string, value: unknown) {
  const store = stores.getStore();
  if (store) return store.write(file, value);
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n');
  await rename(temp, file);
}
export function readJson(file: string): Promise<unknown | null> {
  return measurePipeline('storage.read', async () => {
    const value = await readJsonImpl(file);
    countPipeline(value === null ? 'storage.miss' : 'storage.hit');
    return value;
  });
}
async function readJsonImpl(file: string): Promise<unknown | null> {
  const store = stores.getStore();
  if (store) return store.read(file);
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
