/**
 * Dashboard Backend-for-Frontend (BFF).
 *
 * Responsibility:
 * - Aggregates the read models required by the Next.js dashboard into one HTTP response.
 * - Executes independent database reads concurrently to reduce remote PostgreSQL round trips.
 * - Enforces the authenticated user's company, effective module entitlements, and active role.
 *
 * This is a read-only projection boundary. It never mutates operational records and it must
 * not be used to bypass the owning module's workflow or authorization middleware.
 */
import { NextFunction, Request, Response, Router } from 'express';
import prisma from '../../config/database';
import { buildResourceScope } from '../accounts/resource-scope.service';
import { RoleCode } from '../../types/roles';
import { getModelFields } from '../../utils/crud-factory';
import { ForbiddenError, ValidationError } from '../../utils/errors';
import { Prisma } from '@prisma/client';
import { ReadThroughCache } from '../../utils/read-through-cache';

export const dashboardRouter = Router();

const dashboardCache = new ReadThroughCache<Record<string, unknown>>(250);
const DASHBOARD_CACHE_OPTIONS = { ttlMs: 15_000, staleMs: 285_000, timeoutMs: 1_200 };

type DashboardSection = 'projects' | 'finance' | 'crm';

const SECTION_ROLES: Record<DashboardSection, readonly string[]> = {
  projects: [RoleCode.PROJECT_MANAGER, RoleCode.OPERATIONAL_MANAGER, RoleCode.DIRECTOR, RoleCode.SUPERVISOR, RoleCode.STAFF, RoleCode.CRM_LEAD, RoleCode.SALES],
  finance: [RoleCode.FINANCE, RoleCode.DIRECTOR],
  crm: [RoleCode.CRM_LEAD, RoleCode.SALES, RoleCode.PROJECT_MANAGER, RoleCode.DIRECTOR],
};

/** Parses and validates the optional comma-separated section selection. */
function parseSections(value: unknown): DashboardSection[] {
  if (!value) return ['projects', 'finance', 'crm'];
  const values = String(value).split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  const invalid = values.filter((item) => !['projects', 'finance', 'crm'].includes(item));
  if (invalid.length) throw new ValidationError(`Dashboard section tidak valid: ${invalid.join(', ')}.`);
  return [...new Set(values)] as DashboardSection[];
}

/**
 * Determines whether the current identity may receive a dashboard section.
 * Company Admin remains an IAM operator and is intentionally excluded from operational data.
 */
function canReadSection(req: Request, section: DashboardSection): boolean {
  const moduleCode = section.toUpperCase();
  const enabled = new Set((req.user?.enabled_modules ?? []).map((item) => item.toUpperCase()));
  const activeRole = req.user?.active_role_code;
  return enabled.has(moduleCode) && Boolean(activeRole && SECTION_ROLES[section].includes(activeRole));
}

