/**
 * File: backend-express/src/middlewares/auth.middleware.ts
 *
 * Purpose: Implements request middleware responsibilities for the platform domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { UnauthorizedError } from '../utils/errors';
import prisma from '../config/database';
import { loadUserAccessContext } from '../modules/accounts/access-context.service';

/**
 * Authentication Middleware.
 *
 * Extracts Bearer token from Authorization header,
 * verifies JWT signature, loads user from DB, injects into req.user.
 *
 * Matches Django: JWTAuthentication + IsAuthenticated behavior.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Token autentikasi tidak valid atau tidak tersedia.'));
  }

  const token = header.slice(7);
  const payload = verifyAccessToken(token);
  if (!payload) {
    return next(new UnauthorizedError('Token autentikasi tidak valid atau sudah kedaluwarsa.'));
  }

  // Load fresh user from DB to ensure account is still active
  const user = await prisma.iam_user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      full_name: true,
      is_staff: true,
      status: true,
      tenant_id: true,
      is_active: true,
    },
  });

  if (!user || !user.is_active) {
    return next(new UnauthorizedError('Akun tidak aktif atau tidak ditemukan.'));
  }

  const access = await loadUserAccessContext(user.id);

  // Administrative authority is derived from canonical role codes, not legacy booleans.
  req.user = {
    id: user.id,
    email: user.email,
    full_name: user.full_name ?? '',
    is_staff: user.is_staff,
    is_superuser: access.isSuperAdmin,
    status: user.status ?? 'ACTIVE',
    tenant_id: user.tenant_id,
    company_id: access.companyId,
    accessible_company_ids: access.companyIds,
    roles: access.roles,
    active_role_code: access.activeRoleCode,
    enabled_modules: access.enabledModules,
    delegated_modules: access.delegatedModules,
  };
  req.tenantId = user.tenant_id;

  next();
}

/**
 * Optional authentication: attach user if token present, but don't reject if missing.
 * Use for endpoints that are public but may show more info when authenticated.
 */
export async function optionalAuthenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();

  const token = header.slice(7);
  const payload = verifyAccessToken(token);
  if (!payload) return next();

  const user = await prisma.iam_user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      full_name: true,
      is_staff: true,
      status: true,
      tenant_id: true,
      is_active: true,
    },
  });

  if (user?.is_active) {
    const access = await loadUserAccessContext(user.id);
    req.user = {
      id: user.id,
      email: user.email,
      full_name: user.full_name ?? '',
      is_staff: user.is_staff,
      is_superuser: access.isSuperAdmin,
      status: user.status ?? 'ACTIVE',
      tenant_id: user.tenant_id,
      company_id: access.companyId,
      accessible_company_ids: access.companyIds,
      roles: access.roles,
      active_role_code: access.activeRoleCode,
      enabled_modules: access.enabledModules,
      delegated_modules: access.delegatedModules,
    };
    req.tenantId = user.tenant_id;
  }

  next();
}
