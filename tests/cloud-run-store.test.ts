import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkerBackend, durableStore, relativeKey, sha256 } from '../src/server/book-analysis/cloud/store';
import { readJson, writeJson, listJson, withJsonStore } from '../src/server/book-analysis/json-store';

test('fresh worker restores checkpoints; upload failures never publish pointers; checksum corruption fails closed', async () => {
  const objects = new Map<string, string>(), pointers = new Map<string, { object: string; hash: string }>();
  let uploadFails = false;
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/eazo_worker')) {
      const { p_action: action, p_payload: p } = JSON.parse(String(init?.body));
      if (action === 'write') pointers.set(p.key, { object: p.object, hash: p.hash });
      const result = action === 'read' ? pointers.get(p.key) ?? null : action === 'list'
        ? [...pointers.keys()].filter(k => k.startsWith(p.prefix)).map(k => k.slice(p.prefix.length)) : true;
      return Response.json(result);
    }
    const key = url.pathname.split('/eazo-analysis/')[1];
    if (init?.method === 'POST') {
      if (uploadFails) return new Response('', { status: 503 });
      objects.set(key, String(init.body)); return Response.json({});
    }
    return new Response(objects.get(key));
  };
  const backend = () => new WorkerBackend('https://example.supabase.co', 'test-only', 'a2828282-8282-4282-8282-828282828282', 'test-token', transport);
  await withJsonStore(durableStore(backend(), '/analysis', () => {}), async () => {
    await writeJson('/analysis/run/chunk.json', { anchors: [12, 40] });
  });
  await withJsonStore(durableStore(backend(), '/analysis', () => {}), async () => {
    assert.deepEqual(await readJson('/analysis/run/chunk.json'), { anchors: [12, 40] });
    assert.deepEqual(await listJson('/analysis/run'), ['chunk.json']);
    assert.equal(await readJson('/analysis/missing.json'), null);
    uploadFails = true;
    await assert.rejects(writeJson('/analysis/run/next.json', {}));
    assert.equal(pointers.has('run/next.json'), false);
    const key = pointers.get('run/chunk.json')!.object;
    objects.set(key, '{}');
    await assert.rejects(readJson('/analysis/run/chunk.json'), /checksum/);
  });
});

test('lost leases and path traversal cannot write; AsyncLocalStorage isolates worker contexts', async () => {
  assert.throws(() => relativeKey('/analysis', '/other/file.json'));
  const backend = new WorkerBackend('https://example.supabase.co', 'test-only', 'a2828282-8282-4282-8282-828282828282', 'test-token', async () => { throw new Error('must not fetch'); });
  await assert.rejects(durableStore(backend, '/analysis', () => { throw new Error('lost lease'); }).write('/analysis/a.json', {}), /lost lease/);
  const makeStore = (value: string) => ({ read: async () => value, write: async () => {}, list: async () => [] });
  assert.deepEqual(await Promise.all(['a', 'b'].map(value => withJsonStore(makeStore(value), async () => readJson('/same')))), ['a', 'b']);
  assert.equal(sha256(Buffer.from('x')), sha256('x'));
});
