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
import { hasModuleAssignmentCapability, isUsableModuleAssignment } from '../utils/module-assignments';

/**
 * Company Module Entitlement Middleware.
 *
 * Implements pay-per-module feature toggling per company:
 * - Super Admin manages entitlements outside operational module routes.
 * - For company users, validates against `iam_company_module_access`.
 * - Defaults to fail-closed if module access record does not exist or is disabled.
 */
const MODULE_ENTITLEMENT_ALIASES: Record<string, string[]> = {
  REQUESTS: ['REQUESTS', 'HRMS'],
  SALES: ['SALES', 'CRM'],
  ASSETS: ['ASSETS', 'INVENTORY'],
};

function isSafeLegacyProjection(assignment: any): boolean {
  const code = String(assignment.legacy_role_code || '').trim().toUpperCase().replace(/^ROLE-/, '');
  const scope = String(assignment.data_scope || '').toUpperCase();
  const capabilities = new Set((assignment.capability_codes ?? []).map((item: unknown) => String(item).toUpperCase()));
  const has = (capability: string) => {
    const normalizedModule = String(assignment.module_code).toUpperCase();
    if (capability === 'READ' && typeof assignment.allow_read === 'boolean') return assignment.allow_read;
    if (capability === 'WRITE' && typeof assignment.allow_write === 'boolean') return assignment.allow_write;
    if (capability === 'APPROVE' && typeof assignment.allow_approve === 'boolean') return assignment.allow_approve;
    if (capability === 'MANAGE_USERS' && typeof assignment.allow_manage_users === 'boolean') return assignment.allow_manage_users;
    return capabilities.has(capability) || capabilities.has(`${normalizedModule}:${capability}`);
  };
  if (code === 'SALES') return scope === 'OWN' && has('READ');
  if (code === 'SUPERVISOR') return scope === 'TEAM' && has('WRITE');
  if (code === 'STAFF') return scope === 'OWN' && has('READ');
  if (code === 'DIRECTOR') return scope === 'ALL' && has('READ');
  if (['CRM_LEAD', 'PROJECT_MANAGER', 'OPERATIONAL_MANAGER', 'FINANCE'].includes(code)) {
    return scope === 'ALL' && has('MANAGE_USERS') && (has('APPROVE') || has('WRITE'));
  }
  return false;
}

