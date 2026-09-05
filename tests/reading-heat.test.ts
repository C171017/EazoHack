import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { completedFootprints, readingHeat, heatColor, heatCount, mergeFootprints, FootprintSchema } from '../src/features/book-graph/reading-heat';
import { createFootprintRepository } from '../src/features/persistence/reading-footprints';
import { makeMockArtifact } from '../src/shared/fixtures';
import type { RouteKind, RouteRun, Selection, SourceAnchor } from '../src/shared/schemas';

const source = { bookId: 'heat-test', fileHash: 'heat-source', extractionVersion: 'txt-lf-v1', sourceText: 'x'.repeat(10000) };
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
  assert.equal(readingHeat([...events, ...events], source).bins[5].events.length, 1);
  for (const status of ['pending', 'running', 'failed', 'cancelled'] as const)
    assert.deepEqual(completedFootprints([{ ...g.run, status }], [g.artifact], [g.anchor]), []);
  assert.deepEqual(completedFootprints([g.run], [], [g.anchor]), []);
  assert.equal(generation('sources', 'source_discovery').event(), undefined);
});

test('four method filters share absolute counts and a fixed color scale', () => {
  const events = ['interactive_ui', 'concept_diagram', 'interactive_panel', 'generated_image'].flatMap((route, index) =>
    Array.from({ length: index + 1 }, (_, i) => generation(`${route}-${i}`, route as RouteKind).event()));
  const bin = readingHeat(events, source).bins[5];
  assert.equal(heatCount(bin, 'all'), 10);
  assert.deepEqual(bin.counts, { explanation: 1, diagram: 2, interactive: 3, illustration: 4 });
  assert.equal(heatCount(bin, 'diagram'), 2);
  assert.equal(heatColor(3), heatColor(5));
  assert.notEqual(heatColor(2), heatColor(3));
  assert.equal(heatColor(11), heatColor(999));
  // Adding a hotspot cannot renormalize another bin's color.
  const extra = generation('extra', 'interactive_ui', 9000).event();
  assert.equal(heatColor(readingHeat([...events, extra], source).bins[5].events.length), heatColor(10));
});

test('source midpoint handles boundaries and long selections without counting one generation many times', () => {
  const events = [generation('first', 'interactive_ui', 0, 2).event(), generation('boundary', 'interactive_ui', 199, 201).event(),
    generation('last', 'interactive_ui', 9998, 10000).event(), generation('long', 'interactive_ui', 0, 8000).event()];
  const { bins } = readingHeat(events, source);
  assert.equal(bins[0].events.length, 1); assert.equal(bins[1].events.length, 1);
  assert.equal(bins[49].events.length, 1); assert.equal(bins[20].events.length, 1);
  assert.equal(bins.reduce((sum, bin) => sum + bin.events.length, 0), 4);
});

test('stale hashes, extraction versions, quotes and unresolved anchors cannot create misplaced heat', () => {
  const original = generation('source').event();
  for (const patch of [{ fileHash: 'changed' }, { extractionVersion: 'changed' }, { quote: 'changed' }, { resolution: 'unresolved' as const }]) {
    const event = { ...original, anchors: [{ ...original.anchors[0], ...patch }] };
    const result = readingHeat([event], source);
    assert.equal(result.excluded, 1); assert.equal(result.bins.flatMap(b => b.events).length, 0);
  }
  assert.equal(readingHeat([{ ...original, bookId: 'another-book' }], source).excluded, 0);
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
  assert.equal(readingHeat(saved, source).bins[5].events.length, 2);
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