/** Loads project dashboard source records using the same limits as the former browser fan-out. */
async function loadProjectBundle(req: Request, includeFinance: boolean) {
  const companyId = req.companyId!;
  const tenantId = req.user?.tenant_id;
  if (!tenantId) throw new ForbiddenError('Tenant user tidak tersedia untuk dashboard proyek.');
  type ProjectBundle = {
    projects: unknown[]; mainTasks: unknown[]; assignments: unknown[]; weeklyTasks: unknown[];
    dailyTasks: unknown[]; tasks: unknown[]; milestones: unknown[]; stages: unknown[];
    costEntries: unknown[]; proposals: unknown[]; fundings: unknown[]; users: unknown[];
  };
  const rows = await prisma.$queryRaw<Array<{ bundle: ProjectBundle }>>(Prisma.sql`
    SELECT jsonb_build_object(
      'projects', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, project_code, project_name, customer_name, manager_name, description, planned_start_date, planned_end_date, actual_start_date, actual_end_date, budget_amount, contract_amount, progress_percent, status, lifecycle_status, health_status, project_manager_id FROM project_project WHERE tenant_id = ${tenantId}::uuid AND company_id = ${companyId}::uuid LIMIT 100) x), '[]'::jsonb),
      'mainTasks', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, project_id, name, description, priority, start_date, due_date, weight, status FROM project_main_task WHERE tenant_id = ${tenantId}::uuid AND company_id = ${companyId}::uuid LIMIT 300) x), '[]'::jsonb),
      'assignments', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, main_task_id, assignee_id FROM project_task_assignment WHERE tenant_id = ${tenantId}::uuid AND company_id = ${companyId}::uuid LIMIT 500) x), '[]'::jsonb),
      'weeklyTasks', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, main_task_id, assignee_id, week_number, start_date, end_date, target_description, status FROM project_weekly_task WHERE tenant_id = ${tenantId}::uuid AND company_id = ${companyId}::uuid LIMIT 500) x), '[]'::jsonb),
      'dailyTasks', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, weekly_task_id, owner_id, title, planned_date, time_slot, output_result, notes, progress, status, is_blocked, block_reason FROM project_daily_task WHERE tenant_id = ${tenantId}::uuid AND company_id = ${companyId}::uuid LIMIT 1000) x), '[]'::jsonb),
      'tasks', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, project_id, parent_task_id, task_name, description, priority, progress_percent, status FROM project_task WHERE tenant_id = ${tenantId}::uuid AND company_id = ${companyId}::uuid LIMIT 500) x), '[]'::jsonb),
      'milestones', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, project_id, milestone_name, planned_date, actual_date, weight_percent, status FROM project_milestone WHERE tenant_id = ${tenantId}::uuid AND company_id = ${companyId}::uuid LIMIT 300) x), '[]'::jsonb),
      'stages', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, project_id, check_type, status, message, blocking, checked_at FROM project_readiness_check WHERE tenant_id = ${tenantId}::uuid AND company_id = ${companyId}::uuid LIMIT 200) x), '[]'::jsonb),
      'costEntries', '[]'::jsonb, 'proposals', '[]'::jsonb, 'fundings', '[]'::jsonb,
      'users', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT DISTINCT u.id, u.full_name, u.email, u.username FROM iam_user u JOIN iam_user_role ur ON ur.user_id = u.id WHERE ur.tenant_id = ${tenantId}::uuid AND ur.company_id = ${companyId}::uuid LIMIT 200) x), '[]'::jsonb)
    ) AS bundle
  `);
  // Finance owns its projection in the bootstrap route. Keep the legacy flag
  // explicit so a future standalone caller cannot silently receive raw data.
  if (includeFinance) throw new ValidationError('Finance harus dimuat melalui section finance.');
  return rows[0].bundle;
}

