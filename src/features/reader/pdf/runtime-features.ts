type PdfFeatures = {
  Map?: { prototype: object };
  Set?: { prototype: object };
  Iterator?: { prototype: object };
  Promise?: object;
  Math?: object;
  Uint8Array?: { prototype: object };
};

function methods(value: object | undefined, names: string[]) {
  return !!value && names.every(name => typeof (value as Record<string, unknown>)[name] === 'function');
}

/** PDF.js 6 uses these APIs in both its main module and its separate worker.
 * Select the upstream compatibility build before importing either module;
 * syntax transpilation alone cannot supply missing built-in methods.
 */
export function supportsModernPdfRuntime(scope: PdfFeatures = globalThis) {
  return methods(scope.Map?.prototype, ['getOrInsert', 'getOrInsertComputed'])
    && methods(scope.Set?.prototype, ['intersection', 'difference', 'union', 'isSubsetOf'])
    && methods(scope.Iterator?.prototype, ['map', 'filter', 'reduce', 'toArray'])
    && methods(scope.Promise, ['withResolvers', 'try'])
    && methods(scope.Math, ['sumPrecise'])
    && methods(scope.Uint8Array, ['fromBase64'])
    && methods(scope.Uint8Array?.prototype, ['toBase64']);
}
