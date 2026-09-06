import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { withRequestDeadline } from '../src/features/browser/abort';
import { analysisRequest } from '../src/features/book-graph/analysis-request';
import { cloudRequest, CloudRequestError } from '../src/features/cloud/request';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** Deterministic deadlines; no real fetches or sleeping for retry timers. */
function deadlines(t: TestContext) {
  let nextId = 0;
  const timers = new Map<number, { callback: () => void; ms: number | undefined }>();
  t.mock.method(globalThis, 'setTimeout', (callback: () => void, ms?: number) => {
    const id = ++nextId; timers.set(id, { callback, ms }); return id;
  });
  t.mock.method(globalThis, 'clearTimeout', (id: number) => { timers.delete(id); });
  return {
    timers,
    fire(ms: number) {
      const entry = [...timers].find(([, timer]) => timer.ms === ms);
      assert.ok(entry, `expected a ${ms}ms timer`);
      timers.delete(entry[0]); entry[1].callback();
    },
    clean(signal?: AbortSignal) {
      assert.equal(timers.size, 0, 'deadline/backoff timers released');
      if (signal) assert.equal(getEventListeners(signal, 'abort').length, 0, 'caller listeners released');
    },
  };
}

function bodyResponse(json: () => Promise<unknown>, status = 200): Response {
  return { ok: status < 400, status, json } as Response;
}

test('controller helper and both clients work without newer AbortSignal methods', async t => {
  const clock = deadlines(t);
  for (const name of ['any', 'timeout'] as const) {
    t.mock.method(AbortSignal, name, () => { throw new Error(`AbortSignal.${name} unavailable`); });
  }
  t.mock.method(AbortSignal.prototype, 'throwIfAborted', () => { throw new Error('throwIfAborted unavailable'); });
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: true }));
  const caller = new AbortController();
  assert.equal(await withRequestDeadline(async () => 42, { signal: caller.signal }), 42);
  assert.deepEqual(await analysisRequest('/job', { signal: caller.signal, reconnect: () => assert.fail('unexpected retry') }), { ok: true });
  assert.deepEqual(await cloudRequest('session'), { ok: true });
  clock.clean(caller.signal);
});

for (const outcome of ['success', 'sync failure', 'async failure'] as const) {
  test(`helper cleans timers and listeners after ${outcome}`, async t => {
    const clock = deadlines(t), caller = new AbortController(), failure = new TypeError('transport');
    let composed!: AbortSignal;
    const request = withRequestDeadline(signal => {
      composed = signal;
      assert.equal(clock.timers.size, 1);
      assert.equal(getEventListeners(caller.signal, 'abort').length, 1);
      if (outcome === 'sync failure') throw failure;
      return outcome === 'async failure' ? Promise.reject(failure) : Promise.resolve('done');
    }, { signal: caller.signal });
    if (outcome === 'success') assert.equal(await request, 'done');
    else await assert.rejects(request, error => error === failure);
    clock.clean(caller.signal);
    caller.abort();
    assert.equal(composed.aborted, false, 'completed request detached from caller');
  });
}

test('already-aborted callers skip all operations and preserve arbitrary abort reasons', async t => {
  const clock = deadlines(t);
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => assert.fail('fetch must not run'));
  for (const reason of [new Error('closed'), 'closed', null, undefined]) {
    const caller = new AbortController(); caller.abort(reason);
    const check = (error: unknown) => error === caller.signal.reason;
    await assert.rejects(withRequestDeadline(async () => assert.fail('operation must not run'), { signal: caller.signal }), check);
    await assert.rejects(cloudRequest('session', undefined, undefined, { signal: caller.signal }), check);
    await assert.rejects(analysisRequest('/job', { signal: caller.signal, reconnect: () => assert.fail('retry must not run') }), check);
    clock.clean(caller.signal);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('caller abort without a reason property falls back to AbortError', async t => {
  const clock = deadlines(t), caller = new AbortController();
  Object.defineProperty(caller.signal, 'reason', { value: undefined });
  const request = withRequestDeadline(() => new Promise<never>(() => {}), { signal: caller.signal });
  const rejected = assert.rejects(request, { name: 'AbortError' });
  await setImmediate(); caller.abort(); await rejected;
  clock.clean(caller.signal);
});

test('helper rejects invalid deadlines instead of disabling or overflowing the timer', async t => {
  const clock = deadlines(t), caller = new AbortController();
  for (const timeoutMs of [-1, Infinity, NaN, 2_147_483_648]) {
    await assert.rejects(withRequestDeadline(async () => assert.fail('operation must not run'), { signal: caller.signal, timeoutMs }), RangeError);
    clock.clean(caller.signal);
  }
});

test('cloud preserves all positional forms, falsy bodies, caching, and owner identity headers', async t => {
  const clock = deadlines(t), requests: { url: string; init: RequestInit }[] = [];
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, init: RequestInit) => {
    requests.push({ url: String(url), init }); return Response.json({ id: 'server-account' });
  });
  const calls: [string, unknown?, string?][] = [
    ['session'], ['open', { source: null }], ['books', undefined, 'account-a'],
    ['snapshot', { revision: 2 }, 'account-b'], ['open', null], ['open', false], ['open', 0], ['open', ''],
  ];
  for (const args of calls) {
    assert.deepEqual(await cloudRequest(...args), { id: 'server-account' });
    const { url, init } = requests.at(-1)!;
    assert.equal(url, '/api/cloud/' + args[0]);
    assert.equal(init.method, args[1] === undefined ? 'GET' : 'POST');
    assert.equal(init.body, args[1] === undefined ? undefined : JSON.stringify(args[1]));
    assert.equal(init.cache, 'no-store');
    assert.equal(new Headers(init.headers).get('x-eazo-owner'), args[2] ?? null);
    assert.equal(new Headers(init.headers).get('Content-Type'), args[1] === undefined ? null : 'application/json');
    assert.equal(init.signal?.aborted, false);
    clock.clean();
  }
});

