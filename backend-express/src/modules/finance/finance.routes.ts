/**
 * File: backend-express/src/modules/finance/finance.routes.ts
 *
 * Purpose: Implements Express API routing responsibilities for the finance domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { FinanceService } from './finance.service';
import { PeriodClosingService } from './period-closing.service';
import { AuditService } from '../core/audit.service';
import { createCrudRouter } from '../../utils/crud-factory';
import { enforceSoD, requireFinanceRole, requireSuperadmin } from '../../middleware/sod.middleware';
import { DocumentFSM } from '../../utils/fsm';
import { sendSuccess, sendError } from '../../utils/response';
import { RoleCode } from '../../types/roles';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';

export const financeRouter = Router();

/**
 * financeUserCount implements a named function within this file's Express API routing boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `iam_role`, `iam_user_role`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
async function financeUserCount(companyId: string) {
  const financeRoles = await prisma.iam_role.findMany({ where: { role_code: RoleCode.FINANCE }, select: { id: true } });
  return prisma.iam_user_role.count({
    where: { company_id: companyId, role_id: { in: financeRoles.map((role) => role.id) } },
  });
}

/**
 * POST route handler: `/period-closings/request`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `fin_period_closing` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
financeRouter.post('/period-closings/request', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.companyId) throw new ForbiddenError('Company aktif wajib dipilih.');
    const closingType = String(req.body.closing_type ?? 'MONTHLY').toUpperCase();
    const documentId = req.body.document_id ?? req.body.fiscal_year_id ?? null;
    const fiscalPeriodId = req.body.fiscal_period_id ?? null;
    if (closingType === 'MONTHLY' && !fiscalPeriodId) throw new ValidationError('fiscal_period_id wajib diisi.');
    if (closingType === 'YEAR_END' && !documentId) throw new ValidationError('fiscal_year_id wajib diisi.');
    const record = await prisma.fin_period_closing.create({ data: {
      tenant_id: req.user?.tenant_id, company_id: req.companyId, created_by_id: req.user?.id,
      requested_by: req.user?.id, fiscal_period_id: fiscalPeriodId, document_id: documentId,
      closing_type: closingType, status: 'PENDING_APPROVAL', started_at: new Date(),
    } });
    sendSuccess(res.status(201), record);
  } catch (err) { next(err); }
});

/**
 * POST route handler: `/period-closings/:id/approve`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `fin_period_closing` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
financeRouter.post('/period-closings/:id/approve', requireFinanceRole([RoleCode.FINANCE]), async (req, res, next) => {
  try {
    const record = await prisma.fin_period_closing.findFirst({ where: { id: req.params.id, company_id: req.companyId } });
    if (!record) throw new NotFoundError('Period closing');
    if (record.status !== 'PENDING_APPROVAL') throw new ValidationError(`Closing berstatus ${record.status}.`);
    if (record.requested_by === req.user?.id) throw new ForbiddenError('Requester tidak boleh menyetujui closing yang sama.');
    const updated = await prisma.fin_period_closing.update({ where: { id: record.id }, data: {
      status: 'APPROVED', approved_by: req.user?.id, approved_at: new Date(),
    } });
    sendSuccess(res, updated);
  } catch (err) { next(err); }
});

/**
 * POST route handler: `/period-closings/:id/execute`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `fin_period_closing` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
financeRouter.post('/period-closings/:id/execute', requireFinanceRole([RoleCode.FINANCE, RoleCode.DIRECTOR]), async (req, res, next) => {
  try {
    if (!req.companyId) throw new ForbiddenError('Company aktif wajib dipilih.');
    const record = await prisma.fin_period_closing.findFirst({ where: { id: req.params.id, company_id: req.companyId } });
    if (!record) throw new NotFoundError('Period closing');
    if (record.status !== 'APPROVED' || !record.approved_by) throw new ValidationError('Closing belum disetujui Finance.');
    const count = await financeUserCount(req.companyId);
    if (count >= 2 && (record.approved_by === req.user?.id || record.requested_by === req.user?.id)) {
      throw new ForbiddenError('Company dengan dua atau lebih user Finance wajib memisahkan requester, approver, dan executor.');
    }
    const result = record.closing_type === 'YEAR_END'
      ? await PeriodClosingService.executeYearEndClosing(record.document_id!, req.companyId, req.user?.id ?? 'system')
      : await PeriodClosingService.closeFiscalPeriod(record.fiscal_period_id!, req.user?.id ?? 'system');
    await prisma.fin_period_closing.update({ where: { id: record.id }, data: {
      status: 'COMPLETED', executed_by: req.user?.id, completed_at: new Date(),
    } });
    sendSuccess(res, { closing_request_id: record.id, ...result });
  } catch (err) { next(err); }
});

// =============================================================================
// CHART OF ACCOUNTS
// =============================================================================

/**
 * POST route handler: `/accounts/setup-standard`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
financeRouter.post('/accounts/setup-standard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const map = await FinanceService.ensureStandardCOA(req.companyId);
    sendSuccess(res, { accounts_created_or_found: map.size, coa: Array.from(map.values()) });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// COMPUTED BALANCE ENGINE
// =============================================================================

/**
 * GET route handler: `/accounts/:id/balance`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
financeRouter.get('/accounts/:id/balance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await FinanceService.getAccountBalance(req.params.id, req.companyId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET route handler: `/bank-accounts/:id/balance`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
financeRouter.get('/bank-accounts/:id/balance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await FinanceService.getBankAccountBalance(req.params.id);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// JOURNAL ACTIONS
// =============================================================================

/**
 * POST route handler: `/journal-entries/:id/post`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
financeRouter.post('/journal-entries/:id/post', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await FinanceService.postJournalEntry(req.params.id);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// REVERSAL / STORNO — membutuhkan SoD: penyetuju ≠ pembuat
/**
 * POST `/journal-entries/:id/reverse` handler registered on this router.
 *
 * Authentication/authorization: inherits the global authenticated tenant, module entitlement, RBAC, idempotency, and audit pipeline plus middleware supplied in this call.
 * Request/response: consumes the parameters/body referenced by the callback, preserves its current status/payload contract, and forwards unexpected errors through `next` where provided.
 * Persistence and state changes are limited to the Prisma/service operations visible in this handler; financial terminal-state and SoD rules remain authoritative.
 */
