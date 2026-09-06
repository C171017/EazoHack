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

test('published Chinese map covers every chapter and stays isolated from the Republic cache', async () => {
  const [chinese, republic, again] = await Promise.all([loadMapStore('hong-lou-meng'), loadMapStore(), loadMapStore('hong-lou-meng')]);
  assert.equal(chinese, again);
  assert.notEqual(chinese.graph.fileHash, republic.graph.fileHash);
  assert.equal(chinese.graph.bookId, 'hong-lou-meng');
  assert.match(chinese.hierarchy.version, /^sample:hong-lou-meng:/);
  assert.equal(new Set(chinese.graph.nodes.map(node => node.sourceLabel.split(' · ')[0])).size, 120);
  assert.ok(chinese.graph.nodes.length > 120);
  assert.ok(chinese.graph.axisAnalysis?.consistencyVersion);
  const leaves = new Set(chinese.hierarchy.entries.filter(entry => entry.kind === 'occurrence').map(entry => entry.id));
  assert.deepEqual(leaves, new Set(chinese.graph.nodes.map(node => node.id)));
});

test('Chinese map API serves its own children and source anchors', async () => {
  const { GET } = await import('../src/app/api/book-map/route');
  const store = await loadMapStore('hong-lou-meng');
  const request = (params: Record<string, string>) => GET(new Request(`http://localhost/api/book-map?${new URLSearchParams({version: store.hierarchy.version, ...params})}`, {headers:{cookie:'eazo-book=unrelated-cloud-selection'}}));
  const root = store.hierarchy.roots.find(id => store.hierarchy.children[id])!;
  const children = await request({kind:'children',id:root});
  assert.equal(children.status, 200);
  const body = await children.json();
  assert.equal(body.version, store.hierarchy.version);
  assert.equal(body.pages[root].length, store.hierarchy.children[root].length);
  const anchor = store.graph.anchors[0];
  const response = await request({kind:'anchor',id:anchor.id});
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).anchor, anchor);
  const stale = await request({kind:'heat-index',version:'sample:hong-lou-meng:stale'});
  assert.equal(stale.status, 409);
});
