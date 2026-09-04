/**
 * File: frontend-next/middleware.tsx
 *
 * Purpose: Implements application infrastructure responsibilities in the frontend application.
 * Responsibility: Owns the contracts declared here and connects them to framework discovery or explicit imports without changing unrelated domain state.
 * Integration: Consumers reach this file through static imports, framework conventions, or an explicit script entry point.
 * Dependencies and side effects: Function-level documentation identifies HTTP, database, browser-state, and security effects where they occur.
 */
import { NextResponse, type NextRequest } from 'next/server';

/**
 * middleware implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Lewati file statis, font, icon, dan internal Next.js
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/fonts') ||
    pathname.startsWith('/images') ||
    pathname.startsWith('/api')
  ) {
    return NextResponse.next();
  }

  // Periksa token di cookie
  const token = request.cookies.get('access_token')?.value;
  const isLoginPage = pathname === '/login';

  // 1. Jika belum login dan mengakses halaman selain /login -> redirect ke /login
  if (!token && !isLoginPage) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2. Jika sudah login dan membuka /login atau root (/) -> arahkan ke /dashboard
  if (token && (isLoginPage || pathname === '/')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match seluruh route kecuali file statis
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
