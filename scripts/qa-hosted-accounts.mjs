/** Live, opt-in hosted auth/isolation/sync checks. Never starts AI jobs or deletes accounts. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, stat, chmod } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

class QAFailure extends Error {}
const args = new Map(process.argv.slice(2).map(value => { const index = value.indexOf('='); return index < 0 ? [value, true] : [value.slice(0, index), value.slice(index + 1)]; }));
const privateDir = String(args.get('--private-dir') ?? '/private/tmp/eazo-private-config');
const envFile = String(args.get('--env-file') ?? path.join(privateDir, 'preview.env'));
const sessionFile = path.join(privateDir, 'qa-account-sessions.json');
const userFile = path.join(privateDir, 'smoke-users.json');
let label = 'configuration';
const pass = message => console.log(`PASS ${message}`);
const check = (condition, message) => { if (!condition) throw new QAFailure(message); };
async function privateRead(file) {
  const info = await stat(file);
  check((info.mode & 0o077) === 0, 'A credentials file must have permissions 0600.');
  return readFile(file, 'utf8');
}
async function privateWrite(file, value) {
  await writeFile(file, value, { mode: 0o600 }); await chmod(file, 0o600);
}
async function raw(url, init = {}) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(45_000), ...init });
  const bytes = new Uint8Array(await response.arrayBuffer());
  let body;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { body = null; }
  return { status: response.status, body, bytes, cookies: response.headers.getSetCookie(), headers: response.headers };
}
const cookieString = cookies => Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join('; ');
function absorbCookies(cookies, lines) {
  for (const line of lines) {
    const pair = line.split(';', 1)[0], index = pair.indexOf('=');
    if (index < 1) continue;
    const name = pair.slice(0, index), value = pair.slice(index + 1);
    if (!value || /max-age=0(?:;|$)/i.test(line)) delete cookies[name]; else cookies[name] = value;
  }
}
function equal(actual, expected, message) {
  try { assert.deepEqual(actual, expected); } catch { throw new QAFailure(message); }
}

try {
  const env = parseEnv(await privateRead(envFile));
  const backend = new URL(env.SUPABASE_URL);
  check(backend.protocol === 'https:', 'Supabase HTTPS URL required.');
  const publishable = env.SUPABASE_PUBLISHABLE_KEY;
  check(!!publishable, 'Supabase publishable key missing.');
  const users = JSON.parse(await privateRead(userFile));
  check(Array.isArray(users) && users.length >= 2 && users[0].id !== users[1].id, 'Two distinct existing synthetic users are required.');
  check(users.slice(0, 2).every(user => /smoke|test|qa/i.test(user.email)), 'Refusing accounts not visibly labeled as synthetic test users.');
  const supabase = (route, token, init = {}) => raw(new URL(route, backend), {
    ...init, headers: { apikey: publishable, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  if (args.has('--mint-sessions')) {
    check(!args.has('--run-live'), 'Mint and live test phases must be separate commands.');
    const sessions = [];
    for (const [index, user] of users.slice(0, 2).entries()) {
      label = `mint synthetic account ${index === 0 ? 'A' : 'B'}`;
      const result = await supabase('/auth/v1/token?grant_type=password', undefined, { method: 'POST', body: JSON.stringify({ email: user.email, password: user.password }) });
      check(result.status === 200 && result.body?.user?.id === user.id && result.body.access_token && result.body.refresh_token, `Synthetic authentication failed with HTTP ${result.status}; no provider configuration was changed.`);
      sessions.push({ id: user.id, alias: index === 0 ? 'A' : 'B', cookies: { 'eazo-access': result.body.access_token, 'eazo-refresh': result.body.refresh_token, 'eazo-account': user.id } });
      // Persist each successful mint promptly; token values never reach stdout.
      await privateWrite(sessionFile, JSON.stringify(sessions));
      pass(`synthetic account ${index === 0 ? 'A' : 'B'} session stored privately`);
    }
    process.exit(0);
  }
  check(args.has('--run-live'), 'Pass --mint-sessions or --run-live explicitly.');
  const base = new URL(String(args.get('--base-url') ?? ''));
  check(['http:', 'https:'].includes(base.protocol) && base.pathname === '/' && !base.search && !base.username && !base.password, 'App origin required without credentials or path.');
  const sessions = JSON.parse(await privateRead(sessionFile));
  check(sessions.length === 2 && sessions.every((session, index) => session.id === users[index].id), 'Stored synthetic sessions do not match expected accounts.');
  const [a, b] = sessions;
  const runId = randomUUID();
  const runDir = path.join(privateDir, `qa-run-${runId}`);
  await mkdir(runDir, { recursive: true, mode: 0o700 });
  const report = { schema: 'eazo-hosted-account-qa-v1', runId, base: base.origin, startedAt: new Date().toISOString(), checks: [], fixture: null };
  const checkpoint = async message => { report.checks.push(message); await privateWrite(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2)); pass(message); };
  const persistSessions = () => privateWrite(sessionFile, JSON.stringify(sessions));
  let requestIndex = 0;
  async function app(route, session, body, options = {}) {
    const headers = { ...(session ? { Cookie: cookieString(session.cookies), 'x-eazo-owner': session.id } : {}), ...(body === undefined ? {} : { Origin: base.origin, 'Content-Type': 'application/json' }), ...options.headers };
    let result;
    if (args.has('--via-vercel')) {
      const stem = path.join(runDir, `request-${++requestIndex}`);
      const headersFile = `${stem}.headers`, bodyFile = `${stem}.response`, configFile = `${stem}.curl`;
      const quote = value => '"' + String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n').replaceAll('\r', '\\r') + '"';
      const config = ['silent', 'show-error', 'max-time = 45', `request = ${quote(body === undefined ? 'GET' : 'POST')}`, `dump-header = ${quote(headersFile)}`, `output = ${quote(bodyFile)}`];
      for (const [name, value] of Object.entries(headers)) config.push(`header = ${quote(`${name}: ${value}`)}`);
      if (body !== undefined) {
        await privateWrite(`${stem}.body`, JSON.stringify(body)); config.push(`data-binary = ${quote('@' + `${stem}.body`)}`);
      }
      await privateWrite(headersFile, ''); await privateWrite(bodyFile, ''); await privateWrite(configFile, config.join('\n'));
      const cli = String(args.get('--vercel-cli') ?? '/private/tmp/eazo-npm-cache/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js');
      const configDir = String(args.get('--vercel-config') ?? '/private/tmp/eazo-vercel-config');
      try { await promisify(execFile)(process.execPath, [cli, '--global-config', configDir, 'curl', route, '--deployment', base.origin, '--', '--config', configFile], { env: { ...process.env, VERCEL_TELEMETRY_DISABLED: '1' }, timeout: 90_000, maxBuffer: 1024 * 1024 }); }
      catch { throw new QAFailure('Vercel request failed; private request files retained for local inspection.'); }
      const headerText = await readFile(headersFile, 'utf8');
      const statuses = [...headerText.matchAll(/^HTTP\/[^ ]+ (\d+)/gm)];
      const bytes = new Uint8Array(await readFile(bodyFile));
      let parsed; try { parsed = JSON.parse(new TextDecoder().decode(bytes)); } catch { parsed = null; }
      result = { status: Number(statuses.at(-1)?.[1]), body: parsed, bytes, cookies: [...headerText.matchAll(/^set-cookie:\s*(.+)$/gim)].map(match => match[1].trim()), headers: new Headers() };
    } else {
      const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? env.VERCEL_AUTOMATION_BYPASS_SECRET;
      result = await raw(new URL(route, base), { method: body === undefined ? 'GET' : 'POST', headers: { ...headers, ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    }
    if (session) { absorbCookies(session.cookies, result.cookies); await persistSessions(); }
    return result;
  }
  function status(result, expected, message) { check(result.status === expected, `${message}: HTTP ${result.status}, expected ${expected}.`); }
  async function query(session, table, query) {
    const response = await supabase(`/rest/v1/${table}?${query}`, session.cookies['eazo-access']);
    status(response, 200, `RLS ${table}`); check(Array.isArray(response.body), 'Expected row array.'); return response.body;
  }
  label = 'sessions';
  for (const session of sessions) {
    const result = await app('/api/cloud/session', session); status(result, 200, 'Session read'); check(result.body?.id === session.id, 'Session owner mismatch.');
  }
  await checkpoint('A and B app sessions resolve to separate identities');

  label = 'fixture upload';
  const content = Buffer.from(`Eazo disposable hosted QA ${runId}.\n`.padEnd(1024, 'Reading sync test passage. '));
  const digest = createHash('sha256').update(content).digest('hex');
  const localBookId = `qa:${runId}`;
  const prepared = await app('/api/cloud/prepare', a, { localBookId, title: `QA disposable ${runId.slice(0, 8)}`, fileHash: digest, extractionVersion: 'txt-lf-v1', sourceSha256: digest, sourceBytes: content.length });
  status(prepared, 200, 'Prepare fixture');
  const source = prepared.body?.source;
  check(source?.owner_id === a.id && source.id && source.book_id && prepared.body.uploadUrl, 'Prepare returned wrong source owner.');
  report.fixture = { owner: a.id, sourceId: source.id, bookId: source.book_id, localBookId, sourceObject: source.source_object, bytes: content.length };
  await privateWrite(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2));
  const upload = await raw(prepared.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: content });
  status(upload, 200, 'Upload fixture');
  await checkpoint('A uploaded a disposable 1 KiB TXT source with sourceBytes');

  label = 'snapshot revisions';
  const snapshot = position => ({ schemaVersion: 1, id: localBookId, bookId: localBookId, selections: [], anchors: [], artifacts: [], placements: [], interactionState: {}, mapView: null, graphViewport: null, readerPosition: { fileHash: digest, extractionVersion: 'txt-lf-v1', startOffset: position }, footprints: [], bookmarks: [], savedAt: new Date().toISOString() });
  const deviceOne = randomUUID(), deviceTwo = randomUUID();
  const first = { source: source.id, device: deviceOne, mutationId: randomUUID(), baseRevision: 0, payload: snapshot(128) };
  const head0 = await app(`/api/cloud/snapshot?source=${source.id}`, a); status(head0, 200, 'Initial snapshot'); equal(head0.body, { revision: 0, payload: null }, 'Initial revision must be zero.');
  const saved = await app('/api/cloud/snapshot', a, first); status(saved, 200, 'First snapshot'); check(saved.body.revision === 1, 'First save did not become revision one.');
  const duplicate = await app('/api/cloud/snapshot', a, first); status(duplicate, 200, 'Idempotent retry'); check(duplicate.body.revision === 1, 'Retry created another revision.');
  const stale = { source: source.id, device: deviceTwo, mutationId: randomUUID(), baseRevision: 0, payload: snapshot(64) };
  const conflict = await app('/api/cloud/snapshot', a, stale); status(conflict, 409, 'Stale-device snapshot');
  check(conflict.body?.error?.code === 'snapshot_conflict', 'Stale save did not return structured conflict.');
  check(conflict.body.current.revision === 1 && conflict.body.current.payload.readerPosition.startOffset === 128, 'Conflict head was altered.');
  const head1 = await app(`/api/cloud/snapshot?source=${source.id}`, a); status(head1, 200, 'Unchanged head'); equal(head1.body, conflict.body.current, 'Stale save changed accepted head.');
  const versions = await query(a, 'reading_snapshots', `source_id=eq.${source.id}&select=mutation_id,accepted_revision,payload`);
  check(versions.length === 2 && versions.some(row => row.mutation_id === stale.mutationId && row.accepted_revision === null && row.payload.readerPosition.startOffset === 64), 'Conflict candidate or accepted version missing.');
  await checkpoint('Revision 0→1, retry idempotency, stale-device conflict, and both retained versions verified');

  label = 'source validation';
  const invalid = await app('/api/cloud/snapshot', a, { ...first, mutationId: randomUUID(), baseRevision: 1, payload: { ...snapshot(1), readerPosition: { fileHash: digest, extractionVersion: 'txt-lf-v1', startOffset: content.length + 1 } } });
  status(invalid, 400, 'Out-of-source position');
  await checkpoint('Snapshot with a position outside the source is rejected');

  label = 'account isolation';
  const booksB = await app('/api/cloud/books', b); status(booksB, 200, 'B books'); check(!booksB.body.some(book => book.id === source.book_id), 'B can list A fixture.');
  for (const [route, body] of [
    ['/api/cloud/open', { source: source.id }], ['/api/cloud/download', { source: source.id }],
    ['/api/cloud/snapshot', { ...first, mutationId: randomUUID(), baseRevision: 1 }],
    ['/api/cloud/export-file', { kind: 'source', id: source.id }],
    [`/api/cloud/snapshot?source=${source.id}`, undefined],
  ]) {
    const rejected = await app(route, b, body); check([403, 404].includes(rejected.status), `B cross-owner action must be denied, got HTTP ${rejected.status}.`);
    check(!rejected.body?.payload && !rejected.body?.url, 'Cross-owner response leaked private data.');
  }
  const wrongOwner = await app('/api/cloud/books', b, undefined, { headers: { 'x-eazo-owner': a.id } }); status(wrongOwner, 403, 'Stale owner header');
  for (const table of ['books', 'book_sources', 'reading_snapshots', 'reading_heads']) {
    const column = table === 'books' ? 'id' : table === 'book_sources' ? 'id' : 'source_id';
    const id = table === 'books' ? source.book_id : source.id;
    const hidden = await query(b, table, `${column}=eq.${id}&select=*`); check(hidden.length === 0, 'B can read A database rows.');
  }
  const rpcDenied = await supabase('/rest/v1/rpc/eazo_save_snapshot', b.cookies['eazo-access'], { method: 'POST', body: JSON.stringify({ p_source: source.id, p_device: randomUUID(), p_mutation: randomUUID(), p_base_revision: 1, p_payload: snapshot(256) }) });
  check(rpcDenied.status >= 400 && rpcDenied.status < 500, 'B can write A through direct snapshot RPC.');
  const patchDenied = await supabase(`/rest/v1/books?id=eq.${source.book_id}`, b.cookies['eazo-access'], { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ title: 'unauthorized QA rename' }) });
  check(patchDenied.status >= 400 || (patchDenied.status === 200 && Array.isArray(patchDenied.body) && patchDenied.body.length === 0), 'B can edit A book through direct table access.');
  const readDenied = await supabase(`/storage/v1/object/authenticated/eazo-sources/${source.source_object}`, b.cookies['eazo-access']);
  check(readDenied.status >= 400 && readDenied.status < 500, 'B can read A storage object.');
  const overwriteDenied = await supabase(`/storage/v1/object/eazo-sources/${source.source_object}`, b.cookies['eazo-access'], { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: Buffer.from('unauthorized test write') });
  check(overwriteDenied.status >= 400 && overwriteDenied.status < 500, 'B can overwrite A storage object.');
  const ownerRead = await supabase(`/storage/v1/object/authenticated/eazo-sources/${source.source_object}`, a.cookies['eazo-access']);
  status(ownerRead, 200, 'Owner storage read'); check(createHash('sha256').update(ownerRead.bytes).digest('hex') === digest, 'A source changed during unauthorized attempt.');
  await checkpoint('B cannot list, open, download, export, snapshot-read/write, or storage-read/write A data');

  label = 'owner export';
  for (const session of sessions) {
    let cursor = null, seenFixture = false, finished = false;
    for (let page = 0; page < 200; page++) {
      const response = await app('/api/cloud/export' + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''), session);
      status(response, 200, 'Account export');
      check(response.body?.account?.id === session.id && Array.isArray(response.body.records), 'Export identity mismatch.');
      for (const row of response.body.records) {
        if (row.owner_id) check(row.owner_id === session.id, 'Export contains a foreign owner.');
        if (row.id === source.id || row.source_id === source.id) seenFixture = true;
      }
      cursor = response.body.nextCursor;
      if (!cursor) { finished = true; break; }
    }
    check(finished, 'Export exceeded bounded QA page count.');
    check(session === a ? seenFixture : !seenFixture, 'Fixture export isolation failed.');
  }
  await checkpoint('Paginated account export is owner-scoped and includes A fixture only for A');

  label = 'session refresh';
  const originalRefresh = a.cookies['eazo-refresh'];
  a.cookies['eazo-access'] = 'expired-qa-access-token';
  const renewed = await app('/api/cloud/session', a); status(renewed, 200, 'Session refresh');
  check(renewed.body?.id === a.id && a.cookies['eazo-access'] !== 'expired-qa-access-token' && a.cookies['eazo-refresh'], 'Refresh did not restore session.');
  check(renewed.cookies.some(value => /^eazo-access=/.test(value) && /httponly/i.test(value) && /samesite=lax/i.test(value)), 'Renewed access cookie lacks security attributes.');
  if (base.protocol === 'https:') check(renewed.cookies.some(value => /^eazo-access=/.test(value) && /secure/i.test(value)), 'Hosted access cookie is not Secure.');
  check(a.cookies['eazo-refresh'] !== originalRefresh, 'Refresh token was not rotated.');
  const anonymous = { id: a.id, cookies: { 'eazo-access': 'expired-qa-access-token', 'eazo-refresh': 'invalid-qa-refresh-token', 'eazo-account': a.id, 'eazo-book': source.id } };
  const expired = await app('/api/cloud/session', anonymous); status(expired, 200, 'Expired session');
  equal(expired.body, { id: null, email: null }, 'Invalid refresh did not become signed out.');
  check(!anonymous.cookies['eazo-access'] && !anonymous.cookies['eazo-refresh'] && !anonymous.cookies['eazo-book'], 'Invalid refresh retained private cookies.');
  await checkpoint('Expired access renews through refresh rotation; invalid refresh clears private session cookies');

  label = 'origin and Google-only entry';
  status(await app('/api/cloud/open', a, { source: source.id }, { headers: { Origin: 'https://untrusted.invalid' } }), 403, 'Foreign origin');
  status(await app('/api/cloud/login', undefined, { email: 'qa@example.invalid', password: 'not-a-real-password' }), 410, 'Retired password app endpoint');
  await checkpoint('Foreign-origin mutations denied and application password login remains disabled');
  report.finishedAt = new Date().toISOString(); report.status = 'passed';
  await privateWrite(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`PASS hosted suite; private report: ${path.join(runDir, 'report.json')}`);
  console.log('Synthetic accounts and the 1 KiB fixture are retained. No models were called and no accounts were deleted.');
} catch (error) {
  // Never print arbitrary response objects, fetch URLs, CLI errors, or assertions containing tokens.
  const allowed = error instanceof QAFailure ? error.message : 'Operation failed; private credentials and response details were not printed.';
  console.error(`FAIL ${label}: ${allowed.replace(/https?:\/\/[^\s]+/g, '[URL omitted]').slice(0, 300)}`);
  process.exitCode = 1;
}
