import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadingImageTransport, readingImageHashes, validateReadingEnvelope, mapReadingImages } from '../src/features/cloud/reading-images';
import { WorkspaceSnapshotSchema } from '../src/features/persistence';
import { fixtureAnchors, fixtureSelection, makeMockArtifact } from '../src/shared/fixtures';
import { ReadingSync, type SyncDependencies } from '../src/features/cloud/sync-engine';
import type { SnapshotHead } from '../src/features/cloud/sync-store';

function richReading() {
  const artifact = makeMockArtifact('generated_image', fixtureSelection, 'illustration-1');
  if (artifact.kind !== 'generated_image') throw new Error();
  artifact.payload = { status: 'ready', prompt: 'Test illustration', caption: 'Test', resource: { dataUrl: 'data:image/png;base64,' + 'A'.repeat(3_200_000), width: 128, height: 128 } };
  const interactive = makeMockArtifact('interactive_panel', fixtureSelection, 'interactive-1');
  return WorkspaceSnapshotSchema.parse({ schemaVersion: 1, id: fixtureSelection.bookId, bookId: fixtureSelection.bookId, selections: [fixtureSelection], anchors: fixtureAnchors, artifacts: [artifact, interactive],
    placements: [{ artifactId: artifact.id, selectionId: fixtureSelection.id, anchorId: fixtureAnchors[0].id, offset: fixtureSelection.selectedText.length, mode: 'block_after_selection', order: 0 }],
    interactionState: { [interactive.id]: { selected: 'second', expanded: true } },
    readerPosition: { fileHash: fixtureAnchors[0].fileHash, extractionVersion: fixtureAnchors[0].extractionVersion, startOffset: 15 },
    footprints: [{ id: 'illustration-1', bookId: fixtureSelection.bookId, createdAt: artifact.createdAt, kind: 'illustration', anchors: fixtureAnchors, artifacts: [artifact] }], savedAt: new Date().toISOString() });
}

test('large illustrations, enhancements, interaction state, position and heatmap survive sync to a second device', async t => {
  const reading = richReading();
  const files = new Map<string, string>(); let uploads = 0;
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/cloud/reading-image') {
      assert.equal(new Headers(init?.headers).get('x-eazo-owner'), 'alice');
      const { hash } = JSON.parse(String(init?.body)); return Response.json({ uploadUrl: `https://storage.test/${hash}` });
    }
    if (url.startsWith('/api/cloud/reading-image?')) return Response.json({ url: 'https://storage.test/' + new URL(url, 'https://app.test').searchParams.get('hash') });
    if (url.startsWith('https://storage.test/')) {
      if (init?.method === 'PUT') { uploads++; files.set(url, new TextDecoder().decode(init.body as Uint8Array)); return new Response(''); }
      return new Response(files.get(url));
    }
    throw new Error('Unexpected request');
  });
  const aImages = createReadingImageTransport('alice', 'source');
  const bImages = createReadingImageTransport('alice', 'source');
  const wire = await aImages.pack(reading);
  assert.equal(uploads, 1, 'Repeated image in generation history uploads once');
  assert.ok(JSON.stringify(wire).length < 20_000, 'Reading request stays small');
  assert.equal(readingImageHashes(wire).length, 1);
  validateReadingEnvelope(wire);
  await aImages.pack(reading); assert.equal(uploads, 1);
  let head: SnapshotHead = { revision: 0, payload: null };
  const restored: unknown[] = [];
  const deps = (images: ReturnType<typeof createReadingImageTransport>): SyncDependencies => ({ load: async () => null, save: async () => {}, archive: async () => {},
    get: async () => ({ ...head, payload: head.payload ? await images.unpack(head.payload) : null }),
    put: async record => { head = { revision: head.revision + 1, payload: await images.pack(record.current) as SnapshotHead['payload'] }; return { revision: head.revision, payload: null }; },
    validate: value => WorkspaceSnapshotSchema.parse(value), restore: value => restored.push(value), status: () => {}, uuid: () => crypto.randomUUID(), online: () => true, remote: true });
  const a = new ReadingSync('alice:source', deps(aImages)); await a.start(); await a.update(reading); await a.flush();
  const b = new ReadingSync('alice:source', deps(bImages)); await b.start();
  assert.deepEqual(restored.at(-1), reading);
});
test('malformed and cross-path illustration references are rejected', () => {
  assert.throws(() => readingImageHashes({ dataUrl: 'eazo-image:../other-account/private' }));
  assert.throws(() => validateReadingEnvelope(mapReadingImages(richReading(), () => 'https://untrusted.test/image')));
});
