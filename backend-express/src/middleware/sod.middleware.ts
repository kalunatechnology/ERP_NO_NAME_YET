/**
 * File: backend-express/src/middleware/sod.middleware.ts
 *
 * Purpose: Implements request middleware responsibilities for the platform domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors';
import { hasModuleAssignmentCapability, isUsableModuleAssignment } from '../utils/module-assignments';
import { isSuperAdmin, RoleCode } from '../types/roles';
import { hasModuleOverride } from '../utils/module-permissions';
import prisma from '../config/database';

// =============================================================================
// SEGREGATION OF DUTIES (SoD) MIDDLEWARE — Enterprise Edition
// Implementasi prinsip Maker-Checker dengan:
//   - SoD Threshold Amount: Transaksi di bawah ambang batas dibebaskan dari SoD
//   - Fail-closed saat Maker dan Checker sama. DoA belum didukung sampai tersedia
//     model delegasi yang memiliki delegator, company scope, masa berlaku, dan revocation.
// =============================================================================

export interface SoDContext {
  documentCreatorId: string;
  documentId:        string;
  documentType:      string;
  currentUserId:     string;
}

// ---------------------------------------------------------------------------
// Konfigurasi Default — dapat di-override via environment variable
// ---------------------------------------------------------------------------

const DEFAULT_SOD_THRESHOLD_AMOUNT = Number(process.env.SOD_THRESHOLD_AMOUNT ?? 500000); // Rp 500.000

// ---------------------------------------------------------------------------
// enforceSoD: Maker-Checker dengan Threshold
// ---------------------------------------------------------------------------

/**
 * enforceSoD implements a request-bound security or governance step.
 *
 * Input/output: Reads the Express request/response context, attaches only the identity/scope metadata declared in the implementation, then either calls `next` or rejects the request.
 * Security intent: The check runs before protected business handlers so unauthenticated, cross-company, unauthorized, or invalid requests cannot reach persistence mutations.
 * Data/side effects: May mutate request metadata or the response, as shown in the implementation.
 */
export async function findActiveDelegationOfAuthority(params: {
  companyId: string;
  delegateUserId: string;
  moduleCode?: string;
  amount?: number | null;
}) {
  try {
    const now = new Date();
    const rows = await (prisma as any).iam_approval_delegation?.findMany?.({
      where: {
        company_id: params.companyId,
        delegate_user_id: params.delegateUserId,
        ...(params.moduleCode ? { module_code: params.moduleCode.toUpperCase() } : {}),
        revoked_at: null,
        valid_from: { lte: now },
        valid_until: { gte: now },
      },
      orderBy: { max_amount: 'desc' },
    });
    if (!Array.isArray(rows) || rows.length === 0) return null;
    if (params.amount === undefined || params.amount === null) return rows[0];
    return rows.find((d: any) => Number(d.max_amount ?? 0) === 0 || Number(params.amount) <= Number(d.max_amount ?? 0)) ?? null;
  } catch {
    return null;
  }
}

export function hasLevel1FinanceBypass(user: any): boolean {
  if (!user) return false;
  if (isSuperAdmin(user.roles ?? [])) return true;
  const assignments = Array.isArray(user.module_assignments) ? user.module_assignments : [];
  return assignments.some(
    (assignment: any) =>
      isUsableModuleAssignment(assignment, 'FINANCE') &&
      Number(assignment.tier_level) === 1,
  );
}

