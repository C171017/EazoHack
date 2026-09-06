import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

// Only public demo/runtime files. User uploads belong in private Supabase Storage.
const output = path.resolve('public/_pdf');
await rm(output, { recursive: true, force: true });
async function copy(source, destination) {
  const target = path.join(output, destination);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
}
await copy('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'assets/pdf.worker.mjs');
await copy('node_modules/tesseract.js/dist/worker.min.js', 'assets/ocr/worker.min.js');
await copy('node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'assets/ocr/eng.traineddata.gz');
for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
  for (const name of await readdir(`node_modules/pdfjs-dist/${directory}`)) {
    if (/\.(bcmap|pfb|ttf|wasm|js)$/.test(name)) {
      await copy(`node_modules/pdfjs-dist/${directory}/${name}`, `assets/${directory}/${name}`);
    }
  }
}
for (const name of await readdir('node_modules/tesseract.js-core')) {
  if (/^tesseract-core[\w-]*\.wasm(?:\.js)?$/.test(name)) {
    await copy(`node_modules/tesseract.js-core/${name}`, `assets/ocr/${name}`);
  }
}
await copy('data/books/plato-republic/source/the-republic-of-plato-jowett-1888-3rd-edition.pdf', 'republic.pdf');
console.log('Prepared public demo PDF and allowlisted PDF/OCR assets in public/_pdf.');
