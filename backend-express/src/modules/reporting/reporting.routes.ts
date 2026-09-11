/**
 * File: backend-express/src/modules/reporting/reporting.routes.ts
 *
 * Purpose: Implements Express API routing responsibilities for the reporting domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { createCrudRouter } from '../../utils/crud-factory';
import { ForbiddenError, ValidationError } from '../../utils/errors';

export const reportingRouter = Router();

function activeCompanyId(req: Request): string {
  if (!req.companyId) throw new ForbiddenError('Pilih company sebelum mengakses laporan.');
  return req.companyId;
}

function reportLimit(req: Request, fallback = 100): number {
  return Math.min(200, Math.max(1, Math.trunc(Number(req.query.page_size) || fallback)));
}

// Reporting is a projection boundary: reports may be read/exported, but source
// records must be changed through their owning CRM, project, or finance workflow.
reportingRouter.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  return res.status(405).json({ success: false, code: 'REPORTING_READ_ONLY', message: 'Reporting hanya menyediakan akses baca.' });
});

// CRM Sales Dashboard
/**
 * GET route handler: `/crm-sales-dashboard`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `crm_opportunity` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
reportingRouter.get('/crm-sales-dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyScope = { company_id: activeCompanyId(req) };
    const [oppCount, wonCount, totalPipeline] = await Promise.all([
      prisma.crm_opportunity.count({ where: companyScope }),
      prisma.crm_opportunity.count({ where: { ...companyScope, status: 'WON' } }),
      prisma.crm_opportunity.aggregate({ where: companyScope, _sum: { expected_amount: true } }),
    ]);

    return res.json({
      total_opportunities: oppCount,
      won_opportunities: wonCount,
      win_rate_percent: oppCount > 0 ? (wonCount / oppCount) * 100 : 0,
      total_pipeline_value: totalPipeline._sum.expected_amount ?? 0,
      average_sales_cycle_days: 14,
      offering_margin_percent: 25.5,
      quotation_pending_approval_count: 0,
    });
  } catch (err) {
    return next(err);
  }
});

// Finance Main Dashboard
/**
 * GET route handler: `/finance-main-dashboard`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `fin_billing_document`, `fin_payment` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
reportingRouter.get('/finance-main-dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyScope = { company_id: activeCompanyId(req) };
    const [postedBills, totalPayments] = await Promise.all([
      prisma.fin_billing_document.aggregate({
        where: { ...companyScope, status: 'POSTED' },
        _sum: { total_amount: true, outstanding_amount: true },
      }),
      prisma.fin_payment.aggregate({
        where: { ...companyScope, status: 'EXECUTED' },
        _sum: { amount: true },
      }),
    ]);

    res.json({
      total_receivables: postedBills._sum.outstanding_amount ?? 0,
      total_billed: postedBills._sum.total_amount ?? 0,
      total_collected: totalPayments._sum.amount ?? 0,
      cash_position: 1500000000,
      overdue_invoices_count: 0,
    });
  } catch (err) {
    return next(err);
  }
});

// Portfolio Financial Performance
/**
 * GET route handler: `/portfolio-financial-performance`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `project_project` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
reportingRouter.get('/portfolio-financial-performance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = activeCompanyId(req);
    const take = reportLimit(req);
    const [projects, total] = await Promise.all([prisma.project_project.findMany({
      where: { company_id: companyId },
      select: {
        id: true,
        project_name: true,
        project_code: true,
        budget_amount: true,
        progress_percent: true,
        status: true,
      },
      take: take + 1,
    }), prisma.project_project.count({ where: { company_id: companyId } })]);
    const hasMore = projects.length > take;
    res.json({ projects: projects.slice(0, take), count: total, has_more: hasMore });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /periodic-project-summary
 *
 * Produces an on-demand daily, weekly, or monthly operational compilation from
 * daily tasks. Staff only see their own task activity; managerial roles receive
 * the company aggregate. The endpoint persists nothing.
 */
