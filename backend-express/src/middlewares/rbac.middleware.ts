/**
 * File: backend-express/src/middlewares/rbac.middleware.ts
 *
 * Purpose: Implements request middleware responsibilities for the platform domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';
import { isSuperAdmin, RoleCode } from '../types/roles';
import { hasModuleOverride } from '../utils/module-permissions';

/**
 * RBAC Middleware — Role-Based Access Control.
 *
 * Translates Django's is_staff / is_superuser / role checks
 * into Express middleware factories.
 */

/**
 * Require that the caller's currently active role is allowed. Superusers always
 * pass. A role check immediately following `requireModuleAccess` also accepts
 * an explicit Company-Admin per-user delegation for that same module and HTTP
 * mode; the delegation can never exceed the Super-Admin company entitlement.
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }
    if (isSuperAdmin(req.user.roles)) return next();

    const activeRole = req.user.active_role_code ?? req.user.roles[0] ?? '';
    const hasRole = allowedRoles.includes(activeRole);
    const isWriteMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const hasDelegatedModuleAccess = Boolean(
      req.moduleAccess?.delegated
      && (isWriteMethod ? req.moduleAccess.allowWrite : req.moduleAccess.allowRead),
    );
    if (!hasRole && !hasDelegatedModuleAccess) {
      return next(
        new ForbiddenError(
          `Akses ditolak untuk role aktif ${activeRole || 'tidak tersedia'}. Pilih salah satu role: ${allowedRoles.join(', ')}.`,
        ),
      );
    }
    next();
  };
}

/**
 * Active role is the fallback. A validated Admin module override has priority;
 * business checks such as ownership and Maker–Checker run separately.
 */
export function requireActiveRole(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());
    if (isSuperAdmin(req.user.roles)) return next();

    const activeRole = req.user.active_role_code ?? req.user.roles[0] ?? '';
    if (!allowedRoles.includes(activeRole) && !hasModuleOverride(req)) {
      return next(new ForbiddenError(
        `Aksi ini membutuhkan role aktif: ${allowedRoles.join(', ')}. ` +
        `Role aktif Anda: ${activeRole || 'tidak terdeteksi'}.`,
      ));
    }
    return next();
  };
}

export interface ActiveRoleMutationPolicy {
  restrictedRoles: string[];
  allowedMutationPaths?: Array<RegExp | { path: RegExp; methods?: string[] }>;
  message: string;
}

/**
 * Restricts mutations according to the caller's currently selected role.
 *
 * Read requests and validated Admin write overrides pass. Without an override,
 * a restricted role may execute only explicitly allow-listed workflow actions.
 *
 * Security note: this middleware uses active_role_code rather than the union of
 * all assigned roles. Switching role therefore changes the active permission
 * context immediately without requiring a new login.
 */
export function restrictActiveRoleMutations(policy: ActiveRoleMutationPolicy) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());
    if (isSuperAdmin(req.user.roles)) return next();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) return next();
    if (hasModuleOverride(req)) return next();

    const activeRole = req.user.active_role_code ?? req.user.roles[0] ?? '';
    if (!policy.restrictedRoles.includes(activeRole)) return next();

    const requestPath = req.originalUrl.split('?')[0] ?? req.path;
    const allowed = (policy.allowedMutationPaths ?? []).some((rule) => {
      if (rule instanceof RegExp) return rule.test(requestPath);
      return rule.path.test(requestPath)
        && (!rule.methods || rule.methods.includes(req.method.toUpperCase()));
    });
    if (allowed) return next();

    return next(new ForbiddenError(policy.message));
  };
}

/**
 * Require all listed roles (strict intersection).
 */
export function requireAllRoles(...requiredRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());
    if (isSuperAdmin(req.user.roles)) return next();

    const hasAll = requiredRoles.every((r) => req.user!.roles.includes(r));
    if (!hasAll) {
      return next(new ForbiddenError(`Akses ditolak. Diperlukan semua role: ${requiredRoles.join(', ')}.`));
    }
    next();
  };
}

/**
 * Require the user to be Django staff (is_staff = true).
 */