financeRouter.post(
  '/journal-entries/:id/reverse',
  requireFinanceRole([RoleCode.FINANCE, RoleCode.DIRECTOR]),
  enforceSoD({
    getCreatorId: async (req) => {
      const entry = await prisma.fin_journal_entry.findUnique({ where: { id: req.params.id } });
      return (entry as any)?.created_by_id ?? null;
    },
    action: 'reverse',
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reason } = req.body;
      if (!reason || String(reason).trim().length < 5) {
        return sendError(res, 'Alasan reversal wajib diisi minimal 5 karakter.', 400);
      }
      const result = await FinanceService.reverseJournalEntry(
        req.params.id,
        reason,
        req.user?.id ?? 'unknown',
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// =============================================================================
// TRIAL BALANCE & FINANCIAL REPORTS
// =============================================================================

/**
 * GET route handler: `/trial-balance`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
financeRouter.get('/trial-balance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await FinanceService.getTrialBalance(req.companyId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET route handler: `/profit-and-loss`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
financeRouter.get('/profit-and-loss', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const startDate = req.query.start_date ? new Date(req.query.start_date as string) : undefined;
    const endDate = req.query.end_date ? new Date(req.query.end_date as string) : undefined;
    const result = await FinanceService.getProfitAndLoss(req.companyId, startDate, endDate);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET route handler: `/balance-sheet`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
financeRouter.get('/balance-sheet', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const asOfDate = req.query.as_of_date ? new Date(req.query.as_of_date as string) : undefined;
    const result = await FinanceService.getBalanceSheet(req.companyId, asOfDate);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// INTERNAL FUND TRANSFER (Via Cash in Transit 1140)
// =============================================================================

/**
 * POST `/bank-accounts/internal-transfer` handler registered on this router.
 *
 * Authentication/authorization: inherits the global authenticated tenant, module entitlement, RBAC, idempotency, and audit pipeline plus middleware supplied in this call.
 * Request/response: consumes the parameters/body referenced by the callback, preserves its current status/payload contract, and forwards unexpected errors through `next` where provided.
 * Persistence and state changes are limited to the Prisma/service operations visible in this handler; financial terminal-state and SoD rules remain authoritative.
 */
financeRouter.post(
  '/bank-accounts/internal-transfer',
  requireFinanceRole([RoleCode.FINANCE]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { from_bank_account_id, to_bank_account_id, amount, description, reference_number } = req.body;
      if (!from_bank_account_id || !to_bank_account_id || !amount || !description) {
        return sendError(res, 'from_bank_account_id, to_bank_account_id, amount, dan description wajib diisi.', 400);
      }
      if (!req.companyId) {
        return sendError(res, 'companyId tidak ditemukan pada context request.', 400);
      }
      const result = await FinanceService.executeInternalTransfer({
        fromBankAccountId: from_bank_account_id,
        toBankAccountId: to_bank_account_id,
        amount: Number(amount),
        description,
        companyId: req.companyId,
        executedByUserId: req.user?.id ?? 'unknown',
        referenceNumber: reference_number,
      });
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

// =============================================================================
// BANKING: Statement Import & Reconciliation
// =============================================================================

/**
 * POST route handler: `/bank-accounts/:id/import-statement`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
financeRouter.post('/bank-accounts/:id/import-statement', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { statement_date, lines } = req.body;
    if (!statement_date || !Array.isArray(lines)) {
      return sendError(res, 'statement_date dan lines[] wajib diisi.', 400);
    }
    const result = await FinanceService.importBankStatement(
      req.params.id,
      new Date(statement_date),
      lines,
    );
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
});

/**
 * POST `/bank-statement-lines/:id/reconcile` handler registered on this router.
 *
 * Authentication/authorization: inherits the global authenticated tenant, module entitlement, RBAC, idempotency, and audit pipeline plus middleware supplied in this call.
 * Request/response: consumes the parameters/body referenced by the callback, preserves its current status/payload contract, and forwards unexpected errors through `next` where provided.
 * Persistence and state changes are limited to the Prisma/service operations visible in this handler; financial terminal-state and SoD rules remain authoritative.
 */
financeRouter.post(
  '/bank-statement-lines/:id/reconcile',
  requireFinanceRole([RoleCode.FINANCE]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { payment_id, journal_line_id, matched_amount, match_type } = req.body;
      if (!matched_amount || !match_type) {
        return sendError(res, 'matched_amount dan match_type wajib diisi.', 400);
      }
      const result = await FinanceService.reconcileBankTransaction({
        statementLineId: req.params.id,
        paymentId: payment_id,
        journalLineId: journal_line_id,
        matchedAmount: Number(matched_amount),
        matchType: match_type,
        reconciledByUserId: req.user?.id ?? 'unknown',
      });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// =============================================================================
// TAX SUMMARY
// =============================================================================

/**
 * GET route handler: `/tax-summary`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
financeRouter.get('/tax-summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await FinanceService.getTaxSummary(req.companyId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// PROJECT FUNDING (SoD + FSM Protected)
// =============================================================================

/**
 * POST route handler: `/project-fundings/:id/decide`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
financeRouter.post('/project-fundings/:id/decide', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const decision = req.body.decision ?? (req.body.action === 'approve' ? 'APPROVED' : 'REJECTED');
    const result = await FinanceService.decideFunding(
      req.params.id,
      decision,
      req.body.remarks ?? '',
      req.user?.id,
    );
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST route handler: `/project-fundings/:id/draw`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `fin_project_funding` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
financeRouter.post('/project-fundings/:id/draw', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const funding = await prisma.fin_project_funding.findUnique({ where: { id: req.params.id } });
    if (!funding) return sendError(res, 'Project funding tidak ditemukan.', 404);

    const fsm = new DocumentFSM('FUND_REQUEST');
    const { nextState } = fsm.apply(funding.status as any, 'draw');

    const updated = await prisma.fin_project_funding.update({
      where: { id: req.params.id },
      data: { status: nextState },
    });
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// BILLING DOCUMENT ACTIONS (FSM + SoD Protected)
// =============================================================================

/**
 * POST route handler: `/billing-documents/:id/post`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
financeRouter.post('/billing-documents/:id/post', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await FinanceService.postBillingDocument(req.params.id, req.user?.id);
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
});

/**
 * POST `/billing-documents/:id/verify` handler registered on this router.
 *
 * Authentication/authorization: inherits the global authenticated tenant, module entitlement, RBAC, idempotency, and audit pipeline plus middleware supplied in this call.
 * Request/response: consumes the parameters/body referenced by the callback, preserves its current status/payload contract, and forwards unexpected errors through `next` where provided.
 * Persistence and state changes are limited to the Prisma/service operations visible in this handler; financial terminal-state and SoD rules remain authoritative.
 */
financeRouter.post(
  '/billing-documents/:id/verify',
  requireFinanceRole([RoleCode.FINANCE]),
  enforceSoD({
    getCreatorId: async (req) => {
      const doc = await prisma.fin_billing_document.findUnique({ where: { id: req.params.id } });
      return (doc as any)?.created_by_id ?? null;
    },
    action: 'verify',
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await prisma.fin_billing_document.findUnique({ where: { id: req.params.id } });
      if (!doc) return sendError(res, 'Billing document tidak ditemukan.', 404);

      const fsm = new DocumentFSM('BILLING');
      const { nextState } = fsm.apply(doc.status as any, 'verify');

      const updated = await prisma.fin_billing_document.update({
        where: { id: req.params.id },
        data: { status: nextState },
      });
      sendSuccess(res, updated);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST `/billing-documents/:id/approve` handler registered on this router.
 *
 * Authentication/authorization: inherits the global authenticated tenant, module entitlement, RBAC, idempotency, and audit pipeline plus middleware supplied in this call.
 * Request/response: consumes the parameters/body referenced by the callback, preserves its current status/payload contract, and forwards unexpected errors through `next` where provided.
 * Persistence and state changes are limited to the Prisma/service operations visible in this handler; financial terminal-state and SoD rules remain authoritative.
 */
financeRouter.post(
  '/billing-documents/:id/approve',
  requireFinanceRole([RoleCode.FINANCE, RoleCode.DIRECTOR]),
  enforceSoD({
    getCreatorId: async (req) => {
      const doc = await prisma.fin_billing_document.findUnique({ where: { id: req.params.id } });
      return (doc as any)?.created_by_id ?? null;
    },
    action: 'approve',
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await prisma.fin_billing_document.findUnique({ where: { id: req.params.id } });
      if (!doc) return sendError(res, 'Billing document tidak ditemukan.', 404);

      const fsm = new DocumentFSM('BILLING');
      const { nextState } = fsm.apply(doc.status as any, 'approve');

      const updated = await prisma.fin_billing_document.update({
        where: { id: req.params.id },
        data: { status: nextState, approved_by_id: req.user?.id, approved_at: new Date() },
      });
      sendSuccess(res, updated);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST route handler: `/billing-documents/:id/reject`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `fin_billing_document` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
financeRouter.post('/billing-documents/:id/reject', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doc = await prisma.fin_billing_document.findUnique({ where: { id: req.params.id } });
    if (!doc) return sendError(res, 'Billing document tidak ditemukan.', 404);

    const fsm = new DocumentFSM('BILLING');
    const { nextState } = fsm.apply(doc.status as any, 'reject');

    const updated = await prisma.fin_billing_document.update({
      where: { id: req.params.id },
      data: { status: nextState },
    });
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// PAYMENT ACTIONS (FSM Protected)
// =============================================================================

/**
 * POST route handler: `/payments/:id/submit`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `fin_payment` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
financeRouter.post('/payments/:id/submit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payment = await prisma.fin_payment.findUnique({ where: { id: req.params.id } });
    if (!payment) return sendError(res, 'Payment tidak ditemukan.', 404);

    const fsm = new DocumentFSM('PAYMENT');
    const { nextState } = fsm.apply(payment.status as any, 'submit');

    const updated = await prisma.fin_payment.update({ where: { id: req.params.id }, data: { status: nextState } });
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
});

/**
 * POST `/payments/:id/approve` handler registered on this router.
 *
 * Authentication/authorization: inherits the global authenticated tenant, module entitlement, RBAC, idempotency, and audit pipeline plus middleware supplied in this call.
 * Request/response: consumes the parameters/body referenced by the callback, preserves its current status/payload contract, and forwards unexpected errors through `next` where provided.
 * Persistence and state changes are limited to the Prisma/service operations visible in this handler; financial terminal-state and SoD rules remain authoritative.
 */
financeRouter.post(
  '/payments/:id/approve',
  requireFinanceRole([RoleCode.FINANCE, RoleCode.DIRECTOR]),
  enforceSoD({
    getCreatorId: async (req) => {
      const payment = await prisma.fin_payment.findUnique({ where: { id: req.params.id } });
      return (payment as any)?.created_by_id ?? null;
    },
    action: 'approve',
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payment = await prisma.fin_payment.findUnique({ where: { id: req.params.id } });
      if (!payment) return sendError(res, 'Payment tidak ditemukan.', 404);

      const fsm = new DocumentFSM('PAYMENT');
      const { nextState } = fsm.apply(payment.status as any, 'approve');

      const updated = await prisma.fin_payment.update({ where: { id: req.params.id }, data: { status: nextState } });
      sendSuccess(res, updated);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST route handler: `/payments/:id/execute`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `fin_payment` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
financeRouter.post('/payments/:id/execute', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payment = await prisma.fin_payment.findUnique({ where: { id: req.params.id } });
    if (!payment) return sendError(res, 'Payment tidak ditemukan.', 404);

    const fsm = new DocumentFSM('PAYMENT');
    const { nextState } = fsm.apply(payment.status as any, 'post');

    const updated = await prisma.fin_payment.update({
      where: { id: req.params.id },
      data: { status: nextState, payment_date: new Date() },
    });
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// PERIOD CLOSING & YEAR-END CLOSING (Fase 4)
// =============================================================================

// Status semua periode fiskal
/**
 * GET route handler: `/fiscal-periods/status`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `fin_fiscal_period` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
financeRouter.get('/fiscal-periods/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const periods = await prisma.fin_fiscal_period.findMany({
      orderBy: { start_date: 'desc' },
      take: 24,
    });
    sendSuccess(res, periods);
  } catch (err) { next(err); }
});

// Tutup buku bulanan
/**
 * POST `/fiscal-periods/:id/close` handler registered on this router.
 *
 * Authentication/authorization: inherits the global authenticated tenant, module entitlement, RBAC, idempotency, and audit pipeline plus middleware supplied in this call.
 * Request/response: consumes the parameters/body referenced by the callback, preserves its current status/payload contract, and forwards unexpected errors through `next` where provided.
 * Persistence and state changes are limited to the Prisma/service operations visible in this handler; financial terminal-state and SoD rules remain authoritative.
 */
financeRouter.post(
  '/fiscal-periods/:id/close',
  requireFinanceRole([RoleCode.FINANCE, RoleCode.DIRECTOR]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      throw new ValidationError('Gunakan workflow period-closings: request, approve, lalu execute.');
    } catch (err) { next(err); }
  },
);

// Buka kembali periode bulanan (Finance Manager)
/**
 * POST `/fiscal-periods/:id/reopen` handler registered on this router.
 *
 * Authentication/authorization: inherits the global authenticated tenant, module entitlement, RBAC, idempotency, and audit pipeline plus middleware supplied in this call.
 * Request/response: consumes the parameters/body referenced by the callback, preserves its current status/payload contract, and forwards unexpected errors through `next` where provided.
 * Persistence and state changes are limited to the Prisma/service operations visible in this handler; financial terminal-state and SoD rules remain authoritative.
 */
financeRouter.post(
  '/fiscal-periods/:id/reopen',
  requireFinanceRole([RoleCode.FINANCE, RoleCode.DIRECTOR]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await prisma.fin_fiscal_period.update({
        where: { id: req.params.id },
        data:  { status: 'OPEN' },
      });
      sendSuccess(res, updated);
    } catch (err) { next(err); }
  },
);

// Tutup buku tahunan (Year-End Closing)
/**
 * POST `/fiscal-years/:id/year-end-closing` handler registered on this router.
 *
 * Authentication/authorization: inherits the global authenticated tenant, module entitlement, RBAC, idempotency, and audit pipeline plus middleware supplied in this call.
 * Request/response: consumes the parameters/body referenced by the callback, preserves its current status/payload contract, and forwards unexpected errors through `next` where provided.
 * Persistence and state changes are limited to the Prisma/service operations visible in this handler; financial terminal-state and SoD rules remain authoritative.
 */
financeRouter.post(
  '/fiscal-years/:id/year-end-closing',
  requireFinanceRole([RoleCode.FINANCE, RoleCode.DIRECTOR]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      throw new ValidationError('Gunakan workflow period-closings: request, approve, lalu execute.');
    } catch (err) { next(err); }
  },
);

// Rollback tutup buku tahunan via Storno (Superadmin/Direktur only)
/**
 * POST `/fiscal-years/:id/reopen-year-end` handler registered on this router.
 *
 * Authentication/authorization: inherits the global authenticated tenant, module entitlement, RBAC, idempotency, and audit pipeline plus middleware supplied in this call.
 * Request/response: consumes the parameters/body referenced by the callback, preserves its current status/payload contract, and forwards unexpected errors through `next` where provided.
 * Persistence and state changes are limited to the Prisma/service operations visible in this handler; financial terminal-state and SoD rules remain authoritative.
 */
financeRouter.post(
  '/fiscal-years/:id/reopen-year-end',
/**
 * requireSuperadmin implements a named method within this file's Express API routing boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  requireSuperadmin(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reason } = req.body;
      if (!reason || reason.trim().length < 10) {
        return sendError(res, 'Alasan pembukaan kembali wajib diisi minimal 10 karakter.', 400);
      }
      const result = await PeriodClosingService.reopenFiscalYear(
        req.params.id,
        reason,
        req.user?.id ?? 'system',
      );
      sendSuccess(res, result);
    } catch (err) { next(err); }
  },
);

// =============================================================================
// WIP CAPITALIZATION (Fase 3)
// =============================================================================

/**
 * POST route handler: `/projects/:id/capitalize-wip`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
financeRouter.post('/projects/:id/capitalize-wip',
  requireFinanceRole([RoleCode.FINANCE, RoleCode.DIRECTOR]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { amount, description } = req.body;
      if (!amount || Number(amount) <= 0) return sendError(res, 'amount wajib diisi dan harus lebih dari 0.', 400);
      const result = await FinanceService.capitalizeProjectWIP(
        req.params.id,
        Number(amount),
        description ?? '',
        req.user?.id ?? 'system',
        req.companyId,
      );
      sendSuccess(res, result);
    } catch (err) { next(err); }
  },
);

// =============================================================================
// NTPN — TAX PAYMENT REFERENCE (Fase 3)
// =============================================================================

/**
 * POST route handler: `/tax-transactions/:id/record-ntpn`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
financeRouter.post('/tax-transactions/:id/record-ntpn', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ntpn, payment_reference, paid_at } = req.body;
    if (!ntpn || !payment_reference || !paid_at) {
      return sendError(res, 'ntpn, payment_reference, dan paid_at wajib diisi.', 400);
    }
    const result = await FinanceService.recordNTPN(
      req.params.id, ntpn, payment_reference, new Date(paid_at),
    );
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// =============================================================================
// AUDIT TRAIL & EXECUTIVE REPORT (Fase 4)
// =============================================================================

/**
 * GET route handler: `/audit-trail`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
financeRouter.get('/audit-trail', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AuditService.getAuditTrail({
      entity:    req.query.entity    as string | undefined,
      entityId:  req.query.entity_id as string | undefined,
      userId:    req.query.user_id   as string | undefined,
      action:    req.query.action    as string | undefined,
      fromDate:  req.query.from_date ? new Date(req.query.from_date as string) : undefined,
      toDate:    req.query.to_date   ? new Date(req.query.to_date   as string) : undefined,
      companyId: req.companyId ?? undefined,
      page:      req.query.page      ? Number(req.query.page)      : 1,
      pageSize:  req.query.page_size ? Number(req.query.page_size) : 50,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

/**
 * GET route handler: `/executive-audit-report`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
financeRouter.get('/executive-audit-report', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const year = req.query.year ? Number(req.query.year) : undefined;
    const result = await FinanceService.getExecutiveAuditReport(req.companyId ?? undefined, year);
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// Import Statement CSV (KlikBCA / Mandiri / Standar)
/**
 * POST route handler: `/bank-accounts/:id/import-csv`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
financeRouter.post('/bank-accounts/:id/import-csv', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { csv_content } = req.body;
    if (!csv_content || typeof csv_content !== 'string') {
      return sendError(res, 'csv_content (isi file CSV) wajib dikirimkan sebagai text string.', 400);
    }
    const result = await FinanceService.importBankStatementCSV({
      bankAccountId: req.params.id,
      csvContent:    csv_content,
      companyId:     req.companyId ?? undefined,
      userId:        req.user?.id,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// =============================================================================
// CRUD VIEWSETS (Generic)
// =============================================================================

financeRouter.use('/accounts', createCrudRouter({ modelName: 'fin_account', searchFields: ['account_code', 'account_name'] }));
financeRouter.use('/journals', createCrudRouter({ modelName: 'fin_journal', searchFields: ['journal_code', 'journal_name'] }));
financeRouter.use('/journal-entries', createCrudRouter({ modelName: 'fin_journal_entry', searchFields: ['entry_number', 'description'] }));
financeRouter.use('/journal-lines', createCrudRouter({ modelName: 'fin_journal_line' }));
financeRouter.use('/fiscal-years', createCrudRouter({ modelName: 'fin_fiscal_year' }));
financeRouter.use('/fiscal-periods', createCrudRouter({ modelName: 'fin_fiscal_period' }));
financeRouter.use('/billing-documents', createCrudRouter({ modelName: 'fin_billing_document', searchFields: ['invoice_number', 'billing_type'] }));
financeRouter.use('/billing-document-lines', createCrudRouter({ modelName: 'fin_billing_document_line', searchFields: ['description'] }));
financeRouter.use('/billing-proposals', createCrudRouter({ modelName: 'fin_billing_proposal', searchFields: ['description'] }));
financeRouter.use('/payments', createCrudRouter({ modelName: 'fin_payment', searchFields: ['payment_number'] }));
financeRouter.use('/customer-receipts', createCrudRouter({ modelName: 'fin_payment', searchFields: ['payment_number'] }));
financeRouter.use('/vendor-payments', createCrudRouter({ modelName: 'fin_payment', searchFields: ['payment_number'] }));
financeRouter.use('/payment-lines', createCrudRouter({ modelName: 'fin_payment_allocation' }));
financeRouter.use('/payment-allocations', createCrudRouter({ modelName: 'fin_payment_allocation' }));
financeRouter.use('/bank-accounts', createCrudRouter({ modelName: 'fin_bank_account', searchFields: ['account_number', 'bank_name'] }));
financeRouter.use('/bank-statements', createCrudRouter({ modelName: 'fin_bank_statement' }));
financeRouter.use('/bank-statement-lines', createCrudRouter({ modelName: 'fin_bank_statement_line' }));
financeRouter.use('/bank-reconciliations', createCrudRouter({ modelName: 'fin_bank_reconciliation' }));
financeRouter.use('/tax-transactions', createCrudRouter({ modelName: 'fin_tax_transaction' }));
financeRouter.use('/budgets', createCrudRouter({ modelName: 'fin_budget' }));
financeRouter.use('/budget-lines', createCrudRouter({ modelName: 'fin_budget_line' }));
financeRouter.use('/project-cost-entries', createCrudRouter({ modelName: 'fin_project_cost_entry', searchFields: ['description'] }));
financeRouter.use('/project-fundings', createCrudRouter({ modelName: 'fin_project_funding', searchFields: ['description'] }));
financeRouter.use('/credit-facilities', createCrudRouter({ modelName: 'fin_credit_facility' }));
financeRouter.use('/recurring-payment-rules', createCrudRouter({ modelName: 'fin_recurring_payment_rule' }));
financeRouter.use('/overhead-rules', createCrudRouter({ modelName: 'fin_overhead_rule' }));
