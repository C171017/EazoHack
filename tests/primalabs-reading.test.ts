import assert from 'node:assert/strict';
import test from 'node:test';
import { createProvider, dispatchProvider, routeProviderName } from '../src/server/providers';
import { createPrimaLabsProvider } from '../src/server/providers/primalabs';
import { fixtureSelection, makeMockArtifact } from '../src/shared/fixtures';

test('MiMo powers the three reading aids while image routing stays unchanged', async t => {
  const oldKey = process.env.PRIMALABS_API_KEY;
  process.env.PRIMALABS_API_KEY = 'test-key';
  t.after(() => { if (oldKey === undefined) delete process.env.PRIMALABS_API_KEY; else process.env.PRIMALABS_API_KEY = oldKey; });
  const imageProvider = routeProviderName('generated_image');
  assert.ok(imageProvider === 'fal' || imageProvider === 'bfl');
  assert.equal(dispatchProvider('real',['interactive_ui','generated_image']), 'mixed');
  for (const kind of ['interactive_ui','concept_diagram','interactive_panel'] as const) {
    const raw = kind === 'interactive_ui'
      ? {title:'Read', explanation:'An explanation.', steps:['Read','Reflect'], assumptions:[]}
      : kind === 'concept_diagram'
        ? {nodes:[{label:'A'},{label:'B'}], edges:[{sourceIndex:0,targetIndex:1,label:'relates'}],legend:'Reading'}
        : (makeMockArtifact('interactive_panel',fixtureSelection,'fixture').payload as {explorer:unknown}).explorer;
    t.mock.method(globalThis,'fetch',async (url: unknown, init: RequestInit) => {
      assert.equal(url,'https://api.primalabs.ai/v1/chat/completions');
      const request = JSON.parse(String(init.body));
      assert.equal(request.model,'primalabs-ai/MiMo-V2.6-Pro-RL');
      assert.equal(request.response_format.type,'json_schema');
      assert.equal(request.response_format.json_schema.strict,true);
      return Response.json({model:request.model,usage:{prompt_tokens:100,completion_tokens:50},choices:[{finish_reason:'stop',message:{content:JSON.stringify(raw)}}]});
    });
    assert.equal(routeProviderName(kind),'primalabs');
    const result = await createProvider(kind,'real').run(fixtureSelection,{routeRunId:'test'});
    assert.ok(result.ok, JSON.stringify(result));
    assert.equal(result.payload.provider,'primalabs');
    assert.equal(result.payload.kind,kind);
    assert.deepEqual(result.payload.anchorIds,fixtureSelection.anchorIds);
  }
});

test('MiMo reading aid fails closed for missing key, empty balance, and cancellation', async t => {
  const oldKey = process.env.PRIMALABS_API_KEY;
  t.after(() => { if (oldKey === undefined) delete process.env.PRIMALABS_API_KEY; else process.env.PRIMALABS_API_KEY = oldKey; });
  const provider = createPrimaLabsProvider('interactive_ui');
  delete process.env.PRIMALABS_API_KEY;
  const missing = await provider.run(fixtureSelection,{routeRunId:'test'});
  assert.ok(!missing.ok && missing.error.code === 'not_configured');
  process.env.PRIMALABS_API_KEY = 'test-secret';
  t.mock.method(globalThis,'fetch',async () => new Response('test-secret',{status:402}));
  const unpaid = await provider.run(fixtureSelection,{routeRunId:'test'});
  assert.ok(!unpaid.ok && unpaid.error.code === 'provider_failed');
  assert.ok(!JSON.stringify(unpaid).includes('test-secret'));
  const cancelled = await provider.run(fixtureSelection,{routeRunId:'test',signal:AbortSignal.abort()});
  assert.ok(!cancelled.ok && cancelled.error.code === 'cancelled');
});
