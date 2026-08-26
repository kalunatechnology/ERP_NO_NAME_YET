import { Request, Response, NextFunction } from 'express';

/**
 * Tenant & Multi-Company Scoping Middleware.
 *
 * Matches Django's ERPQueryFilterBackend + scope_queryset() behavior.
 *
 * Company resolution order:
 *   1. X-Company-ID request header (explicit scope override)
 *   2. query param `company_id`
 *   3. First company accessible to user (resolved at query time by service layer)
 *
 * The resolved companyId is injected into req.companyId for downstream services.
 */
export function resolveTenant(req: Request, _res: Response, next: NextFunction): void {
  // 1. Header takes priority (matches Django CORS_ALLOW_HEADERS x-company-id)
  const fromHeader = req.headers['x-company-id'];
  const headerVal = Array.isArray(fromHeader) ? fromHeader[0] : fromHeader;

  // 2. Query param fallback
  const fromQuery = req.query['company_id'] as string | undefined;

  req.companyId = headerVal ?? fromQuery ?? null;

  next();
}

/**
 * Build a Prisma WHERE clause fragment for tenant-scoped queries.
 *
 * Mirrors scoping.py's scope_queryset() logic:
 *   - Superusers bypass all scoping
 *   - tenant_id scoping always applied if user has tenant
 *   - company_id scoping applied if companyId resolved
 */
export function buildScopeFilter(
  req: Request,
  options?: {
    tenantField?: string;
    companyField?: string;
  },
): Record<string, unknown> {
  const user = req.user;
  if (!user || user.is_superuser) return {};

  const tenantField = options?.tenantField ?? 'tenant_id';
  const companyField = options?.companyField ?? 'company_id';

  const filter: Record<string, unknown> = {};

  // Tenant isolation
  if (user.tenant_id) {
    filter[tenantField] = { in: [user.tenant_id, null] };
  }

  // Company isolation
  if (req.companyId) {
    filter[companyField] = { in: [req.companyId, null] };
  }

  return filter;
}
