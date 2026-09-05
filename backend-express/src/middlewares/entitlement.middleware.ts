/**
 * File: backend-express/src/middlewares/entitlement.middleware.ts
 *
 * Purpose: Implements request middleware responsibilities for the platform domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';
import { isSuperAdmin } from '../types/roles';

/**
 * Company Module Entitlement Middleware.
 *
 * Implements pay-per-module feature toggling per company:
 * - Super Admin has universal governance & read access.
 * - For company users, validates against `iam_company_module_access`.
 * - Defaults to fail-closed if module access record does not exist or is disabled.
 */
export function requireModuleAccess(moduleCode: string, mode: 'read' | 'write' = 'read') {
  const normalizedModule = moduleCode.trim().toUpperCase();

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(new UnauthorizedError());
      }

      // Super Admin bypasses module entitlement checks
      if (isSuperAdmin(req.user.roles)) {
        return next();
      }

      const companyId = req.companyId;
      if (!companyId) {
        return next(
          new ForbiddenError(`Pilih company eksplisit untuk mengakses modul ${normalizedModule}.`),
        );
      }

      const access = await prisma.iam_company_module_access.findUnique({
        where: {
          company_id_module_code: {
            company_id: companyId,
            module_code: normalizedModule,
          },
        },
      });

      const isWriteMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
      const effectiveMode = isWriteMethod ? 'write' : mode;

      if (!access || !access.enabled) {
        // Read fallback if allow_read is explicitly granted even when module is not fully enabled
        if (effectiveMode === 'read' && access?.allow_read) {
          return next();
        }
        return next(
          new ForbiddenError(
            `Modul ${normalizedModule} belum diaktifkan untuk company Anda. Hubungi Super Administrator.`,
          ),
        );
      }

      const now = new Date();
      if ((access.effective_from && access.effective_from > now) ||
          (access.effective_until && access.effective_until < now)) {
        return next(new ForbiddenError(`Akses modul ${normalizedModule} sedang tidak berlaku.`));
      }

      if (effectiveMode === 'read' && !access.allow_read) {
        return next(new ForbiddenError(`Akses baca modul ${normalizedModule} dinonaktifkan.`));
      }

      if (effectiveMode === 'write' && !access.allow_write) {
        return next(
          new ForbiddenError(
            `Akses penulisan untuk modul ${normalizedModule} dinonaktifkan pada company Anda.`,
          ),
        );
      }

      // A Company Admin can tailor access for one user, but never bypass the
      // Super-Admin company entitlement checked above. No override means
      // inheritance from the company setting; an override is authoritative.
      const userOverride = await prisma.iam_user_module_access.findUnique({
        where: { user_id_module_code: { user_id: req.user.id, module_code: normalizedModule } },
      });
      if (userOverride) {
        if (userOverride.company_id !== companyId || userOverride.tenant_id !== req.user.tenant_id) {
          return next(new ForbiddenError(`Konfigurasi akses personal ${normalizedModule} tidak sesuai company.`));
        }
        if (effectiveMode === 'read' && !userOverride.allow_read) {
          return next(new ForbiddenError(`Akses baca personal untuk modul ${normalizedModule} dinonaktifkan.`));
        }
        if (effectiveMode === 'write' && !userOverride.allow_write) {
          return next(new ForbiddenError(`Akses tulis personal untuk modul ${normalizedModule} dinonaktifkan.`));
        }
        req.moduleAccess = { moduleCode: normalizedModule, delegated: true, allowRead: userOverride.allow_read, allowWrite: userOverride.allow_write };
      } else {
        req.moduleAccess = { moduleCode: normalizedModule, delegated: false, allowRead: access.allow_read, allowWrite: access.allow_write };
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
