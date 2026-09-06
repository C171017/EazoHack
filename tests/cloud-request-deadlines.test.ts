import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { cloudRequest, CloudRequestError } from '../src/features/cloud/request';

for (const action of ['delete-account', 'analyze', 'resume']) {
  test(`${action} can finish after 30s, including body decoding, and releases its deadline`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const caller = new AbortController();
    let requestSignal!: AbortSignal;
    t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, init: RequestInit) => {
      requestSignal = init.signal!;
      assert.equal(new Headers(init.headers).get('x-eazo-owner'), 'owner');
      await new Promise(resolve => setTimeout(resolve, 40_000));
      const response = new Response();
      t.mock.method(response, 'json', async () => {
        await new Promise(resolve => setTimeout(resolve, 40_000));
        return { ok: true };
      });
      return response;
    });
    const request = cloudRequest(action, {}, 'owner', { signal: caller.signal });
    await setImmediate(); t.mock.timers.tick(40_000); await setImmediate();
    assert.equal(requestSignal.aborted, false);
    t.mock.timers.tick(40_000);
    assert.deepEqual(await request, { ok: true });
    assert.equal(getEventListeners(caller.signal, 'abort').length, 0);
    t.mock.timers.tick(120_000); caller.abort();
    assert.equal(requestSignal.aborted, false, 'completed request has no timer or caller listener');
  });

  test(`${action} remains bounded at 120s across fetch and body, without automatic retry`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const caller = new AbortController();
    let requestSignal!: AbortSignal;
    const fetchMock = t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, init: RequestInit) => {
      requestSignal = init.signal!;
      await new Promise(resolve => setTimeout(resolve, 70_000));
      const response = new Response();
      t.mock.method(response, 'json', () => new Promise<never>(() => {}));
      return response;
    });
    const rejected = assert.rejects(cloudRequest(action, {}, 'owner', { signal: caller.signal }), error => {
      assert.equal(error instanceof CloudRequestError, false);
      assert.equal((error as Error).name, 'TimeoutError'); return true;
    });
    await setImmediate(); t.mock.timers.tick(70_000); await setImmediate();
    t.mock.timers.tick(49_999); assert.equal(requestSignal.aborted, false);
    t.mock.timers.tick(1); await rejected;
    assert.equal(requestSignal.aborted, true);
    assert.equal(caller.signal.aborted, false);
    assert.equal(getEventListeners(caller.signal, 'abort').length, 0);
    assert.equal(fetchMock.mock.callCount(), 1);
  });
}

test('default action budgets apply to unchanged positional calls and query strings', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let requestSignal!: AbortSignal;
  t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, init: RequestInit) => {
    requestSignal = init.signal!;
    return new Promise<never>(() => {});
  });
  for (const [action, budget] of [
    ['delete-account', 120_000], ['analyze', 120_000], ['resume', 120_000],
    ['analyze?key=example', 120_000], ['session', 30_000], ['books', 30_000],
    ['export?cursor=analyze', 30_000], ['analyze-other', 30_000],
  ] as const) {
    const rejected = assert.rejects(cloudRequest(action, {}, 'owner'), { name: 'TimeoutError' });
    await setImmediate();
    t.mock.timers.tick(budget - 1); assert.equal(requestSignal.aborted, false);
    t.mock.timers.tick(1); await rejected;
    assert.equal(requestSignal.aborted, true);
  }
});

test('explicit timeout overrides both action defaults, including zero and longer budgets', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let requestSignal!: AbortSignal;
  t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, init: RequestInit) => {
    requestSignal = init.signal!; return new Promise<never>(() => {});
  });
  for (const [action, timeoutMs] of [['delete-account', 5000], ['analyze', 0], ['resume', 180_000], ['session', 60_000]] as const) {
    const rejected = assert.rejects(cloudRequest(action, {}, 'owner', { timeoutMs }), { name: 'TimeoutError' });
    await setImmediate();
    if (timeoutMs) { t.mock.timers.tick(timeoutMs - 1); assert.equal(requestSignal.aborted, false); }
    t.mock.timers.tick(timeoutMs ? 1 : 0); await rejected;
    assert.equal(requestSignal.aborted, true);
  }
});

test('caller cancellation remains immediate for long actions and preserves its reason', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Promise<never>(() => {}));
  for (const action of ['delete-account', 'analyze', 'resume']) {
    const caller = new AbortController(), reason = new Error('closed');
    const rejected = assert.rejects(cloudRequest(action, {}, 'owner', { signal: caller.signal }), error => error === reason);
    await setImmediate(); caller.abort(reason); await rejected;
    assert.equal(getEventListeners(caller.signal, 'abort').length, 0);
  }
  assert.equal(fetchMock.mock.callCount(), 3);
});
