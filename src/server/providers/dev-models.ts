import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const TextChoice = z.enum(['default', 'vertex_ai', 'inco']);
export const DevModelsSchema = z.object({
  interactive_ui: TextChoice,
  concept_diagram: TextChoice,
  interactive_panel: TextChoice,
  generated_image: z.enum(['default', 'bfl', 'fal']),
}).strict();
export type DevModels = z.infer<typeof DevModelsSchema>;
export const DEFAULT_DEV_MODELS: DevModels = { interactive_ui: 'default', concept_diagram: 'default', interactive_panel: 'default', generated_image: 'default' };
export const DEV_DIRECTORY = path.join(process.cwd(), '.local-dev');
const settingsPath = path.join(DEV_DIRECTORY, 'models.json');
const scope = new AsyncLocalStorage<DevModels>();

export function readDevModels(): DevModels {
  if (process.env.NODE_ENV !== 'development') return { ...DEFAULT_DEV_MODELS };
  try { return DevModelsSchema.parse(JSON.parse(readFileSync(settingsPath, 'utf8'))); }
  catch { return { ...DEFAULT_DEV_MODELS }; }
}

export function saveDevModels(value: unknown): DevModels {
  if (process.env.NODE_ENV !== 'development') throw new Error('Development only');
  const settings = DevModelsSchema.parse(value);
  mkdirSync(DEV_DIRECTORY, { recursive: true });
  const temporary = `${settingsPath}.${crypto.randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 });
  renameSync(temporary, settingsPath);
  return settings;
}

/** Freeze choices for the whole dispatch, even if the panel changes mid-request. */
export function withDevModels<T>(run: () => T): T {
  return scope.run(readDevModels(), run);
}

export function devModelChoice(kind: string): string | undefined {
  if (process.env.NODE_ENV !== 'development') return undefined;
  const settings = scope.getStore() ?? readDevModels();
  const choice = settings[kind as keyof DevModels];
  return choice === 'default' ? undefined : choice;
}

export function isLocalDevelopment(request: Request): boolean {
  if (process.env.NODE_ENV !== 'development') return false;
  const url = new URL(request.url);
  const host = request.headers.get('host') || url.host;
  let hostname: string;
  try { hostname = new URL(`http://${host}`).hostname; } catch { return false; }
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    && ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
    && (!request.headers.get('origin') || request.headers.get('origin') === `${url.protocol}//${host}`)
    && !['cross-site', 'same-site'].includes(request.headers.get('sec-fetch-site') ?? '');
}
