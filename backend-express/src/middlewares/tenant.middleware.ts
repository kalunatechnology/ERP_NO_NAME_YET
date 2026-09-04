/**
 * File: backend-express/src/middlewares/tenant.middleware.ts
 *
 * Purpose: Implements request middleware responsibilities for the platform domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { ForbiddenError } from '../utils/errors';
import { isSuperAdmin } from '../types/roles';

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
export async function resolveTenant(req: Request, _res: Response, next: NextFunction): Promise<void> {
  // 1. Header takes priority (matches Django CORS_ALLOW_HEADERS x-company-id)
  const fromHeader = req.headers['x-company-id'];
  const headerVal = Array.isArray(fromHeader) ? fromHeader[0] : fromHeader;

  // 2. Query param fallback
  const fromQuery = req.query['company_id'] as string | undefined;

  const requestedCompanyId = headerVal ?? fromQuery ?? null;
  const user = req.user!;

  try {
    if (isSuperAdmin(user.roles)) {
      if (!requestedCompanyId || requestedCompanyId === 'all') {
        req.companyId = null;
        return next();
      }

      const company = await prisma.core_company.findFirst({
        where: { id: requestedCompanyId },
        select: { id: true },
      });
      if (!company) {
        return next(new ForbiddenError('Company yang diminta tidak ditemukan.'));
      }
      req.companyId = company.id;
      return next();
    }

    const assignedCompanyId = user.company_id;
    if (!assignedCompanyId) {
      return next(new ForbiddenError('User belum memiliki assignment company yang aktif.'));
    }
    if (requestedCompanyId && requestedCompanyId !== assignedCompanyId) {
      return next(new ForbiddenError('User tidak memiliki akses ke company yang diminta.'));
    }

    req.companyId = assignedCompanyId;
    return next();
  } catch (error) {
    return next(error);
  }
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
  if (!user) return {};

  const tenantField = options?.tenantField ?? 'tenant_id';
  const companyField = options?.companyField ?? 'company_id';

  const filter: Record<string, unknown> = {};

  if (isSuperAdmin(user.roles)) {
    if (req.companyId) filter[companyField] = req.companyId;
    return filter;
  }

  // Tenant isolation
  if (user.tenant_id) {
    filter[tenantField] = user.tenant_id;
  }

  // Company isolation
  if (req.companyId) {
    filter[companyField] = req.companyId;
  }

  return filter;
}
