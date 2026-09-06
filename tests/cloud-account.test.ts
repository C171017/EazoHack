import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { deleteAccount, exportAccount, exportAccountFile } from '../src/server/cloud/account';

const user = { id: '11111111-1111-4111-8111-111111111111', token: 'user-token' };
const source = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function configure(t: TestContext) {
  const old = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_PUBLISHABLE_KEY, secret: process.env.SUPABASE_SECRET_KEY };
  process.env.SUPABASE_URL = 'https://cloud.example';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'public';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  t.after(() => {
    for (const [name, value] of Object.entries({ SUPABASE_URL: old.url, SUPABASE_PUBLISHABLE_KEY: old.key, SUPABASE_SECRET_KEY: old.secret })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
}

test('account export pages large snapshots one at a time with owner filtering', async t => {
  configure(t);
  let requested = '';
  const before = '2026-09-06T00:00:00.000Z';
  const cursor = Buffer.from(JSON.stringify({ table: 2, last: user.id, before })).toString('base64url');
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    requested = String(input); return Response.json([{ id: source, payload: { note: 'saved' } }]);
  });
  const result = await exportAccount(user, cursor);
  assert.equal(result.table, 'reading_snapshots');
  assert.deepEqual(JSON.parse(Buffer.from(result.nextCursor!, 'base64url').toString()), { table: 2, last: source, before });
  assert.match(requested, /limit=1&id=gt.11111111/);
  assert.equal(new URL(requested).searchParams.get('created_at'), `lte.${before}`);
  assert.equal(result.exportedAt, before);
  assert.match(requested, /owner_id=eq.11111111/);
  await assert.rejects(exportAccount(user, '2:0&owner_id=other'), /Invalid export cursor/);
});

test('file export cannot sign a source that belongs to another user', async t => {
  configure(t);
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    calls.push(String(input)); return Response.json([]);
  });
  await assert.rejects(exportAccountFile(user, { kind: 'source', id: source }), /not found/);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /owner_id=eq.11111111/);
});

test('graph export signs only a whitelisted published object under the owner', async t => {
  configure(t);
  const calls: string[] = [];
  const prefix = `${user.id}/book/job/output/`;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    calls.push(String(input));
    return calls.length === 1 ? Response.json([{ manifest_object: prefix + 'manifest.json' }]) : Response.json({ signedURL: '/object/sign/export-token' });
  });
  const result = await exportAccountFile(user, { kind: 'hierarchy', id: source });
  assert.equal(result.path, prefix + 'hierarchy.json');
  assert.match(calls[1], /eazo-analysis\/.*\/hierarchy.json$/);
  assert.equal(result.url, 'https://cloud.example/storage/v1/object/sign/export-token');
});

test('account deletion fences first, removes storage bytes and rows, deletes auth last', async t => {
  configure(t);
  const calls: { path: string; body: unknown }[] = [];
  let removed = false;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, body });
    if (path.includes('/object/list/')) {
      if (path.endsWith('eazo-sources') && !removed) return Response.json([{ id: 'object', name: 'source.txt' }]);
      return Response.json([]);
    }
    if (path === '/storage/v1/object/eazo-sources') removed = true;
    return Response.json({});
  });
  await deleteAccount(user);
  assert.equal(calls[0].path, '/rest/v1/rpc/eazo_begin_account_deletion');
  assert.equal(calls.at(-2)?.path, '/rest/v1/rpc/eazo_delete_account_rows');
  assert.equal(calls.at(-1)?.path, `/auth/v1/admin/users/${user.id}`);
  assert.deepEqual(calls.find(call => call.path === '/storage/v1/object/eazo-sources')?.body, { prefixes: [`${user.id}/source.txt`] });
});

test('failed storage deletion leaves identity available for a retry', async t => {
  configure(t);
  const paths: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const path = new URL(String(input)).pathname; paths.push(path);
    return path.includes('/object/list/') ? new Response('', { status: 503 }) : Response.json({});
  });
  await assert.rejects(deleteAccount(user), /Cloud request failed/);
  assert.equal(paths.some(path => path.startsWith('/auth/v1/admin/')), false);
  assert.equal(paths.some(path => path.endsWith('eazo_delete_account_rows')), false);
});
