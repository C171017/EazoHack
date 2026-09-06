import test from 'node:test';
import assert from 'node:assert/strict';
import { mapConcurrent } from '../src/server/book-analysis/work-pool';
import { analysisRequest } from '../src/features/book-graph/analysis-request';

const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };

test('worker pool fills freed slots while preserving source order', async () => {
  const slow = deferred(), third = deferred();
  let active = 0, peak = 0;
  const work = mapConcurrent([0, 1, 2, 3], 2, async n => {
    peak = Math.max(peak, ++active);
    if (n === 0) await slow.promise;
    if (n === 2) third.resolve();
    active--;
    return n;
  });
  await third.promise;
  assert.equal(active, 1, 'later work proceeds while the first request is pending');
  slow.resolve();
  assert.deepEqual(await work, [0, 1, 2, 3]);
  assert.equal(peak, 2);
});

test('worker pool drains active checkpoints and stops scheduling after failure', async () => {
  const pending = deferred(), started: number[] = [];
  let saved = false;
  const work = mapConcurrent([0, 1, 2, 3], 2, async n => {
    started.push(n);
    if (n === 0) throw new Error('provider unavailable');
    await pending.promise;
    saved = true;
    return n;
  });
  await Promise.resolve();
  pending.resolve();
  await assert.rejects(work, /provider unavailable/);
  assert.deepEqual(started, [0, 1]);
  assert.equal(saved, true);
});

test('analysis reconnects after dropped replies and proxy errors using identical requests', async () => {
  const requests: RequestInit[] = [], delays: number[] = [];
  const result = await analysisRequest('/job', {
    signal: new AbortController().signal, body: { sourceText: 'same immutable source' }, reconnect: () => {},
    wait: async ms => { delays.push(ms); },
    fetch: async (_url, init) => {
      requests.push(init!);
      if (requests.length === 1) throw new TypeError('Failed to fetch');
      if (requests.length === 2) return new Response('Bad gateway', { status: 502 });
      return Response.json({ status: 'running', key: 'existing-job' });
    },
  });
  assert.deepEqual(result, { status: 'running', key: 'existing-job' });
  assert.deepEqual(delays, [1000, 2000]);
  assert.equal(new Set(requests.map(r => r.body)).size, 1);
});

test('analysis does not retry authorization failures and cancellation stops reconnects', async () => {
  let count = 0;
  await assert.rejects(analysisRequest('/job', {
    signal: new AbortController().signal, reconnect: () => {},
    fetch: async () => { count++; return Response.json({ error: { message: 'Forbidden' } }, { status: 403 }); },
  }), /Forbidden/);
  assert.equal(count, 1);
  const controller = new AbortController();
  await assert.rejects(analysisRequest('/job', {
    signal: controller.signal, reconnect: () => { controller.abort(new Error('reader closed')); },
    fetch: async () => { throw new TypeError('Offline'); },
  }), /reader closed/);
});

test('cross-link repair identifies every invalid link in one response without weakening validation', async () => {
  const { validateSynthesis } = await import('../src/server/book-analysis/graph');
  const nodes = [{ id: 'a', chunkId: 'one' }, { id: 'b', chunkId: 'one' }, { id: 'c', chunkId: 'two' }] as Parameters<typeof validateSynthesis>[1];
  const value = { themes: [{ label: 'Theme', rationale: 'Grounded.', nodeIds: ['a', 'b', 'c'] }], identities: [{ label: 'Concept', nodeIds: ['a', 'b', 'c'] }], crossEdges: [{ source: 'a', target: 'b', type: 'supports' as const, rationale: 'Local.' }, { source: 'b', target: 'a', type: 'develops' as const, rationale: 'Local.' }] };
  assert.throws(() => validateSynthesis(value, nodes), /a->b, b->a/);
  assert.doesNotThrow(() => validateSynthesis({ ...value, crossEdges: [{ ...value.crossEdges[0], target: 'c' }] }, nodes));
  assert.throws(() => validateSynthesis({ ...value, crossEdges: [{ ...value.crossEdges[0], target: 'unknown' }] }, nodes), /Invalid cross-edge/);
});
