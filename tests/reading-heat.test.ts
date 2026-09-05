import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { completedFootprints, heatCount, mergeFootprints, FootprintSchema } from '../src/features/book-graph/reading-heat';
import { placeFootprints, nearestHeatLeaf, unionRanges, type HeatIndex } from '../src/features/book-graph/heat-placement';
import { heatRgb } from '../src/features/book-graph/heat-field';
import { createFootprintRepository } from '../src/features/persistence/reading-footprints';
import { makeMockArtifact } from '../src/shared/fixtures';
import type { RouteKind, RouteRun, Selection, SourceAnchor } from '../src/shared/schemas';

const source = { bookId: 'heat-test', fileHash: 'heat-source', extractionVersion: 'txt-lf-v1', sourceText: 'x'.repeat(10000) };
const index: HeatIndex = { ...source, sourceLength: source.sourceText.length, leaves: Array.from({ length: 50 }, (_, i) => ({ id: `leaf-${i}`, label: `Leaf ${i}`, position: { x: .5, y: 2, z: (i + .5) / 50 }, ranges: [{ start: i * 200, end: (i + 1) * 200 }] })) };
function generation(id: string, route: RouteKind = 'interactive_ui', startOffset = 1100, endOffset = startOffset + 10) {
  const anchor: SourceAnchor = { id: `anchor-${id}`, ...source, locators: [{ kind: 'txt', startOffset, endOffset }], quote: source.sourceText.slice(startOffset, endOffset), prefix: '', suffix: '', resolution: 'exact' };
  // Source text belongs to the resolver, not the serialized anchor.
  delete (anchor as unknown as Record<string, unknown>).sourceText;
  const selection: Selection = { id: `selection-${id}`, bookId: source.bookId, anchorIds: [anchor.id], selectedText: anchor.quote, contextSnapshot: 'Test', createdAt: '2026-09-06T00:00:00Z' };
  const artifact = makeMockArtifact(route, selection, id);
  const run: RouteRun = { id, planId: 'heat-plan', route, status: 'complete', dependsOn: [], artifactIds: [artifact.id] };
  return { anchor, selection, artifact, run, event: () => completedFootprints([run], [artifact], [anchor])[0] };
}

test('only completed supported generations count; multiple outputs count once and replay is idempotent', () => {
  const g = generation('run');
  const second = { ...g.artifact, id: 'second-artifact' };
  const events = completedFootprints([{ ...g.run, artifactIds: [g.artifact.id, second.id] }], [g.artifact, second], [g.anchor]);
  assert.equal(events.length, 1); assert.equal(events[0].artifacts.length, 2);
  assert.equal(mergeFootprints(events, events).length, 1);
  assert.equal(placeFootprints([...events, ...events], source, index).points[0].events.length, 1);
  for (const status of ['pending', 'running', 'failed', 'cancelled'] as const)
    assert.deepEqual(completedFootprints([{ ...g.run, status }], [g.artifact], [g.anchor]), []);
  assert.deepEqual(completedFootprints([g.run], [], [g.anchor]), []);
  assert.equal(generation('sources', 'source_discovery').event(), undefined);
});

test('four method filters share absolute counts and a fixed color scale', () => {
  const events = ['interactive_ui', 'concept_diagram', 'interactive_panel', 'generated_image'].flatMap((route, index) =>
    Array.from({ length: index + 1 }, (_, i) => generation(`${route}-${i}`, route as RouteKind).event()));
  const bin = placeFootprints(events, source, index).points[0];
  assert.equal(heatCount(bin, 'all'), 10);
  assert.deepEqual(bin.counts, { explanation: 1, diagram: 2, interactive: 3, illustration: 4 });
  assert.equal(heatCount(bin, 'diagram'), 2);
  assert.notDeepEqual(heatRgb(3), heatRgb(5));
  assert.notDeepEqual(heatRgb(2), heatRgb(3));
  assert.deepEqual(heatRgb(12), heatRgb(999));
  // Adding a hotspot cannot renormalize another bin's color.
  const extra = generation('extra', 'interactive_ui', 9000).event();
  assert.deepEqual(heatRgb(placeFootprints([...events, extra], source, index).points[0].events.length), heatRgb(10));
});

