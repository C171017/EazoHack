import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const json = async file => JSON.parse(await readFile(file, 'utf8'));
const root = process.cwd();
const book = 'data/books/plato-republic';
const { version } = await json(`${book}/analysis/current-map.json`);
assert.match(version, /^[a-z0-9-]+$/);
const required = [
  `${book}/raw/republic-jowett-3rd-edition.txt`,
  `${book}/analysis/current-map.json`,
  `${book}/analysis/${version}/graph.json`,
  `${book}/analysis/${version}/hierarchy.json`,
];
for (const trace of ['.next/server/app/page.js.nft.json', '.next/server/app/api/book-map/route.js.nft.json', '.next/server/app/api/pdf/assets/[...asset]/route.js.nft.json', '.next/server/app/api/pdf/source/route.js.nft.json']) {
  const files = new Set((await json(trace)).files.map(file => path.resolve(path.dirname(trace), file)));
  if (trace.includes('book-map') || trace.endsWith('/page.js.nft.json')) {
    for (const file of required) assert(files.has(path.resolve(file)), `${trace} is missing ${file}`);
  }
  let size = 0;
  for (const file of files) {
    assert(!/[/\\]\.env(?:[./\\]|$)/.test(file), 'Environment file found in function trace');
    assert(!file.includes(`${path.sep}.local-dev${path.sep}`), 'Local development file found in trace');
    size += (await stat(file)).size;
  }
  assert(size < 250_000_000, `${trace} exceeds conservative 250 MB function budget`);
  console.log(`${path.relative(root, path.resolve(trace))}: ${(size / 1e6).toFixed(2)} MB traced files`);
}
const rewrites = (await json('.next/routes-manifest.json')).rewrites.beforeFiles;
assert(rewrites.some(rule => rule.source === '/api/pdf/source' && rule.destination === '/_pdf/republic.pdf'), 'Build with VERCEL=1 to validate hosted PDF delivery');
assert(rewrites.some(rule => rule.source === '/api/pdf/assets/:asset*' && rule.destination === '/_pdf/assets/:asset*'), 'PDF/OCR CDN rewrite missing');
for (const file of ['republic.pdf', 'assets/pdf.worker.mjs', 'assets/ocr/eng.traineddata.gz', 'assets/ocr/tesseract-core.wasm.js', 'assets/ocr/tesseract-core-simd.wasm.js']) {
  assert((await stat(`public/_pdf/${file}`)).size > 0, `Missing static asset ${file}`);
}
console.log(`Vercel build checks passed for map ${version}. Final Vercel packaging remains to be verified after authorization.`);
