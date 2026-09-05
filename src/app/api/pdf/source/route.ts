import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  const file = path.join(process.cwd(), 'data/books/plato-republic/source/the-republic-of-plato-jowett-1888-3rd-edition.pdf');
  const { size } = await stat(file);
  const headers = new Headers({ 'Content-Type': 'application/pdf', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600', 'Content-Disposition': 'inline; filename="republic.pdf"' });
  const range = request.headers.get('range');
  let start = 0, end = size - 1;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  }
  headers.set('Content-Length', String(end - start + 1));
  const stream = createReadStream(file, { start, end });
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status: range ? 206 : 200, headers });
}
