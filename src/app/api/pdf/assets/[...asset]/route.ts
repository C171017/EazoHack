import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
/** Explicit package subdirectories only; never expose arbitrary node_modules or source paths. */
export async function GET(_request: Request, context: { params: Promise<{ asset: string[] }> }) {
  const { asset } = await context.params;
  if (asset.some(s => !/^[\w.-]+$/.test(s) || s.includes('..'))) return new Response('Not found', { status: 404 });
  const name = asset.join('/');
  let file: string | null = null;
  if (name === 'pdf.worker.mjs') file = 'pdfjs-dist/build/pdf.worker.min.mjs';
  if (name === 'ocr/worker.min.js') file = 'tesseract.js/dist/worker.min.js';
  if (name === 'ocr/eng.traineddata.gz') file = '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz';
  if (asset.length === 2 && asset[0] === 'ocr' && /^tesseract-core[\w-]*\.wasm(?:\.js)?$/.test(asset[1])) file = `tesseract.js-core/${asset[1]}`;
  if (asset.length === 2 && ['cmaps', 'standard_fonts', 'wasm'].includes(asset[0]) && /\.(bcmap|pfb|ttf|wasm|js)$/.test(asset[1])) file = `pdfjs-dist/${name}`;
  if (!file) return new Response('Not found', { status: 404 });
  try {
    const bytes = await readFile(path.join(process.cwd(), 'node_modules', file));
    const type = /\.m?js$/.test(file) ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream';
    return new Response(bytes, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new Response('PDF runtime asset unavailable', { status: 404 }); }
}
