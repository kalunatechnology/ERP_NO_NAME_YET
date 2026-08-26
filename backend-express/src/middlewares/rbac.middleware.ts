import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';

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
    if (req.user.is_superuser) return next();

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

/**
 * Require all listed roles (strict intersection).
 */
export function requireAllRoles(...requiredRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());
    if (req.user.is_superuser) return next();

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
  if (req.user.is_staff || req.user.is_superuser) return next();
  return next(new ForbiddenError('Akses ditolak. Diperlukan izin staff.'));
}

/**
 * Require the user to be a Django superuser.
 */
export function requireSuperuser(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(new UnauthorizedError());
  if (req.user.is_superuser) return next();
  return next(new ForbiddenError('Akses ditolak. Diperlukan izin superuser.'));
}

/**
 * Require the user to be the owner of the resource or a superuser.
 * @param getOwnerId - function to extract the owner ID from request
 */
export function requireOwnerOrSuperuser(getOwnerId: (req: Request) => string | undefined) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());
    if (req.user.is_superuser) return next();

    const ownerId = getOwnerId(req);
    if (ownerId === req.user.id) return next();

    return next(new ForbiddenError('Akses ditolak. Anda bukan pemilik resource ini.'));
  };
}
