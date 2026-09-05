import { randomInt } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { ArtifactSchema, type Artifact, type Selection } from '../../shared/schemas';
import type { Provider, ProviderResult } from './index';
import { illustrationPrompt, ILLUSTRATION_PROMPT_VERSION } from './illustration-prompt';

export const BFL_IMAGE_MODEL = 'flux-2-klein-9b';
export const BFL_IMAGE_SETTINGS = { width: 1024, height: 768, output_format: 'jpeg', safety_tolerance: 2 } as const;
const Submission = z.object({ id: z.string().min(1), polling_url: z.string().url() });
const Poll = z.object({ status: z.enum(['Pending', 'Ready', 'Error', 'Failed', 'Request Moderated', 'Content Moderated', 'Task not found']), result: z.object({ sample: z.string().url() }).nullish() });

async function boundedBytes(response: Response, limit: number): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) throw new SyntaxError('Empty response');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new SyntaxError('Response too large'); }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { reader.releaseLock(); }
}

// Only BFL endpoints can receive the key. Delivery requests never carry it.
function trustedUrl(value: string, delivery = false): string {
  const url = new URL(value);
  const host = delivery ? /^delivery\.[a-z0-9-]+\.bfl\.ai$/ : /^(?:api|api\.[a-z0-9-]+|api-[a-z0-9-]+)\.bfl\.ai$/;
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !host.test(url.hostname)
    || (!delivery && url.pathname !== '/v1/get_result')) throw new SyntaxError('Untrusted result URL');
  return url.href;
}

export function createBflImageProvider(options: { fetch?: typeof fetch; key?: () => string | undefined; timeoutMs?: number; pollIntervalMs?: number } = {}): Provider<Selection, Artifact> {
  return {
    async run(selection, context): Promise<ProviderResult<Artifact>> {
      const startedAt = new Date().toISOString(), started = performance.now();
      const provenance = { provider: 'bfl' as const, label: 'AI illustration · FLUX.2 [klein] 9B via BFL · Interpretive, not source evidence' };
      const metadata = () => ({ provenance, timing: { startedAt, durationMs: Math.round(performance.now() - started) } });
      const fail = (code: 'not_configured' | 'invalid_input' | 'invalid_output' | 'provider_failed' | 'cancelled', message: string, retryable: boolean): ProviderResult<Artifact> => ({ ...metadata(), ok: false, error: { code, message, retryable } });
      if (context.signal?.aborted) return fail('cancelled', 'Illustration cancelled.', true);
      const key = (options.key ?? (() => process.env.BFL_API_KEY))()?.trim();
      if (!key) return fail('not_configured', 'Illustration is not configured. Add BFL_API_KEY to the server environment.', false);
      if (selection.selectedText.length > 12_000) return fail('invalid_input', 'Select a shorter passage for an illustration (up to 12,000 characters).', false);
      const timeout = AbortSignal.timeout(options.timeoutMs ?? 90_000);
      const signal = context.signal ? AbortSignal.any([context.signal, timeout]) : timeout;
      const fetcher = options.fetch ?? fetch;
      const request = { signal, redirect: 'error' as const, cache: 'no-store' as const };
      const headers = { 'x-key': key, accept: 'application/json', 'Content-Type': 'application/json' };
      const httpFailure = async (response: Response): Promise<ProviderResult<Artifact>> => {
        await response.body?.cancel();
        const message = response.status === 401 || response.status === 403 ? 'BFL authentication or permission was denied. Check the server API key.'
          : response.status === 402 ? 'BFL needs account credits before it can generate an illustration.'
          : response.status === 429 ? 'BFL is busy or the account rate limit was reached. Please try again shortly.'
          : `Illustration generation failed (${response.status}).`;
        return fail('provider_failed', message, response.status === 429 || response.status >= 500);
      };
      try {
        const prompt = illustrationPrompt(selection), seed = randomInt(0, 2 ** 31);
        // Never automatically repeat the charged POST, including after timeouts.
        const response = await fetcher(`https://api.bfl.ai/v1/${BFL_IMAGE_MODEL}`, {
          ...request, method: 'POST', headers, body: JSON.stringify({ ...BFL_IMAGE_SETTINGS, prompt, seed }),
        });
        if (!response.ok) return await httpFailure(response);
        const task = Submission.parse(JSON.parse((await boundedBytes(response, 64_000)).toString('utf8')));
        const pollingUrl = trustedUrl(task.polling_url);
        while (true) {
          await delay(options.pollIntervalMs ?? 500, undefined, { signal });
          const response = await fetcher(pollingUrl, { ...request, headers });
          if (!response.ok) return await httpFailure(response);
          const result = Poll.parse(JSON.parse((await boundedBytes(response, 64_000)).toString('utf8')));
          if (result.status === 'Pending') continue;
          if (result.status !== 'Ready') return fail('provider_failed', 'BFL could not return an illustration for this passage. Try a different selection.', false);
          if (!result.result) throw new SyntaxError('Missing image result');
          const image = await fetcher(trustedUrl(result.result.sample, true), request);
          if (!image.ok) return await httpFailure(image);
          const bytes = await boundedBytes(image, 4_000_000);
          if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new SyntaxError('Invalid JPEG');
          signal.throwIfAborted();
          const artifact = ArtifactSchema.parse({
            id: crypto.randomUUID(), bookId: selection.bookId, selectionId: selection.id, routeRunId: context.routeRunId,
            nodeIds: [], anchorIds: selection.anchorIds, provider: 'bfl', schemaVersion: '1', createdAt: new Date().toISOString(), savedAt: null, provenance,
            kind: 'generated_image', payload: { status: 'ready', resource: { dataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}`, width: BFL_IMAGE_SETTINGS.width, height: BFL_IMAGE_SETTINGS.height },
              prompt, caption: `Illustration inspired by: “${selection.selectedText.replace(/\s+/g, ' ').slice(0, 240)}${selection.selectedText.length > 240 ? '…' : ''}”`,
              generation: { model: BFL_IMAGE_MODEL, seed, promptVersion: ILLUSTRATION_PROMPT_VERSION },
            },
          });
          return { ...metadata(), ok: true, payload: artifact };
        }
      } catch (error) {
        if (context.signal?.aborted) return fail('cancelled', 'Illustration cancelled; late output was discarded.', true);
        if (timeout.aborted) return fail('provider_failed', 'Illustration timed out. BFL may still finish and charge for that attempt; retry only if needed.', true);
        if (error instanceof z.ZodError || error instanceof SyntaxError) return fail('invalid_output', 'BFL returned an image or response outside the supported format or size.', true);
        return fail('provider_failed', 'Could not reach BFL. Please try again.', true);
      }
    },
  };
}
