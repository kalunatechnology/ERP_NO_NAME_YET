import { Request, Response, NextFunction } from 'express';

const ACCESS_COOKIE_NAME = 'access_token';
const REFRESH_COOKIE_NAME = 'refresh_token';

/**
 * Parses a single cookie value from the raw `Cookie` request header without
 * requiring an external cookie-parser dependency.
 */
export function extractCookie(req: Request, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) {
      const value = part.slice(idx + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return null;
}

function isHttpsRequest(req: Request): boolean {
  if (req.secure) return true;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0]?.trim().toLowerCase();
  if (proto === 'https') return true;
  return process.env.NODE_ENV === 'production';
}

function cookieDomainOption(): { domain?: string } {
  const domain = String(process.env.COOKIE_DOMAIN || '').trim();
  return domain ? { domain } : {};
}

/**
 * Issues HttpOnly, SameSite=Lax (and Secure in HTTPS/production) session cookies
 * so JWT credentials are protected from XSS document.cookie access.
 */
export function setSessionCookies(
  req: Request,
  res: Response,
  tokens: { access?: string; refresh?: string },
): void {
  const secure = isHttpsRequest(req);
  const domainOpt = cookieDomainOption();

  if (tokens.access) {
    res.cookie(ACCESS_COOKIE_NAME, tokens.access, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
      ...domainOpt,
    });
  }

  if (tokens.refresh) {
    res.cookie(REFRESH_COOKIE_NAME, tokens.refresh, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      ...domainOpt,
    });
  }
}

/** Clears HttpOnly session cookies on logout or invalidation. */
export function clearSessionCookies(req: Request, res: Response): void {
  const secure = isHttpsRequest(req);
  const domainOpt = cookieDomainOption();
  res.clearCookie(ACCESS_COOKIE_NAME, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    ...domainOpt,
  });
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/api/v1/auth',
    ...domainOpt,
  });
}

/** Enforces strict no-store cache headers for auth, PII, and financial endpoints. */
export function applyNoStoreHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.vary('Authorization');
  res.vary('Cookie');
  res.vary('X-Company-ID');
}

export function noStoreMiddleware(_req: Request, res: Response, next: NextFunction): void {
  applyNoStoreHeaders(res);
  next();
}
