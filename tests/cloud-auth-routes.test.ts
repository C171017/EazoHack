import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { WorkStore } from 'next/dist/server/app-render/work-async-storage.external';
import { createGoogleFlow } from '../src/server/cloud/auth';

// Next initializes this global in its server entrypoint. Load its request-context
// machinery only after reproducing that setup, so real cookies() guards run.
Object.assign(globalThis, { AsyncLocalStorage });
const runtime = Promise.all([
  import('next/server'),
  import('next/dist/server/async-storage/request-store'),
  import('next/dist/server/app-render/work-async-storage.external'),
  import('next/dist/server/app-render/work-unit-async-storage.external'),
  import('../src/app/auth/google/route'),
  import('../src/app/auth/callback/route'),
  import('../src/app/auth/refresh/route'),
  import('../src/app/api/cloud/[action]/route'),
  import('../src/proxy'),
]);
const access = () => `header.${Buffer.from(JSON.stringify({ exp: Date.now() / 1000 + 3600 })).toString('base64url')}.sig`;
const initialCookies = (values: Record<string,string>) => Object.entries(values).map(([name,value]) => `${name}=${encodeURIComponent(value)}`).join('; ');
function configure(t: TestContext, fetcher: typeof fetch) {
  for (const [name, value] of Object.entries({ SUPABASE_URL: 'https://auth-test.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', EAZO_SITE_URL: 'https://eazo.example' })) {
    const previous = process.env[name]; process.env[name] = value;
    t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
  }
  t.mock.method(globalThis, 'fetch', fetcher);
}
async function invoke(which: 'google'|'callback'|'refresh'|'cloud', url: string, values: Record<string,string> = {}, action = 'session', init: RequestInit = {}) {
  const [next, requestModule, workModule, unitModule, google, callback, refresh, cloud] = await runtime;
  const headers = new Headers(init.headers);
  headers.set('host','eazo.example');headers.set('cookie',initialCookies(values));
  const request = new next.NextRequest(url, { ...init, signal:init.signal??undefined, headers });
  const store = requestModule.createRequestStoreForAPI(request, new URL(url), { tags:[], expirationsByCacheKind:new Map() }, undefined, undefined, undefined);
  const work = { isStaticGeneration:false, route:new URL(url).pathname, page:new URL(url).pathname, isPrefetchRequest:false } as WorkStore;
  const response = await workModule.workAsyncStorage.run(work, () => unitModule.workUnitAsyncStorage.run(store, () => {
    if(which==='cloud')return (init.method==='POST'?cloud.POST:cloud.GET)(request,{params:Promise.resolve({action})});
    return {google,callback,refresh}[which].GET(request);
  }));
  return {response, cookies:store.mutableCookies};
}

test('Google route starts PKCE; callback changes identity and clears previous selected book', async t => {
  let calls = 0;
  const jwt = access();
  configure(t, async (input, init) => {
    calls++;
    const url = String(input);
    if (url.includes('grant_type=pkce')) {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.auth_code, 'one-use-code');
      assert.match(body.code_verifier, /^[\w-]{43}$/);
      return Response.json({access_token:jwt,refresh_token:'refresh-b',expires_in:3600});
    }
    assert.equal(url, 'https://auth-test.supabase.co/auth/v1/user');
    assert.equal((init?.headers as Record<string,string>).Authorization, `Bearer ${jwt}`);
    return Response.json({id:'account-b',email:'b@example.com'});
  });
  const start = await invoke('google','https://eazo.example/auth/google?next=//evil.example');
  assert.equal(start.response.status,303);
  assert.equal(start.response.headers.get('cache-control'),'private, no-store');
  assert.equal(calls,0);
  const flow = start.cookies.get('eazo-oauth')!.value;
  const state = JSON.parse(flow).state;
  const provider = new URL(start.response.headers.get('location')!);
  assert.equal(provider.searchParams.get('provider'),'google');
  assert.equal(provider.searchParams.get('scopes'),'openid');
  const result = await invoke('callback',`https://eazo.example/auth/callback?state=${state}&code=one-use-code`,{'eazo-oauth':flow,'eazo-account':'account-a','eazo-book':'account-a-book'});
  assert.equal(result.response.status,303);
  assert.equal(result.response.headers.get('location'),'https://eazo.example/cloud');
  assert.equal(result.cookies.get('eazo-account')?.value,'account-b');
  assert.equal(result.cookies.get('eazo-access')?.value,jwt);
  assert.equal(result.cookies.get('eazo-refresh')?.value,'refresh-b');
  assert.equal(result.cookies.get('eazo-book')?.value,'');
  assert.equal(result.cookies.get('eazo-oauth')?.value,'');
  assert.equal(calls,2);
});