export function requireModuleAccess(moduleCode: string, mode: 'read' | 'write' = 'read') {
  const normalizedModule = moduleCode.trim().toUpperCase();
  const candidateModules = MODULE_ENTITLEMENT_ALIASES[normalizedModule] ?? [normalizedModule];

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(new UnauthorizedError());
      }

      // Super Admin governs tenant/company entitlements and does not receive
      // operational membership or module assignments.
      if (isSuperAdmin(req.user.roles)) {
        return next(new ForbiddenError('Super Admin mengelola entitlement company dan tidak menggunakan modul operasional.'));
      }

      const companyId = req.companyId;
      if (!companyId) {
        return next(
          new ForbiddenError(`Pilih company eksplisit untuk mengakses modul ${normalizedModule}.`),
        );
      }

      const accessRows = await prisma.iam_company_module_access.findMany({
        where: {
          company_id: companyId,
          module_code: { in: candidateModules },
        },
      });
      const access =
        accessRows.find((r) => r.enabled) ??
        accessRows[0] ??
        null;

      const isWriteMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
      const effectiveMode = isWriteMethod ? 'write' : mode;

      if (!access || !access.enabled) {
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

      const accessMode = String((access as any).access_mode || 'LEGACY').trim().toUpperCase();
      if (accessMode === 'ASSIGNMENT') {
        const assignments = (req.user.module_assignments ?? []).filter((assignment: any) =>
          isUsableModuleAssignment(assignment, normalizedModule)
        );
        if (!assignments.length) {
          return next(new ForbiddenError(`Belum ada penugasan role aktif untuk modul ${normalizedModule}.`));
        }

        const capabilities = new Set<string>(assignments.flatMap((assignment: any) =>
          Array.isArray(assignment.capability_codes) ? assignment.capability_codes : []
        ));
        const overrides = req.user.permission_overrides ?? [];
        const readOverride = overrides.find((override: any) =>
          String(override.module_code || '').toUpperCase() === normalizedModule
          && String(override.action_code || '').toUpperCase() === 'READ',
        );
        const writeOverride = overrides.find((override: any) =>
          String(override.module_code || '').toUpperCase() === normalizedModule
          && String(override.action_code || '').toUpperCase() === 'WRITE',
        );
        if (String((effectiveMode === 'read' ? readOverride : writeOverride)?.effect || '').toUpperCase() === 'DENY') {
          return next(new ForbiddenError(`Akses ${effectiveMode} modul ${normalizedModule} ditolak secara eksplisit.`));
        }
        const hasRead = assignments.some((assignment: any) => hasModuleAssignmentCapability(assignment, 'READ'))
          || String(readOverride?.effect || '').toUpperCase() === 'ALLOW';
        const hasWrite = assignments.some((assignment: any) => hasModuleAssignmentCapability(assignment, 'WRITE'))
          || String(writeOverride?.effect || '').toUpperCase() === 'ALLOW';
        if (effectiveMode === 'read' && !hasRead) {
          return next(new ForbiddenError(`Role modul ${normalizedModule} tidak memiliki capability READ.`));
        }
        if (effectiveMode === 'write' && !hasWrite) {
          return next(new ForbiddenError(`Role modul ${normalizedModule} tidak memiliki capability WRITE.`));
        }

        // Transitional adapter: legacy route handlers receive a role code only
        // inside this module-scoped request. It is never written to iam_user_role
        // and cannot authorize another module's request.
        const legacyRoleCodes = [...new Set(assignments
          .filter(isSafeLegacyProjection)
          .map((assignment: any) => String(assignment.legacy_role_code || '').trim().toUpperCase())
          .filter(Boolean))];
        req.user.active_role_code = legacyRoleCodes.length === 1 ? legacyRoleCodes[0] : null;
        req.user.module_role_profiles = assignments.map((assignment: any) => assignment.profile_code);
        req.user.module_access = [];
        req.moduleAccess = { moduleCode: normalizedModule, delegated: false, allowRead: hasRead, allowWrite: hasWrite, accessMode: 'ASSIGNMENT' };
        return next();
      }

      // A Company Admin can tailor access for one user or via Department module
      // delegation, but never bypass the Super-Admin company entitlement checked above.
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
        req.moduleAccess = { moduleCode: normalizedModule, delegated: true, allowRead: userOverride.allow_read, allowWrite: userOverride.allow_write, accessMode: 'LEGACY' };
      } else {
        const deptOrGmDelegation = req.user.module_access?.find((m) => m.module_code.toUpperCase() === normalizedModule);
        if (deptOrGmDelegation) {
          if (effectiveMode === 'read' && !deptOrGmDelegation.allow_read) {
            return next(new ForbiddenError(`Akses baca departemen untuk modul ${normalizedModule} dinonaktifkan.`));
          }
          if (effectiveMode === 'write' && !deptOrGmDelegation.allow_write) {
            return next(new ForbiddenError(`Akses tulis departemen untuk modul ${normalizedModule} dinonaktifkan.`));
          }
          req.moduleAccess = {
            moduleCode: normalizedModule,
            delegated: true,
            allowRead: deptOrGmDelegation.allow_read,
            allowWrite: deptOrGmDelegation.allow_write,
            accessMode: 'LEGACY',
          };
        } else {
          req.moduleAccess = { moduleCode: normalizedModule, delegated: false, allowRead: access.allow_read, allowWrite: access.allow_write, accessMode: 'LEGACY' };
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
