import { NextResponse, type NextRequest } from 'next/server';
import { accessNeedsRefresh, authOrigin } from './server/cloud/auth';
import { requestError } from './server/http';

/** Cookie renewal belongs in a Route Handler, before Server Component rendering. */
export function proxy(request: NextRequest) {
  if (request.cookies.has('eazo-refresh') && accessNeedsRefresh(request.cookies.get('eazo-access')?.value)) {
    // Next's proxy adapter parses Location as an absolute URL. Use the public
    // configured origin so internal deployment hostnames never reach the browser.
    let origin: string;
    try { origin = authOrigin(request); } catch (error) { return requestError(error); }
    const target = new URL('/auth/refresh', origin);
    target.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(target, { status: 307, headers: { 'Cache-Control': 'private, no-store' } });
  }
  return NextResponse.next();
}
export const config = { matcher: ['/', '/cloud', '/account'] };
