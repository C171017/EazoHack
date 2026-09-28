import { z } from 'zod';
import type { Generate } from './contracts';
import { ModelRequestError } from './vertex';
import { measurePipeline, measureValidation, recordProviderUsage } from './telemetry';

const BASE_URL = 'https://api.primalabs.ai/v1';
const DEFAULT_MODEL = 'primalabs-ai/MiMo-V2.6-Pro-RL';

export const analysisModel = () => process.env.PRIMALABS_MODEL?.trim() || DEFAULT_MODEL;

export const generateStructured: Generate = async (system, prompt, schema, maxOutputTokens = 12_288, options = {}) => {
  const key = process.env.PRIMALABS_API_KEY?.trim();
  const model = analysisModel();
  if (!key) throw new ModelRequestError('PRIMALABS_API_KEY is missing.', false);
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(model)) throw new ModelRequestError('Invalid PrimaLabs model ID.', false);

  const started = Date.now();
  let response: Response;
  try {
    const timeout = AbortSignal.timeout(options.timeoutMs ?? (maxOutputTokens > 32_768 ? 600_000 : 180_000));
    const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
    response = await measurePipeline('provider', () => fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST', signal,
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        response_format: { type: 'json_schema', json_schema: { name: 'book_analysis', strict: true, schema: z.toJSONSchema(schema) } },
        max_tokens: maxOutputTokens,
      }),
    }));
  } catch (error) {
    throw new ModelRequestError(`PrimaLabs request failed (${error instanceof Error ? error.name : 'network error'}).`, true);
  }
  if (!response.ok) throw new ModelRequestError(`PrimaLabs request failed (${response.status}).`, response.status === 429 || response.status >= 500);

  const body = await response.json() as {
    id?: string; model?: string; usage?: Record<string, unknown>;
    choices?: { finish_reason?: string; message?: { content?: string | null } }[];
  };
  const rawUsage = body.usage ?? {};
  recordProviderUsage({promptTokenCount: rawUsage.prompt_tokens, candidatesTokenCount: rawUsage.completion_tokens,
    cachedContentTokenCount: (rawUsage.prompt_tokens_details as {cached_tokens?:number}|undefined)?.cached_tokens,
    totalTokenCount: rawUsage.total_tokens});
  return measureValidation(() => {
    const choice = body.choices?.[0];
    if (choice?.finish_reason !== 'stop') throw new ModelRequestError(`PrimaLabs did not finish a complete answer (${choice?.finish_reason ?? 'no choice'}).`, choice?.finish_reason === 'length');
    if (!choice.message?.content) throw new ModelRequestError('PrimaLabs returned no JSON content.', true);
    let value: unknown;
    try { value = JSON.parse(choice.message.content); }
    catch { throw new ModelRequestError('PrimaLabs returned invalid JSON content.', true); }
    const usage = Object.fromEntries(Object.entries(rawUsage).filter((entry): entry is [string, number] => typeof entry[1] === 'number'));
    return { value, model, modelVersion: body.model ?? model, responseId: body.id, usage, durationMs: Date.now() - started };
  });
};
