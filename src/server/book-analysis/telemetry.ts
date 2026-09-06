import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

type Stage = 'analysis' | 'extraction' | 'synthesis' | 'review' | 'emblem' | 'axes' | 'calibration' | 'hierarchy';
type Operation = 'auth' | 'provider' | 'validation' | 'storage.read' | 'storage.write' | 'storage.list' | `stage.${Stage}`;
type Counter = 'storage.hit' | 'storage.miss' | 'checkpoint.hit' | 'checkpoint.recovered' | 'provider.reply.hit' | 'provider.reply.miss' | 'retry' | 'pipeline.failed';
const usageKeys = ['promptTokenCount', 'candidatesTokenCount', 'thoughtsTokenCount', 'cachedContentTokenCount', 'totalTokenCount'] as const;
type Usage = Partial<Record<typeof usageKeys[number], number>>;
export type PipelineEvent = {
  schema: 'eazo-performance-v1'; run: string; stage?: Stage;
} & (
  | { event: 'timing'; operation: Operation; durationMs: number; outcome: 'ok' | 'error' }
  | { event: 'count'; counter: Counter }
  | { event: 'usage'; known: boolean; tokens: Usage }
  | { event: 'run'; durationMs: number; outcome: 'ok' | 'error'; counts: Partial<Record<Counter, number>>; tokens: Usage; usageResponses: number; missingUsageResponses: number }
);
type Run = { id: string; write: (event: PipelineEvent) => void; counts: Partial<Record<Counter, number>>; tokens: Usage; usageResponses: number; missingUsageResponses: number; closed: boolean };
type WithoutContext<T> = T extends unknown ? Omit<T, 'schema' | 'run' | 'stage'> : never;
const context = new AsyncLocalStorage<{ run: Run; stage?: Stage }>();
const duration = (started: number) => Math.round((performance.now() - started) * 1000) / 1000;

/** No prompts, paths, source IDs, provider response IDs, credentials or errors. */
function emit(event: WithoutContext<PipelineEvent>) {
  const active = context.getStore();
  if (!active || active.run.closed) return;
  try { active.run.write({ schema: 'eazo-performance-v1', run: active.run.id, stage: active.stage, ...event } as PipelineEvent); }
  catch { /* Instrumentation must never fail analysis or change retry behavior. */ }
}

export async function withPipelineTelemetry<T>(task: () => Promise<T>, options: {
  enabled?: boolean; write?: (event: PipelineEvent) => void;
} = {}): Promise<T> {
  if (context.getStore() || !(options.enabled ?? process.env.EAZO_PERFORMANCE_LOG === '1')) return task();
  const run: Run = { id: randomUUID(), write: options.write ?? (event => console.info(JSON.stringify(event))), counts: {}, tokens: {}, usageResponses: 0, missingUsageResponses: 0, closed: false };
  return context.run({ run }, async () => {
    const started = performance.now(); let outcome: 'ok' | 'error' = 'ok';
    try { return await task(); }
    catch (error) { outcome = 'error'; throw error; }
    finally {
      emit({ event: 'run', durationMs: duration(started), outcome: run.counts['pipeline.failed'] ? 'error' : outcome, counts: run.counts, tokens: run.tokens, usageResponses: run.usageResponses, missingUsageResponses: run.missingUsageResponses });
      run.closed = true;
    }
  });
}

export function pipelineStage<T>(stage: Stage, task: () => Promise<T>): Promise<T> {
  const active = context.getStore();
  if (!active) return task();
  return context.run({ ...active, stage }, () => measurePipeline(`stage.${stage}`, task));
}

export async function measurePipeline<T>(operation: Operation, task: () => Promise<T>): Promise<T> {
  if (!context.getStore()) return task();
  const started = performance.now(); let outcome: 'ok' | 'error' = 'ok';
  try { return await task(); }
  catch (error) { outcome = 'error'; throw error; }
  finally { emit({ event: 'timing', operation, durationMs: duration(started), outcome }); }
}

export function measureValidation<T>(task: () => T): T {
  if (!context.getStore()) return task();
  const started = performance.now(); let outcome: 'ok' | 'error' = 'ok';
  try { return task(); }
  catch (error) { outcome = 'error'; throw error; }
  finally { emit({ event: 'timing', operation: 'validation', durationMs: duration(started), outcome }); }
}

export function countPipeline(counter: Counter) {
  const active = context.getStore();
  if (!active || active.run.closed) return;
  active.run.counts[counter] = (active.run.counts[counter] ?? 0) + 1;
  emit({ event: 'count', counter });
}

/** Record actual response usage before finish/schema checks can reject it.
 * Restored checkpoints do not call this, so historical tokens are not rebilled.
 */
export function recordProviderUsage(value: unknown) {
  const active = context.getStore();
  if (!active || active.run.closed) return;
  const tokens: Usage = {};
  if (value && typeof value === 'object') for (const key of usageKeys) {
    const count = (value as Record<string, unknown>)[key];
    if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) tokens[key] = count;
  }
  const known = Object.keys(tokens).length > 0;
  if (known) active.run.usageResponses++; else active.run.missingUsageResponses++;
  for (const key of usageKeys) if (tokens[key] !== undefined) active.run.tokens[key] = (active.run.tokens[key] ?? 0) + tokens[key];
  emit({ event: 'usage', known, tokens });
}
