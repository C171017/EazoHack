import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { loadPublicSamples } from './public-samples.mjs';

const base = new URL(process.argv[2] || 'http://127.0.0.1:3106');
assert(['http:', 'https:'].includes(base.protocol));
assert(!base.username && !base.password, 'Do not put credentials in the URL');
const samples = await loadPublicSamples();
const budgets = JSON.parse(await readFile(new URL('./performance-budgets.json', import.meta.url), 'utf8'));
// Optional deployment-protection bypass value is read from the process, never printed.
const headers = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {};
async function check(route, expected, options = {}, validate) {
  const started = performance.now();
  const response = await fetch(new URL(route, base), { ...options, headers: { ...headers, ...options.headers }, redirect: 'manual', signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, expected, `${route}: unexpected status (login/protection redirects are failures)`);
  if (validate) await validate(response);
  else await response.arrayBuffer();
  console.log(`PASS ${route}: ${expected}, ${Math.round(performance.now() - started)} ms`);
}
await check('/', 200, {}, async response => assert((await response.text()).includes('Eazo')));
for (const sample of samples) {
  await check(`/?book=${sample.id}`, 200, {}, async response => {
    const bytes = Buffer.from(await response.arrayBuffer());
    assert(bytes.includes(Buffer.from('Complete TXT source')), `${sample.id}: reader is missing`);
    assert(bytes.byteLength <= budgets.readerHtmlBytes, `${sample.id}: HTML byte budget exceeded`);
    const gzipBytes = gzipSync(bytes, { level: 9 }).byteLength;
    assert(gzipBytes <= budgets.readerHtmlGzipBytes, `${sample.id}: HTML gzip budget exceeded`);
    console.log(`${sample.id} HTML: ${bytes.byteLength} decoded / ${gzipBytes} offline gzip bytes`);
  });
  await check(`/api/book-map?kind=heat-index&version=${encodeURIComponent(sample.mapVersion)}`, 200, {}, async response => {
    const bytes = Buffer.from(await response.arrayBuffer());
    assert(bytes.byteLength <= budgets.mapPageBytes, `${sample.id}: map page byte budget exceeded`);
    const body = JSON.parse(bytes.toString('utf8'));
    assert.equal(body.version, sample.mapVersion);
    assert(body.total > 0 && body.leaves.length > 0);
  });
}
await check('/api/book-map?kind=heat-index&version=stale', 409);
await check('/api/pdf/source', 206, { headers: { range: 'bytes=0-1023' } }, async response => {
  assert.match(response.headers.get('content-type') || '', /application\/pdf/);
  assert.match(response.headers.get('content-range') || '', /^bytes 0-1023\//);
  assert.equal((await response.arrayBuffer()).byteLength, 1024);
});
await check('/api/pdf/assets/pdf.worker.mjs', 200, {}, async response => assert.match(response.headers.get('content-type') || '', /javascript/));
await check('/api/pdf/assets/pdf.legacy.worker.mjs', 200, {}, async response => assert.match(response.headers.get('content-type') || '', /javascript/));
await check('/api/pdf/assets/ocr/tesseract-core.wasm.js', 200, {}, async response => assert((await response.arrayBuffer()).byteLength > 4_500_000));
await check('/api/pdf/assets/ocr/eng.traineddata.gz', 200);
await check('/api/pdf/assets/package.json', 404);
await check('/api/dev/models', 404);
await check('/api/pdf/layout', 200);
// Missing origin/session must be rejected before a paid model can be called.
await check('/api/assist/all', 403, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
console.log('Read-only/invalid-input smoke checks passed. Browser, auth, cloud jobs, AI and Shanghai network tests remain separate.');
