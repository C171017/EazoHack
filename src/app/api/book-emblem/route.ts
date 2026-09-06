import { guardGeneration } from "@/server/cloud/backend";
import { EmblemRequestSchema, generateBookEmblem } from '../../../server/book-analysis/emblem';
import { generateStructured } from '../../../server/book-analysis/vertex';
import { readJson, requestError } from '../../../server/http';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  let input;
  try {
    await guardGeneration(request); input = EmblemRequestSchema.parse(await readJson(request)); }
  catch (error) { return requestError(error); }
  try {
    const emblem = await generateBookEmblem(input, (system, prompt, schema, tokens) =>
      generateStructured(system, prompt, schema, tokens, { signal: request.signal, timeoutMs: 45000 }));
    return Response.json({ emblem });
  } catch {
    return Response.json({ error: { code: 'emblem_unavailable', message: 'The custom book illustration is unavailable. Your book is ready with a classic emblem.' } }, { status: 503 });
  }
}