for (const status of [401, 403, 404, 409, 500]) {
  test(`cloud preserves HTTP ${status} classification and details`, async t => {
    const clock = deadlines(t), caller = new AbortController();
    const details = { error: { message: 'Account changed or request rejected' }, current: { revision: 3 } };
    t.mock.method(globalThis, 'fetch', async () => Response.json(details, { status }));
    await assert.rejects(cloudRequest('snapshot', {}, 'expected-account', { signal: caller.signal }), error => {
      assert.ok(error instanceof CloudRequestError);
      assert.equal(error.status, status); assert.equal(error.message, details.error.message);
      assert.deepEqual(error.details, details); return true;
    });
    clock.clean(caller.signal);
  });
}

test('cloud preserves fallback HTTP message and raw transport/body errors', async t => {
  const clock = deadlines(t), caller = new AbortController();
  const transport = new TypeError('offline'), body = new SyntaxError('bad JSON');
  for (const failure of [transport, body]) {
    for (const status of [200, 403]) {
      t.mock.method(globalThis, 'fetch', async () => {
        if (failure === transport) throw failure;
        return bodyResponse(async () => { throw failure; }, status);
      });
      await assert.rejects(cloudRequest('session', undefined, 'owner', { signal: caller.signal }), error => {
        assert.equal(error, failure); assert.equal(error instanceof CloudRequestError, false); return true;
      });
      clock.clean(caller.signal);
    }
  }
  t.mock.method(globalThis, 'fetch', async () => Response.json({}, { status: 500 }));
  await assert.rejects(cloudRequest('session'), { message: 'Cloud request failed.', status: 500 });
  clock.clean();
});

for (const stage of ['fetch', 'body', 'error body'] as const) {
  for (const cause of ['timeout', 'caller'] as const) {
    test(`cloud ${cause} bounds ${stage}, preserves identity classification, and cleans up`, async t => {
      const clock = deadlines(t), caller = new AbortController(), pending = deferred<never>();
      let composed!: AbortSignal, decoding = false;
      const fetchMock = t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, init: RequestInit) => {
        composed = init.signal!;
        if (stage === 'fetch') return pending.promise;
        return bodyResponse(() => { decoding = true; return pending.promise; }, stage === 'error body' ? 403 : 200);
      });
      const reason = new Error('reader closed');
      const request = cloudRequest('session', undefined, 'owner', { signal: caller.signal, timeoutMs: 123 });
      const rejected = assert.rejects(request, error => {
        assert.equal(error instanceof CloudRequestError, false, 'cancellation must not masquerade as an account change');
        if (cause === 'caller') assert.equal(error, reason);
        else assert.equal((error as Error).name, 'TimeoutError');
        return true;
      });
      await setImmediate();
      assert.equal(decoding, stage !== 'fetch');
      if (cause === 'caller') caller.abort(reason); else clock.fire(123);
      await rejected;
      assert.equal(composed.aborted, true);
      assert.equal(caller.signal.aborted, cause === 'caller');
      assert.equal(fetchMock.mock.callCount(), 1, 'cloud requests never retry automatically');
      clock.clean(caller.signal);
      pending.reject(new Error('late transport/body failure'));
      await setImmediate(); // A late failure is handled by the settled race.
    });
  }
}

test('cloud default deadline is 30 seconds even for unchanged calls', async t => {
  const clock = deadlines(t);
  t.mock.method(globalThis, 'fetch', () => new Promise<never>(() => {}));
  const rejected = assert.rejects(cloudRequest('session'), { name: 'TimeoutError' });
  await setImmediate(); clock.fire(30_000); await rejected; clock.clean();
});

