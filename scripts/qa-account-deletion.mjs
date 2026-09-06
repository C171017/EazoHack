/** Explicit live test: creates and deletes only its own uniquely marked synthetic account. */
import { readFile, writeFile, mkdir, stat, chmod } from 'node:fs/promises';
import { parseEnv, promisify } from 'node:util';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import path from 'node:path';

const privateDir = '/private/tmp/eazo-private-config';
const stateFile = path.join(privateDir, 'account-deletion-fixture.json');
const reportFile = path.join(privateDir, 'account-deletion-report.json');
const expectedBackend = 'https://gzmomicvppjckgzbbimm.supabase.co';
const expectedApp = 'https://eazo-hack-account-sync-c171017.vercel.app';
const purpose = 'eazo-isolated-account-deletion-qa';
class SafeFailure extends Error {}
const check = (condition, message) => { if (!condition) throw new SafeFailure(message); };
const pass = message => console.log(`PASS ${message}`);
let phase = 'configuration';
async function privateRead(file) {
  check(((await stat(file)).mode & 0o077) === 0, 'Private file permissions must be 0600.');
  return readFile(file, 'utf8');
}
async function privateWrite(file, value) { await writeFile(file, value, { mode: 0o600 }); await chmod(file, 0o600); }
async function raw(url, init = {}) {
  const response = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(45_000) });
  const bytes = new Uint8Array(await response.arrayBuffer());
  let body; try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { body = null; }
  return { status: response.status, bytes, body, cookies: response.headers.getSetCookie() };
}
try {
  const mode = process.argv[2];
  check(['--create-fixture', '--run-preview'].includes(mode), 'Choose --create-fixture or --run-preview explicitly.');
  const env = parseEnv(await privateRead(path.join(privateDir, 'preview.env')));
  check(env.SUPABASE_URL === expectedBackend, 'Refusing an unexpected Supabase project.');
  const secret = env.SUPABASE_SECRET_KEY, publishable = env.SUPABASE_PUBLISHABLE_KEY;
  check(secret && publishable, 'Required private configuration is missing.');
  const serviceHeaders = { apikey: secret, ...(secret.startsWith('sb_') ? {} : { Authorization: `Bearer ${secret}` }), 'Content-Type': 'application/json' };
  const service = (route, init = {}) => raw(expectedBackend + route, { ...init, headers: { ...serviceHeaders, ...init.headers } });
  const save = state => privateWrite(stateFile, JSON.stringify(state, null, 2));
  let state;
  try { state = JSON.parse(await privateRead(stateFile)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }

  if (mode === '--create-fixture') {
    check(!state?.deleted, 'This fixture already completed deletion; do not create another.');
    if (!state) {
      const runId = randomUUID();
      state = { purpose, runId, email: `eazo-qa-delete-${runId}@example.invalid`, password: randomBytes(36).toString('base64url'), startedAt: new Date().toISOString() };
      await save(state);
    }
    phase = 'create isolated account';
    check(state.purpose === purpose && state.email === `eazo-qa-delete-${state.runId}@example.invalid`, 'Fixture identity guard failed.');
    if (!state.id) {
      const created = await service('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email: state.email, password: state.password, email_confirm: true, user_metadata: { qaPurpose: purpose, qaRun: state.runId } }) });
      check(created.status === 200 && created.body?.id && created.body.email === state.email, `Synthetic account creation returned HTTP ${created.status}; no duplicate retry is attempted.`);
      state.id = created.body.id; await save(state);
    }
    phase = 'mint isolated session';
    const session = await raw(expectedBackend + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: publishable, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: state.email, password: state.password }) });
    check(session.status === 200 && session.body?.user?.id === state.id, `Synthetic session mint returned HTTP ${session.status}.`);
    state.cookies = { 'eazo-access': session.body.access_token, 'eazo-refresh': session.body.refresh_token, 'eazo-account': state.id };
    await save(state); pass('one uniquely labeled synthetic deletion account created; session stored privately');
    process.exit(0);
  }

  check(state?.id && state.cookies && !state.deleted && state.purpose === purpose && state.email === `eazo-qa-delete-${state.runId}@example.invalid`, 'Refusing any account not created by this exact test fixture.');
  const identity = await service(`/auth/v1/admin/users/${state.id}`);
  check(identity.status === 200 && identity.body?.email === state.email && identity.body.user_metadata?.qaPurpose === purpose && identity.body.user_metadata?.qaRun === state.runId, 'Server-side disposable identity markers do not match; deletion refused.');
  const runDir = path.join(privateDir, `delete-run-${state.runId}`);
  await mkdir(runDir, { recursive: true, mode: 0o700 });
  const report = { schema: 'eazo-account-deletion-qa-v1', owner: state.id, runId: state.runId, startedAt: new Date().toISOString(), checks: [] };
  const checkpoint = async message => { report.checks.push(message); await privateWrite(reportFile, JSON.stringify(report, null, 2)); pass(message); };
  let requestIndex = 0;
  async function app(route, body) {
    const stem = path.join(runDir, `request-${++requestIndex}`);
    const headersFile = stem + '.headers', responseFile = stem + '.response', configFile = stem + '.curl';
    const quote = value => '"' + String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n').replaceAll('\r', '\\r') + '"';
    const headers = { Cookie: Object.entries(state.cookies).map(([key, value]) => `${key}=${value}`).join('; '), 'x-eazo-owner': state.id, ...(body === undefined ? {} : { Origin: expectedApp, 'Content-Type': 'application/json' }) };
    const config = ['silent', 'show-error', 'max-time = 60', `request = ${quote(body === undefined ? 'GET' : 'POST')}`, `dump-header = ${quote(headersFile)}`, `output = ${quote(responseFile)}`];
    for (const [key, value] of Object.entries(headers)) config.push(`header = ${quote(`${key}: ${value}`)}`);
    if (body !== undefined) { await privateWrite(stem + '.body', JSON.stringify(body)); config.push(`data-binary = ${quote('@' + stem + '.body')}`); }
    await privateWrite(headersFile, ''); await privateWrite(responseFile, ''); await privateWrite(configFile, config.join('\n'));
    const cli = '/private/tmp/eazo-npm-cache/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js';
    try { await promisify(execFile)(process.execPath, [cli, '--global-config', '/private/tmp/eazo-vercel-config', 'curl', route, '--deployment', expectedApp, '--', '--config', configFile], { env: { ...process.env, VERCEL_TELEMETRY_DISABLED: '1' }, timeout: 100_000, maxBuffer: 1024 * 1024 }); }
    catch { throw new SafeFailure('Protected preview request failed; private request files retained.'); }
    const headerText = await readFile(headersFile, 'utf8');
    const statuses = [...headerText.matchAll(/^HTTP\/[^ ]+ (\d+)/gm)];
    for (const match of headerText.matchAll(/^set-cookie:\s*([^=;]+)=([^;]*)[^\r\n]*/gim)) {
      if (!match[2] || /max-age=0(?:;|$)/i.test(match[0])) delete state.cookies[match[1]];
      else state.cookies[match[1]] = match[2];
    }
    await save(state);
    let parsed; try { parsed = JSON.parse(await readFile(responseFile, 'utf8')); } catch { parsed = null; }
    return { status: Number(statuses.at(-1)?.[1]), body: parsed, headers: headerText };
  }
  phase = 'preview session';
  const session = await app('/api/cloud/session');
  check(session.status === 200 && session.body?.id === state.id, `Isolated preview session failed with HTTP ${session.status}.`);
  await checkpoint('preview resolves only the disposable deletion-test identity');

  phase = 'create synthetic source';
  const bytes = Buffer.from(`Disposable Eazo deletion test ${state.runId}.\n`.padEnd(1024, 'QA source text. '));
  const digest = createHash('sha256').update(bytes).digest('hex');
  const localBookId = `qa-delete:${state.runId}`;
  if (!state.source) {
    const prepared = await app('/api/cloud/prepare', { localBookId, title: `Disposable deletion QA ${state.runId.slice(0, 8)}`, fileHash: digest, extractionVersion: 'txt-lf-v1', sourceSha256: digest, sourceBytes: bytes.length });
    check(prepared.status === 200 && prepared.body?.source?.owner_id === state.id && prepared.body.uploadUrl, `Source preparation failed with HTTP ${prepared.status}.`);
    state.source = prepared.body.source; state.uploadUrl = prepared.body.uploadUrl; await save(state);
    const uploaded = await raw(state.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: bytes });
    check(uploaded.status === 200, `Synthetic source upload failed with HTTP ${uploaded.status}.`);
  }
  check(state.source.source_object.startsWith(state.id + '/'), 'Source owner path mismatch.');
  const downloaded = await app('/api/cloud/download', { source: state.source.id });
  check(downloaded.status === 200 && downloaded.body?.url, 'Could not sign the disposable source for deletion verification.');
  state.downloadUrl = downloaded.body.url; await save(state);
  const sourceRead = await service(`/storage/v1/object/authenticated/eazo-sources/${state.source.source_object}`);
  check(sourceRead.status === 200 && createHash('sha256').update(sourceRead.bytes).digest('hex') === digest, 'Uploaded source bytes do not match fixture.');
  await checkpoint('disposable 1 KiB source exists with verified bytes');

  phase = 'save reading progress';
  if (!state.saved) {
    state.mutationId ??= randomUUID(); state.deviceId ??= randomUUID(); state.savedAt ??= new Date().toISOString(); await save(state);
    const saved = await app('/api/cloud/snapshot', { source: state.source.id, device: state.deviceId, mutationId: state.mutationId, baseRevision: 0, payload: { schemaVersion: 1, id: localBookId, bookId: localBookId, selections: [], anchors: [], artifacts: [], placements: [], interactionState: {}, mapView: null, graphViewport: null, readerPosition: { fileHash: digest, extractionVersion: 'txt-lf-v1', startOffset: 128 }, footprints: [], bookmarks: [], savedAt: state.savedAt } });
    check(saved.status === 200 && saved.body?.revision === 1, `Synthetic saved revision failed with HTTP ${saved.status}.`);
    state.saved = true; await save(state);
  }
  await checkpoint('disposable reading progress saved as revision one');

  phase = 'delete only the marked synthetic account';
  const finalIdentity = await service(`/auth/v1/admin/users/${state.id}`);
  check(finalIdentity.status === 200 && finalIdentity.body?.email === state.email && finalIdentity.body.user_metadata?.qaPurpose === purpose && finalIdentity.body.user_metadata?.qaRun === state.runId, 'Final account identity check failed; deletion refused.');
  const deleted = await app('/api/cloud/delete-account', { confirmation: 'DELETE' });
  check(deleted.status === 200 && deleted.body?.ok === true, `Application deletion returned HTTP ${deleted.status}; retry remains scoped to this fixture.`);
  state.deleted = true; await save(state);
  await checkpoint('application delete-account completed for the uniquely marked synthetic account');

  phase = 'verify complete removal';
  for (const table of ['books', 'book_sources', 'reading_snapshots', 'reading_heads', 'reading_events', 'analysis_jobs', 'graph_versions', 'generation_usage']) {
    const rows = await service(`/rest/v1/${table}?owner_id=eq.${state.id}&select=*&limit=1`);
    check(rows.status === 200 && Array.isArray(rows.body) && rows.body.length === 0, `Residual disposable rows in ${table}.`);
  }
  for (const bucket of ['eazo-sources', 'eazo-analysis']) {
    const listed = await service(`/storage/v1/object/list/${bucket}`, { method: 'POST', body: JSON.stringify({ prefix: state.id, limit: 100, offset: 0 }) });
    check(listed.status === 200 && Array.isArray(listed.body) && listed.body.length === 0, `Residual disposable storage metadata in ${bucket}.`);
  }
  const absent = await service(`/storage/v1/object/authenticated/eazo-sources/${state.source.source_object}`);
  check([400, 404].includes(absent.status), `Deleted source remains downloadable: HTTP ${absent.status}.`);
  const oldSigned = await raw(state.downloadUrl);
  check([400, 404].includes(oldSigned.status), `Previously signed source remains downloadable: HTTP ${oldSigned.status}.`);
  const removedIdentity = await service(`/auth/v1/admin/users/${state.id}`);
  check(removedIdentity.status === 404, `Deleted auth identity still exists: HTTP ${removedIdentity.status}.`);
  check(!state.cookies['eazo-access'] && !state.cookies['eazo-refresh'] && !state.cookies['eazo-account'], 'Application did not clear auth cookies.');
  await checkpoint('private rows, storage listings/downloads, auth identity, and session cookies removed');

  phase = 'late write deletion fence';
  const lateWorker = await service(`/storage/v1/object/eazo-analysis/${state.id}/late-worker.json`, { method: 'POST', body: '{"qa":"late write must fail"}' });
  check(lateWorker.status >= 400 && lateWorker.status < 500, `Deleted-account worker write was not fenced: HTTP ${lateWorker.status}.`);
  const lateSigned = await raw(state.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: bytes });
  check(lateSigned.status >= 400 && lateSigned.status < 500, `Deleted-account signed upload was not fenced: HTTP ${lateSigned.status}.`);
  const fence = await service(`/rest/v1/account_state?owner_id=eq.${state.id}&select=owner_id`);
  check(fence.status === 200 && fence.body?.length === 1 && fence.body[0].owner_id === state.id, 'Durable deletion tombstone missing.');
  await checkpoint('durable tombstone rejects both late service-worker and previously signed source uploads');
  report.finishedAt = new Date().toISOString(); report.status = 'passed';
  await privateWrite(reportFile, JSON.stringify(report, null, 2));
  pass(`account lifecycle suite finished; private report ${reportFile}`);
} catch (error) {
  console.error(`FAIL ${phase}: ${error instanceof SafeFailure ? error.message : 'Operation failed; credentials and response bodies were not printed.'}`);
  process.exitCode = 1;
}