/** Computes complete Finance KPIs in PostgreSQL and returns only visible preview rows. */
async function loadFinanceBundle(req: Request, includeProjects: boolean) {
  const companyId = req.companyId!;
  const tenantId = req.user?.tenant_id;
  if (!tenantId) throw new ForbiddenError('Tenant user tidak tersedia untuk dashboard finance.');
  const pendingFundingStatuses = ['APPROVED', 'DISBURSED', 'COMPLETED'];
  const pendingBillingStatuses = ['APPROVED', 'PAID', 'COMPLETED'];
  const validatedCostStatuses = ['VALIDATED', 'APPROVED'];
  type StatusGroup = { status: string; _count: { _all: number }; _sum: { requested_amount?: number | null; total_amount?: number | null } };
  type FinanceSnapshot = {
    total_budget: number | null; used_budget: number | null;
    funding_groups: StatusGroup[]; billing_groups: StatusGroup[];
    pending_fundings: any[]; pending_billings: any[]; recent_costs: any[];
    recent_fundings: any[]; recent_billings: any[]; projects: any[];
    costs_by_project: any[]; fundings_by_project: any[]; billings_by_project: any[];
  };
  const result = await prisma.$queryRaw<Array<{ snapshot: FinanceSnapshot }>>(Prisma.sql`
    SELECT jsonb_build_object(
      'total_budget', CASE WHEN ${includeProjects}::boolean THEN (SELECT COALESCE(sum(budget_amount),0) FROM project_project WHERE tenant_id=${tenantId}::uuid AND company_id=${companyId}::uuid) ELSE 0 END,
      'used_budget', (SELECT COALESCE(sum(total_cost),0) FROM fin_project_cost_entry WHERE tenant_id=${tenantId}::uuid AND company_id=${companyId}::uuid AND status IN ('VALIDATED','APPROVED')),
      'funding_groups', COALESCE((SELECT jsonb_agg(jsonb_build_object('status',status,'_count',jsonb_build_object('_all',count),'_sum',jsonb_build_object('requested_amount',amount))) FROM (SELECT status,count(*)::int AS count,sum(requested_amount) AS amount FROM fin_project_funding WHERE tenant_id=${tenantId}::uuid AND company_id=${companyId}::uuid GROUP BY status) g), '[]'::jsonb),
      'billing_groups', COALESCE((SELECT jsonb_agg(jsonb_build_object('status',status,'_count',jsonb_build_object('_all',count),'_sum',jsonb_build_object('total_amount',amount))) FROM (SELECT status,count(*)::int AS count,sum(total_amount) AS amount FROM fin_billing_proposal WHERE tenant_id=${tenantId}::uuid AND company_id=${companyId}::uuid GROUP BY status) g), '[]'::jsonb),
      'pending_fundings', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id,project_id,purpose,requested_amount,status,created_at FROM fin_project_funding WHERE tenant_id=${tenantId}::uuid AND company_id=${companyId}::uuid AND status NOT IN ('APPROVED','DISBURSED','COMPLETED') ORDER BY created_at DESC,id DESC LIMIT 8) x), '[]'::jsonb),
      'pending_billings', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id,project_id,description,total_amount,status,created_at FROM fin_billing_proposal WHERE tenant_id=${tenantId}::uuid AND company_id=${companyId}::uuid AND status NOT IN ('APPROVED','PAID','COMPLETED') ORDER BY created_at DESC,id DESC LIMIT 8) x), '[]'::jsonb),
      'recent_costs', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id,project_id,description,total_cost,status,transaction_date FROM fin_project_cost_entry WHERE tenant_id=${tenantId}::uuid AND company_id=${companyId}::uuid ORDER BY transaction_date DESC,id DESC LIMIT 10) x), '[]'::jsonb),
      'recent_fundings', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id,project_id,purpose,requested_amount,status,created_at FROM fin_project_funding WHERE tenant_id=${tenantId}::uuid AND company_id=${companyId}::uuid ORDER BY created_at DESC,id DESC LIMIT 10) x), '[]'::jsonb),
      'recent_billings', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id,project_id,description,total_amount,status,created_at FROM fin_billing_proposal WHERE tenant_id=${tenantId}::uuid AND company_id=${companyId}::uuid ORDER BY created_at DESC,id DESC LIMIT 10) x), '[]'::jsonb),
      'projects', CASE WHEN ${includeProjects}::boolean THEN COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id,project_name,budget_amount FROM project_project WHERE tenant_id=${tenantId}::uuid AND company_id=${companyId}::uuid ORDER BY updated_at DESC,id DESC LIMIT 8) x), '[]'::jsonb) ELSE '[]'::jsonb END,
      'costs_by_project', COALESCE((SELECT jsonb_agg(jsonb_build_object('project_id',project_id,'_sum',jsonb_build_object('total_cost',amount))) FROM (SELECT project_id,sum(total_cost) amount FROM fin_project_cost_entry WHERE tenant_id=${tenantId}::uuid AND company_id=${companyId}::uuid AND status IN ('VALIDATED','APPROVED') GROUP BY project_id) x), '[]'::jsonb),
      'fundings_by_project', COALESCE((SELECT jsonb_agg(jsonb_build_object('project_id',project_id,'_sum',jsonb_build_object('requested_amount',amount))) FROM (SELECT project_id,sum(requested_amount) amount FROM fin_project_funding WHERE tenant_id=${tenantId}::uuid AND company_id=${companyId}::uuid AND status NOT IN ('APPROVED','DISBURSED','COMPLETED') GROUP BY project_id) x), '[]'::jsonb),
      'billings_by_project', COALESCE((SELECT jsonb_agg(jsonb_build_object('project_id',project_id,'_sum',jsonb_build_object('total_amount',amount))) FROM (SELECT project_id,sum(total_amount) amount FROM fin_billing_proposal WHERE tenant_id=${tenantId}::uuid AND company_id=${companyId}::uuid AND status NOT IN ('APPROVED','PAID','COMPLETED') GROUP BY project_id) x), '[]'::jsonb)
    ) AS snapshot
  `);
  const snapshot = result[0].snapshot;
  const budget = { _sum: { budget_amount: snapshot.total_budget } };
  const used = { _sum: { total_cost: snapshot.used_budget } };
  const fundingGroups = snapshot.funding_groups;
  const billingGroups = snapshot.billing_groups;
  const pendingFundings = snapshot.pending_fundings;
  const pendingBillings = snapshot.pending_billings;
  const recentCosts = snapshot.recent_costs;
  const recentFundings = snapshot.recent_fundings;
  const recentBillings = snapshot.recent_billings;
  const projects = snapshot.projects;
  const costsByProject = snapshot.costs_by_project;
  const fundingsByProject = snapshot.fundings_by_project;
  const billingsByProject = snapshot.billings_by_project;

  const fundingStatus = new Map(fundingGroups.map((item) => [item.status.toUpperCase(), item]));
  const billingStatus = new Map(billingGroups.map((item) => [item.status.toUpperCase(), item]));
  const sumGroups = (groups: typeof fundingGroups | typeof billingGroups, statuses: string[]) => groups
    .filter((item) => statuses.includes(item.status.toUpperCase()))
    .reduce((result, item) => result + Number('requested_amount' in item._sum ? item._sum.requested_amount ?? 0 : item._sum.total_amount ?? 0), 0);
  const countGroups = (groups: typeof fundingGroups | typeof billingGroups, statuses: string[]) => groups
    .filter((item) => statuses.includes(item.status.toUpperCase()))
    .reduce((result, item) => result + item._count._all, 0);
  const allFundingStatuses = [...fundingStatus.keys()];
  const allBillingStatuses = [...billingStatus.keys()];
  const pendingFundingKeys = allFundingStatuses.filter((status) => !pendingFundingStatuses.includes(status));
  const pendingBillingKeys = allBillingStatuses.filter((status) => !pendingBillingStatuses.includes(status));
  const approvedFundingKeys = ['APPROVED', 'DISBURSED'];
  const approvedBillingKeys = ['APPROVED', 'PAID'];
  const rejectedKeys = ['REJECTED', 'CANCELLED'];
  const totalBudget = Number(budget._sum.budget_amount ?? 0);
  const usedBudget = Number(used._sum.total_cost ?? 0);
  const pendingAmount = sumGroups(fundingGroups, pendingFundingKeys) + sumGroups(billingGroups, pendingBillingKeys);
  const pendingRequests = countGroups(fundingGroups, pendingFundingKeys) + countGroups(billingGroups, pendingBillingKeys);

  const pendingItems = [
    ...pendingFundings.map((item) => ({ id: item.id, type: 'funding', label: item.purpose || `Pengajuan Dana #${item.id.slice(0, 6)}`, project: item.project_id || '', amount: Number(item.requested_amount ?? 0), status: item.status, date: item.created_at, urgency: Number(item.requested_amount ?? 0) > 50_000_000 ? 'urgent' : 'normal' })),
    ...pendingBillings.map((item) => ({ id: item.id, type: 'billing', label: item.description || `Billing Termin #${item.id.slice(0, 6)}`, project: item.project_id, amount: Number(item.total_amount), status: item.status, date: item.created_at, urgency: Number(item.total_amount) > 50_000_000 ? 'urgent' : 'normal' })),
  ].sort((a, b) => (a.urgency === b.urgency ? new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime() : a.urgency === 'urgent' ? -1 : 1)).slice(0, 8);

  const recentTransactions = [
    ...recentCosts.map((item) => ({ id: item.id, type: 'cost', label: item.description, project: item.project_id, amount: Number(item.total_cost), status: item.status, date: item.transaction_date })),
    ...recentFundings.map((item) => ({ id: item.id, type: 'funding', label: item.purpose, project: item.project_id || '', amount: Number(item.requested_amount ?? 0), status: item.status, date: item.created_at })),
    ...recentBillings.map((item) => ({ id: item.id, type: 'billing', label: item.description, project: item.project_id, amount: Number(item.total_amount), status: item.status, date: item.created_at })),
  ].sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()).slice(0, 20);
  const costMap = new Map(costsByProject.map((item) => [item.project_id, Number(item._sum.total_cost ?? 0)]));
  const fundingMap = new Map(fundingsByProject.map((item) => [item.project_id, Number(item._sum.requested_amount ?? 0)]));
  const billingMap = new Map(billingsByProject.map((item) => [item.project_id, Number(item._sum.total_amount ?? 0)]));
  const projectSummaries = projects.map((project) => {
    const projectBudget = Number(project.budget_amount ?? 0);
    const spent = costMap.get(project.id) ?? 0;
    return { projectId: project.id, projectName: project.project_name, budget: projectBudget, spent, utilization: projectBudget ? Math.min(100, Math.round((spent / projectBudget) * 100)) : 0, pendingAmount: (fundingMap.get(project.id) ?? 0) + (billingMap.get(project.id) ?? 0) };
  });
  return { view: {
    kpis: {
      totalBudget, usedBudget, remainingBudget: Math.max(0, totalBudget - usedBudget), pendingRequests, pendingAmount,
      approvedRequests: countGroups(fundingGroups, approvedFundingKeys) + countGroups(billingGroups, approvedBillingKeys),
      approvedAmount: sumGroups(fundingGroups, approvedFundingKeys) + sumGroups(billingGroups, approvedBillingKeys),
      rejectedRequests: countGroups(fundingGroups, rejectedKeys) + countGroups(billingGroups, rejectedKeys),
      budgetUtilization: totalBudget ? Math.min(100, Math.round((usedBudget / totalBudget) * 100)) : 0,
    },
    pendingItems, recentTransactions, projectSummaries,
    rawCostEntries: [], rawFundings: [], rawBillingProposals: [], rawProjects: [],
  } };
}

