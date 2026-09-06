import test from 'node:test';
import assert from 'node:assert/strict';
import { getChineseBookPreview } from '../src/features/reader/book-preview';
import { prepareText } from '../src/server/book-analysis/source';
import { loadMapStore, mapBootstrap } from '../src/server/book-map/store';

test('all 120 Chinese chapters retain contiguous source coverage and narrative hints', async () => {
  const { sourceText } = await getChineseBookPreview();
  const chunks = prepareText(sourceText);
  assert.equal(new Set(chunks.map(chunk => chunk.section)).size, 120);
  assert.equal(chunks[0].start, 0);
  assert.equal(chunks.at(-1)!.end, sourceText.length);
  for (const [index, chunk] of chunks.entries()) {
    if (index) assert.equal(chunks[index - 1].end, chunk.start);
    assert.match(chunk.section, /^第.+回/);
    for (const passage of chunk.passages) {
      assert.equal(passage.role, 'narrative');
      assert.equal(sourceText.slice(passage.start, passage.end), passage.text);
    }
  }
});

test('sample loader rejects paths outside the public book allowlist', async () => {
  await assert.rejects(loadMapStore('../private' as 'hong-lou-meng'), /Unknown sample book/);
});

test('Republic bootstrap carries its own sample identity for API routing', async () => {
  const graph = mapBootstrap(await loadMapStore());
  assert.equal(graph.bookId, 'plato-republic');
  assert.match(graph.version, /^sample:plato-republic:/);
  assert.ok(graph.roots.length > 0 && graph.roots.length <= 8);
});
