import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

export const publicSamples = [
  { id: 'plato-republic', source: 'data/books/plato-republic/raw/republic-jowett-3rd-edition.txt' },
  { id: 'hong-lou-meng', source: 'data/books/hong-lou-meng/derived/hong-lou-meng-reading.txt' },
];

export async function loadPublicSamples() {
  return Promise.all(publicSamples.map(async sample => {
    const pointer = `data/books/${sample.id}/analysis/current-map.json`;
    const { version } = JSON.parse(await readFile(pointer, 'utf8'));
    assert.match(version, /^[a-z0-9-]+$/, `${sample.id}: invalid map version`);
    const directory = `data/books/${sample.id}/analysis/${version}`;
    const hierarchy = JSON.parse(await readFile(`${directory}/hierarchy.json`, 'utf8'));
    const graph = JSON.parse(await readFile(`${directory}/graph.json`, 'utf8'));
    assert.equal(hierarchy.version, version, `${sample.id}: hierarchy/pointer mismatch`);
    assert.equal(graph.bookId, sample.id, `${sample.id}: wrong source graph`);
    assert.equal(hierarchy.graphVersion, graph.graphVersion, `${sample.id}: graph/hierarchy mismatch`);
    assert(graph.nodes.length > 0 && hierarchy.roots.length > 0, `${sample.id}: empty map`);
    return { ...sample, mapVersion: `sample:${sample.id}:${version}`,
      required: [sample.source, pointer, `${directory}/graph.json`, `${directory}/hierarchy.json`] };
  }));
}
