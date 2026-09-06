import test from 'node:test';
import assert from 'node:assert/strict';
import { readObjectBody } from '../src/server/cloud/object-body';
import { RequestBodyError } from '../src/server/http';

test('oversized declared objects are cancelled before pulling body bytes', async () => {
  let pulls = 0, cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { pulls++; controller.enqueue(new Uint8Array(8)); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  await assert.rejects(readObjectBody(new Response(body, { headers: { 'content-length': '1000' } }), 10, 'Too large'),
    error => error instanceof RequestBodyError && error.status === 400);
  assert.equal(pulls, 0); assert.equal(cancelled, true);
});

test('missing or understated content length cannot bypass the streaming limit', async () => {
  for (const headers of [{}, { 'content-length': '1' }]) {
    let pulls = 0, cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { pulls++; controller.enqueue(new Uint8Array(6)); },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    await assert.rejects(readObjectBody(new Response(body, { headers }), 10, 'Analysis input too large'), /Analysis input too large/);
    assert.equal(pulls, 2); assert.equal(cancelled, true);
  }
});

test('an exact-limit object preserves every original byte', async () => {
  const bytes = Buffer.from('中文\ntext');
  assert.deepEqual(await readObjectBody(new Response(bytes), bytes.length, 'Too large'), bytes);
});
