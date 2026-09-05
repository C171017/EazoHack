import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareText, validateExtraction } from '../src/server/book-analysis/source';
import { ExtractSchema, ReviewSchema, type Generate } from '../src/server/book-analysis/contracts';
import { validateSynthesis, validateGraphSource } from '../src/server/book-analysis/graph';
import { analyzeText } from '../src/server/book-analysis/run';
import { ModelRequestError, vertexSchema } from '../src/server/book-analysis/vertex';
import { SynthesisSchema, IdentityRepairSchema } from '../src/server/book-analysis/contracts';
import { mapWindow, SPATIAL_PAGE_SIZE } from '../src/features/book-graph/map-window';
import { initialView } from '../src/features/book-graph/projection';
import { getBookPreview } from '../src/features/reader/book-preview';
import { createSampleGraph } from '../src/features/book-graph/sample-graph';

test('Republic text segmentation covers every character and preserves exact passages and real book headings', async () => {
  const preview = await getBookPreview();
  const chunks = prepareText(preview.sourceText);
  assert.equal(chunks[0].start, 0);
  assert.equal(chunks.at(-1)!.end, preview.totalCharacters);
  for (const [i, chunk] of chunks.entries()) {
    if (i) assert.equal(chunks[i - 1].end, chunk.start);
    for (const passage of chunk.passages) assert.equal(preview.sourceText.slice(passage.start, passage.end), passage.text);
    const covered = chunk.passages.reduce((offset, p) => {
      assert.equal(preview.sourceText.slice(offset, p.start).trim(), ''); return p.end;
    }, chunk.start);
    assert.equal(preview.sourceText.slice(covered, chunk.end).trim(), '');
  }
  const books = [...new Set(chunks.filter(c => c.section.startsWith('BOOK ')).map(c => c.section))];
  assert.equal(books.length, 10);
  assert.ok(chunks.find(c => c.section === 'BOOK I')!.start < preview.startOffset);
  assert.ok(chunks.find(c => c.section === 'BOOK I')!.start > preview.totalCharacters * .2);
});

test('unknown source references, context-only occurrences and bad endpoints are rejected', () => {
  const chunks = prepareText('BOOK I\n\nJustice is discussed.\n\nBOOK II\n\nA challenge follows.');
  const chunk = chunks[0];
  const node = { label: 'Justice', identityLabel: 'Justice', summary: 'Justice is discussed.', sourceRole: 'dialogue' as const, speaker: null, level: 2, rationale: 'Reusable concept.', passageIds: [chunk.passages[1].id] };
  const value = { summary: 'Justice discussion.', nodes: [node], edges: [] };
  assert.doesNotThrow(() => validateExtraction(ExtractSchema.parse(value), chunk));
  for (const id of ['invented', chunk.context[0].id]) assert.throws(() => validateExtraction({ ...value, nodes: [{ ...node, passageIds: [id] }] }, chunk));
  assert.throws(() => validateExtraction({ ...value, edges: [{ sourceIndex: 0, targetIndex: 7, type: 'supports', rationale: 'Invalid.', passageIds: node.passageIds }] }, chunk));
});

test('synthesis must account for each occurrence exactly once in both theme and identity partitions', () => {
  const nodes = [{ id: 'a', chunkId: 'one' }, { id: 'b', chunkId: 'two' }] as Parameters<typeof validateSynthesis>[1];
  const value = { themes: [{ label: 'Theme', rationale: 'Evidence', nodeIds: ['a', 'b'] }], identities: [{ label: 'Identity', nodeIds: ['a', 'b'] }], crossEdges: [] };
  assert.doesNotThrow(() => validateSynthesis(value, nodes));
  assert.throws(() => validateSynthesis({ ...value, identities: [{ label: 'Identity', nodeIds: ['a', 'a'] }] }, nodes));
  assert.throws(() => validateSynthesis({ ...value, themes: [{ label: 'Theme', rationale: 'Evidence', nodeIds: ['a'] }] }, nodes));
});

test('Vertex schema avoids large grammar bounds while local validation still enforces them', () => {
  const wire = vertexSchema(SynthesisSchema) as { properties: { identities: { maxItems?: number }; themes: { maxItems?: number } } };
  assert.equal(wire.properties.identities.maxItems, undefined);
  assert.equal(wire.properties.themes.maxItems, 7);
  const group = { label: 'Identity', nodeIds: ['a'] };
  assert.equal(SynthesisSchema.safeParse({ themes: Array.from({ length: 3 }, () => ({ ...group, rationale: 'Evidence.' })), identities: Array.from({ length: 501 }, () => group), crossEdges: [] }).success, false);
});

