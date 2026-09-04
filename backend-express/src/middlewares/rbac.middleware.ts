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
import { isCompanyAdmin, isSuperAdmin } from '../types/roles';

/**
 * RBAC Middleware — Role-Based Access Control.
 *
 * Translates Django's is_staff / is_superuser / role checks
 * into Express middleware factories.
 */

/**
 * Require that at least one of the given role codes is present in req.user.roles.
 * Superusers always pass regardless of roles.
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }
    if (isSuperAdmin(req.user.roles)) return next();

    const hasRole = req.user.roles.some((r) => allowedRoles.includes(r));
    if (!hasRole) {
      return next(
        new ForbiddenError(
          `Akses ditolak. Diperlukan salah satu role: ${allowedRoles.join(', ')}.`,
        ),
      );
    }
    next();
  };
}

export interface ActiveRoleMutationPolicy {
  restrictedRoles: string[];
  allowedMutationPaths?: RegExp[];
  message: string;
}

/**
 * Restricts mutations according to the caller's currently selected role.
 *
 * Read requests always pass. A restricted role may execute only explicitly
 * allow-listed workflow actions, which keeps Executive preview access
 * read-only while preserving Q7 governance actions such as approval, reversal,
 * and period-closing execution.
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

    const activeRole = req.user.active_role_code ?? req.user.roles[0] ?? '';
    if (!policy.restrictedRoles.includes(activeRole)) return next();

    const requestPath = req.originalUrl.split('?')[0] ?? req.path;
    const allowed = (policy.allowedMutationPaths ?? []).some((pattern) => pattern.test(requestPath));
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
  if (isCompanyAdmin(req.user.roles)) return next();
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
  if (isCompanyAdmin(req.user.roles)) return next();
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
  if (!req.user || !isSuperAdmin(req.user.roles) || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const governancePrefixes = ['/auth/', '/accounts/', '/core/companies', '/core/tenants'];
  if (governancePrefixes.some((prefix) => req.path.startsWith(prefix))) {
    return next();
  }

  return next(new ForbiddenError('Super Admin hanya memiliki akses baca untuk data operasional.'));
}