test('mismatched or consumed callback cannot make a backend call or replace account', async t => {
  configure(t, async () => { throw new Error('Callback must reject before network access'); });
  const flow = createGoogleFlow('https://auth-test.supabase.co','https://eazo.example');
  const result = await invoke('callback','https://eazo.example/auth/callback?state=wrong&code=stolen',{'eazo-oauth':flow.cookie,'eazo-account':'original'});
  assert.equal(result.response.headers.get('location'),'https://eazo.example/cloud?auth_error=expired');
  assert.equal(result.cookies.get('eazo-account')?.value,'original');
  const replay = await invoke('callback','https://eazo.example/auth/callback?code=consumed');
  assert.equal(replay.response.headers.get('location'),'https://eazo.example/cloud?auth_error=expired');
});

test('cancelled consent clears pending flow and returns to a recoverable account page', async t => {
  configure(t, async () => { throw new Error('Denied consent must not exchange a token'); });
  const flow = createGoogleFlow('https://auth-test.supabase.co','https://eazo.example');
  const state = JSON.parse(flow.cookie).state;
  const result = await invoke('callback',`https://eazo.example/auth/callback?state=${state}&error=access_denied&error_description=untrusted`,{'eazo-oauth':flow.cookie});
  assert.equal(result.response.headers.get('location'),'https://eazo.example/cloud?auth_error=cancelled');
  assert.equal(result.cookies.get('eazo-oauth')?.value,'');
});

test('session route renews without a prior session-page visit and keeps remote errors distinct from signed out', async t => {
  let fail = false;
  configure(t, async input => {
    if (fail) return Response.json({error:'outage'},{status:503});
    if (String(input).includes('grant_type=refresh_token')) return Response.json({access_token:access(),refresh_token:'session-renewed',expires_in:3600});
    return Response.json({id:'current-account',email:'reader@example.com'});
  });
  const renewed = await invoke('cloud','https://eazo.example/api/cloud/session',{'eazo-refresh':'route-session-refresh','eazo-account':'current-account'});
  assert.deepEqual(await renewed.response.json(),{id:'current-account',email:'reader@example.com'});
  assert.equal(renewed.cookies.get('eazo-refresh')?.value,'session-renewed');
  fail = true;
  const outage = await invoke('cloud','https://eazo.example/api/cloud/session',{'eazo-access':access(),'eazo-refresh':'preserve-on-outage'});
  assert.equal(outage.response.status,502);
  assert.equal(outage.cookies.get('eazo-refresh')?.value,'preserve-on-outage');
  const anonymous = await invoke('cloud','https://eazo.example/api/cloud/session');
  assert.deepEqual(await anonymous.response.json(),{email:null,id:null});
});

test('stale-account mutation and forged-origin logout fail before writing cloud data', async t => {
  let calls = 0;
  configure(t, async input => {calls++; assert.equal(String(input),'https://auth-test.supabase.co/auth/v1/user');return Response.json({id:'account-b'});});
  const stale = await invoke('cloud','https://eazo.example/api/cloud/snapshot',{'eazo-access':access()},'snapshot',{method:'POST',headers:{origin:'https://eazo.example','content-type':'application/json','x-eazo-owner':'account-a'},body:'{}'});
  assert.equal(stale.response.status,403);
  assert.equal(calls,1);
  const forged = await invoke('cloud','https://eazo.example/api/cloud/logout',{'eazo-access':access()},'logout',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:'{}'});
  assert.equal(forged.response.status,403);
  assert.equal(calls,1);
});

test('refresh route clears rejected refresh cookies and cannot redirect into itself', async t => {
  configure(t, async () => Response.json({error:'invalid_grant'},{status:400}));
  const result = await invoke('refresh','https://eazo.example/auth/refresh?next=/auth/refresh',{'eazo-refresh':'revoked-integration-token','eazo-book':'old-book'});
  assert.equal(result.response.status,303);
  assert.equal(result.response.headers.get('location'),'https://eazo.example/cloud?auth_error=expired');
  assert.equal(result.cookies.get('eazo-refresh')?.value,'');
  assert.equal(result.cookies.get('eazo-book')?.value,'');
});

