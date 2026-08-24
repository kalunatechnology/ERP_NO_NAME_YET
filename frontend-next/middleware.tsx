import { NextResponse, type NextRequest } from 'next/server';

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