/**
 * File: backend-express/src/modules/commands/commands.routes.ts
 *
 * Purpose: Implements Express API routing responsibilities for the commands domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Router, Request, Response, NextFunction } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { WorkflowRegistry, WorkflowTransitionError } from '../../workflows';
import { ProjectsService } from '../projects/projects.service';
import { FinanceService } from '../finance/finance.service';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { requireModuleAccess } from '../../middlewares/entitlement.middleware';
import { requireRole } from '../../middlewares/rbac.middleware';
import { RoleCode } from '../../types/roles';

export const commandsRouter = Router();

commandsRouter.use('/sales', requireModuleAccess('SALES'), requireRole(RoleCode.CRM_LEAD, RoleCode.SALES, RoleCode.PROJECT_MANAGER));
commandsRouter.use('/projects', requireModuleAccess('PROJECTS'), requireRole(RoleCode.PROJECT_MANAGER, RoleCode.OPERATIONAL_MANAGER, RoleCode.DIRECTOR, RoleCode.SUPERVISOR, RoleCode.STAFF));
commandsRouter.use('/finance', requireModuleAccess('FINANCE'), requireRole(RoleCode.FINANCE, RoleCode.DIRECTOR));

function activeCompanyId(req: Request): string {
  if (!req.companyId) throw new ForbiddenError('Pilih company sebelum menjalankan command operasional.');
  return req.companyId;
}

async function updateBusinessDocumentStatus(req: Request, status: string) {
  const companyId = activeCompanyId(req);
  return prisma.$transaction(async (tx) => {
    const document = await tx.core_business_document.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: { id: true },
    });
    if (!document) throw new NotFoundError('Document');
    return tx.core_business_document.update({ where: { id: document.id }, data: { status } });
  });
}

async function updateProjectStatus(req: Request, data: { status: string; started_at?: Date }) {
  const companyId = activeCompanyId(req);
  return prisma.$transaction(async (tx) => {
    const project = await tx.project_project.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: { id: true },
    });
    if (!project) throw new NotFoundError('Project');
    return tx.project_project.update({ where: { id: project.id }, data });
  });
}

async function findWorkflowDocument(tx: Prisma.TransactionClient, module: string, documentId: string, companyId: string) {
  switch (module.toUpperCase()) {
    case 'PROJECT':
      return tx.project_project.findFirst({ where: { id: documentId, company_id: companyId } });
    case 'SALES_ORDER':
      return tx.sales_order.findFirst({ where: { id: documentId, company_id: companyId } });
    case 'PURCHASE_ORDER':
      return tx.proc_purchase_order.findFirst({ where: { id: documentId, company_id: companyId } });
    default:
      throw new WorkflowTransitionError(`Module workflow '${module}' tidak didukung oleh penyimpanan command.`);
  }
}

async function updateWorkflowDocumentStatus(tx: Prisma.TransactionClient, module: string, documentId: string, status: string) {
  switch (module.toUpperCase()) {
    case 'PROJECT':
      return tx.project_project.update({ where: { id: documentId }, data: { status } });
    case 'SALES_ORDER':
      return tx.sales_order.update({ where: { id: documentId }, data: { status } });
    case 'PURCHASE_ORDER':
      return tx.proc_purchase_order.update({ where: { id: documentId }, data: { status } });
    default:
      throw new WorkflowTransitionError(`Module workflow '${module}' tidak didukung oleh penyimpanan command.`);
  }
}

function requireWorkflowEntitlement(req: Request, res: Response, next: NextFunction) {
  const entitlementByWorkflow: Record<string, string> = {
    PROJECT: 'PROJECTS',
    SALES_ORDER: 'SALES',
    PURCHASE_ORDER: 'PROCUREMENT',
  };
  const moduleCode = entitlementByWorkflow[String(req.params.module || '').toUpperCase()];
  if (!moduleCode) return next(new WorkflowTransitionError(`Module workflow '${req.params.module}' tidak didukung.`));
  return requireModuleAccess(moduleCode)(req, res, next);
}

// =============================================================================
// WORKFLOW ENGINE COMMANDS
// =============================================================================

/**
 * GET route handler: `/workflow/registry`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
commandsRouter.get('/workflow/registry', (_req: Request, res: Response) => {
  res.json(WorkflowRegistry.listAll());
});

/**
 * GET route handler: `/workflow/transitions/:module/:document_id`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
commandsRouter.get('/workflow/transitions/:module/:document_id', requireWorkflowEntitlement, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { module, document_id } = req.params;
    const companyId = activeCompanyId(req);
    const tenantCode = req.user?.tenant_id ? 'arsalynk' : 'default';
    const wf = WorkflowRegistry.get(tenantCode, module);

    const context = {
      user: {
        id: req.user?.id ?? 'system',
        is_superuser: req.user?.is_superuser ?? false,
        roles: req.user?.roles ?? [],
      },
      company_id: companyId,
      tenant_code: tenantCode,
    };

    const document = await prisma.$transaction((tx) => findWorkflowDocument(tx, module, document_id, companyId));
    if (!document) throw new NotFoundError('Workflow document');
    const currentStatus = String(document.status);
    const transitions = wf.getAvailableTransitions(currentStatus, context);
    res.json({
      module,
      document_id,
      current_status: currentStatus,
      available_transitions: transitions,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST route handler: `/workflow/execute/:module/:document_id`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
commandsRouter.post('/workflow/execute/:module/:document_id', requireWorkflowEntitlement, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { module, document_id } = req.params;
    const { action, note, extra } = req.body;
    if (!action || typeof action !== 'string') throw new WorkflowTransitionError('Action workflow wajib diisi.');
    const companyId = activeCompanyId(req);
    const tenantCode = req.user?.tenant_id ? 'arsalynk' : 'default';
    const wf = WorkflowRegistry.get(tenantCode, module);

    const context = {
      user: {
        id: req.user?.id ?? 'system',
        is_superuser: req.user?.is_superuser ?? false,
        roles: req.user?.roles ?? [],
      },
      company_id: companyId,
      tenant_code: tenantCode,
      note,
      extra,
    };

    const result = await prisma.$transaction(async (tx) => {
      const document = await findWorkflowDocument(tx, module, document_id, companyId);
      if (!document) throw new NotFoundError('Workflow document');
      const fromStatus = String(document.status);
      const transition = wf.getAvailableTransitions(fromStatus, context).find((item) => item.action === action);
      if (!transition) {
        throw new WorkflowTransitionError(`Action '${action}' tidak tersedia dari status '${fromStatus}'.`);
      }
      await wf.validateTransition(document, fromStatus, transition.to_status, context);
      const updated = await updateWorkflowDocumentStatus(tx, module, document.id, transition.to_status);
      await wf.onStatusChanged(updated, fromStatus, transition.to_status, context);
      return { updated, fromStatus, transition };
    });

    res.json({
      success: true,
      module,
      document_id,
      action,
      previous_status: result.fromStatus,
      new_status: result.transition.to_status,
      document: result.updated,
    });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// CORE DOCUMENT COMMANDS
// =============================================================================

/**
 * POST route handler: `/core/documents/:id/submit`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `core_business_document` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
commandsRouter.post('/core/documents/:id/submit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await updateBusinessDocumentStatus(req, 'SUBMITTED');
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * POST route handler: `/core/documents/:id/approve`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `core_business_document` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
commandsRouter.post('/core/documents/:id/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await updateBusinessDocumentStatus(req, 'APPROVED');
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * POST route handler: `/core/documents/:id/reject`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `core_business_document` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
commandsRouter.post('/core/documents/:id/reject', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await updateBusinessDocumentStatus(req, 'REJECTED');
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * POST route handler: `/core/documents/:id/post`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `core_business_document` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
commandsRouter.post('/core/documents/:id/post', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await updateBusinessDocumentStatus(req, 'POSTED');
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * POST route handler: `/core/documents/:id/cancel`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `core_business_document` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
commandsRouter.post('/core/documents/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await updateBusinessDocumentStatus(req, 'CANCELLED');
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * POST route handler: `/core/documents/:id/reverse`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `core_business_document` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
commandsRouter.post('/core/documents/:id/reverse', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await updateBusinessDocumentStatus(req, 'REVERSED');
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * GET route handler: `/core/documents/:id/history`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `core_business_document` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
commandsRouter.get('/core/documents/:id/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doc = await prisma.core_business_document.findFirst({
      where: { id: req.params.id, company_id: activeCompanyId(req) },
    });
    if (!doc) throw new NotFoundError('Document');
    res.json({ document: doc, history: [] });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// SALES COMMANDS
// =============================================================================

/**
 * POST route handler: `/sales/quotations/:id/convert-to-order`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `sales_quotation`, `sales_order` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
commandsRouter.post('/sales/quotations/:id/convert-to-order', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = activeCompanyId(req);
    const order = await prisma.$transaction(async (tx) => {
      const quotation = await tx.sales_quotation.findFirst({
        where: { id: req.params.id, company_id: companyId },
      });
      if (!quotation) throw new NotFoundError('Quotation');
      const created = await tx.sales_order.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: quotation.tenant_id,
          company_id: companyId,
          created_by_id: req.user?.id,
          quotation_id: quotation.id,
          customer_party_id: quotation.customer_party_id,
          currency_id: quotation.currency_id,
          payment_term_id: quotation.payment_term_id,
          order_date: new Date(),
          subtotal: quotation.subtotal,
          tax_amount: quotation.tax_amount,
          total_amount: quotation.total_amount ?? 0,
          status: 'CONFIRMED',
        },
      });
      await tx.sales_quotation.update({ where: { id: quotation.id }, data: { status: 'ACCEPTED' } });
      return created;
    });

    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// PROJECT COMMANDS
// =============================================================================

/**
 * POST route handler: `/projects/projects/:id/start`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `project_project` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
commandsRouter.post('/projects/projects/:id/start', requireRole(RoleCode.PROJECT_MANAGER, RoleCode.OPERATIONAL_MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await updateProjectStatus(req, { status: 'ACTIVE', started_at: new Date() });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * POST route handler: `/projects/projects/:id/close`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `project_project` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
commandsRouter.post('/projects/projects/:id/close', requireRole(RoleCode.PROJECT_MANAGER, RoleCode.OPERATIONAL_MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await updateProjectStatus(req, { status: 'COMPLETED' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * GET route handler: `/projects/projects/:id/health`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
commandsRouter.get('/projects/projects/:id/health', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ProjectsService.calculateProjectEVM(req.params.id, new Date(), activeCompanyId(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET route handler: `/projects/projects/:id/costs`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `fin_project_cost_entry`, `project_expense` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
commandsRouter.get('/projects/projects/:id/costs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = activeCompanyId(req);
    const [entries, expenses] = await Promise.all([
      prisma.fin_project_cost_entry.findMany({ where: { project_id: req.params.id, company_id: companyId } }),
      prisma.project_expense.findMany({ where: { project_id: req.params.id, company_id: companyId } }),
    ]);
    res.json({ entries, expenses });
  } catch (err) {
    next(err);
  }
});

/**
 * GET route handler: `/projects/projects/:id/flow-status`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `project_project` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
commandsRouter.get('/projects/projects/:id/flow-status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await prisma.project_project.findFirst({
      where: { id: req.params.id, company_id: activeCompanyId(req) },
    });
    if (!project) throw new NotFoundError('Project');
    res.json({
      project_id: project.id,
      status: project.status,
      lifecycle_status: project.lifecycle_status,
      progress_percent: project.progress_percent ?? 0,
    });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// FINANCE COMMANDS
// =============================================================================

/**
 * POST route handler: `/finance/journal-entries/:id/post`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
commandsRouter.post('/finance/journal-entries/:id/post', requireRole(RoleCode.FINANCE), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await FinanceService.postJournalEntry(req.params.id, activeCompanyId(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET route handler: `/finance/flow-status`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
commandsRouter.get('/finance/flow-status', (_req: Request, res: Response) => {
  res.json({ status: 'ACTIVE', healthy: true });
});

// =============================================================================
// REPORTING COMMANDS
// =============================================================================

/**
 * GET route handler: `/reporting/crm-sales-dashboard`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `crm_opportunity` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
commandsRouter.get('/reporting/crm-sales-dashboard', requireModuleAccess('CRM'), requireRole(RoleCode.CRM_LEAD, RoleCode.SALES, RoleCode.PROJECT_MANAGER, RoleCode.DIRECTOR), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyWhere = { company_id: activeCompanyId(req) };
    const [oppCount, wonCount, totalPipeline, wonOpportunities] = await Promise.all([
      prisma.crm_opportunity.count({ where: companyWhere }),
      prisma.crm_opportunity.count({ where: { ...companyWhere, status: 'WON' } }),
      prisma.crm_opportunity.aggregate({ where: companyWhere, _sum: { expected_amount: true, expected_margin: true } }),
      prisma.crm_opportunity.findMany({
        where: { ...companyWhere, status: 'WON', opened_at: { not: null }, closed_at: { not: null } },
        select: { opened_at: true, closed_at: true },
      }),
    ]);
    const totalAmount = Number(totalPipeline._sum.expected_amount ?? 0);
    const totalMargin = Number(totalPipeline._sum.expected_margin ?? 0);
    const salesCycleDays = wonOpportunities.length > 0
      ? wonOpportunities.reduce((sum, opportunity) => sum + Math.max(0, (opportunity.closed_at!.getTime() - opportunity.opened_at!.getTime()) / 86_400_000), 0) / wonOpportunities.length
      : 0;

    res.json({
      total_opportunities: oppCount,
      won_opportunities: wonCount,
      win_rate_percent: oppCount > 0 ? (wonCount / oppCount) * 100 : 0,
      total_pipeline_value: totalPipeline._sum.expected_amount ?? 0,
      average_sales_cycle_days: salesCycleDays,
      offering_margin_percent: totalAmount > 0 ? (totalMargin / totalAmount) * 100 : 0,
      quotation_pending_approval_count: 0,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET route handler: `/reporting/finance-main-dashboard`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `fin_billing_document`, `fin_payment` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
commandsRouter.get('/reporting/finance-main-dashboard', requireModuleAccess('FINANCE'), requireRole(RoleCode.FINANCE, RoleCode.DIRECTOR), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyWhere = { company_id: activeCompanyId(req) };
    const [postedBills, incomingPayments, outgoingPayments, overdueInvoices] = await Promise.all([
      prisma.fin_billing_document.aggregate({
        where: { ...companyWhere, status: 'POSTED' },
        _sum: { total_amount: true, outstanding_amount: true },
      }),
      prisma.fin_payment.aggregate({
        where: { ...companyWhere, payment_type: 'CUSTOMER_RECEIPT', status: { in: ['RECEIVED', 'EXECUTED'] } },
        _sum: { amount: true },
      }),
      prisma.fin_payment.aggregate({
        where: { ...companyWhere, payment_type: { not: 'CUSTOMER_RECEIPT' }, status: 'EXECUTED' },
        _sum: { amount: true },
      }),
      prisma.fin_billing_document.count({
        where: { ...companyWhere, due_date: { lt: new Date() }, outstanding_amount: { gt: 0 } },
      }),
    ]);
    const totalIncoming = Number(incomingPayments._sum.amount ?? 0);
    const totalOutgoing = Number(outgoingPayments._sum.amount ?? 0);

    res.json({
      total_receivables: postedBills._sum.outstanding_amount ?? 0,
      total_billed: postedBills._sum.total_amount ?? 0,
      total_collected: totalIncoming,
      cash_position: totalIncoming - totalOutgoing,
      overdue_invoices_count: overdueInvoices,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET route handler: `/reporting/portfolio-financial-performance`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `project_project` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
commandsRouter.get('/reporting/portfolio-financial-performance', requireModuleAccess('PROJECTS'), requireRole(RoleCode.PROJECT_MANAGER, RoleCode.OPERATIONAL_MANAGER, RoleCode.DIRECTOR, RoleCode.FINANCE), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projects = await prisma.project_project.findMany({
      where: { company_id: activeCompanyId(req) },
      select: {
        id: true,
        project_name: true,
        project_code: true,
        budget_amount: true,
        progress_percent: true,
        status: true,
      },
    });
    res.json({ projects, count: projects.length });
  } catch (err) {
    next(err);
  }
});
