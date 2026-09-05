import { z } from 'zod';
import { ArtifactSchema, type Artifact, type Selection } from '../../shared/schemas';
import type { Provider, ProviderResult } from './index';
import { illustrationPrompt, ILLUSTRATION_PROMPT_VERSION } from './illustration-prompt';

export const FAL_IMAGE_MODEL = 'fal-ai/z-image/turbo';
export const FAL_IMAGE_SETTINGS = {
  image_size: { width: 1024, height: 768 }, num_images: 1, num_inference_steps: 8,
  output_format: 'jpeg', acceleration: 'regular', enable_safety_checker: true,
  enable_prompt_expansion: false, sync_mode: true,
} as const;
const MAX_RESPONSE_BYTES = 4_000_000;
const ImageResponse = z.object({
  images: z.array(z.object({
    url: z.string().max(MAX_RESPONSE_BYTES).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/),
    width: z.literal(1024), height: z.literal(768),
  })).length(1),
  seed: z.number().int().nonnegative(),
  has_nsfw_concepts: z.array(z.boolean()).length(1),
});

async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new SyntaxError('Empty response');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new SyntaxError('Image response exceeds size limit');
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally { reader.releaseLock(); }
}

export function createFalImageProvider(options: { fetch?: typeof fetch; key?: () => string | undefined; timeoutMs?: number } = {}): Provider<Selection, Artifact> {
  return {
    async run(selection, context): Promise<ProviderResult<Artifact>> {
      const startedAt = new Date().toISOString(), started = performance.now();
      const provenance = { provider: 'fal' as const, label: 'AI illustration · Z-Image Turbo via fal · Interpretive, not source evidence' };
      const metadata = () => ({ provenance, timing: { startedAt, durationMs: Math.round(performance.now() - started) } });
      const fail = (code: 'not_configured' | 'invalid_input' | 'invalid_output' | 'provider_failed' | 'cancelled', message: string, retryable: boolean): ProviderResult<Artifact> => ({ ...metadata(), ok: false, error: { code, message, retryable } });
      if (context.signal?.aborted) return fail('cancelled', 'Illustration cancelled.', true);
      const key = (options.key ?? (() => process.env.FAL_KEY))()?.trim();
      if (!key) return fail('not_configured', 'Illustration is not configured. Add FAL_KEY to the server environment.', false);
      if (selection.selectedText.length > 12_000) return fail('invalid_input', 'Select a shorter passage for an illustration (up to 12,000 characters).', false);
      const timeout = AbortSignal.timeout(options.timeoutMs ?? 90_000);
      const signal = context.signal ? AbortSignal.any([context.signal, timeout]) : timeout;
      try {
        const prompt = illustrationPrompt(selection);
        // Fixed endpoint and settings: the browser cannot select models, supply keys,
        // change billing parameters, or turn this handler into an arbitrary proxy.
        const response = await (options.fetch ?? fetch)(`https://fal.run/${FAL_IMAGE_MODEL}`, {
          method: 'POST', signal, redirect: 'error', cache: 'no-store',
          headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...FAL_IMAGE_SETTINGS, prompt }),
        });
        if (!response.ok) {
          await response.body?.cancel();
          const message = response.status === 401 || response.status === 403 ? 'fal authentication or permission was denied. Check the server API key and account balance.'
            : response.status === 402 ? 'fal needs account credits before it can generate an illustration.'
            : response.status === 429 ? 'fal is busy or the account rate limit was reached. Please try again shortly.'
            : `Illustration generation failed (${response.status}).`;
          return fail('provider_failed', message, response.status === 429 || response.status >= 500);
        }
        const result = ImageResponse.parse(await boundedJson(response));
        if (result.has_nsfw_concepts[0]) return fail('provider_failed', 'The image provider could not return an illustration for this passage. Try a different selection.', false);
        const image = result.images[0];
        const bytes = Buffer.from(image.url.split(',')[1], 'base64');
        if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return fail('invalid_output', 'fal returned an invalid image.', true);
        if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        const artifact = ArtifactSchema.parse({
          id: crypto.randomUUID(), bookId: selection.bookId, selectionId: selection.id, routeRunId: context.routeRunId,
          nodeIds: [], anchorIds: selection.anchorIds, provider: 'fal', schemaVersion: '1', createdAt: new Date().toISOString(), savedAt: null, provenance,
          kind: 'generated_image', payload: { status: 'ready', resource: { dataUrl: image.url, width: image.width, height: image.height },
            prompt, caption: `Illustration inspired by: “${selection.selectedText.replace(/\s+/g, ' ').slice(0, 240)}${selection.selectedText.length > 240 ? '…' : ''}”`,
            generation: { model: FAL_IMAGE_MODEL, seed: result.seed, promptVersion: ILLUSTRATION_PROMPT_VERSION },
          },
        });
        return { ...metadata(), ok: true, payload: artifact };
      } catch (error) {
        if (context.signal?.aborted) return fail('cancelled', 'Illustration cancelled; late output was discarded.', true);
        if (timeout.aborted) return fail('provider_failed', 'Illustration timed out. The provider may still finish and charge for that attempt; retry only if needed.', true);
        if (error instanceof z.ZodError || error instanceof SyntaxError) return fail('invalid_output', 'fal returned an image outside the supported format or size.', true);
        return fail('provider_failed', 'Could not reach the image provider. Please try again.', true);
      }
    },
  };
}