test('text pipeline saves exact coordinates, excludes rejected claims, resumes checkpoints and never publishes failed runs', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eazo-analysis-'));
  const raw = Buffer.from('BOOK I\n\nA particular just act.\n\nBOOK II\n\nA definition of justice.\n\nBOOK III\n\nAn objection to the definition.');
  const chunks = prepareText(raw.toString());
  let calls = 0;
  const generate: Generate = async (_system, prompt, schema) => {
    calls++;
    let value: unknown;
    if (schema === ExtractSchema) {
      const chunk = chunks.find(c => prompt.includes(`Source section hint: ${c.section}.`))!;
      value = { summary: 'A reading unit.', nodes: [{ label: chunk.section, identityLabel: 'Justice', summary: chunk.passages[1].text, sourceRole: 'dialogue', speaker: null, level: 1, rationale: 'A claim.', passageIds: [chunk.passages[1].id] }], edges: [] };
    } else if (schema === ReviewSchema) value = { rejectedNodes: [{ id: 'n-3-1', reason: 'Test: unsupported classification.' }], rejectedEdges: [], notes: 'Model review fixture.' };
    else if (schema === IdentityRepairSchema) value = { assignments: [{ nodeId: 'n-3-1', identityIndex: 0 }] };
    else value = { themes: chunks.map((c, i) => ({ label: c.section, rationale: 'Test theme rationale.', nodeIds: [`n-${i + 1}-1`] })), identities: [{ label: 'Justice', nodeIds: ['n-1-1', 'n-2-1'] }], crossEdges: [{ source: 'n-2-1', target: 'n-1-1', type: 'defines', rationale: 'Definition.' }] };
    return { value, model: 'fixture', modelVersion: 'fixture', usage: {}, durationMs: 1 };
  };
  try {
    const input = { raw, bookId: 'fixture', outputRoot: root, model: 'fixture', generate };
    const result = await analyzeText(input);
    assert.equal(result.graph.nodes.length, 2);
    assert.equal(result.graph.identities.length, 1);
    const resolved = JSON.parse(await readFile(path.join(result.root, 'synthesis-resolved.json'), 'utf8'));
    assert.equal(resolved.identities[0].nodeIds.length, 3, 'Targeted repair must retain every candidate before evidence review.');
    assert.equal(result.graph.analysis?.rejectedNodes, 1);
    assert.equal(result.graph.analysis?.processedCharacters, raw.length);
    assert.ok(result.graph.nodes.every(n => n.position.y === n.structuralLevel));
    assert.notEqual(result.graph.nodes[0].position.z, result.graph.nodes[1].position.z);
    const initialCalls = calls;
    await analyzeText(input);
    assert.equal(calls, initialCalls, 'Completed provider responses must be reused.');
    const published = await readFile(path.join(root, 'current-graph.json'), 'utf8');
    await assert.rejects(analyzeText({ ...input, raw: Buffer.from('Different text'), generate: async () => { throw new ModelRequestError('Permission denied fixture', false); } }));
    assert.equal(await readFile(path.join(root, 'current-graph.json'), 'utf8'), published);
    const bad = structuredClone(result.graph); bad.anchors[0].quote = 'Invented';
    assert.throws(() => validateGraphSource(bad, raw.toString(), bad.fileHash));
    // Corrupted successful checkpoint fails closed rather than silently using its payload.
    const checkpoint = JSON.parse(await readFile(path.join(result.root, 'chunk-001.json'), 'utf8'));
    await writeFile(path.join(result.root, 'chunk-001.json'), JSON.stringify({ ...checkpoint, value: {} }));
    await assert.rejects(analyzeText(input));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('map pages retain source coordinates and filters can expose every occurrence', async () => {
  const graph = createSampleGraph(await getBookPreview());
  graph.nodes = Array.from({ length: 60 }, (_, i) => ({ ...graph.nodes[i % 9], id: `test-${i}`, sourceRole: i % 2 ? 'dialogue' : 'commentary' }));
  const before = JSON.stringify(graph.nodes.map(n => n.position));
  const view = { ...initialView(graph.graphVersion), sourceScope: 'book' as const };
  const first = mapWindow(graph, view, [0, 1]);
  const second = mapWindow(graph, { ...view, nodePage: 1 }, [0, 1]);
  assert.equal(first.spatial.length, SPATIAL_PAGE_SIZE);
  assert.equal(first.pages, 5);
  assert.ok(second.spatial.every(n => !first.spatial.some(a => a.id === n.id)));
  assert.equal(mapWindow(graph, { ...view, roleFilter: 'dialogue' }, [0, 1]).filtered.length, 30);
  assert.equal(mapWindow(graph, { ...view, nodePage: 999 }, [0, 1]).page, 4);
  assert.equal(JSON.stringify(graph.nodes.map(n => n.position)), before);
});
