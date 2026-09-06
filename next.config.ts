import type { NextConfig } from 'next';

const config: NextConfig = {
  // The PDF asset handler reads these at runtime; keep them in traced deployments.
  outputFileTracingIncludes: {
    '/': [
      './data/books/hong-lou-meng/derived/hong-lou-meng-reading.txt',
      './data/books/plato-republic/raw/republic-jowett-3rd-edition.txt',
      './data/books/hong-lou-meng/analysis/current-map.json',
      './data/books/hong-lou-meng/analysis/semantic-hierarchy-*/graph.json',
      './data/books/hong-lou-meng/analysis/semantic-hierarchy-*/hierarchy.json',
      './data/books/plato-republic/analysis/current-map.json',
      './data/books/plato-republic/analysis/semantic-hierarchy-*/graph.json',
      './data/books/plato-republic/analysis/semantic-hierarchy-*/hierarchy.json',
    ],
    '/api/book-map': [
      './data/books/hong-lou-meng/derived/hong-lou-meng-reading.txt',
      './data/books/plato-republic/raw/republic-jowett-3rd-edition.txt',
      './data/books/hong-lou-meng/analysis/current-map.json',
      './data/books/hong-lou-meng/analysis/semantic-hierarchy-*/graph.json',
      './data/books/hong-lou-meng/analysis/semantic-hierarchy-*/hierarchy.json',
      './data/books/plato-republic/analysis/current-map.json',
      './data/books/plato-republic/analysis/semantic-hierarchy-*/graph.json',
      './data/books/plato-republic/analysis/semantic-hierarchy-*/hierarchy.json',
    ],
    '/api/pdf/source': [
      './data/books/plato-republic/source/the-republic-of-plato-jowett-1888-3rd-edition.pdf',
    ],
    '/api/pdf/assets/*': [
      './node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
      './node_modules/pdfjs-dist/cmaps/*.bcmap',
      './node_modules/pdfjs-dist/standard_fonts/*',
      './node_modules/pdfjs-dist/wasm/*',
      './node_modules/tesseract.js/dist/worker.min.js',
      './node_modules/tesseract.js-core/*.wasm*',
      './node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
    ],
  },
  // Build-time flag supplied by Vercel. Preserve local API handlers while serving
  // large, public demo assets from the CDN in hosted builds (no function body cap).
  async rewrites() {
    return {
      beforeFiles: process.env.VERCEL === '1' ? [
        { source: '/api/pdf/assets/:asset*', destination: '/_pdf/assets/:asset*' },
        { source: '/api/pdf/source', destination: '/_pdf/republic.pdf' },
      ] : [],
    };
  },
};

export default config;
