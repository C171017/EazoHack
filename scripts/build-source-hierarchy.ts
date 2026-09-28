import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GraphSchema } from '../src/shared/schemas';
import { clusterEntry, leafEntry, validateHierarchy, type Hierarchy, type MapEntry } from '../src/shared/zoom-hierarchy';

// A source-order navigation hierarchy for a completed graph without modern axis ratings.
// Labels and summaries come from the graph's existing model-reviewed themes.
async function main() {
const root = path.join(process.cwd(), 'data/books/plato-republic/analysis');
const graph = GraphSchema.parse(JSON.parse(await readFile(path.join(root, 'current-graph.json'), 'utf8')));
if (graph.axisVersion) throw new Error('This script only builds a hierarchy for legacy coordinates');
if (graph.analysis?.status !== 'complete') throw new Error('Analysis must be complete');

const version = `source-hierarchy-v1-${createHash('sha256').update(graph.graphVersion).digest('hex').slice(0,16)}`;
const entries: MapEntry[] = [];
const children: Record<string,string[]> = {};
let sequence = 0;
const add = (entry: MapEntry) => { entries.push(entry); return entry; };

function group(items: MapEntry[], label: string, summary: string): MapEntry {
  const id = `source-group-${++sequence}`;
  const parent = add(clusterEntry(id,label,summary,items));
  children[id] = items.map(item => item.id);
  for (const item of items) item.parentId = id;
  return parent;
}

function branch(items: MapEntry[], label: string, summary: string): MapEntry {
  if (items.length <= 8) return group(items,label,summary);
  const batches: MapEntry[] = [];
  const count = Math.ceil(items.length/8);
  const base = Math.floor(items.length/count);
  const extra = items.length%count;
  for (let batch=0, i=0; batch<count; batch++) {
    const size = base+(batch<extra?1:0);
    const part = items.slice(i,i+size);
    batches.push(group(part,`${label} · ${i+1}–${i+part.length}`,
      `Source-order navigation group within ${label}.`));
    i += size;
  }
  return branch(batches,label,summary);
}

const shortLabels: Record<string,string> = {
  'theme-0':'Justice',
  'theme-1':'City and soul',
  'theme-2':'Education',
  'theme-3':'Guardian institutions',
  'theme-4':'Good and philosophy',
  'theme-5':'Decline and tyranny',
  'theme-6':'Poetry and afterlife',
};
const roots = graph.territories.map(theme => {
  const leaves = graph.nodes.filter(node => node.themeTerritoryIds[0] === theme.id)
    .sort((a,b) => (a.position.z ?? 0)-(b.position.z ?? 0) || a.id.localeCompare(b.id))
    .map(node => add(leafEntry(node)));
  if (leaves.length < 2) throw new Error(`Theme ${theme.id} cannot form a cluster`);
  return branch(leaves,shortLabels[theme.id] ?? theme.label,theme.label);
});

const hierarchy: Hierarchy = {
  version, graphVersion:graph.graphVersion, fileHash:graph.fileHash,
  extractionVersion:graph.extractionVersion, promptVersion:'source-hierarchy-v1',
  model:graph.analysis.model, createdAt:new Date().toISOString(),
  roots:roots.map(root=>root.id), depth:Math.max(...roots.map(root=>root.height)),
  entries, children,
  rationale:'Model-reviewed MiMo themes are roots. Nodes are grouped in source order within each theme; intermediate groups and coordinates are deterministic navigation aids, without additional model interpretation.',
};
validateHierarchy(hierarchy,graph);
const dir = path.join(root,version);
await mkdir(dir,{recursive:true});
await writeFile(path.join(dir,'graph.json'),JSON.stringify(graph,null,2)+'\n');
await writeFile(path.join(dir,'hierarchy.json'),JSON.stringify(hierarchy,null,2)+'\n');
await writeFile(path.join(root,'current-map.json'),JSON.stringify({version},null,2)+'\n');
console.log(JSON.stringify({version,nodes:graph.nodes.length,roots:roots.length,depth:hierarchy.depth}));
}

main().catch(error => { console.error(error); process.exitCode=1; });