/** Loads accurate CRM aggregates plus the six opportunity rows visible on the dashboard. */
async function loadCrmBundle(req: Request, enabledModules: readonly string[]) {
  const [opportunityScope, inquiryScope, serviceCaseScope, approvalScope] = await Promise.all([
    'crm_opportunity',
    'crm_customer_inquiry',
    'service_case',
    'crm_executive_approval',
  ].map((modelName) => buildResourceScope(req, modelName, getModelFields(modelName))));
  const enabled = new Set(enabledModules.map((item) => item.toUpperCase()));
  const activeWhere = { ...opportunityScope, status: { notIn: ['CANCELLED', 'CANCEL', 'BATAL'] } };
  const [opportunityCount, activeOpportunityCount, wonCount, pipeline, wonDates, inquiryCount, caseCount, pendingApprovalCount, opportunities] = await Promise.all([
    prisma.crm_opportunity.count({ where: opportunityScope }),
    prisma.crm_opportunity.count({ where: activeWhere }),
    prisma.crm_opportunity.count({ where: { ...opportunityScope, status: 'WON' } }),
    prisma.crm_opportunity.aggregate({ where: activeWhere, _sum: { expected_amount: true, expected_margin: true } }),
    prisma.crm_opportunity.findMany({
      where: { ...opportunityScope, status: 'WON', opened_at: { not: null }, closed_at: { not: null } },
      select: { opened_at: true, closed_at: true },
    }),
    prisma.crm_customer_inquiry.count({ where: inquiryScope }),
    enabled.has('SERVICE') ? prisma.service_case.count({ where: serviceCaseScope }) : Promise.resolve(0),
    prisma.crm_executive_approval.count({ where: { ...approvalScope, decision: 'PENDING' } }),
    prisma.crm_opportunity.findMany({
      where: activeWhere,
      orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
      take: 6,
      select: {
        id: true,
        opportunity_name: true,
        pipeline_stage: true,
        status: true,
        expected_amount: true,
        probability_percent: true,
      },
    }),
  ]);
  const pipelineValue = Number(pipeline._sum.expected_amount ?? 0);
  const margin = Number(pipeline._sum.expected_margin ?? 0);
  const averageCycle = wonDates.length
    ? wonDates.reduce((sum, item) => sum + Math.max(0, (item.closed_at!.getTime() - item.opened_at!.getTime()) / 86_400_000), 0) / wonDates.length
    : 0;
  return {
    data: { opportunities },
    dashboard: {
      total_opportunities: opportunityCount,
      active_opportunities: activeOpportunityCount,
      total_inquiries: inquiryCount,
      total_service_cases: caseCount,
      won_opportunities: wonCount,
      win_rate_percent: opportunityCount ? (wonCount / opportunityCount) * 100 : 0,
      total_pipeline_value: pipelineValue,
      weighted_project_value: pipelineValue,
      offering_margin_percent: pipelineValue ? (margin / pipelineValue) * 100 : 0,
      average_sales_cycle_days: averageCycle,
      quotation_pending_approval_count: pendingApprovalCount,
    },
  };
}