export function requireStaff(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(new UnauthorizedError());
  if (isSuperAdmin(req.user.roles) || req.user.active_role_code === RoleCode.COMPANY_ADMIN) return next();
  return next(new ForbiddenError('Akses ditolak. Diperlukan izin staff.'));
}

/**
 * Require the user to be a Django superuser.
 */
export function requireSuperuser(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(new UnauthorizedError());
  if (isSuperAdmin(req.user.roles)) return next();
  return next(new ForbiddenError('Akses ditolak. Diperlukan izin superuser.'));
}

/**
 * Require the user to be the owner of the resource or a superuser.
 * @param getOwnerId - function to extract the owner ID from request
 */
export function requireOwnerOrSuperuser(getOwnerId: (req: Request) => string | undefined) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());
    if (isSuperAdmin(req.user.roles)) return next();

    const ownerId = getOwnerId(req);
    if (ownerId === req.user.id) return next();

    return next(new ForbiddenError('Akses ditolak. Anda bukan pemilik resource ini.'));
  };
}

/**
 * requireCompanyAdmin implements a request-bound security or governance step.
 *
 * Input/output: Reads the Express request/response context, attaches only the identity/scope metadata declared in the implementation, then either calls `next` or rejects the request.
 * Security intent: The check runs before protected business handlers so unauthenticated, cross-company, unauthorized, or invalid requests cannot reach persistence mutations.
 * Data/side effects: May mutate request metadata or the response, as shown in the implementation.
 */
export function requireCompanyAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(new UnauthorizedError());
  if (isSuperAdmin(req.user.roles) || req.user.active_role_code === RoleCode.COMPANY_ADMIN) return next();
  return next(new ForbiddenError('Aksi ini memerlukan role Company Admin atau Super Admin.'));
}

/**
 * requireAdminForWrite implements a request-bound security or governance step.
 *
 * Input/output: Reads the Express request/response context, attaches only the identity/scope metadata declared in the implementation, then either calls `next` or rejects the request.
 * Security intent: The check runs before protected business handlers so unauthenticated, cross-company, unauthorized, or invalid requests cannot reach persistence mutations.
 * Data/side effects: May mutate request metadata or the response, as shown in the implementation.
 */
export function requireAdminForWrite(req: Request, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  return requireCompanyAdmin(req, res, next);
}

/**
 * requireCompanyContextForWrite implements a request-bound security or governance step.
 *
 * Input/output: Reads the Express request/response context, attaches only the identity/scope metadata declared in the implementation, then either calls `next` or rejects the request.
 * Security intent: The check runs before protected business handlers so unauthenticated, cross-company, unauthorized, or invalid requests cannot reach persistence mutations.
 * Data/side effects: May mutate request metadata or the response, as shown in the implementation.
 */
export function requireCompanyContextForWrite(req: Request, _res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!req.companyId) {
    return next(new ForbiddenError('Pilih satu company eksplisit sebelum melakukan perubahan data.'));
  }
  return next();
}

/**
 * requireSuperAdminForWrite implements a request-bound security or governance step.
 *
 * Input/output: Reads the Express request/response context, attaches only the identity/scope metadata declared in the implementation, then either calls `next` or rejects the request.
 * Security intent: The check runs before protected business handlers so unauthenticated, cross-company, unauthorized, or invalid requests cannot reach persistence mutations.
 * Data/side effects: May mutate request metadata or the response, as shown in the implementation.
 */
export function requireSuperAdminForWrite(req: Request, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  return requireSuperuser(req, res, next);
}

/**
 * enforceSuperAdminReadOnly implements a request-bound security or governance step.
 *
 * Input/output: Reads the Express request/response context, attaches only the identity/scope metadata declared in the implementation, then either calls `next` or rejects the request.
 * Security intent: The check runs before protected business handlers so unauthenticated, cross-company, unauthorized, or invalid requests cannot reach persistence mutations.
 * Data/side effects: May mutate request metadata or the response, as shown in the implementation.
 */
