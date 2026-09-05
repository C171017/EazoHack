import type { NextConfig } from 'next';

const config: NextConfig = {
  // The PDF asset handler reads these at runtime; keep them in traced deployments.
  outputFileTracingIncludes: {
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
};

export default config;
