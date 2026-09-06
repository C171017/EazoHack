import { mkdir, readFile, rename, writeFile, readdir } from 'node:fs/promises';
import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
export interface JsonStore {
  read(file: string): Promise<unknown | null>;
  write(file: string, value: unknown): Promise<void>;
  list(directory: string): Promise<string[]>;
}
const stores = new AsyncLocalStorage<JsonStore>();
export function withJsonStore<T>(store: JsonStore, task: () => Promise<T>): Promise<T> {
  return stores.run(store, task);
}
export async function listJson(directory: string): Promise<string[]> {
  const store = stores.getStore();
  if (store) return store.list(directory);
  try { return await readdir(directory); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
}
export async function writeJson(file: string, value: unknown) {
  const store = stores.getStore();
  if (store) return store.write(file, value);
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n');
  await rename(temp, file);
}
export async function readJson(file: string): Promise<unknown | null> {
  const store = stores.getStore();
  if (store) return store.read(file);
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
