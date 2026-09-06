import { z } from 'zod';
import { vertexAccessToken } from '../providers/vertex-gemini';
import type { Generate } from './contracts';
import { measurePipeline, measureValidation, recordProviderUsage } from './telemetry';

export const analysisModel = () => process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash';
export class ModelRequestError extends Error {
  constructor(message: string, public retryable: boolean) { super(message); }
}

// Vertex's documented responseSchema subset; local Zod remains the full validator.
export function vertexSchema(schema: z.ZodType): unknown {
  const convert = (input: unknown, depth = 0): unknown => {
    if (Array.isArray(input)) return input.map(item => convert(item, depth + 1));
    if (input === null || typeof input !== 'object') return input;
    const value = input as Record<string, unknown>;
    if (Array.isArray(value.anyOf)) {
      const members = value.anyOf as { type?: string }[];
      const actual = members.filter(m => m.type !== 'null');
      if (actual.length === 1 && actual.length !== members.length) return { ...(convert(actual[0], depth + 1) as object), nullable: true };
    }
    return Object.fromEntries(Object.entries(value)
      // Large bounded arrays can exceed Vertex's schema grammar complexity budget.
      // Nested bounds also multiply grammar states (axis ratings contain several
      // evidence arrays). Keep all limits in local Zod validation.
      .filter(([key, entry]) => !['$schema', 'additionalProperties', 'minLength', 'maxLength'].includes(key) && !(key === 'maxItems' && typeof entry === 'number' && (entry > 12 || depth > 4)))
      .map(([key, entry]) => [key, key === 'type' && typeof entry === 'string' ? entry.toUpperCase() : convert(entry, depth + 1)]));
  };
  return convert(z.toJSONSchema(schema));
}

export const generateStructured: Generate = async (system, prompt, schema, maxOutputTokens = 12_288, options = {}) => {
  const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID || '';
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'global';
  const model = analysisModel();
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project) || !/^[a-z0-9-]+$/.test(location) || !/^[a-z0-9.-]+$/.test(model)) throw new ModelRequestError('Invalid or missing Vertex project, location, or model configuration.', false);
  const started = Date.now();
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 180_000);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  const token = await measurePipeline('auth', vertexAccessToken);
  const body = await measurePipeline('provider', async () => {
    const response = await fetch(`https://aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`, {
      method: 'POST', signal,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: vertexSchema(schema), maxOutputTokens, thinkingConfig: { thinkingLevel: 'LOW' } },
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: { message?: string }; usageMetadata?: unknown };
      recordProviderUsage(error.usageMetadata);
      throw new ModelRequestError(`Vertex request failed (${response.status}): ${error.error?.message?.slice(0, 1600) ?? 'No error detail.'}`, response.status === 429 || response.status >= 500);
    }
    const body = await response.json() as {
      modelVersion?: string; responseId?: string; usageMetadata?: Record<string, number>;
      candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    };
    recordProviderUsage(body.usageMetadata);
    return body;
  });
  return measureValidation(() => {
    const candidate = body.candidates?.[0];
    if (candidate?.finishReason !== 'STOP') throw new ModelRequestError(`Vertex did not finish a complete answer (${candidate?.finishReason ?? 'no candidate'}).`, candidate?.finishReason === 'MAX_TOKENS');
    const raw = candidate.content?.parts?.filter(p => !p.thought).map(p => p.text ?? '').join('');
    if (!raw) throw new ModelRequestError('Vertex returned no structured content.', true);
    return { value: JSON.parse(raw), model, modelVersion: body.modelVersion ?? model, responseId: body.responseId, usage: body.usageMetadata ?? {}, durationMs: Date.now() - started };
  });
};
