import { withPipelineTelemetry } from '../src/server/book-analysis/telemetry';
import { calibrateBookAxes } from '../src/server/book-analysis/axis-calibration';
import { assignBookAxes } from '../src/server/book-analysis/axis-run';
import { writeJson } from '../src/server/book-analysis/json-store';
import { createHash } from 'node:crypto';
import { validateGraphSource } from '../src/server/book-analysis/graph';
import { readFile, mkdir, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { analyzeText } from '../src/server/book-analysis/run';
import { buildHierarchy } from '../src/server/book-analysis/hierarchy-run';
import { GraphSchema } from '../src/shared/schemas';
import { prepareText } from '../src/server/book-analysis/source';
import { analysisModel, generateStructured } from '../src/server/book-analysis/vertex';

async function main() {
  // Optional custom text: --input /path/book.txt --book-id example --output /path/results
  const args = process.argv.slice(2);
  const option = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const inputFile = option('--input') ?? 'data/books/plato-republic/raw/republic-jowett-3rd-edition.txt';
  const bookId = option('--book-id') ?? 'plato-republic';
  if (!/^[a-z0-9-]+$/.test(bookId)) throw new Error('Book ID must contain lowercase letters, numbers, and hyphens.');
  const outputRoot = path.resolve(option('--output') ?? `data/books/${bookId}/analysis`);
  const raw = await readFile(inputFile);
  if (args.includes('--dry-run')) {
    const text = raw.toString('utf8').replace(/\r\n?/g, '\n');
    const chunks = prepareText(text);
    console.log(JSON.stringify({ model: analysisModel(), characters: text.length, chunks: chunks.length, sections: [...new Set(chunks.map(c => c.section))], maximumOccurrences: chunks.length * 8, outputRoot }, null, 2));
    return;
  }
  await mkdir(outputRoot, { recursive: true });
  const lockFile = path.join(outputRoot, '.run.lock');
  const lock = await open(lockFile, 'wx').catch(() => { throw new Error(`Another analysis holds ${lockFile}. If a process was killed, confirm it stopped before removing this lock.`); });
  await lock.writeFile(String(process.pid));
  try {
    let graph=args.includes('--hierarchy-only')||args.includes('--axes-only')?GraphSchema.parse(JSON.parse(await readFile(path.join(outputRoot,'current-graph.json'),'utf8'))):(await analyzeText({ raw, bookId, outputRoot, model: analysisModel(), generate: generateStructured, log: console.log })).graph;
    validateGraphSource(graph,raw.toString('utf8').replace(/\r\n?/g,'\n'),createHash('sha256').update(raw).digest('hex'));
    if(graph.bookId!==bookId)throw new Error('Graph book ID does not match the requested input.');
    graph=await assignBookAxes({graph,outputRoot,model:analysisModel(),generate:generateStructured,log:console.log});
    graph=await calibrateBookAxes({graph,outputRoot,model:analysisModel(),generate:generateStructured,log:console.log});
    await buildHierarchy({graph,outputRoot,model:analysisModel(),generate:generateStructured,log:console.log});
    await writeJson(path.join(outputRoot,'current-graph.json'),graph);
  }
  finally { await lock.close(); await unlink(lockFile); }
}
withPipelineTelemetry(main).catch(error => { console.error(error instanceof Error ? error.message : 'Analysis failed.'); process.exitCode = 1; });
