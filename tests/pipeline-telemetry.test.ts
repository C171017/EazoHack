import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleAuth } from 'google-auth-library';
import { z } from 'zod';
import { withPipelineTelemetry, pipelineStage, measurePipeline, measureValidation, countPipeline, recordProviderUsage, type PipelineEvent } from '../src/server/book-analysis/telemetry';
import { generateStructured } from '../src/server/book-analysis/vertex';
import { readJson, writeJson, withJsonStore } from '../src/server/book-analysis/json-store';

test('concurrent runs keep stage, cache and usage counters isolated without logging private data', async () => {
  const events: PipelineEvent[] = [];
  await Promise.all([1, 2].map(count => withPipelineTelemetry(() => pipelineStage('extraction', async () => {
    const data = new Map<string, unknown>();
    await withJsonStore({ read: async key => data.get(key) ?? null, write: async (key, value) => { data.set(key, value); }, list: async () => [] }, async () => {
      await readJson('/private/book/title');
      await writeJson('/private/book/title', { source: 'secret passage' });
      await readJson('/private/book/title');
      recordProviderUsage({ totalTokenCount: count, source: 'secret passage', promptTokenCount: -1 });
      countPipeline('checkpoint.hit');
      measureValidation(() => ({ source: 'secret passage' }));
    });
  }), { enabled: true, write: event => events.push(event) })));
  const runs = events.filter(event => event.event === 'run');
  assert.equal(runs.length, 2); assert.equal(new Set(runs.map(event => event.run)).size, 2);
  assert.deepEqual(runs.map(event => event.tokens.totalTokenCount).sort(), [1, 2]);
  for (const run of runs) {
    assert.equal(run.counts['storage.hit'], 1); assert.equal(run.counts['storage.miss'], 1);
    assert.equal(run.counts['checkpoint.hit'], 1); assert.equal(run.usageResponses, 1);
  }
  assert(events.some(event => event.event === 'timing' && event.operation === 'validation' && event.stage === 'extraction'));
  assert.doesNotMatch(JSON.stringify(events), /secret passage|private\/book|"promptTokenCount":-1/);
});

test('disabled or failed telemetry cannot change task results or errors', async () => {
  const events: PipelineEvent[] = [], error = new Error('private provider reply');
  const result = await withPipelineTelemetry(() => measurePipeline('provider', async () => 42), { enabled: false, write: event => events.push(event) });
  assert.equal(result, 42); assert.equal(events.length, 0);
  await assert.rejects(withPipelineTelemetry(() => measurePipeline('provider', async () => { throw error; }), {
    enabled: true, write: () => { throw new Error('logging failed'); },
  }), reason => reason === error);
  await assert.rejects(withPipelineTelemetry(() => measurePipeline('provider', async () => { throw error; }), {
    enabled: true, write: event => events.push(event),
  }), reason => reason === error);
  assert(events.some(event => event.event === 'run' && event.outcome === 'error'));
  assert.doesNotMatch(JSON.stringify(events), /private provider reply/);
});

test('incomplete and rejected provider responses retain usage before validation fails', async t => {
  const oldProject = process.env.GOOGLE_CLOUD_PROJECT, oldVercel = process.env.VERCEL;
  process.env.GOOGLE_CLOUD_PROJECT = 'test-project'; delete process.env.VERCEL;
  t.after(() => {
    if (oldProject === undefined) delete process.env.GOOGLE_CLOUD_PROJECT; else process.env.GOOGLE_CLOUD_PROJECT = oldProject;
    if (oldVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = oldVercel;
  });
  t.mock.method(GoogleAuth.prototype, 'getAccessToken', async () => 'private-test-token');
  const replies = [
    { candidates: [{ finishReason: 'MAX_TOKENS' }], usageMetadata: { totalTokenCount: 11 } },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not JSON private passage' }] } }], usageMetadata: { totalTokenCount: 7 } },
    { error: { message: 'private failure' }, usageMetadata: { totalTokenCount: 3 } },
  ];
  t.mock.method(globalThis, 'fetch', async () => {
    const reply = replies.shift()!;
    return Response.json(reply, { status: 'error' in reply ? 429 : 200 });
  });
  const events: PipelineEvent[] = [];
  await withPipelineTelemetry(async () => {
    for (let i = 0; i < 3; i++) await assert.rejects(generateStructured('private prompt', 'private source', z.object({ ok: z.boolean() })));
    // A restored checkpoint is counted but its historical usage is not added.
    countPipeline('checkpoint.hit'); recordProviderUsage(undefined);
  }, { enabled: true, write: event => events.push(event) });
  const run = events.find(event => event.event === 'run')!;
  assert.equal(run.tokens.totalTokenCount, 21); assert.equal(run.usageResponses, 3); assert.equal(run.missingUsageResponses, 1);
  assert.equal(events.filter(event => event.event === 'timing' && event.operation === 'auth').length, 3);
  assert.equal(events.filter(event => event.event === 'timing' && event.operation === 'provider').length, 3);
  assert.doesNotMatch(JSON.stringify(events), /private|not JSON/);
});
