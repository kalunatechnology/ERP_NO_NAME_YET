/**
 * File: backend-express/src/modules/core/request.routes.ts
 *
 * Purpose: Implements Express API routing responsibilities for the core domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { NextFunction, Request, Response, Router } from 'express';

import { RequestService } from './request.service';
import { ReadThroughCache } from '../../utils/read-through-cache';
import { ForbiddenError, ValidationError } from '../../utils/errors';
import { RoleCode } from '../../types/roles';
import { requireActiveRole } from '../../middlewares/rbac.middleware';
import { sendSuccess, sendError } from '../../utils/response';
import prisma from '../../config/database';

export const requestRouter = Router();

requestRouter.get('/disbursement-accounts', requireActiveRole(RoleCode.FINANCE), async (req, res, next) => {
  try {
    const accounts = await prisma.fin_bank_account.findMany({
      where: { company_id: activeCompanyId(req), status: 'ACTIVE', ledger_account_id: { not: null } },
      select: { id: true, account_name: true, bank_name: true, account_number: true }
    });
    sendSuccess(res, accounts);
  } catch (error) { next(error); }
});

/**
 * Cache feed request.
 */
const requestFeedCache =
  new ReadThroughCache<Record<string, unknown>>(250);

const REQUEST_FEED_CACHE_OPTIONS = {
  ttlMs: 15_000,
  staleMs: 45_000,
  timeoutMs: 1_500,
};

/**
 * Revision digunakan sebagai cache-buster.
 *
 * Setiap request berubah:
 * - create
 * - assign
 * - reassign
 * - approval
 * - LPJ
 *
 * revision dinaikkan sehingga cache lama tidak digunakan lagi.
 */
let requestFeedCacheRevision = 0;

function invalidateRequestFeedCache() {
  requestFeedCacheRevision += 1;
}

requestRouter.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.once('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        invalidateRequestFeedCache();
        requestFeedCache.clear();
      }
    });
  }
  next();
});

function activeCompanyId(req: Request): string {
  if (!req.companyId) throw new ForbiddenError('Pilih company sebelum mengakses request.');
  return req.companyId;
}

function activeUserId(req: Request): string {
  if (!req.user?.id) throw new ForbiddenError('User terautentikasi diperlukan.');
  return req.user.id;
}

// =============================================================================
// MARKA+ INTERNAL REQUESTS & TICKETING ENDPOINTS
// =============================================================================

// List request cards with filters
/**
 * GET route handler: `/` and `/requests`.
 */
requestRouter.get(
  ['/', '/requests'],
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const companyId = req.companyId;

      const userId =
        req.user?.id;

      const activeRole =
        req.user?.active_role_code;

      if (!companyId) {
        throw new ForbiddenError(
          'Company aktif diperlukan untuk memuat request.',
        );
      }

      if (!userId) {
        throw new ForbiddenError(
          'User aktif tidak tersedia untuk memuat request.',
        );
      }

      if (!activeRole) {
        throw new ForbiddenError(
          'Role aktif tidak tersedia untuk memuat request.',
        );
      }

      const type =
        typeof req.query.type === 'string'
          ? req.query.type
          : undefined;

      const status =
        typeof req.query.status === 'string'
          ? req.query.status
          : undefined;

      const page = Math.max(
        1,
        Math.trunc(
          Number(req.query.page) || 1,
        ),
      );

      const pageSize = Math.min(
        100,
        Math.max(
          1,
          Math.trunc(
            Number(
              req.query.page_size ??
                req.query.pageSize,
            ) || 20,
          ),
        ),
      );

      /**
       * PENTING:
       *
       * Cache harus user-aware dan role-aware.
       *
       * Staff A:
       * company|staff-a|STAFF
       *
       * Staff B:
       * company|staff-b|STAFF
       *
       * sehingga tidak mungkin memakai feed satu sama lain.
       */
      const cacheKey = [
        'request-feed',

        /**
         * invalidate version
         */
        requestFeedCacheRevision,

        /**
         * Tenant isolation.
         */
        req.user?.tenant_id ?? 'no-tenant',

        /**
         * Company isolation.
         */
        companyId,

        /**
         * User isolation.
         */
        userId,

        /**
         * Role isolation.
         */
        activeRole,

        /**
         * Query projection.
         */
        type ?? 'ALL',
        status ?? 'ALL',
        page,
        pageSize,
      ].join('|');

      const cached =
        await requestFeedCache.get(
          cacheKey,

          async () => {
            return RequestService.getRequests({
              type,
              status,

              page,
              pageSize,

              companyId,

              /**
               * NEW
               *
               * Dipakai service untuk:
               *
               * Staff:
               * assignee_user_id = current user
               */
              requesterUserId:
                userId,

              /**
               * NEW
               */
              activeRole,
            }) as unknown as Record<string, unknown>;
          },

          REQUEST_FEED_CACHE_OPTIONS,
        );

      /**
       * Response berbeda berdasarkan Authorization
       * dan company.
       */
      res.vary('Authorization');
      res.vary('X-Company-ID');

      res.setHeader(
        'Cache-Control',
        'private, max-age=15',
      );

      res.setHeader(
        'X-Request-Feed-Cache',
        cached.state,
      );

      return res.json({
        success: true,
        data: cached.value,
      });
    } catch (error) {
      return next(error);
    }
  },
);

