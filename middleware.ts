import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  // Redirect custom domain root to landing page
  if (hostname.includes('logicsupplies.ca') && request.nextUrl.pathname === '/' && !request.nextUrl.searchParams.has('mode')) {
    return NextResponse.redirect(new URL('/landing', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/'],
};
