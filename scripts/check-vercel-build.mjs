import assert from 'node:assert/strict';
import { readFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { loadPublicSamples } from './public-samples.mjs';

const json = async file => JSON.parse(await readFile(file, 'utf8'));
const root = process.cwd();
const samples = await loadPublicSamples();
const budgets = await json(new URL('./performance-budgets.json', import.meta.url));
const traces = (await readdir('.next/server/app', { recursive: true })).filter(file => file.endsWith('.nft.json')).map(file => path.join('.next/server/app', file));
for (const expected of ['page.js.nft.json', 'api/book-map/route.js.nft.json', 'api/cloud/[action]/route.js.nft.json', 'api/assist/[kind]/route.js.nft.json', 'api/pdf/assets/[...asset]/route.js.nft.json', 'api/pdf/source/route.js.nft.json']) {
  assert(traces.includes(path.join('.next/server/app', expected)), `Missing runtime trace: ${expected}`);
}
for (const trace of traces) {
  const files = new Set((await json(trace)).files.map(file => path.resolve(path.dirname(trace), file)));
  const readerTrace = trace === path.join('.next/server/app/page.js.nft.json') || trace === path.join('.next/server/app/api/book-map/route.js.nft.json');
  if (readerTrace) {
    for (const sample of samples) for (const file of sample.required) assert(files.has(path.resolve(file)), `${trace} is missing ${file}`);
  }
  let size = 0;
  for (const file of files) {
    assert(!/[/\\]\.env(?:[./\\]|$)/.test(file), 'Environment file found in function trace');
    assert(!file.includes(`${path.sep}.local-dev${path.sep}`), 'Local development file found in trace');
    size += (await stat(file)).size;
  }
  const budget = readerTrace ? budgets.readerTraceBytes : budgets.functionTraceBytes;
  assert(size < budget, `${trace} exceeds ${budget} byte function-trace budget`);
  console.log(`${path.relative(root, path.resolve(trace))}: ${(size / 1e6).toFixed(2)} MB traced files`);
}
let cssRaw = 0, cssGzip = 0;
for (const file of await readdir('.next/static/css')) {
  if (!file.endsWith('.css')) continue;
  const content = await readFile(path.join('.next/static/css', file));
  cssRaw += content.byteLength; cssGzip += gzipSync(content, { level: 9 }).byteLength;
}
assert(cssRaw > 0 && cssRaw <= budgets.cssRawBytes, `CSS raw budget exceeded: ${cssRaw} bytes`);
assert(cssGzip <= budgets.cssGzipBytes, `CSS gzip budget exceeded: ${cssGzip} bytes`);
console.log(`All emitted CSS: ${cssRaw} raw / ${cssGzip} gzip bytes (offline compression, not measured transfer)`);
const rewrites = (await json('.next/routes-manifest.json')).rewrites.beforeFiles;
assert(rewrites.some(rule => rule.source === '/api/pdf/source' && rule.destination === '/_pdf/republic.pdf'), 'Build with VERCEL=1 to validate hosted PDF delivery');
assert(rewrites.some(rule => rule.source === '/api/pdf/assets/:asset*' && rule.destination === '/_pdf/assets/:asset*'), 'PDF/OCR CDN rewrite missing');
for (const file of ['republic.pdf', 'assets/pdf.worker.mjs', 'assets/ocr/eng.traineddata.gz', 'assets/ocr/tesseract-core.wasm.js', 'assets/ocr/tesseract-core-simd.wasm.js']) {
  assert((await stat(`public/_pdf/${file}`)).size > 0, `Missing static asset ${file}`);
}
console.log(`Vercel build checks passed for ${samples.map(sample => sample.mapVersion).join(', ')}. Final Vercel packaging remains a separate check.`);
