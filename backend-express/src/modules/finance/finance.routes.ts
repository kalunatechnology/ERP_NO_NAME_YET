import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { FinanceService } from './finance.service';
import { PeriodClosingService } from './period-closing.service';
import { AuditService } from '../core/audit.service';
import { createCrudRouter } from '../../utils/crud-factory';
import { enforceSoD, requireFinanceRole, requireSuperadmin } from '../../middleware/sod.middleware';
import { DocumentFSM } from '../../utils/fsm';
import { sendSuccess, sendError } from '../../utils/response';

export const financeRouter = Router();

// =============================================================================
// CHART OF ACCOUNTS
// =============================================================================

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

financeRouter.get('/accounts/:id/balance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await FinanceService.getAccountBalance(req.params.id, req.companyId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

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

financeRouter.post('/journal-entries/:id/post', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await FinanceService.postJournalEntry(req.params.id);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// REVERSAL / STORNO — membutuhkan SoD: penyetuju ≠ pembuat
financeRouter.post(
  '/journal-entries/:id/reverse',
  requireFinanceRole(['FINANCE_MANAGER', 'DIRECTOR']),
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

financeRouter.get('/trial-balance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await FinanceService.getTrialBalance(req.companyId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

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

financeRouter.post(
  '/bank-accounts/internal-transfer',
  requireFinanceRole(['FINANCE_STAFF', 'FINANCE_MANAGER']),
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

financeRouter.post(
  '/bank-statement-lines/:id/reconcile',
  requireFinanceRole(['FINANCE_STAFF', 'FINANCE_MANAGER']),
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

financeRouter.post('/billing-documents/:id/post', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await FinanceService.postBillingDocument(req.params.id, req.user?.id);
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
});

financeRouter.post(
  '/billing-documents/:id/verify',
  requireFinanceRole(['FINANCE_STAFF', 'FINANCE_MANAGER']),
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

financeRouter.post(
  '/billing-documents/:id/approve',
  requireFinanceRole(['FINANCE_MANAGER', 'DIRECTOR']),
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

financeRouter.post(
  '/payments/:id/approve',
  requireFinanceRole(['FINANCE_MANAGER', 'DIRECTOR']),
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
financeRouter.post(
  '/fiscal-periods/:id/close',
  requireFinanceRole(['FINANCE_MANAGER', 'DIRECTOR']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await PeriodClosingService.closeFiscalPeriod(
        req.params.id,
        req.user?.id ?? 'system',
      );
      sendSuccess(res, result);
    } catch (err) { next(err); }
  },
);

// Buka kembali periode bulanan (Finance Manager)
financeRouter.post(
  '/fiscal-periods/:id/reopen',
  requireFinanceRole(['FINANCE_MANAGER', 'DIRECTOR']),
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
financeRouter.post(
  '/fiscal-years/:id/year-end-closing',
  requireFinanceRole(['FINANCE_MANAGER', 'DIRECTOR']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyId = req.body.company_id ?? req.companyId ?? '';
      if (!companyId) return sendError(res, 'company_id wajib diisi untuk year-end closing.', 400);
      const result = await PeriodClosingService.executeYearEndClosing(
        req.params.id,
        companyId,
        req.user?.id ?? 'system',
      );
      sendSuccess(res, result);
    } catch (err) { next(err); }
  },
);

// Rollback tutup buku tahunan via Storno (Superadmin/Direktur only)
financeRouter.post(
  '/fiscal-years/:id/reopen-year-end',
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

financeRouter.post('/projects/:id/capitalize-wip',
  requireFinanceRole(['FINANCE_STAFF', 'FINANCE_MANAGER', 'DIRECTOR']),
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

financeRouter.get('/executive-audit-report', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const year = req.query.year ? Number(req.query.year) : undefined;
    const result = await FinanceService.getExecutiveAuditReport(req.companyId ?? undefined, year);
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// Import Statement CSV (KlikBCA / Mandiri / Standar)
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
