import { scalableSynthesis } from './scalable-synthesis';
import { calibrateBookAxes } from './axis-calibration';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { ExtractSchema, PROMPT_VERSION, ReviewSchema, type Candidate, type CandidateEdge, type Generate, type ModelReply, type Review } from './contracts';
import { assembleGraph } from './graph';
import { extractionPrompt, reviewPrompt, SYSTEM } from './prompts';
import { prepareText, validateExtraction } from './source';
import { ModelRequestError } from './vertex';
import { BookEmblemSchema } from '../../shared/book-emblem';
import { EMBLEM_SYSTEM, emblemPrompt } from './emblem';

import { readJson, writeJson, listJson } from './json-store';
import { assignBookAxes } from './axis-run';
export { readJson, writeJson } from './json-store';

export async function analyzeText(input: {
  raw: Buffer; bookId: string; outputRoot: string; model: string; generate: Generate;
  sourceIdentity?: { fileHash: string; extractionVersion: string };
  concurrency?: number; log?: (message: string) => void;
}) {
  const text = input.raw.toString('utf8').replace(/\r\n?/g, '\n');
  const fileHash = input.sourceIdentity?.fileHash ?? createHash('sha256').update(input.raw).digest('hex');
  const chunks = prepareText(text);

  const runId = `${PROMPT_VERSION}-${fileHash.slice(0, 12)}-${createHash('sha256').update(input.model).digest('hex').slice(0, 8)}`;
  const root = path.join(input.outputRoot, runId);
  const log = input.log ?? (() => {});
  const passages = new Map(chunks.flatMap(c => c.passages).map(p => [p.id, p]));
  const concurrency = Math.max(1, Math.min(4, input.concurrency ?? 3));
  const metadata = { runId, bookId: input.bookId, fileHash, model: input.model, promptVersion: PROMPT_VERSION, sourceLength: text.length, totalChunks: chunks.length, scope: 'Complete LF-normalized input, including introduction and apparatus; selective navigational outline.', chunks: chunks.map(c => ({ id: c.id, start: c.start, end: c.end, section: c.section, passageIds: c.passages.map(p => p.id) })) };
  const previous = await readJson(path.join(root, 'manifest.json')) as { chunks?: typeof metadata.chunks } | null;
  const changedChunks = new Set(metadata.chunks.filter(c => previous?.chunks && JSON.stringify(previous.chunks.find(p => p.id === c.id)) !== JSON.stringify(c)).map(c => c.id));
  await writeJson(path.join(root, 'manifest.json'), { ...metadata, status: 'running', phase: 'extracting' });
  const replies: { key: string; reply: ModelReply }[] = [];
  async function call<T>(key: string, prompt: string, schema: z.ZodType<T>, validate: (value: T) => T, tokens = 12_288, system = SYSTEM): Promise<T> {
    const file = path.join(root, `${key}.json`);
    const cached = await readJson(file) as ModelReply | null;
    const requestHash = createHash('sha256').update(JSON.stringify({ system, prompt, schema: z.toJSONSchema(schema), tokens, model: input.model })).digest('hex');
    const invalidated = changedChunks.has(key) || changedChunks.size > 0 && !key.startsWith('chunk-');
    if (cached && !invalidated && cached.requestHash === requestHash) {
      if (cached.model !== input.model) throw new Error('Checkpoint model mismatch.');
      const value = validate(schema.parse(cached.value));
      cached.requestHash = requestHash;
      await writeJson(file, cached);
      replies.push({ key, reply: cached }); log(`${key}: restored`); return value;
    }
    // A complete provider reply may survive an interrupted write or a stricter
    // prior validator. Revalidate matching attempts before spending another call.
    const attempts = await listJson(path.join(root, 'attempts'));
    for (const name of attempts.filter(n => n.startsWith(`${key}-`)).sort().reverse()) {
      const reply = await readJson(path.join(root, 'attempts', name)) as ModelReply;
      if (reply.requestHash !== requestHash || reply.model !== input.model || invalidated) continue;
      let value: T;
      try { value = validate(schema.parse(reply.value)); } catch { continue; }
      await writeJson(file, reply); replies.push({ key, reply }); log(`${key}: recovered validated response`); return value;
    }
    let failure = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const reply = await input.generate(system, prompt + (failure ? `\nThe previous attempt failed validation: ${failure.slice(0, 1600)}. Regenerate a complete corrected response.` : ''), schema, tokens);
        reply.requestHash = requestHash;
        // Retain provider response and usage even when our validation rejects it.
        await writeJson(path.join(root, 'attempts', `${key}-${Date.now()}-${attempt}.json`), reply);
        const value = validate(schema.parse(reply.value));
        await writeJson(file, reply); replies.push({ key, reply });
        log(`${key}: complete (${Math.round(reply.durationMs / 1000)}s)`); return value;
      } catch (error) {
        failure = error instanceof Error ? error.message : 'Unknown analysis error';
        await writeJson(path.join(root, 'errors', `${key}-${Date.now()}-${attempt}.json`), { attempt, error: failure });
        if (error instanceof ModelRequestError && !error.retryable) throw error;
        if (attempt === 3) throw new Error(`${key} failed after 3 attempts: ${failure}`);
        log(`${key}: retry ${attempt + 1} after validation/provider failure`);
        await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
      }
    }
    throw new Error('Analysis retry exhausted.');
  }
  async function batch<T, R>(items: T[], task: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const values: R[] = [];
    for (let start = 0; start < items.length; start += concurrency) {
      const results = await Promise.allSettled(items.slice(start, start + concurrency).map((item, index) => task(item, start + index)));
      const failures = results.filter(r => r.status === 'rejected');
      for (const result of results) if (result.status === 'fulfilled') values.push(result.value);
      if (failures.length) throw new Error(failures.map(f => String(f.reason)).join('\n'));
    }
    return values;
  }
  try {
    log(`Processing ${text.length.toLocaleString()} source characters across ${chunks.length} chunks; model ${input.model}.`);
    let completedChunks = 0;
    const extracted = await batch(chunks, async chunk => {
      const value = await call(chunk.id, extractionPrompt(chunk, text), ExtractSchema, v => validateExtraction(v, chunk));
      log(`Analyzing passages: ${++completedChunks} of ${chunks.length} sections complete`);
      return value;
    });
    const nodes: Candidate[] = extracted.flatMap((value, i) => value.nodes.map((n, j) => ({ ...n, id: `n-${i + 1}-${j + 1}`, chunkId: chunks[i].id })));
    if (!nodes.length) throw new Error('No meaningful occurrences extracted.');
    const edges: CandidateEdge[] = extracted.flatMap((value, i) => value.edges.map((e, j) => ({ id: `e-${i + 1}-${j + 1}`, source: `n-${i + 1}-${e.sourceIndex + 1}`, target: `n-${i + 1}-${e.targetIndex + 1}`, type: e.type, rationale: e.rationale, passageIds: [...new Set(e.passageIds)] })));
    await writeJson(path.join(root, 'manifest.json'), { ...metadata, status: 'running', phase: 'synthesizing', completedChunks: chunks.length });
    const synthesis = await scalableSynthesis(nodes, passages, call, log);
    await writeJson(path.join(root, 'synthesis-resolved.json'), synthesis);
    for (const [index, e] of synthesis.crossEdges.entries()) {
      if (edges.some(existing => existing.source === e.source && existing.target === e.target && existing.type === e.type)) continue;
      edges.push({ ...e, id: `cross-${index + 1}`, passageIds: [...new Set(nodes.filter(n => n.id === e.source || n.id === e.target).flatMap(n => n.passageIds))] });
    }
    await writeJson(path.join(root, 'candidates.json'), { nodes, edges });
    await writeJson(path.join(root, 'manifest.json'), { ...metadata, status: 'running', phase: 'reviewing', completedChunks: chunks.length });
    // Every node and edge is reviewed exactly once. Include target context for outgoing edges.
    const batches = Array.from({ length: Math.ceil(nodes.length / 32) }, (_, i) => nodes.slice(i * 32, (i + 1) * 32));
    const reviews: Review[] = await batch(batches, async (group, i) => {
      const ids = new Set(group.map(n => n.id));
      const localEdges = edges.filter(e => ids.has(e.source));
      const context = nodes.filter(n => !ids.has(n.id) && localEdges.some(e => e.target === n.id));
      const prompt = reviewPrompt(group, localEdges, passages, synthesis.themes) + `\nEDGE ENDPOINT CONTEXT (not target nodes for rejection):\n${JSON.stringify(context.map(n => ({ ...n, evidence: n.passageIds.map(id => passages.get(id)!.text) })))}`;
      return call(`review-${i + 1}`, prompt, ReviewSchema, value => {
        if (value.rejectedNodes.some(n => !ids.has(n.id)) || value.rejectedEdges.some(e => !localEdges.some(edge => edge.id === e.id))) throw new Error('Review referenced IDs outside its targets.');
        return value;
      });
    });
    const baseGraph = assembleGraph({ nodes, edges, synthesis, reviews, passages, text, fileHash, extractionVersion: input.sourceIdentity?.extractionVersion, bookId: input.bookId, graphVersion: runId, model: input.model, totalChunks: chunks.length });
    // Summaries cover every analyzed section; the emblem has a reusable checkpoint.
    baseGraph.bookEmblem = await call('book-emblem', emblemPrompt({ title: input.bookId, excerpt: JSON.stringify(synthesis.themes.map(({label,rationale}) => ({label,rationale}))) }), BookEmblemSchema, value => value, 2048, EMBLEM_SYSTEM);
    let graph = await assignBookAxes({graph:baseGraph,outputRoot:input.outputRoot,model:input.model,generate:input.generate,log});
    graph = await calibrateBookAxes({graph,outputRoot:input.outputRoot,model:input.model,generate:input.generate,log});
    await writeJson(path.join(root, 'graph.json'), graph);
    await writeJson(path.join(root, 'manifest.json'), { ...metadata, status: 'complete', phase: 'complete', completedChunks: chunks.length, graph: { nodes: graph.nodes.length, identities: graph.identities.length, edges: graph.edges.length, themes: graph.territories.length }, validatedCalls: replies.map(r => ({ key: r.key, modelVersion: r.reply.modelVersion, responseId: r.reply.responseId, usage: r.reply.usage, durationMs: r.reply.durationMs })), completedAt: new Date().toISOString() });
    // Publish only a fully validated snapshot; failed runs never replace a working graph.
    await writeJson(path.join(input.outputRoot, 'current-graph.json'), graph);
    log(`Saved ${graph.nodes.length} occurrences, ${graph.identities.length} identities, ${graph.edges.length} edges, ${graph.territories.length} themes.`);
    return { graph, root };
  } catch (error) {
    await writeJson(path.join(root, 'manifest.json'), { ...metadata, status: 'failed', completedChunks: replies.filter(r => r.key.startsWith('chunk-')).length, error: error instanceof Error ? error.message : 'Analysis failed', updatedAt: new Date().toISOString() });
    throw error;
  }
}