export function enforceSuperAdminReadOnly(req: Request, _res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (!req.user || !isSuperAdmin(req.user.roles) || ['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return next();
  }

  const requestPath = req.path.replace(/\/+$/, '') || '/';
  const personalUtilityPosts = new Set([
    '/recent-items/track', '/core/recent-items/track', '/core/track-recent',
    '/sidebar-feed/mark-read', '/core/sidebar-feed/mark-read',
  ]);
  if (method === 'POST' && personalUtilityPosts.has(requestPath)) return next();

  const governancePrefixes = ['/auth/', '/accounts/', '/core/companies', '/core/tenants', '/core/integration-sources', '/master-data/departments', '/master-data/cost-centers'];
  if (governancePrefixes.some((prefix) => requestPath.startsWith(prefix))) {
    return next();
  }

  return next(new ForbiddenError('Super Admin hanya memiliki akses baca untuk data operasional.'));
}

export function requireModulePermission(
  moduleCode: string,
  action: 'read' | 'write' | 'approve' | 'delete' | 'manage_users' = 'read',
) {
  const normalizedModule = String(moduleCode || '').trim().toUpperCase();
  const normalizedAction = action.toUpperCase();
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());
    if (isSuperAdmin(req.user.roles) || req.user.active_role_code === RoleCode.COMPANY_ADMIN) return next();

    const overrides: any[] = (req.user as any)?.permission_overrides ?? [];
    const explicitOverride = overrides.find(
      (o) => String(o.module_code || '').toUpperCase() === normalizedModule && String(o.action_code || '').toUpperCase() === normalizedAction
    );
    if (explicitOverride) {
      if (String(explicitOverride.effect).toUpperCase() === 'DENY') {
        return next(new ForbiddenError(`Akses ditolak secara eksplisit untuk aksi '${action}' pada modul ${normalizedModule}.`));
      }
      if (String(explicitOverride.effect).toUpperCase() === 'ALLOW') {
        return next();
      }
    }

    const assignments: any[] = (req.user as any)?.module_assignments ?? [];
    const match = assignments.find(
      (a) => String(a.module_code || '').toUpperCase() === normalizedModule && a.status === 'ACTIVE'
    );
    if (match) {
      const ok =
        action === 'read' ? match.allow_read !== false
        : action === 'write' ? Boolean(match.allow_write)
        : action === 'approve' ? Boolean(match.allow_approve)
        : action === 'delete' ? Boolean(match.allow_delete)
        : Boolean(match.allow_manage_users);
      if (ok) return next();
    }

    const capabilities: any[] = (req.user as any)?.cross_module_capabilities ?? [];
    const hasCrossBridge = capabilities.some(
      (c) =>
        String(c.target_module_code || '').toUpperCase() === normalizedModule
        && c.status === 'ACTIVE'
        && Array.isArray(c.allowed_actions)
        && (c.allowed_actions.includes(normalizedAction) || (action !== 'read' && c.allowed_actions.includes('ACTION')))
    );
    if (hasCrossBridge) return next();

    if (hasModuleOverride(req, normalizedModule)) {
      if (action === 'read' || action === 'write') return next();
    }

    return next(
      new ForbiddenError(`Akses ditolak: Anda tidak memiliki izin '${action}' pada modul ${normalizedModule}.`),
    );
  };
}

export function requireModuleTier(moduleCode: string, maxTierLevel: 1 | 2 | 3) {
  const normalizedModule = String(moduleCode || '').trim().toUpperCase();
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());
    if (isSuperAdmin(req.user.roles) || req.user.active_role_code === RoleCode.COMPANY_ADMIN) return next();

    const assignments: any[] = (req.user as any)?.module_assignments ?? [];
    const match = assignments.find(
      (a) => String(a.module_code || '').toUpperCase() === normalizedModule && a.status === 'ACTIVE'
    );
    if (match && Number(match.tier_level) >= 0 && Number(match.tier_level) <= maxTierLevel) {
      return next();
    }

    return next(
      new ForbiddenError(`Akses ditolak: Diperlukan minimal Level ${maxTierLevel} pada modul ${normalizedModule}.`),
    );
  };
}
