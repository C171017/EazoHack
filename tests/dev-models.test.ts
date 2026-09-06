import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_DEV_MODELS, DevModelsSchema, isLocalDevelopment, readDevModels, saveDevModels } from '../src/server/providers/dev-models';
import { routeProviderName } from '../src/server/providers';
import { analysisModel } from '../src/server/book-analysis/vertex';
import { GET, POST } from '../src/app/api/dev/models/route';

test('development model choices reject unsupported providers and extra fields', () => {
  assert.ok(DevModelsSchema.safeParse(DEFAULT_DEV_MODELS).success);
  assert.ok(!DevModelsSchema.safeParse({ ...DEFAULT_DEV_MODELS, generated_image: 'vertex_ai' }).success);
  assert.ok(!DevModelsSchema.safeParse({ ...DEFAULT_DEV_MODELS, apiKey: 'secret' }).success);
});

test('production refuses both settings and local panel assets', async () => {
  const previous = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: 'production' });
  try {
    assert.deepEqual(readDevModels(), DEFAULT_DEV_MODELS);
    for (const kind of ['interactive_ui', 'concept_diagram', 'interactive_panel'] as const) assert.equal(routeProviderName(kind), 'vertex_ai');
    assert.equal(analysisModel(), process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash');
    assert.throws(() => saveDevModels(DEFAULT_DEV_MODELS));
    for (const url of ['http://localhost:3000/api/dev/models', 'http://localhost:3000/api/dev/models?asset=panel']) assert.equal((await GET(new Request(url))).status, 404);
    assert.equal((await POST(new Request('http://localhost:3000/api/dev/models', { method: 'POST' }))).status, 404);
  } finally { if (previous === undefined) Reflect.deleteProperty(process.env, "NODE_ENV"); else Object.assign(process.env, { NODE_ENV: previous }); }
});

test('development rejects remote hosts and cross-origin writes', async () => {
  const previous = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: 'development' });
  try {
    assert.equal(isLocalDevelopment(new Request('http://localhost:3000/api/dev/models')), true);
    assert.equal(isLocalDevelopment(new Request('https://example.com/api/dev/models')), false);
    assert.equal(isLocalDevelopment(new Request('http://localhost:3000/api/dev/models', { headers: { origin: 'https://evil.test' } })), false);
    assert.equal(isLocalDevelopment(new Request('http://localhost:3000/api/dev/models', { headers: { host: 'evil.test' } })), false);
    assert.equal((await POST(new Request('http://localhost:3000/api/dev/models', { method: 'POST' }))).status, 403);
    assert.equal((await POST(new Request('http://localhost:3000/api/dev/models', { method: 'POST', headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json' }, body: '{"unsupported":true}' }))).status, 400);
  } finally { if (previous === undefined) Reflect.deleteProperty(process.env, "NODE_ENV"); else Object.assign(process.env, { NODE_ENV: previous }); }
});