export function enforceSoD(options: {
  getCreatorId:     (req: Request) => Promise<string | null | undefined>;
  getAmountValue?:  (req: Request) => Promise<number | null>;
  thresholdAmount?: number;
  action?:          string;
  moduleCode?:      string;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const currentUserId = req.user?.id;
      if (!currentUserId) {
        return next(new ForbiddenError('Autentikasi diperlukan untuk operasi ini.'));
      }

      const creatorId = await options.getCreatorId(req);
      if (!creatorId) {
        // Tidak ada kreator ditemukan — izinkan (dokumen baru atau tidak relevan)
        return next();
      }

      // ==== SOD THRESHOLD CHECK ====
      // Transaksi di bawah ambang batas tidak memerlukan Maker-Checker ketat
      const threshold = options.thresholdAmount ?? DEFAULT_SOD_THRESHOLD_AMOUNT;
      let resolvedAmount: number | null = null;
      if (options.getAmountValue) {
        resolvedAmount = await options.getAmountValue(req);
        if (resolvedAmount !== null && resolvedAmount <= threshold) {
          res.setHeader('X-SoD-Status',   'BYPASSED_THRESHOLD');
          res.setHeader('X-SoD-Threshold', String(threshold));
          res.setHeader('X-SoD-Amount',    String(resolvedAmount));
          return next();
        }
      }

      // ==== LEVEL 1 SINGLE-USER FINANCE BYPASS ====
      if (hasLevel1FinanceBypass(req.user)) {
        res.setHeader('X-SoD-Status', 'BYPASSED_LEVEL_1');
        res.setHeader('X-SoD-Maker', creatorId);
        res.setHeader('X-SoD-Checker', currentUserId);
        return next();
      }

      // ==== MAKER === CHECKER CHECK ====
      if (currentUserId !== creatorId) {
        // Berbeda user — SoD terpenuhi; cek apakah bertindak di bawah DoA aktif
        const companyId = req.companyId || (req.user as any)?.company_id;
        if (companyId) {
          const activeDoa = await findActiveDelegationOfAuthority({
            companyId: String(companyId),
            delegateUserId: currentUserId,
            moduleCode: options.moduleCode,
            amount: resolvedAmount,
          });
          if (activeDoa) {
            (req as any).activeDelegation = activeDoa;
            res.setHeader('X-SoD-DoA', 'ACTIVE');
          }
        }
        res.setHeader('X-SoD-Maker',   creatorId);
        res.setHeader('X-SoD-Checker', currentUserId);
        res.setHeader('X-SoD-Status',  'PASSED');
        return next();
      }

      // The current schema has no delegator, validity window, company scope, or
      // revocation fields for a trustworthy DoA grant. Fail closed until a
      // dedicated delegation model exists; an arbitrary DELEGATED approval may
      // never authorize maker === checker.
      const actionMessages: Record<string, string> = {
        approve: 'disetujui',
        verify: 'diverifikasi',
        reject: 'ditolak',
        execute: 'diproses',
        post: 'dibukukan',
      };
      const action = String(options.action ?? 'approve').toLowerCase();
      const actionMessage = actionMessages[action];
      const message = actionMessage
        ? `Dokumen ini tidak dapat ${actionMessage} oleh pembuatnya. Silakan minta pengguna lain yang berwenang untuk melanjutkan.`
        : 'Pembuat dokumen tidak dapat melanjutkan tindakan pada dokumen yang sama. Silakan minta pengguna lain yang berwenang.';
      return next(new ForbiddenError(message));
    } catch (err) {
      return next(err);
    }
  };
}

// ---------------------------------------------------------------------------
// requireFinanceRole: Role-Based Access Control untuk aksi keuangan
// ---------------------------------------------------------------------------

/**
 * requireFinanceRole implements a request-bound security or governance step.
 *
 * Input/output: Reads the Express request/response context, attaches only the identity/scope metadata declared in the implementation, then either calls `next` or rejects the request.
 * Security intent: The check runs before protected business handlers so unauthenticated, cross-company, unauthorized, or invalid requests cannot reach persistence mutations.
 * Data/side effects: May mutate request metadata or the response, as shown in the implementation.
 */