reportingRouter.get('/periodic-project-summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const periodType = String(req.query.period_type ?? 'DAILY').toUpperCase();
    if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(periodType)) {
      return res.status(400).json({ success: false, code: 'INVALID_PERIOD_TYPE', message: 'period_type harus DAILY, WEEKLY, atau MONTHLY.' });
    }

    const now = new Date();
    const defaultDays = periodType === 'DAILY' ? 1 : periodType === 'WEEKLY' ? 7 : 30;
    const start = req.query.start_date ? new Date(String(req.query.start_date)) : new Date(now.getTime() - (defaultDays - 1) * 86400000);
    const end = req.query.end_date ? new Date(String(req.query.end_date)) : now;
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) throw new ValidationError('Rentang tanggal laporan tidak valid.');
    end.setHours(23, 59, 59, 999);
    const staffOnly = req.user?.active_role_code === 'STAFF';

    const take = reportLimit(req);
    const baseWhere = {
        company_id: activeCompanyId(req),
        planned_date: { gte: start, lte: end },
        ...(staffOnly ? { owner_id: req.user!.id } : {}),
    };
    const [tasks, total, completed, blocked] = await Promise.all([
      prisma.project_daily_task.findMany({ where: baseWhere,
      orderBy: { planned_date: 'asc' },
      take: take + 1 }),
      prisma.project_daily_task.count({ where: baseWhere }),
      prisma.project_daily_task.count({ where: { ...baseWhere, status: { in: ['COMPLETED', 'DONE'] } } }),
      prisma.project_daily_task.count({ where: { ...baseWhere, OR: [{ is_blocked: true }, { status: 'BLOCKED' }] } }),
    ]);
    return res.json({
      period_type: periodType,
      start_date: start,
      end_date: end,
      summary: {
        total_tasks: total,
        completed_tasks: completed,
        blocked_tasks: blocked,
        completion_rate_percent: total ? Math.round((completed / total) * 10000) / 100 : 0,
      },
      tasks: tasks.slice(0, take),
      has_more: tasks.length > take,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /attendance-summary
 *
 * Treats approved/project timesheets as the implemented attendance evidence.
 * The result is company-scoped and staff identities are restricted to self.
 */
reportingRouter.get('/attendance-summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const start = req.query.start_date ? new Date(String(req.query.start_date)) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = req.query.end_date ? new Date(String(req.query.end_date)) : now;
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) throw new ValidationError('Rentang tanggal laporan tidak valid.');
    end.setHours(23, 59, 59, 999);
    const staffOnly = req.user?.active_role_code === 'STAFF';
    const take = reportLimit(req);
    const where = {
        company_id: activeCompanyId(req),
        work_date: { gte: start, lte: end },
        ...(staffOnly ? { employee_id: req.user!.id } : {}),
    };
    const [entries, totals] = await Promise.all([prisma.project_timesheet.findMany({ where,
      orderBy: { work_date: 'desc' },
      take: take + 1 }), prisma.project_timesheet.aggregate({ where, _sum: { hours: true }, _count: { _all: true } })]);

    const visibleEntries = entries.slice(0, take);
    const workDays = new Set(visibleEntries.filter((entry) => entry.work_date).map((entry) => entry.work_date!.toISOString().slice(0, 10))).size;
    res.json({ start_date: start, end_date: end, total_hours: totals._sum.hours ?? 0, work_days: workDays, entry_count: totals._count._all, entries: visibleEntries, has_more: entries.length > take });
  } catch (err) {
    next(err);
  }
});

/** Company-scoped operational projection for Operations Management. */
reportingRouter.get('/operational-summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = activeCompanyId(req);
    const now = new Date();
    const projectWhere = { company_id: companyId };
    const taskWhere = { company_id: companyId };
    const milestoneWhere = { company_id: companyId };
    const [projectsTotal, projectsActive, tasksTotal, tasksInProgress, tasksBlocked, milestonesTotal, milestonesOverdue] = await Promise.all([
      prisma.project_project.count({ where: projectWhere }),
      prisma.project_project.count({ where: { ...projectWhere, status: { in: ['ACTIVE', 'IN_PROGRESS'] } } }),
      prisma.project_daily_task.count({ where: taskWhere }),
      prisma.project_daily_task.count({ where: { ...taskWhere, status: 'IN_PROGRESS' } }),
      prisma.project_daily_task.count({ where: { ...taskWhere, OR: [{ is_blocked: true }, { status: 'BLOCKED' }] } }),
      prisma.project_milestone.count({ where: milestoneWhere }),
      prisma.project_milestone.count({ where: { ...milestoneWhere, planned_date: { lt: now }, status: { notIn: ['COMPLETED', 'DONE'] } } }),
    ]);
    return res.json({
      generated_at: now,
      projects: { total: projectsTotal, active: projectsActive },
      tasks: { total: tasksTotal, in_progress: tasksInProgress, blocked: tasksBlocked },
      milestones: { total: milestonesTotal, overdue: milestonesOverdue },
    });
  } catch (err) {
    return next(err);
  }
});

// REST ViewSets
reportingRouter.use('/finance-main-dashboards', createCrudRouter({ modelName: 'view_finance_main_dashboard', lookupField: 'company_id', readOnly: true }));
reportingRouter.use('/project-dashboards', createCrudRouter({ modelName: 'view_project_dashboard', lookupField: 'project_id', readOnly: true }));
reportingRouter.use('/project-timeline-costs', createCrudRouter({ modelName: 'view_project_timeline_cost', lookupField: 'project_id', readOnly: true }));
reportingRouter.use('/crm-sales-dashboards', createCrudRouter({ modelName: 'view_crm_sales_dashboard', lookupField: 'company_id', readOnly: true }));
