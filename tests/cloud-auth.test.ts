import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { accessNeedsRefresh, authOrigin, createGoogleFlow, readGoogleFlow, resolveCloudUser, safeReturnPath, writeSession, type AuthBackend, type AuthCookies } from '../src/server/cloud/auth';
import { RequestBodyError } from '../src/server/http';

const token = (expiry = Date.now() / 1000 + 3600) => `header.${Buffer.from(JSON.stringify({ exp: expiry })).toString('base64url')}.signature`;
function jar(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const writes: string[] = [];
  const cookies: AuthCookies = {
    get: name => values.has(name) ? { value: values.get(name)! } : undefined,
    set: (name, value, options) => { assert.equal(options.httpOnly, true); assert.equal(options.sameSite, 'lax'); writes.push(name); values.set(name, value); },
    delete: name => { writes.push(name); values.delete(name); },
  };
  return { cookies, values, writes };
}

test('Google flow binds a random verifier, state, expiry and safe return document', () => {
  const flow = createGoogleFlow('https://project.supabase.co', 'https://eazo.example', '/?book=hello', 1000);
  const parsed = JSON.parse(flow.cookie);
  const url = new URL(flow.url);
  assert.equal(url.searchParams.get('provider'), 'google');
  assert.equal(url.searchParams.get('code_challenge_method'), 's256');
  assert.equal(url.searchParams.get('code_challenge'), createHash('sha256').update(parsed.verifier).digest('base64url'));
  assert.equal(new URL(url.searchParams.get('redirect_to')!).searchParams.get('state'), parsed.state);
  assert.deepEqual(readGoogleFlow(flow.cookie, parsed.state, 2000), { verifier: parsed.verifier, next: '/?book=hello' });
  assert.throws(() => readGoogleFlow(flow.cookie, 'a'.repeat(43), 2000), /expired/);
  assert.throws(() => readGoogleFlow(flow.cookie, parsed.state, 601_001), /expired/);
  assert.throws(() => readGoogleFlow(undefined, parsed.state), /expired/);
  assert.notEqual(createGoogleFlow('https://project.supabase.co', 'https://eazo.example').cookie, flow.cookie);
});

test('OAuth returns cannot escape origin or loop through auth routes', () => {
  for (const path of ['https://evil.example', '//evil.example', '/\\evil.example', '/%2f%2fevil.example', '/%5cevil.example', '/\nevil', '/auth/refresh', '/%61uth/refresh', '/x/../auth/refresh', '/api/cloud/logout', '/%zz']) assert.equal(safeReturnPath(path), '/cloud', path);
  assert.equal(safeReturnPath('/?book=one#passage'), '/?book=one#passage');
});

test('auth callback origin requires canonical configuration in production and rejects forwarded-host injection', () => {
  const request = new Request('http://internal/auth/google', { headers: { host: 'eazo.example', 'x-forwarded-host': 'evil.example' } });
  assert.equal(authOrigin(request, 'https://eazo.example', true), 'https://eazo.example');
  assert.throws(() => authOrigin(request, undefined, true), /EAZO_SITE_URL/);
  assert.throws(() => authOrigin(request, 'https://evil.example', true), /main Eazo/);
  assert.throws(() => authOrigin(request, 'http://eazo.example', true), /configured/);
  assert.equal(authOrigin(new Request('http://internal/auth/google', { headers: { host: '127.0.0.1:3107' } }), undefined, false), 'http://127.0.0.1:3107');
});

test('protected request renews a missing access token and clears selected book after account change', async () => {
  const state = jar({ 'eazo-refresh': 'refresh-account-switch', 'eazo-account': 'old', 'eazo-book': 'private-old-book' });
  const access = token();
  const paths: string[] = [];
  const call: AuthBackend = async <T>(path: string) => {
    paths.push(path);
    return (path.includes('/token?') ? { access_token: access, refresh_token: 'new-refresh', expires_in: 3600 } : { id: 'new', email: 'new@example.com' }) as T;
  };
  const user = await resolveCloudUser(state.cookies, 'key', call);
  assert.equal(user.id, 'new');
  assert.equal(user.token, access);
  assert.equal(state.values.get('eazo-refresh'), 'new-refresh');
  assert.equal(state.values.get('eazo-account'), 'new');
  assert.equal(state.values.has('eazo-book'), false);
  assert.deepEqual(paths, ['/auth/v1/token?grant_type=refresh_token', '/auth/v1/user']);
});

test('concurrent protected requests coalesce refresh rotation and both receive renewed cookies', async () => {
  const first = jar({ 'eazo-refresh': 'refresh-concurrent' });
  const second = jar({ 'eazo-refresh': 'refresh-concurrent' });
  let refreshes = 0;
  const call: AuthBackend = async <T>(path: string) => {
    if (path.includes('/token?')) { refreshes++; await new Promise(resolve => setTimeout(resolve, 10)); return { access_token: token(), refresh_token: 'rotated', expires_in: 3600 } as T; }
    return { id: 'same' } as T;
  };
  await Promise.all([resolveCloudUser(first.cookies, 'key', call), resolveCloudUser(second.cookies, 'key', call)]);
  assert.equal(refreshes, 1);
  assert.equal(first.values.get('eazo-refresh'), 'rotated');
  assert.equal(second.values.get('eazo-refresh'), 'rotated');
});

test('network outage preserves refresh token; confirmed revocation clears browser session', async () => {
  for (const status of [502, 401]) {
    const state = jar({ 'eazo-refresh': `refresh-error-${status}`, 'eazo-book': 'book' });
    const call: AuthBackend = async () => { throw new RequestBodyError('unavailable', status); };
    await assert.rejects(resolveCloudUser(state.cookies, 'key', call));
    assert.equal(state.values.has('eazo-refresh'), status !== 401);
    assert.equal(state.values.has('eazo-book'), status !== 401);
  }
});

test('server rendering authenticates without attempting cookie writes or refresh', async () => {
  const access = token(Date.now() / 1000 - 5);
  const state = jar({ 'eazo-access': access, 'eazo-refresh': 'dont-refresh' });
  const call: AuthBackend = async <T>(path: string) => { assert.equal(path, '/auth/v1/user'); return { id: 'user' } as T; };
  assert.equal((await resolveCloudUser(state.cookies, 'key', call, false)).id, 'user');
  assert.deepEqual(state.writes, []);
});

test('same account renewal preserves selected book, malformed or expiring tokens need renewal', () => {
  const state = jar({ 'eazo-account': 'same', 'eazo-book': 'selected' });
  writeSession(state.cookies, { access_token: token(), refresh_token: 'r', expires_in: 3600 }, { id: 'same' });
  assert.equal(state.values.get('eazo-book'), 'selected');
  assert.equal(accessNeedsRefresh(token()), false);
  assert.equal(accessNeedsRefresh(token(Date.now() / 1000 + 10)), true);
  assert.equal(accessNeedsRefresh('corrupt'), true);
  assert.equal(accessNeedsRefresh(undefined), true);
});
