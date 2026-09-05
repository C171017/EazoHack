import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchProvider } from '../src/server/providers';
import { createIncoProvider } from '../src/server/providers/inco';
import { fixtureSelection, makeMockArtifact } from '../src/shared/fixtures';

const explanation = {title:'Read', explanation:'An explanation.', steps:['Read','Reflect'], assumptions:[]};
test('Inco routes all three methods and preserves validated artifacts and provenance', async t => {
  const oldKey = process.env.INCO_API_KEY;
  process.env.INCO_API_KEY = 'test-key';
  t.after(() => { if (oldKey === undefined) delete process.env.INCO_API_KEY; else process.env.INCO_API_KEY = oldKey; });
  for (const kind of ['interactive_ui','concept_diagram','interactive_panel'] as const) {
    const raw = kind === 'interactive_ui' ? explanation : kind === 'concept_diagram' ? {nodes:[{label:'A'},{label:'B'}], edges:[{sourceIndex:0,targetIndex:1,label:'relates'}],legend:'Reading'} : (makeMockArtifact('interactive_panel',fixtureSelection,'fixture').payload as {explorer:unknown}).explorer;
    t.mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
      assert.equal(url,'https://api.inco.ai/v1/chat/completions');
      assert.equal(init.redirect,'error');
      const body = JSON.parse(String(init.body));
      assert.equal(body.model,'glm-5.3-flash:fast');
      assert.equal(body.messages[0].role,'system');
      return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(raw)}}]});
    });
    const result = await createIncoProvider(kind).run(fixtureSelection,{routeRunId:'test'});
    assert.ok(result.ok);
    assert.equal(result.payload.provider,'inco');
    assert.equal(result.payload.kind,kind);
    assert.deepEqual(result.payload.anchorIds,fixtureSelection.anchorIds);
    assert.equal(dispatchProvider('real',[kind]),'vertex_ai');
  }
});

test('Inco handles missing keys, cancellation, HTTP errors and invalid output without exposing secrets', async t => {
  const oldKey = process.env.INCO_API_KEY;
  t.after(() => { if (oldKey === undefined) delete process.env.INCO_API_KEY; else process.env.INCO_API_KEY = oldKey; });
  const provider = createIncoProvider('interactive_ui');
  delete process.env.INCO_API_KEY;
  const missing = await provider.run(fixtureSelection,{routeRunId:'test'});
  assert.ok(!missing.ok && missing.error.code === 'not_configured');
  process.env.INCO_API_KEY = 'test-secret';
  for (const status of [401,402,429,500]) {
    t.mock.method(globalThis,'fetch',async () => new Response('test-secret',{status}));
    const result = await provider.run(fixtureSelection,{routeRunId:'test'});
    assert.ok(!result.ok);
    assert.equal(result.error.retryable,status >= 429);
    assert.ok(!JSON.stringify(result).includes('test-secret'));
  }
  for (const [content,finish_reason] of [['{}','stop'],[JSON.stringify(explanation),'length']]) {
    t.mock.method(globalThis,'fetch',async () => Response.json({choices:[{finish_reason,message:{content}}]}));
    const result = await provider.run(fixtureSelection,{routeRunId:'test'});
    assert.ok(!result.ok && result.error.code === 'invalid_output');
  }
  const result = await provider.run(fixtureSelection,{routeRunId:'test',signal:AbortSignal.abort()});
  assert.ok(!result.ok && result.error.code === 'cancelled');
});