// Create new card request (Meeting, Leave, Fund Request, Other)
/**
 * POST route handler: `/` and `/requests`.
 */
requestRouter.post(
  ['/', '/requests'],
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.companyId) {
        throw new ForbiddenError(
          'Company aktif diperlukan untuk membuat request.',
        );
      }

      if (!req.user?.id) {
        throw new ForbiddenError(
          'User aktif tidak tersedia.',
        );
      }

      const result =
        await RequestService.createRequest(
          req.body,
          req.user.id,
          req.companyId,
          req.user.tenant_id,
        );

      /**
       * CREATE_REQUEST mengubah feed.
       */
      invalidateRequestFeedCache();

      return res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      return next(error);
    }
  },
);

// List team members for "Who's inside" selector with search
requestRouter.get('/team-members', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = req.query.search as string | undefined;
    const members = await RequestService.getTeamMembers(activeCompanyId(req), search);
    sendSuccess(res, members);
  } catch (err) { next(err); }
});

// Level 1: OM Validation (APPROVE or RE_CHECK)
requestRouter.post('/:id/validate-om', requireActiveRole(RoleCode.OPERATIONAL_MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { decision, remarks } = req.body;
    if (!decision || !['APPROVE', 'RE_CHECK'].includes(decision)) {
      return sendError(res, 'decision wajib diisi (APPROVE atau RE_CHECK).', 400);
    }
    const result = await RequestService.validateByOM({
      requestId: req.params.id,
      decision,
      remarks,
      omUserId:  activeUserId(req),
      companyId: activeCompanyId(req),
    });
    invalidateRequestFeedCache();
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// Level 2: Executive/PM Approval (APPROVE or REJECT)
requestRouter.post('/:id/approve-exec', requireActiveRole(RoleCode.PROJECT_MANAGER, RoleCode.DIRECTOR), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { decision, remarks } = req.body;
    if (!decision || !['APPROVE', 'REJECT'].includes(decision)) {
      return sendError(res, 'decision wajib diisi (APPROVE atau REJECT).', 400);
    }
    const result = await RequestService.approveByExecutive({
      requestId:  req.params.id,
      decision,
      remarks,
      execUserId: activeUserId(req),
      companyId: activeCompanyId(req),
    });
    invalidateRequestFeedCache();
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// Level 3: Finance Disbursement
requestRouter.post('/:id/disburse', requireActiveRole(RoleCode.FINANCE), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { disburse_account_id, disburse_reference } = req.body;
    const result = await RequestService.disburseRequest({
      requestId:          req.params.id,
      disburseAccountId:  disburse_account_id,
      disburseReference:  disburse_reference,
      disburseUserId:     activeUserId(req),
      companyId:          activeCompanyId(req),
    });
    invalidateRequestFeedCache();
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// Level 4: Requester Submit LPJ / Nota Belanja
requestRouter.post('/:id/submit-lpj', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { realization_amount, discrepancy_amount, discrepancy_type, notes, invoices } = req.body;
    if (!realization_amount || Number(realization_amount) <= 0) {
      return sendError(res, 'realization_amount (total belanja riil) wajib diisi lebih dari 0.', 400);
    }
    const result = await RequestService.submitLPJ({
      requestId:          req.params.id,
      realizationAmount:  Number(realization_amount),
      discrepancyAmount:  discrepancy_amount ? Number(discrepancy_amount) : 0,
      discrepancyType:    discrepancy_type ?? 'NONE',
      notes,
      invoices,
      requesterUserId:    activeUserId(req),
      companyId:          activeCompanyId(req),
    });
    invalidateRequestFeedCache();
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// Level 5: OM Final Verification of LPJ (Closes Ticket)
requestRouter.post('/:id/verify-lpj-om', requireActiveRole(RoleCode.OPERATIONAL_MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { decision, remarks } = req.body;
    if (!decision || !['APPROVE', 'REVISE'].includes(decision)) {
      return sendError(res, 'decision wajib diisi (APPROVE atau REVISE).', 400);
    }
    const result = await RequestService.verifyLPJByOM({
      requestId: req.params.id,
      decision,
      remarks,
      omUserId:  activeUserId(req),
      companyId: activeCompanyId(req),
    });
    invalidateRequestFeedCache();
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// Assign / Reassign Request to a Staff
/**
 * PATCH /requests/:requestId/assignee
 *
 * Assign pertama dan reassign menggunakan endpoint yang sama.
 *
 * Backend service menentukan:
 *
 * belum ada assignee
 *   -> ASSIGN_REQUEST
 *
 * sudah ada assignee
 *   -> REASSIGN_REQUEST
 */
requestRouter.patch(
  [
    '/:requestId/assignee',
    '/:id/assignee',
    '/requests/:requestId/assignee',
    '/requests/:id/assignee',
  ],
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const companyId =
        req.companyId;

      const assignedByUserId =
        req.user?.id;

      const activeRole =
        req.user?.active_role_code;

      const requestId =
        String(
          req.params.requestId ?? req.params.id ?? '',
        ).trim();

      const assigneeUserId =
        typeof req.body?.assignee_user_id ===
        'string'
          ? req.body.assignee_user_id.trim()
          : '';

      if (!companyId) {
        throw new ForbiddenError(
          'Company aktif diperlukan untuk assign request.',
        );
      }

      if (!assignedByUserId) {
        throw new ForbiddenError(
          'User aktif tidak tersedia untuk assign request.',
        );
      }

      if (!activeRole) {
        throw new ForbiddenError(
          'Role aktif tidak tersedia untuk assign request.',
        );
      }

      if (!requestId) {
        throw new ValidationError(
          'Request ID wajib diisi.',
        );
      }

      if (!assigneeUserId) {
        throw new ValidationError(
          'assignee_user_id wajib diisi.',
        );
      }

      /**
       * Staff tidak boleh assign/reassign request.
       *
       * Assignment merupakan fungsi koordinasi /
       * managerial.
       */
      const allowedRoles =
        new Set<string>([
          RoleCode.PROJECT_MANAGER,
          RoleCode.OPERATIONAL_MANAGER,
          RoleCode.DIRECTOR,
          RoleCode.SUPERVISOR,
          RoleCode.SUPER_ADMIN,
          RoleCode.COMPANY_ADMIN,
        ]);

      if (
        !allowedRoles.has(activeRole)
      ) {
        throw new ForbiddenError(
          'Role aktif tidak memiliki akses untuk assign atau reassign request.',
        );
      }

      const result =
        await RequestService.assignRequest({
          requestId,
          assigneeUserId,
          assignedByUserId,
          companyId,
        });

      /**
       * Assignment mengubah hasil GET /requests.
       *
       * Increment revision agar:
       *
       * Staff lama
       * Staff baru
       * PM
       * OM
       *
       * semuanya tidak menerima snapshot lama.
       */
      invalidateRequestFeedCache();

      return res.json({
        success: true,
        message:
          result.reassigned
            ? 'Request berhasil di-reassign.'
            : 'Request berhasil di-assign.',
        data:
          result,
      });
    } catch (error) {
      return next(error);
    }
  },
);
