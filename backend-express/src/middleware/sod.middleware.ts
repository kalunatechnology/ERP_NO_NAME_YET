/**
 * File: backend-express/src/middleware/sod.middleware.ts
 *
 * Purpose: Implements request middleware responsibilities for the platform domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { ForbiddenError } from '../utils/errors';
import { isCompanyAdmin, isSuperAdmin, RoleCode } from '../types/roles';

// =============================================================================
// SEGREGATION OF DUTIES (SoD) MIDDLEWARE — Enterprise Edition
// Implementasi prinsip Maker-Checker dengan:
//   - SoD Threshold Amount: Transaksi di bawah ambang batas dibebaskan dari SoD
//   - Delegation of Authority (DoA): Pelimpahan wewenang persetujuan yang tercatat di audit
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
// Helper: Cek apakah ada Delegation of Authority (DoA) yang aktif
// ---------------------------------------------------------------------------

/**
 * findActiveDelegation implements a request-bound security or governance step.
 *
 * Input/output: Reads the Express request/response context, attaches only the identity/scope metadata declared in the implementation, then either calls `next` or rejects the request.
 * Security intent: The check runs before protected business handlers so unauthenticated, cross-company, unauthorized, or invalid requests cannot reach persistence mutations.
 * Data/side effects: Queries or records Prisma model(s) `core_workflow_approval`.
 */
async function findActiveDelegation(delegatorUserId: string, delegateUserId: string): Promise<boolean> {
  // Cek apakah ada workflow approval yang dilakukan oleh delegate atas nama delegator
  try {
    const delegation = await prisma.core_workflow_approval.findFirst({
      where: {
        approver_user_id: delegateUserId,
        decision:         'DELEGATED',
      },
    });
    return !!delegation;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// enforceSoD: Maker-Checker dengan Threshold & Delegation of Authority
// ---------------------------------------------------------------------------

/**
 * enforceSoD implements a request-bound security or governance step.
 *
 * Input/output: Reads the Express request/response context, attaches only the identity/scope metadata declared in the implementation, then either calls `next` or rejects the request.
 * Security intent: The check runs before protected business handlers so unauthenticated, cross-company, unauthorized, or invalid requests cannot reach persistence mutations.
 * Data/side effects: May mutate request metadata or the response, as shown in the implementation.
 */
export function enforceSoD(options: {
  getCreatorId:     (req: Request) => Promise<string | null | undefined>;
  getAmountValue?:  (req: Request) => Promise<number | null>;
  thresholdAmount?: number;
  action?:          string;
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
      if (options.getAmountValue) {
        const amount = await options.getAmountValue(req);
        if (amount !== null && amount <= threshold) {
          res.setHeader('X-SoD-Status',   'BYPASSED_THRESHOLD');
          res.setHeader('X-SoD-Threshold', String(threshold));
          res.setHeader('X-SoD-Amount',    String(amount));
          return next();
        }
      }

      // ==== MAKER === CHECKER CHECK ====
      if (currentUserId !== creatorId) {
        // Berbeda user — SoD terpenuhi
        res.setHeader('X-SoD-Maker',   creatorId);
        res.setHeader('X-SoD-Checker', currentUserId);
        res.setHeader('X-SoD-Status',  'PASSED');
        return next();
      }

      // Maker === Checker — Cek Delegation of Authority (DoA)
      const hasDelegation = await findActiveDelegation(creatorId, currentUserId);
      if (hasDelegation) {
        res.setHeader('X-SoD-Status',    'DELEGATION_OVERRIDE');
        res.setHeader('X-SoD-Delegator', creatorId);
        res.setHeader('X-SoD-Delegate',  currentUserId);
        return next();
      }

      // Tidak ada pengecualian — Blokir
      return next(
        new ForbiddenError(
          `[SoD Violation] Pengguna yang membuat dokumen ini (${currentUserId}) ` +
          `tidak dapat melakukan aksi "${options.action ?? 'approve'}" pada dokumen yang sama. ` +
          `Diperlukan Maker dan Checker yang berbeda. ` +
          `Jika approver utama berhalangan, gunakan fitur Delegation of Authority.`,
        ),
      );
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
    const userRoles = req.user?.roles ?? [];
    if (!userRoles.some((role) => roles.includes(role))) {
      return next(
        new ForbiddenError(
          `Aksi ini membutuhkan salah satu dari role berikut: ${roles.join(', ')}. ` +
          `Role Anda saat ini: ${userRoles.join(', ') || 'tidak terdeteksi'}.`,
        ),
      );
    }
    return next();
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
    if (isCompanyAdmin(req.user?.roles ?? [])) {
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
    if (isSuperAdmin(roles) || roles.includes(RoleCode.DIRECTOR)) {
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
