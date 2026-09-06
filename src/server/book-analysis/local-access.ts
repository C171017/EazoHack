import { RequestBodyError } from '../http';
export function requireLocalAnalysis(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get('host') ?? url.host;
  const publicUrl = new URL(`${url.protocol}//${host}`);
  if (process.env.NODE_ENV !== 'development' || process.env.VERCEL || !['localhost', '127.0.0.1', '[::1]'].includes(publicUrl.hostname)) throw new RequestBodyError('Local book analysis is unavailable here. Use the Cloud library to create a hosted map.', 503);
  const origin = request.headers.get('origin');
  if (origin && origin !== publicUrl.origin) throw new RequestBodyError('Cross-origin analysis requests are not allowed.', 403);
}