/**
 * GET /api/v1/dashboard/bootstrap?sections=projects,finance,crm
 *
 * Returns one company-scoped payload for the requested, authorized dashboard sections.
 * Independent section loaders run concurrently. Unauthorized requested sections fail closed
 * instead of being silently included, preventing BFF aggregation from weakening RBAC.
 */
dashboardRouter.get('/bootstrap', async (req: Request, res: Response, next: NextFunction) => {
  const startedAt = performance.now();
  try {
    if (!req.companyId) throw new ForbiddenError('Pilih satu company eksplisit untuk memuat dashboard operasional.');
    const requested = parseSections(req.query.sections);
    const denied = requested.filter((section) => !canReadSection(req, section));
    if (denied.length) throw new ForbiddenError(`Akses dashboard ditolak untuk section: ${denied.join(', ')}.`);
    const enabled = req.user?.enabled_modules ?? [];
    const cacheKey = [
      req.user!.tenant_id,
      req.companyId,
      req.user!.id,
      req.user!.active_role_code,
      [...enabled].sort().join(','),
      [...requested].sort().join(','),
    ].join('|');
    const cached = await dashboardCache.get(cacheKey, async () => {
      const requestedSet = new Set(requested);
      const sectionPromises = new Map<DashboardSection, Promise<unknown>>();
      // Loaders are intentionally created inside the cache miss callback. A hit
      // therefore performs zero dashboard database reads.
      if (requestedSet.has('projects')) sectionPromises.set('projects', loadProjectBundle(req, false));
      if (requestedSet.has('finance')) sectionPromises.set('finance', loadFinanceBundle(req, enabled.includes('PROJECTS')));
      if (requestedSet.has('crm')) sectionPromises.set('crm', loadCrmBundle(req, enabled));
      const result = await Promise.all(requested.map(async (section) => [section, await sectionPromises.get(section)!] as const));
      return Object.fromEntries(result);
    }, DASHBOARD_CACHE_OPTIONS);
    // The URL is shared by every tenant and role; make every intermediary aware
    // that authorization and company scope are part of the representation key.
    res.vary('Authorization');
    res.vary('X-Company-ID');
    res.setHeader('Cache-Control', 'private, max-age=15, stale-while-revalidate=30');
    res.setHeader('X-Dashboard-Cache', cached.state);
    res.setHeader('Server-Timing', `dashboard;dur=${(performance.now() - startedAt).toFixed(1)}`);
    return res.json({ success: true, data: cached.value, meta: { sections: requested, request_id: req.requestId } });
  } catch (error) {
    return next(error);
  }
});
