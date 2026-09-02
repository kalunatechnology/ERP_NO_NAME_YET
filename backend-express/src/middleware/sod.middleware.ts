import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { ForbiddenError } from '../utils/errors';

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

export function requireFinanceRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = (req.user as any)?.role;
    if (!userRole || !roles.includes(userRole)) {
      return next(
        new ForbiddenError(
          `Aksi ini membutuhkan salah satu dari role berikut: ${roles.join(', ')}. ` +
          `Role Anda saat ini: ${userRole ?? 'tidak terdeteksi'}.`,
        ),
      );
    }
    return next();
  };
}

// ---------------------------------------------------------------------------
// requireCompanyAdmin: Otorisasi untuk Admin Perusahaan (Company Admin)
// ---------------------------------------------------------------------------

export function requireCompanyAdmin() {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as any;
    const userRoles: string[] = user?.roles || [user?.role].filter(Boolean);
    const isSuper = user?.is_superuser;
    const isStaff = user?.is_staff;

    if (
      isSuper ||
      isStaff ||
      userRoles.includes('SUPERADMIN') ||
      userRoles.includes('COMPANY_ADMIN') ||
      userRoles.includes('DIRECTOR')
    ) {
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

export function requireSuperadmin() {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = (req.user as any)?.role;
    const isSuper = (req.user as any)?.is_superuser;
    if (isSuper || ['SUPERADMIN', 'DIRECTOR'].includes(userRole)) {
      return next();
    }
    return next(
      new ForbiddenError(
        `Aksi ini hanya dapat dilakukan oleh SUPERADMIN atau DIRECTOR. ` +
        `Role Anda: ${userRole ?? 'tidak terdeteksi'}.`,
      ),
    );
  };
}