export function requireFinanceRole(roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const assignedRoles = req.user?.roles ?? [];
    const activeRole = req.user?.active_role_code ?? assignedRoles[0] ?? '';
    if (req.moduleAccess?.accessMode === 'ASSIGNMENT') {
      const method = req.method.toUpperCase();
      const path = req.originalUrl.split('?')[0] ?? req.path;
      const capability = ['GET', 'HEAD', 'OPTIONS'].includes(method)
        ? 'READ'
        : method === 'DELETE'
          ? 'DELETE'
          : /\/(?:delete|remove|void)(?:-[^/?]+)*(?:\/|$)/i.test(path)
            ? 'DELETE'
            : /\/(?:approve|reject|execute|close|post|verify|authorize|validate|disburse|review|decide|archive)(?:-[^/?]+)*(?:\/|$)/i.test(path)
            ? 'APPROVE'
            : 'WRITE';
      const moduleCode = String(req.moduleAccess.moduleCode || 'FINANCE').trim().toUpperCase();
      const assignments = ((req.user as any)?.module_assignments ?? []).filter((assignment: any) =>
        isUsableModuleAssignment(assignment, moduleCode),
      );
      const override = ((req.user as any)?.permission_overrides ?? []).find((item: any) =>
        String(item.module_code || '').trim().toUpperCase() === moduleCode
        && String(item.action_code || '').trim().toUpperCase() === capability,
      );
      if (String(override?.effect || '').trim().toUpperCase() === 'DENY') {
        return next(new ForbiddenError(`Capability ${capability} ditolak secara eksplisit pada modul ${moduleCode}.`));
      }
      const hasCapability = assignments.some((assignment: any) =>
        hasModuleAssignmentCapability(assignment, capability),
      );
      const hasOverrideGrant = assignments.length > 0
        && String(override?.effect || '').trim().toUpperCase() === 'ALLOW';
      return hasCapability || hasOverrideGrant
        ? next()
        : next(new ForbiddenError(`Role Profile ${moduleCode} tidak memiliki capability ${capability}.`));
    }
    if (roles.includes(activeRole) || isSuperAdmin(assignedRoles)) {
      return next();
    }
    if (hasModuleOverride(req, 'FINANCE') && String((req.user as any)?.role_level || '').toUpperCase() !== 'GM') {
      return next();
    }
    return next(
      new ForbiddenError(
        `Aksi ini membutuhkan salah satu dari role berikut: ${roles.join(', ')}. ` +
        `Role aktif Anda: ${activeRole || 'tidak terdeteksi'}.`,
      ),
    );
  };
}

// ---------------------------------------------------------------------------
// requireCompanyAdmin: Otorisasi untuk Admin Perusahaan (Company Admin)
// ---------------------------------------------------------------------------

/**
 * requireCompanyAdmin implements a request-bound security or governance step.
 *
 * Input/output: Reads the Express request/response context, attaches only the identity/scope metadata declared in the implementation, then either calls `next` or rejects the request.
 * Security intent: The check runs before protected business handlers so unauthenticated, cross-company, unauthorized, or invalid requests cannot reach persistence mutations.
 * Data/side effects: May mutate request metadata or the response, as shown in the implementation.
 */
export function requireCompanyAdmin() {
/**
 * return implements a request-bound security or governance step.
 *
 * Input/output: Reads the Express request/response context, attaches only the identity/scope metadata declared in the implementation, then either calls `next` or rejects the request.
 * Security intent: The check runs before protected business handlers so unauthenticated, cross-company, unauthorized, or invalid requests cannot reach persistence mutations.
 * Data/side effects: May mutate request metadata or the response, as shown in the implementation.
 */
  return (req: Request, _res: Response, next: NextFunction) => {
    const assignedRoles = req.user?.roles ?? [];
    if (isSuperAdmin(assignedRoles) || req.user?.active_role_code === RoleCode.COMPANY_ADMIN) {
      return next();
    }

    return next(
      new ForbiddenError(
        'Aksi ini memerlukan kewenangan Company Admin (Admin Perusahaan) atau Superadmin.',
      ),
    );
  };
}

// ---------------------------------------------------------------------------
// requireSuperadmin: Otorisasi khusus untuk aksi kritis (Year-End Reopen, dll)
// ---------------------------------------------------------------------------

/**
 * requireSuperadmin implements a request-bound security or governance step.
 *
 * Input/output: Reads the Express request/response context, attaches only the identity/scope metadata declared in the implementation, then either calls `next` or rejects the request.
 * Security intent: The check runs before protected business handlers so unauthenticated, cross-company, unauthorized, or invalid requests cannot reach persistence mutations.
 * Data/side effects: May mutate request metadata or the response, as shown in the implementation.
 */
export function requireSuperadmin() {
  return (req: Request, _res: Response, next: NextFunction) => {
    const roles = req.user?.roles ?? [];
    if (isSuperAdmin(roles) || req.user?.active_role_code === RoleCode.DIRECTOR) {
      return next();
    }
    return next(
      new ForbiddenError(
        `Aksi ini hanya dapat dilakukan oleh ${RoleCode.SUPER_ADMIN} atau ${RoleCode.DIRECTOR}. ` +
        `Role Anda: ${roles.join(', ') || 'tidak terdeteksi'}.`,
      ),
    );
  };
}
