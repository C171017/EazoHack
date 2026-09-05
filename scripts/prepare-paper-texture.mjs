// Offline asset preparation; never imported by the application.
// Uses sharp, already installed with Next.js. Run after npm ci:
// node scripts/prepare-paper-texture.mjs
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../design/paper-candidates/a-warm-book-paper.png', import.meta.url));
const output = fileURLToPath(new URL('../public/textures/', import.meta.url));
await mkdir(output, { recursive: true });

const manifest = [];
for (const size of [600, 1200]) {
  for (const format of ['avif', 'webp', 'jpg']) {
    const filename = `warm-book-v1-${size}.${format}`;
    const image = sharp(source).resize(size, size, { withoutEnlargement: true }).removeAlpha().toColourspace('srgb');
    // Fine, low-contrast fibers need more quality than ordinary photographs.
    if (format === 'avif') image.avif({ quality: 70, effort: 7, chromaSubsampling: '4:4:4' });
    if (format === 'webp') image.webp({ quality: 88, effort: 6, smartSubsample: true });
    if (format === 'jpg') image.jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: '4:4:4' });
    const info = await image.toFile(`${output}/${filename}`);
    manifest.push({ filename, width: info.width, height: info.height, bytes: info.size });
  }
}

await writeFile(new URL('../design/paper-candidates/web-assets.json', import.meta.url), `${JSON.stringify(manifest, null, 2)}\n`);
console.table(manifest);
