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
import { isSuperAdmin, RoleCode } from '../types/roles';

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

      // The current schema has no delegator, validity window, company scope, or
      // revocation fields for a trustworthy DoA grant. Fail closed until a
      // dedicated delegation model exists; an arbitrary DELEGATED approval may
      // never authorize maker === checker.
      return next(
        new ForbiddenError(
          `[SoD Violation] Pengguna yang membuat dokumen ini (${currentUserId}) ` +
          `tidak dapat melakukan aksi "${options.action ?? 'approve'}" pada dokumen yang sama. ` +
          `Diperlukan Maker dan Checker yang berbeda.`,
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
    const assignedRoles = req.user?.roles ?? [];
    const activeRole = req.user?.active_role_code ?? assignedRoles[0] ?? '';
    if (!roles.includes(activeRole)) {
      return next(
        new ForbiddenError(
          `Aksi ini membutuhkan salah satu dari role berikut: ${roles.join(', ')}. ` +
          `Role aktif Anda: ${activeRole || 'tidak terdeteksi'}.`,
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