test('placement uses overlap first, nearest text gap second, and deterministic ties', () => {
  const a = index.leaves[0], b = index.leaves[1];
  assert.equal(nearestHeatLeaf([{ start: 190, end: 240 }], [a,b])?.leaf.id, b.id);
  // The nearest center is not a substitute for nearest interval distance.
  const long = { ...a, ranges: [{start:0,end:1000}] }, short = {...b,ranges:[{start:1020,end:1030}]};
  assert.equal(nearestHeatLeaf([{ start: 999, end: 1001 }], [long,short])?.leaf.id, long.id);
  assert.equal(nearestHeatLeaf([{ start: 1014, end: 1016 }], [long,short])?.leaf.id, short.id);
  const tied = { ...a, id: 'a-first' };
  assert.equal(nearestHeatLeaf([{start:50,end:60}], [a,tied])?.leaf.id, 'a-first');
  assert.equal(nearestHeatLeaf([{start:50,end:60}], [tied,a])?.leaf.id, 'a-first');
  assert.deepEqual(unionRanges([{start:0,end:10},{start:5,end:20}]), [{start:0,end:20}]);
  const longEvent = generation('long', 'interactive_ui', 0, 8000).event();
  assert.equal(placeFootprints([longEvent],source,index).points.reduce((sum,p)=>sum+p.events.length,0),1);
});

test('nearest unplaced leaf and incompatible source index remain explicitly unmapped', () => {
  const event = generation('unplaced').event();
  assert.equal(placeFootprints([event],source,{...index,leaves:index.leaves.map(l=>l.id==='leaf-5'?{...l,position:null}:l)}).unmapped,1);
  assert.equal(placeFootprints([event],source,{...index,fileHash:'older'}).unmapped,1);
  assert.equal(placeFootprints([event],source,null).unmapped,1);
  // A gap fallback is recorded for inspection, rather than claimed as an overlap.
  const placed=placeFootprints([event],source,{...index,leaves:[index.leaves[0]]});
  assert.equal(placed.points[0].nearest,1);
});

test('stale hashes, extraction versions, quotes and unresolved anchors cannot create misplaced heat', () => {
  const original = generation('source').event();
  for (const patch of [{ fileHash: 'changed' }, { extractionVersion: 'changed' }, { quote: 'changed' }, { resolution: 'unresolved' as const }]) {
    const event = { ...original, anchors: [{ ...original.anchors[0], ...patch }] };
    const result = placeFootprints([event], source, index);
    assert.equal(result.excluded, 1); assert.equal(result.points.flatMap(b => b.events).length, 0);
  }
  assert.equal(placeFootprints([{ ...original, bookId: 'another-book' }], source, index).excluded, 0);
  assert.throws(() => FootprintSchema.parse({ ...original, anchors: [] }));
  assert.throws(() => FootprintSchema.parse({ ...original, kind: 'diagram' }));
  assert.throws(() => FootprintSchema.parse({ ...original, id: 'wrong-run' }));
});

test('footprints and their generated results survive reload, repeated saves, and concurrent writers', async () => {
  const indexedDB = new IDBFactory();
  const first = createFootprintRepository({ indexedDB }), second = createFootprintRepository({ indexedDB });
  const a = generation('persist-a').event(), b = generation('persist-b', 'concept_diagram').event();
  await Promise.all([first.record([a]), second.record([a, b])]);
  await first.close(); await second.close();
  const reopened = createFootprintRepository({ indexedDB });
  const saved = await reopened.list(source.bookId);
  assert.deepEqual(mergeFootprints(saved), mergeFootprints([a, b]));
  assert.equal(placeFootprints(saved, source, index).points[0].events.length, 2);
  assert.deepEqual(await reopened.list('different-book'), []);
  await reopened.close();
});

test('failed storage writes preserve existing history and support retry without duplicates', async () => {
  const repository = createFootprintRepository({ indexedDB: new IDBFactory() });
  const a = generation('before-failure').event(), b = generation('retry').event();
  await repository.record([a]);
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function () { throw new DOMException('Full', 'QuotaExceededError'); };
  try { await assert.rejects(repository.record([b]), /could not be saved/); }
  finally { IDBObjectStore.prototype.put = put; }
  assert.deepEqual(await repository.list(source.bookId), [a]);
  await repository.record([b]); await repository.record([b]);
  assert.equal((await repository.list(source.bookId)).length, 2);
  await assert.rejects(repository.record([{ ...b, bookId: 'wrong-book' }]));
  await repository.close();
});
