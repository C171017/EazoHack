import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { GraphSchema } from '../../shared/schemas';
import type { BookPreview } from '../../features/reader/book-preview';
import { validateGraphSource } from './graph';

export async function loadRepublicGraph(preview: BookPreview) {
  const raw = await readFile(path.join(process.cwd(), 'data/books/plato-republic/analysis/current-graph.json'), 'utf8');
  const graph = GraphSchema.parse(JSON.parse(raw));
  if (!graph.analysis || graph.bookId !== 'plato-republic') throw new Error('No completed Republic analysis is available. Run npm run analyze:book.');
  return validateGraphSource(graph, preview.sourceText, preview.fileHash);
}
