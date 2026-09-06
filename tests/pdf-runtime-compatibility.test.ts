import test from 'node:test';
import assert from 'node:assert/strict';
import { supportsModernPdfRuntime } from '../src/features/reader/pdf/runtime-features';
import { GET } from '../src/app/api/pdf/assets/[...asset]/route';

const methods = (names: string[]) => Object.fromEntries(names.map(name => [name, () => {}]));
function modern() {
  return {
    Map: { prototype: methods(['getOrInsert', 'getOrInsertComputed']) },
    Set: { prototype: methods(['intersection', 'difference', 'union', 'isSubsetOf']) },
    Iterator: { prototype: methods(['map', 'filter', 'reduce', 'toArray']) },
    Promise: methods(['withResolvers', 'try']), Math: methods(['sumPrecise']),
    Uint8Array: { ...methods(['fromBase64']), prototype: methods(['toBase64']) },
  };
}

test('older engine built-ins select compatibility mode without a browser-name check', () => {
  assert.equal(supportsModernPdfRuntime(modern()), true);
  const withoutMapUpsert = modern(); delete withoutMapUpsert.Map.prototype.getOrInsertComputed;
  assert.equal(supportsModernPdfRuntime(withoutMapUpsert), false);
  assert.equal(supportsModernPdfRuntime({ ...modern(), Iterator: undefined }), false);
  const withoutPreciseSum = modern(); delete withoutPreciseSum.Math.sumPrecise;
  assert.equal(supportsModernPdfRuntime(withoutPreciseSum), false);
  const withoutPromiseTry = modern(); delete withoutPromiseTry.Promise.try;
  assert.equal(supportsModernPdfRuntime(withoutPromiseTry), false);
  assert.equal(supportsModernPdfRuntime({}), false);
});

test('both PDF worker builds are served as JavaScript and traversal stays denied', async () => {
  for (const name of ['pdf.worker.mjs', 'pdf.legacy.worker.mjs']) {
    const response = await GET(new Request(`http://localhost/api/pdf/assets/${name}?v=test`), {params: Promise.resolve({asset: [name]})});
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/javascript');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok((await response.arrayBuffer()).byteLength > 1000);
  }
  const denied = await GET(new Request('http://localhost/api/pdf/assets/other'), {params: Promise.resolve({asset: ['..', 'legacy', 'build', 'pdf.mjs']})});
  assert.equal(denied.status, 404);
});
