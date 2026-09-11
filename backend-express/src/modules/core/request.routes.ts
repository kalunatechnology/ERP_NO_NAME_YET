/**
 * File: backend-express/src/modules/core/request.routes.ts
 *
 * Purpose: Implements Express API routing responsibilities for the core domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { RequestService } from './request.service';
import { sendSuccess, sendError } from '../../utils/response';
import { ForbiddenError } from '../../utils/errors';
import { ReadThroughCache } from '../../utils/read-through-cache';
import { requireActiveRole } from '../../middlewares/rbac.middleware';
import { RoleCode } from '../../types/roles';
import prisma from '../../config/database';

export const requestRouter = Router();
requestRouter.get('/disbursement-accounts', requireActiveRole(RoleCode.FINANCE), async (req, res, next) => {
  try {
    const accounts = await prisma.fin_bank_account.findMany({ where: { company_id: activeCompanyId(req), status: 'ACTIVE', ledger_account_id: { not: null } }, select: { id: true, account_name: true, bank_name: true, account_number: true } });
    sendSuccess(res, accounts);
  } catch (error) { next(error); }
});
const requestFeedCache = new ReadThroughCache<Awaited<ReturnType<typeof RequestService.getRequests>>>(250);

// A successful request mutation invalidates all compact feed projections. The
// collection is bounded and small, so full invalidation is safer than risking
// a missed filter-specific key.
requestRouter.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.once('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 400) requestFeedCache.clear();
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
 * GET route handler: `/`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
requestRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = activeCompanyId(req);
    const status = req.query.status as string | undefined;
    const type = req.query.type as string | undefined;
    const page = req.query.page ? Number(req.query.page) : 1;
    const pageSize = req.query.page_size ? Number(req.query.page_size) : 30;
    const key = [companyId, status ?? '', type ?? '', page, pageSize].join('|');
    const cached = await requestFeedCache.get(key, () => RequestService.getRequests({
      status, type, companyId, page, pageSize,
    }), { ttlMs: 10_000, staleMs: 50_000, timeoutMs: 1_000 });
    res.setHeader('X-Request-Cache', cached.state);
    sendSuccess(res, cached.value);
  } catch (err) { next(err); }
});

// Create new card request (Meeting, Leave, Fund Request, Other)
/**
 * POST route handler: `/`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
requestRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await RequestService.createRequest(
      req.body,
      activeUserId(req),
      activeCompanyId(req),
      req.user?.tenant_id,
    );
    sendSuccess(res, result, 201);
  } catch (err) { next(err); }
});

// List team members for "Who's inside" selector with search
/**
 * GET route handler: `/team-members`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
requestRouter.get('/team-members', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = req.query.search as string | undefined;
    const members = await RequestService.getTeamMembers(activeCompanyId(req), search);
    sendSuccess(res, members);
  } catch (err) { next(err); }
});

// Level 1: OM Validation (APPROVE or RE_CHECK)
/**
 * POST route handler: `/:id/validate-om`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
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
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// Level 2: Executive/PM Approval (APPROVE or REJECT)
/**
 * POST route handler: `/:id/approve-exec`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
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
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// Level 3: Finance Disbursement
/**
 * POST route handler: `/:id/disburse`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
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
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// Level 4: Requester Submit LPJ / Nota Belanja
/**
 * POST route handler: `/:id/submit-lpj`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
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
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// Level 5: OM Final Verification of LPJ (Closes Ticket)
/**
 * POST route handler: `/:id/verify-lpj-om`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
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
    sendSuccess(res, result);
  } catch (err) { next(err); }
});
