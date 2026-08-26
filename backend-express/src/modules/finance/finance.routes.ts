import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { FinanceService } from './finance.service';
import { createCrudRouter } from '../../utils/crud-factory';

export const financeRouter = Router();

// =============================================================================
// JOURNAL ACTIONS
// =============================================================================

financeRouter.post('/journal-entries/:id/post', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await FinanceService.postJournalEntry(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

financeRouter.get('/trial-balance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await FinanceService.getTrialBalance(req.companyId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// PROJECT FUNDING ACTIONS
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
    res.json(result);
  } catch (err) {
    next(err);
  }
});

financeRouter.post('/project-fundings/:id/draw', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await prisma.fin_project_funding.update({
      where: { id: req.params.id },
      data: { status: 'DRAWN' },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// BILLING DOCUMENT ACTIONS
// =============================================================================

financeRouter.post('/billing-documents/:id/post', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await prisma.fin_billing_document.update({
      where: { id: req.params.id },
      data: { status: 'POSTED', posting_date: new Date() },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

financeRouter.post('/billing-documents/:id/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await prisma.fin_billing_document.update({
      where: { id: req.params.id },
      data: { status: 'VERIFIED' },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

financeRouter.post('/billing-documents/:id/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await prisma.fin_billing_document.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED' },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

financeRouter.post('/billing-documents/:id/reject', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await prisma.fin_billing_document.update({
      where: { id: req.params.id },
      data: { status: 'REJECTED' },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// PAYMENT ACTIONS
// =============================================================================

financeRouter.post('/payments/:id/submit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await prisma.fin_payment.update({
      where: { id: req.params.id },
      data: { status: 'SUBMITTED' },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

financeRouter.post('/payments/:id/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await prisma.fin_payment.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED' },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

financeRouter.post('/payments/:id/execute', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await prisma.fin_payment.update({
      where: { id: req.params.id },
      data: { status: 'EXECUTED', payment_date: new Date() },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// CRUD VIEWSETS
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
financeRouter.use('/payment-lines', createCrudRouter({ modelName: 'fin_payment_allocation' }));
financeRouter.use('/payment-allocations', createCrudRouter({ modelName: 'fin_payment_allocation' }));
financeRouter.use('/bank-accounts', createCrudRouter({ modelName: 'fin_bank_account', searchFields: ['account_number', 'bank_name'] }));
financeRouter.use('/bank-statements', createCrudRouter({ modelName: 'fin_bank_statement' }));
financeRouter.use('/bank-statement-lines', createCrudRouter({ modelName: 'fin_bank_statement_line' }));
financeRouter.use('/tax-transactions', createCrudRouter({ modelName: 'fin_tax_transaction' }));
financeRouter.use('/budgets', createCrudRouter({ modelName: 'fin_budget' }));
financeRouter.use('/budget-lines', createCrudRouter({ modelName: 'fin_budget_line' }));
financeRouter.use('/project-cost-entries', createCrudRouter({ modelName: 'fin_project_cost_entry', searchFields: ['description'] }));
financeRouter.use('/project-fundings', createCrudRouter({ modelName: 'fin_project_funding', searchFields: ['description'] }));
financeRouter.use('/credit-facilities', createCrudRouter({ modelName: 'fin_credit_facility' }));
financeRouter.use('/recurring-payment-rules', createCrudRouter({ modelName: 'fin_recurring_payment_rule' }));
financeRouter.use('/overhead-rules', createCrudRouter({ modelName: 'fin_overhead_rule' }));
