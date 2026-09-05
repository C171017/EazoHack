import assert from 'node:assert/strict';
import test from 'node:test';
import { createBflImageProvider, BFL_IMAGE_MODEL, BFL_IMAGE_SETTINGS } from '../src/server/providers/bfl-klein';
import { dispatchProvider, imageProviderName } from '../src/server/providers';
import { dispatchRoutePlan } from '../src/server/dispatcher';
import { createRoutePlan } from '../src/server/routing';
import { fixtureSelection } from '../src/shared/fixtures';
import { illustrationPrompt } from '../src/server/providers/illustration-prompt';

const context = { routeRunId: 'bfl-test' };
const polling = 'https://api.eu.bfl.ai/v1/get_result?id=test';
const delivery = 'https://delivery.eu.bfl.ai/test.jpeg?token=signed';
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
function successfulFetch(): typeof fetch {
  return async (url, init) => {
    if (init?.method === 'POST') return Response.json({ id: 'test', polling_url: polling });
    if (url === polling) return Response.json({ status: 'Ready', result: { sample: delivery } });
    return new Response(jpeg);
  };
}

test('BFL submits once, polls, and embeds the image without exposing credentials or signed URLs', async () => {
  let submissions = 0, polls = 0;
  const result = await createBflImageProvider({ key: () => 'test-secret', pollIntervalMs: 0, fetch: async (url, init) => {
    assert.equal(init?.redirect, 'error');
    if (init?.method === 'POST') {
      submissions++;
      assert.equal(url, `https://api.bfl.ai/v1/${BFL_IMAGE_MODEL}`);
      assert.equal(new Headers(init.headers).get('x-key'), 'test-secret');
      const body = JSON.parse(String(init.body));
      assert.deepEqual(body, { ...BFL_IMAGE_SETTINGS, prompt: illustrationPrompt(fixtureSelection), seed: body.seed });
      assert.ok(Number.isInteger(body.seed));
      return Response.json({ id: 'test', polling_url: polling });
    }
    if (url === polling) {
      polls++;
      return Response.json(polls === 1 ? { status: 'Pending' } : { status: 'Ready', result: { sample: delivery } });
    }
    assert.equal(url, delivery);
    assert.equal(new Headers(init?.headers).has('x-key'), false);
    return new Response(jpeg);
  } }).run(fixtureSelection, context);
  assert.ok(result.ok);
  assert.equal(submissions, 1);
  assert.equal(polls, 2);
  assert.equal(result.payload.provider, 'bfl');
  assert.deepEqual(result.payload.anchorIds, fixtureSelection.anchorIds);
  assert.ok(!JSON.stringify(result).includes('test-secret'));
  assert.ok(!JSON.stringify(result).includes('token=signed'));
});

test('BFL preflight rejects missing key, long selections, and cancellation without a request', async () => {
  const fetch: typeof globalThis.fetch = async () => { throw new Error('Must not call'); };
  for (const [key, selection, signal, code] of [
    ['', fixtureSelection, undefined, 'not_configured'],
    ['key', { ...fixtureSelection, selectedText: 'x'.repeat(12001) }, undefined, 'invalid_input'],
    ['key', fixtureSelection, AbortSignal.abort(), 'cancelled'],
  ] as const) {
    const result = await createBflImageProvider({ key: () => key, fetch }).run(selection, { ...context, signal });
    assert.ok(!result.ok && result.error.code === code);
  }
});

test('BFL rejects untrusted polling and delivery hosts before fetching them', async () => {
  for (const unsafe of ['https://localhost/private', 'https://api.bfl.ai.evil.test/v1/get_result', 'http://api.bfl.ai/v1/get_result', 'https://api.bfl.ai:123/v1/get_result']) {
    let calls = 0;
    const result = await createBflImageProvider({ key: () => 'key', pollIntervalMs: 0, fetch: async () => {
      calls++;
      return Response.json({ id: 'test', polling_url: unsafe });
    } }).run(fixtureSelection, context);
    assert.ok(!result.ok && result.error.code === 'invalid_output');
    assert.equal(calls, 1);
  }
  let calls = 0;
  const result = await createBflImageProvider({ key: () => 'key', pollIntervalMs: 0, fetch: async () => {
    calls++;
    return Response.json(calls === 1 ? { id: 'test', polling_url: polling } : { status: 'Ready', result: { sample: 'https://localhost/private' } });
  } }).run(fixtureSelection, context);
  assert.ok(!result.ok && result.error.code === 'invalid_output');
  assert.equal(calls, 2);
});

test('BFL HTTP errors do not leak upstream details or repeat charged submissions', async () => {
  for (const status of [401, 402, 403, 422, 429, 500]) {
    let calls = 0;
    const result = await createBflImageProvider({ key: () => 'secret', fetch: async () => {
      calls++; return Response.json({ error: 'secret' }, { status });
    } }).run(fixtureSelection, context);
    assert.ok(!result.ok);
    assert.equal(result.error.retryable, status === 429 || status >= 500);
    assert.equal(calls, 1);
    assert.ok(!JSON.stringify(result).includes('secret'));
  }
});

test('BFL rejects moderated, malformed, oversized and non-image responses', async () => {
  for (const scenario of ['moderated', 'malformed', 'oversized', 'not-image']) {
    const fetcher = successfulFetch();
    const result = await createBflImageProvider({ key: () => 'key', pollIntervalMs: 0, fetch: async (url, init) => {
      if (url === polling && scenario === 'moderated') return Response.json({ status: 'Content Moderated' });
      if (url === polling && scenario === 'malformed') return Response.json({ status: 'Ready' });
      if (url === delivery) return new Response(scenario === 'oversized' ? Buffer.alloc(4_000_001) : 'not an image');
      return fetcher(url, init);
    } }).run(fixtureSelection, context);
    assert.ok(!result.ok);
  }
});

test('BFL timeout stops pending polling without resubmitting', async () => {
  let posts = 0;
  const result = await createBflImageProvider({ key: () => 'key', timeoutMs: 20, pollIntervalMs: 1, fetch: async (_url, init) => {
    if (init?.method === 'POST') { posts++; return Response.json({ id: 'test', polling_url: polling }); }
    return Response.json({ status: 'Pending' });
  } }).run(fixtureSelection, context);
  assert.ok(!result.ok && result.error.message.includes('timed out'));
  assert.equal(posts, 1);
});

test('server configuration selects BFL and dispatcher retains BFL provenance', async () => {
  const previous = process.env.IMAGE_PROVIDER;
  process.env.IMAGE_PROVIDER = 'bfl';
  try {
    assert.equal(imageProviderName(), 'bfl');
    assert.equal(dispatchProvider('real', ['generated_image']), 'bfl');
    assert.equal(dispatchProvider('real', ['generated_image', 'interactive_ui']), 'mixed');
    const result = await dispatchRoutePlan({ selection: fixtureSelection, mode: 'real', plan: createRoutePlan({ selection: fixtureSelection, routes: ['generated_image'], mode: 'real' }) }, {
      providerFactory: () => createBflImageProvider({ key: () => 'key', pollIntervalMs: 0, fetch: successfulFetch() }),
    });
    assert.equal(result.provider, 'bfl');
    assert.equal(result.artifacts[0]?.provider, 'bfl');
  } finally {
    if (previous === undefined) delete process.env.IMAGE_PROVIDER;
    else process.env.IMAGE_PROVIDER = previous;
  }
});
