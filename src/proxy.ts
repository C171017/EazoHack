import { NextResponse, type NextRequest } from 'next/server';
import { accessNeedsRefresh } from './server/cloud/auth';

/** Cookie renewal belongs in a Route Handler, before Server Component rendering. */
export function proxy(request: NextRequest) {
  if (request.cookies.has('eazo-refresh') && accessNeedsRefresh(request.cookies.get('eazo-access')?.value)) {
    const target = new URL('/auth/refresh', request.url);
    target.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
    return new Response(null, { status: 307, headers: { Location: target.pathname + target.search, 'Cache-Control': 'private, no-store' } });
  }
  return NextResponse.next();
}
export const config = { matcher: ['/', '/cloud'] };
