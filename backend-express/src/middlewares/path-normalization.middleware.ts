import { NextFunction, Request, Response } from 'express';

/**
 * Canonicalize repeated slashes in an HTTP request path while preserving the
 * query string. This protects Express route matching from URLs assembled as
 * `${BASE_URL}/api/...` when BASE_URL already ends with `/`.
 *
 * Encoded slashes (%2F) are intentionally left untouched.
 */
export function normalizeRequestUrl(rawUrl: string): string {
  if (!rawUrl.startsWith('/')) return rawUrl;

  const queryIndex = rawUrl.indexOf('?');
  const pathname = queryIndex >= 0 ? rawUrl.slice(0, queryIndex) : rawUrl;
  const query = queryIndex >= 0 ? rawUrl.slice(queryIndex) : '';
  const normalizedPathname = pathname.replace(/\/{2,}/g, '/');

  return `${normalizedPathname}${query}`;
}

/**
 * Normalize the URL before any router, authentication, tenant, RBAC, or audit
 * middleware sees it so every layer evaluates the same canonical path.
 */
export function normalizeRequestPath(req: Request, _res: Response, next: NextFunction): void {
  const normalizedUrl = normalizeRequestUrl(req.url);
  const normalizedOriginalUrl = normalizeRequestUrl(req.originalUrl);

  if (normalizedUrl !== req.url) req.url = normalizedUrl;
  if (normalizedOriginalUrl !== req.originalUrl) req.originalUrl = normalizedOriginalUrl;

  next();
}