for (const stage of ['fetch', 'body', 'error body'] as const) {
  test(`analysis caller abort during ${stage} stops without reconnecting`, async t => {
    const clock = deadlines(t), caller = new AbortController();
    let composed!: AbortSignal;
    const request = analysisRequest('/job', {
      signal: caller.signal, reconnect: () => assert.fail('cancellation must not retry'),
      fetch: async (_url, init) => {
        composed = init!.signal!;
        if (stage === 'fetch') return new Promise<never>(() => {});
        return bodyResponse(() => new Promise<never>(() => {}), stage === 'error body' ? 502 : 200);
      },
    });
    const rejected = assert.rejects(request, { name: 'AbortError' });
    await setImmediate(); caller.abort(); await rejected;
    assert.equal(composed.aborted, true); clock.clean(caller.signal);
  });
}

for (const stage of ['fetch', 'body', 'error body'] as const) {
  test(`analysis ${stage} deadlines retry at most eight attempts with cleanup before backoff`, async t => {
    const clock = deadlines(t), caller = new AbortController();
    const signals: AbortSignal[] = [], attempts: number[] = [], delays: number[] = [];
    const request = analysisRequest('/job', {
      signal: caller.signal, reconnect: attempt => { clock.clean(caller.signal); attempts.push(attempt); },
      wait: async ms => { clock.clean(caller.signal); delays.push(ms); },
      fetch: async (_url, init) => {
        signals.push(init!.signal!);
        if (stage === 'fetch') return new Promise<never>(() => {});
        return bodyResponse(() => new Promise<never>(() => {}), stage === 'error body' ? 502 : 200);
      },
    });
    const rejected = assert.rejects(request, { name: 'TimeoutError' });
    for (let i = 0; i < 8; i++) { await setImmediate(); clock.fire(30_000); }
    await rejected;
    assert.equal(signals.length, 8); assert.equal(new Set(signals).size, 8);
    assert.ok(signals.every(signal => signal.aborted));
    assert.deepEqual(attempts, [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(delays, [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    clock.clean(caller.signal);
  });
}

test('analysis preserves transport/body retry, stable POST content, and HTTP classifications', async t => {
  const clock = deadlines(t), caller = new AbortController(), requests: RequestInit[] = [];
  const result = await analysisRequest('/job', {
    signal: caller.signal, body: { sourceText: 'immutable' }, reconnect: () => clock.clean(caller.signal),
    wait: async () => clock.clean(caller.signal),
    fetch: async (_url, init) => {
      requests.push(init!);
      if (requests.length === 1) throw new TypeError('offline');
      if (requests.length === 2) return bodyResponse(async () => { throw new SyntaxError('bad JSON'); });
      if (requests.length === 3) return new Response('bad gateway', { status: 502 });
      return Response.json({ status: 'running' });
    },
  });
  assert.deepEqual(result, { status: 'running' });
  assert.equal(requests.length, 4); assert.equal(new Set(requests.map(init => init.body)).size, 1);
  assert.ok(requests.every(init => init.method === 'POST' && new Headers(init.headers).get('Content-Type') === 'application/json'));
  for (const status of [401, 403, 404, 503]) {
    await assert.rejects(analysisRequest('/job', {
      signal: caller.signal, reconnect: () => assert.fail('permanent error must not retry'),
      fetch: async () => Response.json({ error: { message: 'unavailable' } }, { status }),
    }), { message: 'unavailable', status });
    clock.clean(caller.signal);
  }
});

test('analysis stops on transport AbortError even when caller signal remains active', async t => {
  const clock = deadlines(t), caller = new AbortController();
  await assert.rejects(analysisRequest('/job', {
    signal: caller.signal, reconnect: () => assert.fail('AbortError must not retry'),
    fetch: async () => { throw new DOMException('aborted', 'AbortError'); },
  }), { name: 'AbortError' });
  clock.clean(caller.signal);
});

test('analysis cancellation during backoff releases the wait timer and listener', async t => {
  const clock = deadlines(t), caller = new AbortController();
  let calls = 0;
  const request = analysisRequest('/job', {
    signal: caller.signal, reconnect: () => clock.clean(caller.signal),
    fetch: async () => { calls++; throw new TypeError('offline'); },
  });
  const rejected = assert.rejects(request, { name: 'AbortError' });
  await setImmediate();
  assert.deepEqual([...clock.timers.values()].map(timer => timer.ms), [1000]);
  caller.abort(); await rejected;
  assert.equal(calls, 1); clock.clean(caller.signal);
});

test('analysis successful backoff removes its listener before the next request', async t => {
  const clock = deadlines(t), caller = new AbortController();
  let calls = 0;
  const request = analysisRequest('/job', {
    signal: caller.signal, reconnect: () => clock.clean(caller.signal),
    fetch: async () => {
      assert.equal(getEventListeners(caller.signal, 'abort').length, 1);
      if (++calls === 1) throw new TypeError('offline');
      return Response.json({ ready: true });
    },
  });
  await setImmediate(); clock.fire(1000);
  assert.deepEqual(await request, { ready: true });
  clock.clean(caller.signal);
});
