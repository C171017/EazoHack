import { withPipelineTelemetry } from '../src/server/book-analysis/telemetry';
import path from 'node:path';
import { LocalSourceSchema, localJobRoot, type LocalJob } from '../src/server/book-analysis/local-jobs';
import { readJson, writeJson } from '../src/server/book-analysis/json-store';
import { analyzeText } from '../src/server/book-analysis/run';
import { buildHierarchy } from '../src/server/book-analysis/hierarchy-run';
import { analysisModel, generateStructured } from '../src/server/book-analysis/vertex';

async function main() {
  const root = localJobRoot(process.argv[2]);
  const statusFile = path.join(root, 'status.json');
  for (let i = 0; i < 100 && (await readJson(statusFile) as LocalJob | null)?.pid !== process.pid; i++) await new Promise(resolve => setTimeout(resolve, 50));
  let stage = 'Analyzing the book’s passages';
  let writes = Promise.resolve();
  const report = (status: LocalJob['status'], error?: string) => {
    writes = writes.then(() => writeJson(statusFile, { status, stage, error, pid: process.pid, updatedAt: Date.now() }));
    return writes;
  };
  const heartbeat = setInterval(() => { void report('running'); }, 10_000);
  try {
    const source = LocalSourceSchema.parse(await readJson(path.join(root, 'source.json')));
    const log = (message: string) => { stage = message; void report('running'); };
    await report('running');
    const { graph } = await analyzeText({ raw: Buffer.from(source.sourceText), bookId: source.bookId, sourceIdentity: source, outputRoot: root, model: analysisModel(), generate: generateStructured, log });
    stage = 'Organizing the map into zoomable layers';
    await report('running');
    await buildHierarchy({ graph, outputRoot: root, model: analysisModel(), generate: generateStructured, log });
    clearInterval(heartbeat);
    stage = 'Book map ready';
    await report('ready');
  } catch (error) {
    clearInterval(heartbeat);
    stage = 'Map analysis stopped';
    await report('failed', error instanceof Error ? error.message : 'Analysis failed. Retry to resume.');
  }
}
withPipelineTelemetry(main).catch(() => { process.exitCode = 1; });