test('page proxy uses relative refresh location even behind an internal hostname', async () => {
  const [next,,,,,,,, proxy] = await runtime;
  const request = new next.NextRequest('http://internal:3107/?book=test',{headers:{host:'eazo.example',cookie:'eazo-refresh=needs-renewal'}});
  const result = proxy.proxy(request);
  assert.equal(result.headers.get('location'),'/auth/refresh?next=%2F%3Fbook%3Dtest');
});

test('sign-out clears browser cookies even when remote revocation is unavailable', async t => {
  configure(t, async input => {
    if (String(input).endsWith('/auth/v1/user')) return Response.json({id:'current-account'});
    throw new Error('temporary network outage');
  });
  const result = await invoke('cloud','https://eazo.example/api/cloud/logout',{'eazo-access':access(),'eazo-refresh':'logout-refresh','eazo-account':'current-account','eazo-book':'private-book'},'logout',{method:'POST',headers:{origin:'https://eazo.example','content-type':'application/json'},body:'{}'});
  assert.equal(result.response.status,200);
  for(const name of ['eazo-access','eazo-refresh','eazo-account','eazo-book'])assert.equal(result.cookies.get(name)?.value,'');
});

test('database quota errors are controlled messages and SQL details never reach users', async t => {
  let message = 'source_storage_limit';
  configure(t, async () => Response.json({message,details:'private SQL details'},{status:400}));
  const {backend} = await import('../src/server/cloud/backend');
  await assert.rejects(backend('/rest/v1/book_sources','jwt'),error => error instanceof Error && error.message === 'Your account has reached its source storage limit.' && 'status' in error && error.status === 429);
  message = 'account_deleting';
  await assert.rejects(backend('/rest/v1/books','jwt'),error => error instanceof Error && error.message.includes('Account deletion is in progress') && 'status' in error && error.status === 409);
  message = 'toString';
  await assert.rejects(backend('/rest/v1/books','jwt'),error => error instanceof Error && error.message === 'Cloud request failed. Please retry.');
});

test('a stale account tab cannot sign out the newly active account', async t => {
  let calls=0;
  configure(t,async input=>{calls++;assert.equal(String(input),'https://auth-test.supabase.co/auth/v1/user');return Response.json({id:'account-b'});});
  const result=await invoke('cloud','https://eazo.example/api/cloud/logout',{'eazo-access':access(),'eazo-refresh':'account-b-refresh','eazo-account':'account-b'},'logout',{method:'POST',headers:{origin:'https://eazo.example','content-type':'application/json','x-eazo-owner':'account-a'},body:'{}'});
  assert.equal(result.response.status,403);assert.equal(calls,1);
  assert.equal(result.cookies.get('eazo-refresh')?.value,'account-b-refresh');
});

test('a foreign or missing snapshot source becomes a private-safe 404', async t => {
  configure(t, async input => {
    const url = String(input);
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'account-b' });
    if (url.includes('/rest/v1/account_state?')) return Response.json([]);
    assert.equal(url, 'https://auth-test.supabase.co/rest/v1/rpc/eazo_snapshot_head');
    return Response.json({ code: '42501', message: 'source_not_found', details: 'private source-owner details' }, { status: 403 });
  });
  const result = await invoke('cloud', 'https://eazo.example/api/cloud/snapshot?source=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', { 'eazo-access': access(), 'eazo-account': 'account-b' }, 'snapshot');
  assert.equal(result.response.status, 404);
  const body = await result.response.json();
  assert.equal(body.error.message, 'Book not found.');
  assert.ok(!JSON.stringify(body).includes('private source-owner details'));
});

test('account page cookie renewal happens in the proxy before server rendering', async () => {
  const [next,,,,,,,, proxy] = await runtime;
  assert.ok(proxy.config.matcher.includes('/account'));
  const request = new next.NextRequest('http://internal:3107/account', { headers: { host: 'eazo.example', cookie: 'eazo-access=expired;eazo-refresh=account-renewal' } });
  const response = proxy.proxy(request);
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), '/auth/refresh?next=%2Faccount');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});
