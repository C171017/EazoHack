import { withPipelineTelemetry, countPipeline } from '../src/server/book-analysis/telemetry';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { WorkerBackend, JobSchema, durableStore, sha256 } from '../src/server/book-analysis/cloud/store';
import { readJson, writeJson, withJsonStore } from '../src/server/book-analysis/json-store';
import { analyzeText } from '../src/server/book-analysis/run';
import { assignBookAxes } from '../src/server/book-analysis/axis-run';
import { calibrateBookAxes } from '../src/server/book-analysis/axis-calibration';
import { buildHierarchy } from '../src/server/book-analysis/hierarchy-run';
import { validateGraphSource } from '../src/server/book-analysis/graph';
import { generateStructured } from '../src/server/book-analysis/vertex';
import type { Generate, ModelReply } from '../src/server/book-analysis/contracts';

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
async function main() {
  const backend = new WorkerBackend(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), required('EAZO_ANALYSIS_JOB_ID'), randomUUID());
  let claim = await backend.rpc('claim');
  const waitDeadline = Date.now() + 330_000;
  while (claim && typeof claim === 'object' && 'busy' in claim) {
    if (Date.now() >= waitDeadline) throw new Error('Job already has a live worker');
    await new Promise(resolve => setTimeout(resolve, 5000));
    claim = await backend.rpc('claim');
  }
  if (claim === null) return; // Terminal job or another live lease; duplicate dispatch is a no-op.
  const controller = new AbortController();
  let heartbeatBusy = false;
  const stop = () => controller.abort(new Error('Worker interrupted or lease lost'));
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  const heartbeat = setInterval(async () => {
    if (heartbeatBusy) return;
    heartbeatBusy = true;
    try { await backend.rpc('heartbeat'); } catch { stop(); }
    finally { heartbeatBusy = false; }
  }, 25_000);
  const assertLease = () => controller.signal.throwIfAborted();
  try {
    const job = JobSchema.parse(claim);
    if (job.pipeline_version !== required('EAZO_PIPELINE_VERSION')) throw new Error('Pipeline version mismatch');
    process.env.GEMINI_MODEL = job.model;
    const raw = await backend.download('eazo-sources', job.source_path);
    if (sha256(raw) !== job.source_sha256) throw new Error('Source checksum mismatch');
    // Virtual root only: no local filesystem survives or participates in a retry.
    const root = '/analysis';
    await withJsonStore(durableStore(backend, root, assertLease), async () => {
      // Persist each complete reply BEFORE any phase receives it, including axes/hierarchy.
      const generate: Generate = async (system, prompt, schema, tokens, options) => {
        assertLease();
        const hash = sha256(JSON.stringify({ system, prompt, schema: z.toJSONSchema(schema), tokens, model: job.model }));
        const file = path.join(root, 'provider-replies', `${hash}.json`);
        const cached = await readJson(file) as ModelReply | null;
        if (cached) { countPipeline('provider.reply.hit'); return cached; }
        countPipeline('provider.reply.miss');
        const reply = await generateStructured(system, prompt, schema, tokens, { ...options,
          signal: options?.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal });
        await writeJson(file, reply);
        return reply;
      };
      let { graph } = await analyzeText({ raw, bookId: job.book_id, outputRoot: root, model: job.model, generate, concurrency: 2, sourceIdentity: {fileHash: job.file_hash, extractionVersion: job.extraction_version} });
      validateGraphSource(graph, raw.toString('utf8').replace(/\r\n?/g, '\n'), job.file_hash, job.extraction_version);
      graph = await assignBookAxes({ graph, outputRoot: root, model: job.model, generate });
      graph = await calibrateBookAxes({ graph, outputRoot: root, model: job.model, generate });
      // Each accepted job publishes a distinct version, while its phase checkpoints retain stable keys.
      graph = {...graph, graphVersion: `${graph.graphVersion}-${job.id}`};
      const hierarchy = await buildHierarchy({ graph, outputRoot: root, model: job.model, generate });
      await writeJson(path.join(root, 'result.json'), { graph, hierarchy, sourceSha256: job.source_sha256, pipelineVersion: job.pipeline_version });
      assertLease();
      const prefix = `${backend.namespace}/${backend.token}`;
      const graphBytes = JSON.stringify(graph), hierarchyBytes = JSON.stringify(hierarchy);
      await backend.upload(`${prefix}/graph.json`, graphBytes, true);
      await backend.upload(`${prefix}/hierarchy.json`, hierarchyBytes, true);
      const manifest = JSON.stringify({sourceSha256: job.source_sha256, fileHash: job.file_hash, extractionVersion: job.extraction_version, graphSha256: sha256(graphBytes), hierarchySha256: sha256(hierarchyBytes), pipelineVersion: job.pipeline_version, graphVersion: graph.graphVersion});
      await backend.upload(`${prefix}/manifest.json`, manifest, true);
      assertLease();
      if (!await backend.rpc('complete', { graph_version: graph.graphVersion, manifest_sha256: sha256(manifest) })) throw new Error('Publication rejected');
    });
    console.log(JSON.stringify({ jobId: backend.jobId, status: 'complete' }));
  } catch {
    // Do not leak source or model responses via exception messages.
    await backend.rpc('retry', { code: 'worker_failed' }).catch(() => {});
    throw new Error('Worker failed; durable checkpoints retained');
  } finally {
    clearInterval(heartbeat);
    process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
  }
}
withPipelineTelemetry(main).catch(() => { console.error('Analysis worker failed; inspect durable job status'); process.exitCode = 1; });
