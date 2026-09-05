import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { createFalImageProvider, FAL_IMAGE_SETTINGS } from '../src/server/providers/fal-z-image';
import { illustrationPrompt } from '../src/server/providers/illustration-prompt';
import { fixtureSelection, fixtureAnchors, makeMockArtifact } from '../src/shared/fixtures';
import { dispatchRoutePlan, retryRoutePlan } from '../src/server/dispatcher';
import { createRoutePlan } from '../src/server/routing';
import { createWorkspaceRepository, WorkspaceSnapshotSchema } from '../src/features/persistence';
import { placementsFor } from '../src/features/reader/artifact-placement';

const response = () => ({images:[{url:'data:image/jpeg;base64,/9j/2Q==',width:1024,height:768}],seed:42,has_nsfw_concepts:[false]});
const stub = (body: unknown = response(), status = 200): typeof fetch => async () => Response.json(body, {status});
const context = {routeRunId:'image-test'};

test('fal sends one bounded, passage-grounded request and preserves source and prompt metadata through storage', async () => {
  let calls = 0;
  const provider = createFalImageProvider({key:()=> 'test-secret',fetch:async (url, init) => {
    calls++;
    assert.equal(url,'https://fal.run/fal-ai/z-image/turbo');
    assert.equal(new Headers(init?.headers).get('authorization'),'Key test-secret');
    assert.equal(init?.redirect,'error');
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body, {...FAL_IMAGE_SETTINGS,prompt:illustrationPrompt(fixtureSelection)});
    assert.ok(body.prompt.includes(fixtureSelection.selectedText));
    return Response.json(response());
  }});
  const result = await provider.run(fixtureSelection, context);
  assert.equal(calls,1);
  assert.ok(result.ok);
  assert.equal(result.payload.provider,'fal');
  assert.equal(result.payload.selectionId,fixtureSelection.id);
  assert.deepEqual(result.payload.anchorIds,fixtureSelection.anchorIds);
  assert.equal(JSON.stringify(result).includes('test-secret'),false);
  const snapshot = WorkspaceSnapshotSchema.parse({schemaVersion:1,id:'fal-save',bookId:fixtureSelection.bookId,selections:[fixtureSelection],anchors:fixtureAnchors,artifacts:[result.payload],placements:placementsFor([result.payload],fixtureAnchors),savedAt:new Date().toISOString()});
  const repository=createWorkspaceRepository({indexedDB:new IDBFactory()});
  await repository.save(snapshot);
  assert.deepEqual((await repository.load(snapshot.id))?.artifacts,[result.payload]);
  await repository.close();
});

test('missing credentials, excessive passage and pre-cancellation do not spend a request', async () => {
  const fetch: typeof globalThis.fetch = async () => { throw new Error('Must not call'); };
  const noKey = await createFalImageProvider({key:()=>undefined,fetch}).run(fixtureSelection,context);
  assert.ok(!noKey.ok && noKey.error.code==='not_configured');
  const long = await createFalImageProvider({key:()=> 'key',fetch}).run({...fixtureSelection,selectedText:'x'.repeat(12001)},context);
  assert.ok(!long.ok && long.error.code==='invalid_input');
  const cancelled=await createFalImageProvider({key:()=> 'key',fetch}).run(fixtureSelection,{...context,signal:AbortSignal.abort()});
  assert.ok(!cancelled.ok && cancelled.error.code==='cancelled');
});

test('provider errors never leak upstream body or trigger automatic charged retries', async () => {
  for (const status of [401,402,403,422,429,500]) {
    let calls=0;
    const result=await createFalImageProvider({key:()=> 'secret',fetch:async()=>{calls++;return Response.json({error:'secret upstream details'},{status});}}).run(fixtureSelection,context);
    assert.equal(calls,1);
    assert.ok(!result.ok);
    assert.equal(result.error.retryable,status===429||status>=500);
    assert.equal(JSON.stringify(result).includes('secret'),false);
  }
});

test('unsafe images, remote URLs, wrong dimensions and oversized payloads fail closed', async () => {
  for(const body of [
    {...response(),has_nsfw_concepts:[true]},
    {...response(),images:[{...response().images[0],url:'https://localhost/private'}]},
    {...response(),images:[{...response().images[0],width:8192}]},
    {...response(),images:[{...response().images[0],url:'data:image/jpeg;base64,aGVsbG8='}]},
    {...response(),padding:'x'.repeat(4_000_000)},
  ]) {
    const result=await createFalImageProvider({key:()=> 'key',fetch:stub(body)}).run(fixtureSelection,context);
    assert.ok(!result.ok);
  }
});

test('a timed-out attempt is not automatically resubmitted',async()=>{
  const result = await createFalImageProvider({key:()=> 'key',timeoutMs:10,fetch:async(_url,init)=>{
    await new Promise<void>((resolve,reject)=>{ const timer=setTimeout(resolve,50);init?.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(init.signal?.reason);},{once:true}); });
    return Response.json(response());
  }}).run(fixtureSelection,context);
  assert.ok(!result.ok && result.error.message.includes('timed out'));
});

test('mixed text/image dispatch and retry retain each route provider identity', async()=>{
  const routes=['interactive_ui','generated_image'] as const;
  const request={selection:fixtureSelection,plan:createRoutePlan({selection:fixtureSelection,routes:[...routes],mode:'real'}),mode:'real' as const};
  let failImage=true;
  const options={providerFactory:(kind: typeof routes[number] | 'concept_diagram' | 'source_discovery' | 'interactive_panel')=>kind==='generated_image'
    ? createFalImageProvider({key:()=> 'key',fetch:async()=> failImage ? Response.json({}, {status:429}) : Response.json(response())})
    : {async run(selection: typeof fixtureSelection, ctx:typeof context) {
      const artifact=makeMockArtifact('interactive_ui',selection,ctx.routeRunId);
      artifact.provider='vertex_ai';artifact.provenance={provider:'vertex_ai',label:'Test Vertex AI'};
      return {ok:true as const,payload:artifact,provenance:artifact.provenance,timing:{startedAt:new Date().toISOString(),durationMs:0}};
    }} };
  const first=await dispatchRoutePlan(request,options);
  assert.equal(first.provider,'mixed');
  assert.equal(first.artifacts.length,1);
  failImage=false;
  const retried=await retryRoutePlan(request,first,['generated_image'],options);
  assert.equal(retried.artifacts.length,2);
  assert.equal(retried.artifacts[0].id,first.artifacts[0].id);
  assert.deepEqual(retried.artifacts.map(a=>a.provider),['vertex_ai','fal']);
  const onlyImage=await dispatchRoutePlan({...request,plan:createRoutePlan({selection:fixtureSelection,routes:['generated_image'],mode:'real'})},options);
  assert.equal(onlyImage.provider,'fal');
});
