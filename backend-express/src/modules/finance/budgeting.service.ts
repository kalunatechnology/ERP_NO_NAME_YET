import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import { ensureCompanyDepartmentsAndCostCenters } from '../master_data/master_data.routes';

const MONEY_EPSILON = 0.005;
const CONTROL_POLICIES = new Set(['HARD_STOP', 'SOFT_WARNING', 'APPROVAL_ESCALATION']);
const PERIOD_MODES = new Set(['ANNUAL', 'MONTHLY', 'QUARTERLY']);
const RESERVATION_SOURCE_TYPES = new Set(['REQUEST', 'PURCHASE_ORDER', 'INVOICE', 'OTHER']);
const isActiveMasterStatus = (status?: string | null) => !['INACTIVE', 'DISABLED', 'DELETED', 'ARCHIVED'].includes(String(status ?? '').trim().toUpperCase());

function money(value: unknown, label: string, allowZero = false): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (allowZero ? parsed < 0 : parsed <= 0)) {
    throw new ValidationError(`${label} harus berupa nominal ${allowZero ? 'nol atau lebih' : 'lebih dari nol'}.`);
  }
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function requiredText(value: unknown, label: string, max = 240): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new ValidationError(`${label} wajib diisi (maksimal ${max} karakter).`);
  }
  return value.trim();
}

function deltaText(value: number): string {
  return value.toFixed(2);
}

export class BudgetingService {
  static async getOptions(companyId: string) {
    await ensureCompanyDepartmentsAndCostCenters(companyId);
    const [fiscalYears, fiscalPeriods, accounts, costCenters, projects, departments, coreDepartments, requestTickets, purchaseOrders, legacyFundings] = await Promise.all([
      prisma.fin_fiscal_year.findMany({ where: { company_id: companyId }, orderBy: { start_date: 'desc' } }),
      prisma.fin_fiscal_period.findMany({ where: { company_id: companyId }, orderBy: { period_number: 'asc' } }),
      prisma.fin_account.findMany({ where: { company_id: companyId, status: 'ACTIVE', account_type: 'EXPENSE' }, orderBy: { account_code: 'asc' } }),
      prisma.master_cost_center.findMany({ where: { company_id: companyId }, orderBy: { cost_center_code: 'asc' } }),
      prisma.project_project.findMany({ where: { company_id: companyId, lifecycle_status: { not: 'CANCELLED' } }, select: { id: true, project_code: true, project_name: true }, orderBy: { project_code: 'asc' } }),
      prisma.master_department.findMany({ where: { company_id: companyId }, orderBy: { department_code: 'asc' } }),
      (prisma as any).core_department.findMany({ where: { company_id: companyId, is_active: true }, orderBy: { name: 'asc' } }).catch(() => []),
      prisma.request_ticket.findMany({ where: { company_id: companyId, request_type: 'FUND_REQUEST', cancelled_at: null }, orderBy: { created_at: 'desc' }, take: 100 }),
      prisma.proc_purchase_order.findMany({ where: { company_id: companyId, status: 'APPROVED' }, orderBy: { order_date: 'desc' }, take: 100 }),
      prisma.fin_project_funding.findMany({ where: { company_id: companyId, status: { notIn: ['REJECTED', 'CANCELLED', 'DISBURSED'] } }, orderBy: { created_at: 'desc' }, take: 100 }),
    ]);

    const requestIds = requestTickets.map((request) => request.id);
    const allFundingRequestIds = [...requestIds, ...legacyFundings.map((funding) => funding.id)];
    const workflowIds = requestTickets.map((request) => request.workflow_instance_id);
    const documentIds = purchaseOrders.map((order) => order.document_id).filter((id): id is string => Boolean(id));
    const [requestWorkflows, requestEvents, orderDocuments, requestReservations] = await Promise.all([
      workflowIds.length ? prisma.core_workflow_instance.findMany({ where: { company_id: companyId, id: { in: workflowIds } }, select: { id: true, current_state: true } }) : Promise.resolve([]),
      requestIds.length ? prisma.core_audit_event.findMany({ where: { company_id: companyId, entity_name: 'core_internal_request', event_type: 'CREATE_REQUEST', entity_id: { in: requestIds } }, select: { entity_id: true, after_data: true }, orderBy: { occurred_at: 'asc' } }) : Promise.resolve([]),
      documentIds.length ? prisma.core_business_document.findMany({ where: { company_id: companyId, id: { in: documentIds } }, select: { id: true, document_number: true } }) : Promise.resolve([]),
      allFundingRequestIds.length ? prisma.fin_budget_reservation.findMany({ where: { company_id: companyId, source_type: 'REQUEST', source_id: { in: allFundingRequestIds }, status: { in: ['OPEN', 'PARTIALLY_RELEASED', 'PENDING_APPROVAL'] } }, select: { source_id: true, allocation_id: true, amount: true, remaining_amount: true, status: true } }) : Promise.resolve([]),
    ]);
    const workflowById = new Map(requestWorkflows.map((row) => [row.id, row.current_state]));
    const eventByRequestId = new Map(requestEvents.map((row) => [row.entity_id, row.after_data as Record<string, any> | null]));
    const orderNumberByDocumentId = new Map(orderDocuments.map((row) => [row.id, row.document_number]));
    const reservationByRequestId = new Map(requestReservations.map((row) => [row.source_id, row]));
    const projectById = new Map(projects.map((row) => [row.id, row]));
    const fundRequests = [ ...requestTickets.map((request) => {
      const payload = eventByRequestId.get(request.id) ?? {};
      const reservation = reservationByRequestId.get(request.id);
      return {
        id: request.id,
        request_number: request.request_number,
        title: request.title,
        description: request.description,
        request_type: request.request_type,
        status: workflowById.get(request.workflow_instance_id) ?? request.status,
        request_status: request.status,
        amount: Number(payload.amount ?? 0),
        project_id: request.project_id,
        project_name: projectById.get(request.project_id ?? '')?.project_name ?? null,
        budget_category: payload.budget_category ?? null,
        created_at: request.created_at,
        budget_allocation_id: request.budget_allocation_id ?? reservation?.allocation_id ?? null,
        budget_reservation_id: request.budget_reservation_id ?? null,
        committed_amount: reservation ? Number(reservation.amount) : 0,
        remaining_commitment: reservation ? Number(reservation.remaining_amount) : 0,
        has_active_commitment: Boolean(reservation),
        legacy_funding: false,
      };
    }), ...legacyFundings.map((funding) => {
      const reservation = reservationByRequestId.get(funding.id);
      return {
        id: funding.id,
        request_number: funding.document_id || `FUND-${funding.id.slice(0, 8).toUpperCase()}`,
        title: funding.purpose || 'Permintaan dana proyek',
        description: funding.purpose || '',
        request_type: 'FUND_REQUEST',
        status: funding.status,
        request_status: funding.status,
        amount: Number(funding.requested_amount ?? 0),
        project_id: funding.project_id,
        project_name: projectById.get(funding.project_id ?? '')?.project_name ?? null,
        budget_category: funding.funding_type,
        created_at: funding.created_at,
        budget_allocation_id: reservation?.allocation_id ?? null,
        budget_reservation_id: null,
        committed_amount: reservation ? Number(reservation.amount) : 0,
        remaining_commitment: reservation ? Number(reservation.remaining_amount) : 0,
        has_active_commitment: Boolean(reservation),
        legacy_funding: true,
      };
    })];
    const approvedPurchaseOrders = purchaseOrders.map((order) => ({
      id: order.id,
      order_number: order.document_id ? orderNumberByDocumentId.get(order.document_id) ?? order.document_id : order.id,
      document_id: order.document_id,
      status: order.status,
      order_date: order.order_date,
      total_amount: Number(order.total_amount ?? 0),
      supplier_party_id: order.supplier_party_id,
    }));

    const activeCostCentersMap = new Map<string, any>();
    for (const row of costCenters.filter((r) => isActiveMasterStatus(r.status))) {
      activeCostCentersMap.set(row.id, {
        ...row,
        code: row.cost_center_code,
        name: row.cost_center_name,
        is_cost_center: true,
      });
    }
    for (const d of coreDepartments) {
      if (d.is_cost_center !== false && !activeCostCentersMap.has(d.id)) {
        activeCostCentersMap.set(d.id, {
          id: d.id,
          company_id: d.company_id,
          parent_id: d.parent_id ?? null,
          code: d.code,
          name: d.name,
          cost_center_code: d.code,
          cost_center_name: d.name,
          unit_type: d.unit_type ?? 'DEPARTMENT',
          is_cost_center: true,
          status: 'ACTIVE',
        });
      }
    }

    const activeDepartmentsMap = new Map<string, any>();
    for (const row of departments.filter((r) => isActiveMasterStatus(r.status))) {
      activeDepartmentsMap.set(row.id, {
        ...row,
        code: row.department_code,
        name: row.department_name,
      });
    }
    for (const d of coreDepartments) {
      if (!activeDepartmentsMap.has(d.id)) {
        activeDepartmentsMap.set(d.id, {
          id: d.id,
          company_id: d.company_id,
          parent_id: d.parent_id ?? null,
          code: d.code,
          name: d.name,
          department_code: d.code,
          department_name: d.name,
          unit_type: d.unit_type ?? 'DEPARTMENT',
          is_cost_center: d.is_cost_center !== false,
          status: 'ACTIVE',
        });
      }
    }

    return {
      fiscal_years: fiscalYears,
      fiscal_periods: fiscalPeriods,
      accounts,
      cost_centers: Array.from(activeCostCentersMap.values()),
      projects,
      departments: Array.from(activeDepartmentsMap.values()),
      fund_requests: fundRequests,
      purchase_orders: approvedPurchaseOrders,
    };
  }

  static async listPlans(companyId: string) {
    const plans = await prisma.fin_budget.findMany({
      where: { company_id: companyId },
      include: { allocations: { include: { period_allocations: true, ledger_entries: { select: { fiscal_period_id: true, allocated_delta: true, committed_delta: true, actual_delta: true, entry_type: true } } } } },
      orderBy: [{ created_at: 'desc' }, { budget_name: 'asc' }],
    });
    const planIds = plans.map((plan) => plan.id);
    const [completedReservations, reservationHistory, revisionHistory, transferHistory] = planIds.length ? await Promise.all([
      prisma.fin_budget_reservation.findMany({ where: { company_id: companyId, budget_id: { in: planIds }, status: 'RECOGNIZED' }, select: { budget_id: true }, distinct: ['budget_id'] }),
      prisma.fin_budget_reservation.findMany({ where: { company_id: companyId, budget_id: { in: planIds } }, select: { budget_id: true, source_type: true, source_id: true, status: true } }),
      prisma.fin_budget_revision.findMany({ where: { company_id: companyId, budget_id: { in: planIds } }, select: { budget_id: true }, distinct: ['budget_id'] }),
      prisma.fin_budget_transfer.findMany({ where: { company_id: companyId, budget_id: { in: planIds } }, select: { budget_id: true }, distinct: ['budget_id'] }),
    ]) : [[], [], [], []];
    const requestIds = [...new Set(reservationHistory.filter((row) => row.source_type === 'REQUEST').map((row) => row.source_id))];
    const requestTickets = requestIds.length ? await prisma.request_ticket.findMany({ where: { company_id: companyId, id: { in: requestIds } }, select: { id: true, workflow_instance_id: true } }) : [];
    const workflowIds = requestTickets.map((ticket) => ticket.workflow_instance_id);
    const disbursedWorkflows = workflowIds.length ? await prisma.core_workflow_instance.findMany({
      where: { company_id: companyId, id: { in: workflowIds }, current_state: { in: ['DISBURSED', 'PENDING_LPJ_VERIFICATION', 'COMPLETED', 'CLOSED'] } },
      select: { id: true },
    }) : [];
    const disbursedWorkflowIds = new Set(disbursedWorkflows.map((workflow) => workflow.id));
    const disbursedPlanIds = new Set(reservationHistory.filter((row) => row.source_type === 'REQUEST' && requestTickets.some((ticket) => ticket.id === row.source_id && disbursedWorkflowIds.has(ticket.workflow_instance_id))).map((row) => row.budget_id));
    const completedPlanIds = new Set([...completedReservations.map((row) => row.budget_id), ...disbursedPlanIds]);
    const planIdsWithHistory = new Set([...reservationHistory, ...revisionHistory, ...transferHistory].map((row: any) => row.budget_id));
    const plansWithOpenReservations = new Set(reservationHistory.filter((row) => ['OPEN', 'PARTIALLY_RELEASED'].includes(row.status)).map((row) => row.budget_id));
    return plans.map((plan) => {
      const canEdit = plan.status !== 'CLOSED' && !completedPlanIds.has(plan.id);
      const hasLedger = plan.allocations.some((allocation) => allocation.ledger_entries.length > 0);
      const hasCommitmentOrActual = plan.allocations.some((allocation) => {
        const committed = allocation.ledger_entries.reduce((sum, entry) => sum + Number(entry.committed_delta), 0);
        const actual = allocation.ledger_entries.reduce((sum, entry) => sum + Number(entry.actual_delta), 0);
        return committed > MONEY_EPSILON || actual > MONEY_EPSILON;
      });
      const canChangePeriodMode = plan.status !== 'ACTIVE' || (!completedPlanIds.has(plan.id) && !plansWithOpenReservations.has(plan.id) && !hasCommitmentOrActual);
      return {
        ...plan,
        can_edit: canEdit,
        edit_lock_reason: plan.status === 'CLOSED' ? 'Budget Plan sudah ditutup.' : completedPlanIds.has(plan.id) ? 'Pencairan atau pengakuan actual sudah selesai.' : null,
        can_change_period_mode: canChangePeriodMode,
        can_delete: plan.status === 'DRAFT' && !hasLedger && !planIdsWithHistory.has(plan.id),
        allocations: plan.allocations.map((allocation) => {
          const totalDelta = allocation.ledger_entries.reduce((sum, entry) => sum + Number(entry.allocated_delta), 0);
          return {
            ...allocation,
            budget_amount: Number(allocation.budget_amount ?? 0) + totalDelta,
            period_allocations: allocation.period_allocations.map((period) => ({
              ...period,
              amount: Number(period.amount) + allocation.ledger_entries.filter((entry) => entry.fiscal_period_id === period.fiscal_period_id).reduce((sum, entry) => sum + Number(entry.allocated_delta), 0),
            })),
            ledger_entries: undefined,
          };
        }),
      };
    });
  }

  static async getWorkflowQueue(companyId: string) {
    const [plans, revisions, transfers, reservations] = await Promise.all([
      prisma.fin_budget.findMany({ where: { company_id: companyId, status: 'PENDING_APPROVAL' }, orderBy: { submitted_at: 'asc' } }),
      prisma.fin_budget_revision.findMany({ where: { company_id: companyId, status: 'PENDING_APPROVAL' }, orderBy: { created_at: 'asc' } }),
      prisma.fin_budget_transfer.findMany({ where: { company_id: companyId, status: 'PENDING_APPROVAL' }, orderBy: { created_at: 'asc' } }),
      prisma.fin_budget_reservation.findMany({ where: { company_id: companyId, status: 'PENDING_APPROVAL' }, orderBy: { created_at: 'asc' } }),
    ]);
    return { plans, revisions, transfers, reservations };
  }

  static async getLedger(companyId: string, allocationId?: string) {
    return prisma.fin_budget_ledger.findMany({
      where: { company_id: companyId, ...(allocationId ? { allocation_id: allocationId } : {}) },
      orderBy: [{ posted_at: 'desc' }, { id: 'desc' }], take: 500,
    });
  }

  static async getReservations(companyId: string) {
    return prisma.fin_budget_reservation.findMany({
      where: { company_id: companyId, status: { in: ['PENDING_APPROVAL', 'OPEN', 'PARTIALLY_RELEASED'] } },
      orderBy: [{ status: 'asc' }, { created_at: 'desc' }], take: 500,
    });
  }

  static async getAllocations(companyId: string) {
    return prisma.fin_budget_line.findMany({ where: { company_id: companyId }, include: { budget: true, period_allocations: true }, orderBy: [{ created_at: 'desc' }, { id: 'asc' }], take: 500 });
  }

  static async getDashboard(companyId: string, fiscalYearId?: string) {
    const plans = await prisma.fin_budget.findMany({
      where: { company_id: companyId, status: 'ACTIVE', ...(fiscalYearId ? { fiscal_year_id: fiscalYearId } : {}) },
      include: {
        allocations: {
          include: {
            period_allocations: { orderBy: { fiscal_period_id: 'asc' } },
            ledger_entries: { select: { allocated_delta: true, committed_delta: true, actual_delta: true, fiscal_period_id: true } },
          },
        },
      },
      orderBy: { budget_name: 'asc' },
    });
    const periodIds = [...new Set(plans.flatMap((plan) => plan.allocations.flatMap((allocation) => allocation.period_allocations.map((period) => period.fiscal_period_id))))];
    const fiscalPeriods = periodIds.length ? await prisma.fin_fiscal_period.findMany({ where: { id: { in: periodIds }, company_id: companyId }, select: { id: true, period_number: true } }) : [];
    const periodOrder = new Map(fiscalPeriods.map((period) => [period.id, Number(period.period_number ?? 0)]));
    const allocations = plans.flatMap((plan) => plan.allocations.map((allocation) => {
      const allocated = Number(allocation.budget_amount ?? 0) + allocation.ledger_entries.reduce((total, row) => total + Number(row.allocated_delta), 0);
      const committed = allocation.ledger_entries.reduce((total, row) => total + Number(row.committed_delta), 0);
      const actual = allocation.ledger_entries.reduce((total, row) => total + Number(row.actual_delta), 0);
      const overBudget = committed + actual > allocated + MONEY_EPSILON;
      let carryBalance = 0;
      const periodRows = [...allocation.period_allocations].sort((a, b) => (periodOrder.get(a.fiscal_period_id) ?? 0) - (periodOrder.get(b.fiscal_period_id) ?? 0)).map((period) => {
        const rows = allocation.ledger_entries.filter((row) => row.fiscal_period_id === period.fiscal_period_id);
        const periodAllocated = Number(period.amount) + rows.reduce((total, row) => total + Number(row.allocated_delta), 0);
        const periodCommitted = rows.reduce((total, row) => total + Number(row.committed_delta), 0);
        const periodActual = rows.reduce((total, row) => total + Number(row.actual_delta), 0);
        const currentAvailable = periodAllocated - periodCommitted - periodActual;
        const availableWithCarry = currentAvailable + (plan.carry_forward ? carryBalance : 0);
        carryBalance = plan.carry_forward ? availableWithCarry : 0;
        return { fiscal_period_id: period.fiscal_period_id, period_number: periodOrder.get(period.fiscal_period_id) ?? null, allocated: periodAllocated, committed: periodCommitted, actual: periodActual, carry_forward: plan.carry_forward ? availableWithCarry - currentAvailable : 0, available: availableWithCarry };
      });
      return {
        id: allocation.id,
        budget_id: plan.id,
        budget_name: plan.budget_name,
        budget_type: plan.budget_type,
        control_policy: plan.control_policy,
        allocation_name: allocation.allocation_name,
        account_id: allocation.account_id,
        cost_center_id: allocation.cost_center_id,
        project_id: allocation.project_id,
        department_id: allocation.department_id,
        allocated,
        committed,
        actual,
        available: allocated - committed - actual,
        utilization_percent: allocated > 0 ? Math.round((actual / allocated) * 10000) / 100 : 0,
        over_budget: overBudget,
        periods: periodRows,
      };
    }));
    const totals = allocations.reduce((acc, row) => ({
      allocated: acc.allocated + row.allocated,
      committed: acc.committed + row.committed,
      actual: acc.actual + row.actual,
      available: acc.available + row.available,
    }), { allocated: 0, committed: 0, actual: 0, available: 0 });
    return { fiscal_year_id: fiscalYearId ?? null, totals, allocation_count: allocations.length, over_budget_count: allocations.filter((row) => row.over_budget).length, allocations, plans: plans.map(({ allocations: _allocations, ...plan }) => plan) };
  }

  private static async assertDraftPlanCanBeChanged(tx: any, companyId: string, planId: string) {
    const plan = await tx.fin_budget.findFirst({ where: { id: planId, company_id: companyId } });
    if (!plan) throw new NotFoundError('Budget plan');
    if (plan.status !== 'DRAFT') throw new ConflictError('Budget Plan hanya dapat diedit atau dihapus saat masih berstatus DRAFT.');
    const [ledgerCount, reservationCount, revisionCount, transferCount] = await Promise.all([
      tx.fin_budget_ledger.count({ where: { company_id: companyId, budget_id: planId } }),
      tx.fin_budget_reservation.count({ where: { company_id: companyId, budget_id: planId } }),
      tx.fin_budget_revision.count({ where: { company_id: companyId, budget_id: planId } }),
      tx.fin_budget_transfer.count({ where: { company_id: companyId, budget_id: planId } }),
    ]);
    if (ledgerCount || reservationCount || revisionCount || transferCount) {
      throw new ConflictError('Budget Plan sudah memiliki jejak transaksi dan tidak dapat diedit atau dihapus.');
    }
    return plan;
  }

  static async updatePlan(companyId: string, tenantId: string | null, userId: string, planId: string, input: any) {
    await this.assertPlanCanBeEdited(prisma, companyId, planId);
    return this.createPlan(companyId, tenantId, userId, input, planId);
  }

  private static async assertPlanCanBeEdited(tx: any, companyId: string, planId: string) {
    const plan = await tx.fin_budget.findFirst({
      where: { id: planId, company_id: companyId },
      include: { allocations: { include: { period_allocations: true, ledger_entries: true } } },
    });
    if (!plan) throw new NotFoundError('Budget plan');
    if (plan.status === 'CLOSED') throw new ConflictError('Budget Plan yang sudah ditutup tidak dapat diedit.');
    if (!['DRAFT', 'PENDING_APPROVAL', 'REJECTED', 'ACTIVE'].includes(plan.status)) throw new ConflictError('Status Budget Plan tidak mengizinkan perubahan.');
    const [completedReservation, disbursedRequest] = await Promise.all([
      tx.fin_budget_reservation.findFirst({ where: { company_id: companyId, budget_id: planId, status: 'RECOGNIZED' }, select: { id: true } }),
      this.hasDisbursedRequest(tx, companyId, planId),
    ]);
    if (completedReservation || disbursedRequest) throw new ConflictError('Pencairan sudah selesai; Budget Plan tidak dapat diedit.');
    return plan;
  }

  private static async hasDisbursedRequest(tx: any, companyId: string, planId: string) {
    const reservations = await tx.fin_budget_reservation.findMany({
      where: { company_id: companyId, budget_id: planId, source_type: 'REQUEST' }, select: { source_id: true },
    });
    if (!reservations.length) return false;
    const sourceIds = reservations.map((row: any) => row.source_id);
    const legacyDisbursed = await tx.fin_project_funding.findFirst({ where: { company_id: companyId, id: { in: sourceIds }, status: 'DISBURSED' }, select: { id: true } });
    if (legacyDisbursed) return true;
    const tickets = await tx.request_ticket.findMany({
      where: { company_id: companyId, id: { in: sourceIds } }, select: { workflow_instance_id: true },
    });
    if (!tickets.length) return false;
    const workflow = await tx.core_workflow_instance.findFirst({
      where: { company_id: companyId, id: { in: tickets.map((ticket: any) => ticket.workflow_instance_id) }, current_state: { in: ['DISBURSED', 'PENDING_LPJ_VERIFICATION', 'COMPLETED', 'CLOSED'] } },
      select: { id: true },
    });
    return Boolean(workflow);
  }

  private static async updateActivePlan(tx: any, companyId: string, plan: any, input: any, normalized: any[], userId: string, total: number) {
    const targetPeriodMode = String(input.period_mode ?? 'ANNUAL').toUpperCase();
    const switchingAnnualToPeriod = plan.period_mode === 'ANNUAL' && targetPeriodMode !== 'ANNUAL';
    const switchingPeriodToAnnual = plan.period_mode !== 'ANNUAL' && targetPeriodMode === 'ANNUAL';
    if (String(input.fiscal_year_id) !== String(plan.fiscal_year_id)) throw new ConflictError('Tahun fiskal tidak dapat diubah setelah Budget Plan aktif.');
    if (switchingAnnualToPeriod) {
      const activeReservation = await tx.fin_budget_reservation.findFirst({ where: { company_id: companyId, budget_id: plan.id, status: { in: ['OPEN', 'PARTIALLY_RELEASED'] } }, select: { id: true } });
      const hasCommittedAmounts = plan.allocations.some((allocation: any) => {
        const committed = allocation.ledger_entries.reduce((sum: number, entry: any) => sum + Number(entry.committed_delta), 0);
        const actual = allocation.ledger_entries.reduce((sum: number, entry: any) => sum + Number(entry.actual_delta), 0);
        return committed > MONEY_EPSILON || actual > MONEY_EPSILON;
      });
      if (activeReservation || hasCommittedAmounts) throw new ConflictError('Pembagian periode belum dapat diubah selama masih ada komitmen atau actual yang terbuka. Selesaikan transaksi anggaran terlebih dahulu.');
      const pendingReservations = await tx.fin_budget_reservation.findMany({ where: { company_id: companyId, budget_id: plan.id, status: 'PENDING_APPROVAL', fiscal_period_id: null } });
      if (pendingReservations.length) {
        const periodIds = [...new Set(normalized.flatMap((allocation) => allocation.periods.map((period: any) => period.fiscal_period_id)))];
        const targetPeriods = await tx.fin_fiscal_period.findMany({ where: { company_id: companyId, fiscal_year_id: plan.fiscal_year_id, id: { in: periodIds } }, select: { id: true, start_date: true, end_date: true } });
        for (const reservation of pendingReservations) {
          const reservationPeriod = targetPeriods.find((period) => period.start_date && period.end_date && reservation.created_at >= period.start_date && reservation.created_at <= period.end_date);
          if (!reservationPeriod) throw new ConflictError('Periode untuk komitmen yang menunggu persetujuan tidak dapat ditentukan.');
          await tx.fin_budget_reservation.update({ where: { id: reservation.id }, data: { fiscal_period_id: reservationPeriod.id } });
        }
      }
    }
    if (new Set(normalized.map((row) => row.id)).size !== normalized.length || normalized.length !== plan.allocations.length || normalized.some((row) => !plan.allocations.some((current: any) => current.id === row.id))) {
      throw new ConflictError('Alokasi yang sudah aktif tidak dapat ditambah atau dihapus; ubah pagu pada alokasi yang ada.');
    }
    const now = new Date();
    const updatedPlan = await tx.fin_budget.update({ where: { id: plan.id }, data: {
      budget_name: requiredText(input.budget_name, 'Nama anggaran'),
      budget_type: requiredText(input.budget_type ?? plan.budget_type, 'Jenis anggaran', 60).toUpperCase(),
      control_policy: String(input.control_policy ?? plan.control_policy).toUpperCase(),
      carry_forward: Boolean(input.carry_forward), period_mode: targetPeriodMode,
    } });
    for (const row of normalized) {
      const current = plan.allocations.find((allocation: any) => allocation.id === row.id);
      if (row.account_id !== current.account_id || row.cost_center_id !== current.cost_center_id || row.project_id !== current.project_id || row.department_id !== current.department_id) {
        throw new ConflictError('Akun, cost center, proyek, dan departemen tidak dapat diubah setelah alokasi memiliki riwayat transaksi.');
      }
      const currentPeriods = current.period_allocations.map((period: any) => period.fiscal_period_id).sort();
      const nextPeriods = row.periods.map((period: any) => period.fiscal_period_id).sort();
      if (!switchingAnnualToPeriod && !switchingPeriodToAnnual && currentPeriods.join('|') !== nextPeriods.join('|')) throw new ConflictError('Periode alokasi yang aktif tidak dapat ditambah atau dihapus.');
      const ledgerAllocated = current.ledger_entries.reduce((sum: number, entry: any) => sum + Number(entry.allocated_delta), 0);
      const effectiveTotal = Number(current.budget_amount ?? 0) + ledgerAllocated;
      const committedTotal = current.ledger_entries.reduce((sum: number, entry: any) => sum + Number(entry.committed_delta), 0);
      const actualTotal = current.ledger_entries.reduce((sum: number, entry: any) => sum + Number(entry.actual_delta), 0);
      if (row.budget_amount + MONEY_EPSILON < committedTotal + actualTotal) throw new ConflictError(`Pagu alokasi ${current.allocation_name || ''} tidak boleh di bawah komitmen dan actual yang sudah tercatat.`);
      await tx.fin_budget_line.update({ where: { id: current.id }, data: { allocation_name: row.allocation_name, description: row.description, ...(switchingAnnualToPeriod ? { budget_amount: 0 } : {}) } });
      if (switchingAnnualToPeriod) {
        const baseOffset = -effectiveTotal;
        if (Math.abs(baseOffset) > MONEY_EPSILON) await tx.fin_budget_ledger.create({ data: {
          id: crypto.randomUUID(), tenant_id: plan.tenant_id, company_id: companyId, budget_id: plan.id, allocation_id: current.id,
          source_type: 'BUDGET_PLAN', source_id: plan.id, source_line_id: current.id, entry_type: 'PLAN_EDIT',
          allocated_delta: baseOffset, committed_delta: 0, actual_delta: 0,
          description: 'Konversi pagu tahunan ke alokasi periode.',
          idempotency_key: `BUDGET_PLAN_EDIT:${plan.id}:${current.id}:ANNUAL_TO_PERIOD:${crypto.randomUUID()}`, posted_by_id: userId, posted_at: now,
        } });
        await tx.fin_budget_period_allocation.createMany({ data: row.periods.map((period: any) => ({
          id: crypto.randomUUID(), tenant_id: plan.tenant_id, company_id: companyId, budget_id: plan.id, allocation_id: current.id,
          fiscal_period_id: period.fiscal_period_id, amount: 0, created_by_id: userId,
        })) });
        for (const period of row.periods) if (period.amount > MONEY_EPSILON) await tx.fin_budget_ledger.create({ data: {
          id: crypto.randomUUID(), tenant_id: plan.tenant_id, company_id: companyId, budget_id: plan.id, allocation_id: current.id,
          fiscal_period_id: period.fiscal_period_id, source_type: 'BUDGET_PLAN', source_id: plan.id, source_line_id: current.id, entry_type: 'PLAN_EDIT',
          allocated_delta: period.amount, committed_delta: 0, actual_delta: 0,
          description: 'Alokasi periode dari perubahan Budget Plan.',
          idempotency_key: `BUDGET_PLAN_EDIT:${plan.id}:${current.id}:${period.fiscal_period_id}:${crypto.randomUUID()}`, posted_by_id: userId, posted_at: now,
        } });
      } else if (switchingPeriodToAnnual) {
        await tx.fin_budget_period_allocation.deleteMany({ where: { company_id: companyId, allocation_id: current.id } });
        const delta = Math.round((row.budget_amount - effectiveTotal) * 100) / 100;
        if (Math.abs(delta) > MONEY_EPSILON) await tx.fin_budget_ledger.create({ data: {
          id: crypto.randomUUID(), tenant_id: plan.tenant_id, company_id: companyId, budget_id: plan.id, allocation_id: current.id,
          source_type: 'BUDGET_PLAN', source_id: plan.id, source_line_id: current.id, entry_type: 'PLAN_EDIT',
          allocated_delta: delta, committed_delta: 0, actual_delta: 0,
          description: `Penyesuaian pagu tahunan: ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`,
          idempotency_key: `BUDGET_PLAN_EDIT:${plan.id}:${current.id}:PERIOD_TO_ANNUAL:${crypto.randomUUID()}`, posted_by_id: userId, posted_at: now,
        } });
      } else if (currentPeriods.length === 0) {
        const delta = Math.round((row.budget_amount - effectiveTotal) * 100) / 100;
        if (Math.abs(delta) > MONEY_EPSILON) await tx.fin_budget_ledger.create({ data: {
          id: crypto.randomUUID(), tenant_id: plan.tenant_id, company_id: companyId, budget_id: plan.id, allocation_id: current.id,
          source_type: 'BUDGET_PLAN', source_id: plan.id, source_line_id: current.id, entry_type: 'PLAN_EDIT',
          allocated_delta: delta, committed_delta: 0, actual_delta: 0,
          description: `Penyesuaian pagu Budget Plan: ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`,
          idempotency_key: `BUDGET_PLAN_EDIT:${plan.id}:${current.id}:${crypto.randomUUID()}`, posted_by_id: userId, posted_at: now,
        } });
      } else {
        for (const period of row.periods) {
          const currentPeriod = current.period_allocations.find((item: any) => item.fiscal_period_id === period.fiscal_period_id);
          const effectiveAmount = Number(currentPeriod.amount) + current.ledger_entries.filter((entry: any) => entry.fiscal_period_id === period.fiscal_period_id).reduce((sum: number, entry: any) => sum + Number(entry.allocated_delta), 0);
          const periodCommitted = current.ledger_entries.filter((entry: any) => entry.fiscal_period_id === period.fiscal_period_id).reduce((sum: number, entry: any) => sum + Number(entry.committed_delta), 0);
          const periodActual = current.ledger_entries.filter((entry: any) => entry.fiscal_period_id === period.fiscal_period_id).reduce((sum: number, entry: any) => sum + Number(entry.actual_delta), 0);
          if (period.amount + MONEY_EPSILON < periodCommitted + periodActual) throw new ConflictError('Pagu periode tidak boleh di bawah komitmen dan actual yang sudah tercatat.');
          const delta = Math.round((period.amount - effectiveAmount) * 100) / 100;
          if (Math.abs(delta) > MONEY_EPSILON) await tx.fin_budget_ledger.create({ data: {
            id: crypto.randomUUID(), tenant_id: plan.tenant_id, company_id: companyId, budget_id: plan.id, allocation_id: current.id,
            fiscal_period_id: period.fiscal_period_id, source_type: 'BUDGET_PLAN', source_id: plan.id, source_line_id: current.id, entry_type: 'PLAN_EDIT',
            allocated_delta: delta, committed_delta: 0, actual_delta: 0,
            description: `Penyesuaian pagu periode Budget Plan: ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`,
            idempotency_key: `BUDGET_PLAN_EDIT:${plan.id}:${current.id}:${period.fiscal_period_id}:${crypto.randomUUID()}`, posted_by_id: userId, posted_at: now,
          } });
        }
      }
    }
    return { ...updatedPlan, total_allocated: total, allocation_count: normalized.length };
  }

  static async deleteDraftPlan(companyId: string, planId: string) {
    return prisma.$transaction(async (tx) => {
      const plan = await this.assertDraftPlanCanBeChanged(tx, companyId, planId);
      await tx.fin_budget_line.deleteMany({ where: { company_id: companyId, budget_id: planId } });
      await tx.fin_budget.delete({ where: { id: planId } });
      return { id: planId, status: 'DELETED' };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async createPlan(companyId: string, tenantId: string | null, userId: string, input: any, existingPlanId?: string) {
    if (existingPlanId) await this.assertPlanCanBeEdited(prisma, companyId, existingPlanId);
    const name = requiredText(input.budget_name, 'Nama anggaran');
    const fiscalYearId = requiredText(input.fiscal_year_id, 'Tahun fiskal');
    const budgetType = requiredText(input.budget_type ?? 'OPERATING', 'Jenis anggaran', 60).toUpperCase();
    const policy = String(input.control_policy ?? 'HARD_STOP').toUpperCase();
    const periodMode = String(input.period_mode ?? 'ANNUAL').toUpperCase();
    if (!CONTROL_POLICIES.has(policy)) throw new ValidationError('Kebijakan kontrol anggaran tidak valid.');
    if (!PERIOD_MODES.has(periodMode)) throw new ValidationError('Mode periode anggaran tidak valid.');
    if (!Array.isArray(input.allocations) || input.allocations.length === 0) throw new ValidationError('Tambahkan minimal satu alokasi anggaran.');

    const fiscalYear = await prisma.fin_fiscal_year.findFirst({ where: { id: fiscalYearId, company_id: companyId } });
    if (!fiscalYear) throw new NotFoundError('Tahun fiskal');
    await ensureCompanyDepartmentsAndCostCenters(companyId, tenantId);
    const normalized = [] as Array<{ id: string; allocation_name: string; description: string | null; account_id: string; cost_center_id: string; project_id: string | null; department_id: string | null; budget_amount: number; periods: Array<{ fiscal_period_id: string; amount: number }> }>;
    for (const row of input.allocations) {
      const accountId = requiredText(row.account_id, 'Akun beban');
      const costCenterId = requiredText(row.cost_center_id, 'Cost center');
      const projectId = row.project_id ? requiredText(row.project_id, 'Proyek') : null;
      const departmentId = row.department_id ? requiredText(row.department_id, 'Departemen') : null;
      const overlapping = normalized.some((existing) => existing.account_id === accountId && existing.cost_center_id === costCenterId &&
        (!existing.project_id || !projectId || existing.project_id === projectId) &&
        (!existing.department_id || !departmentId || existing.department_id === departmentId));
      if (overlapping) throw new ValidationError('Dimensi alokasi Budget Plan tidak boleh bertumpang tindih; pilih proyek/departemen yang spesifik atau alokasi yang mencakup semua.');
      const amount = money(row.amount ?? row.budget_amount, 'Pagu alokasi');
      const [account, center, coreCenter, project, department, coreDept] = await Promise.all([
        prisma.fin_account.findFirst({ where: { id: accountId, company_id: companyId, status: 'ACTIVE', account_type: 'EXPENSE' }, select: { id: true, account_code: true, account_name: true } }),
        prisma.master_cost_center.findFirst({ where: { id: costCenterId, company_id: companyId }, select: { id: true, cost_center_code: true, cost_center_name: true, status: true } }),
        (prisma as any).core_department.findFirst({ where: { id: costCenterId, company_id: companyId, is_active: true }, select: { id: true, code: true, name: true, is_cost_center: true } }).catch(() => null),
        projectId ? prisma.project_project.findFirst({ where: { id: projectId, company_id: companyId }, select: { id: true } }) : null,
        departmentId ? prisma.master_department.findFirst({ where: { id: departmentId, company_id: companyId }, select: { id: true, status: true } }) : null,
        departmentId ? (prisma as any).core_department.findFirst({ where: { id: departmentId, company_id: companyId, is_active: true }, select: { id: true } }).catch(() => null) : null,
      ]);
      const resolvedCenter = center && isActiveMasterStatus(center.status)
        ? center
        : coreCenter && coreCenter.is_cost_center !== false
          ? { id: coreCenter.id, cost_center_code: coreCenter.code, cost_center_name: coreCenter.name, status: 'ACTIVE' }
          : null;
      const resolvedDepartmentValid = !departmentId || Boolean((department && isActiveMasterStatus(department.status)) || coreDept);
      if (!account) throw new ValidationError('Akun alokasi harus akun beban aktif pada perusahaan ini.');
      if (!resolvedCenter) throw new ValidationError('Cost center tidak ditemukan atau tidak aktif pada perusahaan ini.');
      if (projectId && !project) throw new ValidationError('Proyek alokasi tidak ditemukan pada perusahaan ini.');
      if (!resolvedDepartmentValid) throw new ValidationError('Departemen tidak ditemukan atau tidak aktif pada perusahaan ini.');
      const periods = Array.isArray(row.periods) ? row.periods.map((period: any) => ({ fiscal_period_id: requiredText(period.fiscal_period_id, 'Periode fiskal'), amount: money(period.amount, 'Pagu periode', true) })) : [];
      if (periodMode !== 'ANNUAL' && periods.length === 0) throw new ValidationError('Mode bulanan/kuartalan memerlukan pembagian pagu periode untuk setiap alokasi.');
      if (periods.length > 0) {
        const fiscalPeriods = await prisma.fin_fiscal_period.findMany({ where: { id: { in: periods.map((period: any) => period.fiscal_period_id) }, company_id: companyId, fiscal_year_id: fiscalYearId }, select: { id: true, period_number: true } });
        if (fiscalPeriods.length !== periods.length) throw new ValidationError('Setiap periode harus termasuk dalam tahun fiskal anggaran.');
        if (periods.some((period: any) => !Number(fiscalPeriods.find((fp) => fp.id === period.fiscal_period_id)?.period_number))) throw new ValidationError('Nomor periode fiskal harus valid.');
        const periodTotal = periods.reduce((total: number, period: any) => total + period.amount, 0);
        if (Math.abs(periodTotal - amount) > MONEY_EPSILON) throw new ValidationError('Jumlah pembagian periode harus sama dengan pagu alokasi.');
        if (periods.length !== new Set(periods.map((period: any) => period.fiscal_period_id)).size) throw new ValidationError('Periode fiskal tidak boleh diduplikasi.');
      }
      normalized.push({ id: existingPlanId && row.id ? requiredText(row.id, 'Alokasi') : crypto.randomUUID(), allocation_name: String(row.allocation_name ?? '').trim() || `${account!.account_code} ${account!.account_name} · ${resolvedCenter.cost_center_code} ${resolvedCenter.cost_center_name}`, description: row.description ? String(row.description).trim().slice(0, 1000) : null, account_id: accountId, cost_center_id: costCenterId, project_id: projectId, department_id: departmentId, budget_amount: amount, periods });
    }
    const total = normalized.reduce((sum, row) => sum + row.budget_amount, 0);
    return prisma.$transaction(async (tx) => {
      const editablePlan = existingPlanId ? await this.assertPlanCanBeEdited(tx, companyId, existingPlanId) : null;
      if (editablePlan?.status === 'ACTIVE') return this.updateActivePlan(tx, companyId, editablePlan, input, normalized, userId, total);
      const savedPlan = existingPlanId
        ? await tx.fin_budget.update({ where: { id: existingPlanId }, data: {
            budget_name: name, budget_type: budgetType, fiscal_year_id: fiscalYearId, currency_id: input.currency_id ?? null,
            control_policy: policy, period_mode: periodMode, carry_forward: Boolean(input.carry_forward), status: 'DRAFT',
            submitted_by: null, submitted_at: null, approval_note: null, rejected_by: null, approved_by: null, approved_at: null,
          } })
        : await tx.fin_budget.create({ data: {
            id: crypto.randomUUID(), tenant_id: tenantId, company_id: companyId, created_by_id: userId,
            budget_name: name, budget_type: budgetType, fiscal_year_id: fiscalYearId, currency_id: input.currency_id ?? null,
            control_policy: policy, period_mode: periodMode, carry_forward: Boolean(input.carry_forward), status: 'DRAFT',
          } });
      if (existingPlanId) await tx.fin_budget_line.deleteMany({ where: { company_id: companyId, budget_id: existingPlanId } });
      for (const allocation of normalized) {
        await tx.fin_budget_line.create({ data: {
          id: allocation.id, tenant_id: tenantId, company_id: companyId, created_by_id: userId, budget_id: savedPlan.id,
          account_id: allocation.account_id, cost_center_id: allocation.cost_center_id, project_id: allocation.project_id,
          department_id: allocation.department_id, budget_amount: allocation.budget_amount,
          allocation_name: allocation.allocation_name, description: allocation.description,
        } });
        if (allocation.periods.length) await tx.fin_budget_period_allocation.createMany({ data: allocation.periods.map((period) => ({
          id: crypto.randomUUID(), tenant_id: tenantId, company_id: companyId, budget_id: savedPlan.id, allocation_id: allocation.id,
          fiscal_period_id: period.fiscal_period_id, amount: period.amount, created_by_id: userId,
        })) });
      }
      return { ...savedPlan, total_allocated: total, allocation_count: normalized.length };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async submitPlan(companyId: string, planId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const plan = await tx.fin_budget.findFirst({ where: { id: planId, company_id: companyId }, include: { allocations: true } });
      if (!plan) throw new NotFoundError('Budget plan');
      if (plan.status !== 'DRAFT' || !plan.allocations.length) throw new ConflictError('Hanya rencana DRAFT yang memiliki alokasi dapat diajukan.');
      return tx.fin_budget.update({ where: { id: planId }, data: { status: 'PENDING_APPROVAL', submitted_by: userId, submitted_at: new Date() } });
    });
  }

  static async approvePlan(companyId: string, planId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const plan = await tx.fin_budget.findFirst({ where: { id: planId, company_id: companyId }, include: { allocations: true } });
      if (!plan) throw new NotFoundError('Budget plan');
      if (plan.status !== 'PENDING_APPROVAL') throw new ConflictError('Rencana anggaran tidak sedang menunggu persetujuan.');
      if (plan.submitted_by === userId || plan.created_by_id === userId) throw new ForbiddenError('Pembuat/pengaju anggaran tidak boleh menyetujui rencananya sendiri.');
      const activePlans = await tx.fin_budget.findMany({ where: { company_id: companyId, fiscal_year_id: plan.fiscal_year_id, status: 'ACTIVE', id: { not: planId } }, include: { allocations: true } });
      const overlaps = activePlans.some((active) => active.allocations.some((existing: any) => plan.allocations.some((candidate: any) =>
        existing.account_id === candidate.account_id && existing.cost_center_id === candidate.cost_center_id &&
        (!existing.project_id || !candidate.project_id || existing.project_id === candidate.project_id) &&
        (!existing.department_id || !candidate.department_id || existing.department_id === candidate.department_id),
      )));
      if (overlaps) throw new ConflictError('Sudah ada Budget Plan aktif dengan dimensi akun, cost center, proyek, atau departemen yang bertabrakan.');
      const now = new Date();
      for (const allocation of plan.allocations) await tx.fin_budget_ledger.create({ data: {
        id: crypto.randomUUID(), tenant_id: plan.tenant_id, company_id: companyId, budget_id: plan.id, allocation_id: allocation.id,
        source_type: 'BUDGET_PLAN', source_id: plan.id, source_line_id: allocation.id, entry_type: 'BASELINE',
        allocated_delta: 0, committed_delta: 0, actual_delta: 0,
        description: 'Snapshot pagu awal saat anggaran diaktifkan.', idempotency_key: `BUDGET_BASELINE:${allocation.id}`, posted_by_id: userId, posted_at: now,
      } });
      return tx.fin_budget.update({ where: { id: plan.id }, data: { status: 'ACTIVE', approved_by: userId, approved_at: now, activated_at: now } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async rejectPlan(companyId: string, planId: string, userId: string, note: string) {
    const reason = requiredText(note, 'Alasan penolakan', 1000);
    const plan = await prisma.fin_budget.findFirst({ where: { id: planId, company_id: companyId } });
    if (!plan) throw new NotFoundError('Budget plan');
    if (plan.status !== 'PENDING_APPROVAL') throw new ConflictError('Rencana tidak sedang menunggu persetujuan.');
    if (plan.submitted_by === userId || plan.created_by_id === userId) throw new ForbiddenError('Pengaju anggaran tidak boleh menolak pengajuannya sendiri.');
    return prisma.fin_budget.update({ where: { id: plan.id }, data: { status: 'REJECTED', rejected_by: userId, approval_note: reason } });
  }

  static async closePlan(companyId: string, planId: string, userId: string, note: string) {
    const reason = requiredText(note, 'Alasan penutupan', 1000);
    return prisma.$transaction(async (tx) => {
      const plan = await tx.fin_budget.findFirst({ where: { id: planId, company_id: companyId }, include: { allocations: true } });
      if (!plan) throw new NotFoundError('Budget plan');
      if (plan.status !== 'ACTIVE') throw new ConflictError('Hanya anggaran aktif yang dapat ditutup.');
      if (plan.approved_by === userId) throw new ForbiddenError('Penyetuju anggaran tidak boleh menutup anggaran yang sama.');
      const openReservations = await tx.fin_budget_reservation.count({ where: { company_id: companyId, budget_id: planId, status: { in: ['OPEN', 'PARTIALLY_RELEASED', 'PENDING_APPROVAL'] } } });
      if (openReservations) throw new ConflictError('Selesaikan atau tolak semua komitmen terbuka sebelum menutup anggaran.');
      await tx.fin_budget.update({ where: { id: planId }, data: { status: 'CLOSED', close_note: reason, closed_by: userId, closed_at: new Date() } });
      for (const allocation of plan.allocations) await tx.fin_budget_ledger.create({ data: {
        id: crypto.randomUUID(), tenant_id: plan.tenant_id, company_id: companyId, budget_id: planId, allocation_id: allocation.id,
        source_type: 'BUDGET_PLAN', source_id: planId, source_line_id: allocation.id, entry_type: 'CLOSE', allocated_delta: 0, committed_delta: 0, actual_delta: 0,
        description: `Budget Plan ditutup: ${reason}`, idempotency_key: `BUDGET_CLOSE:${planId}:${allocation.id}`, posted_by_id: userId,
      } });
      return { id: planId, status: 'CLOSED', closed_by: userId, reason };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async createReservation(companyId: string, tenantId: string | null, userId: string, input: any) {
    const allocationId = requiredText(input.allocation_id, 'Alokasi anggaran');
    const sourceType = requiredText(input.source_type, 'Jenis sumber', 50).toUpperCase();
    if (!RESERVATION_SOURCE_TYPES.has(sourceType)) throw new ValidationError('Jenis sumber komitmen tidak valid.');
    const sourceId = requiredText(input.source_id, 'ID sumber');
    const amount = money(input.amount, 'Nominal komitmen');
    return prisma.$transaction(async (tx) => {
      if (sourceType === 'REQUEST') {
        const source = await tx.request_ticket.findFirst({ where: { id: sourceId, company_id: companyId }, select: { status: true } });
        const legacyFunding = source ? null : await tx.fin_project_funding.findFirst({ where: { id: sourceId, company_id: companyId }, select: { status: true } });
        const requestStatus = String(source?.status ?? legacyFunding?.status ?? '').toUpperCase();
        if ((!source && !legacyFunding) || ['DRAFT', 'CANCELLED', 'REJECTED', 'DISBURSED', 'CLOSED'].includes(requestStatus)) throw new ValidationError('Request tidak ditemukan, belum terdaftar, atau sudah dibatalkan.');
      } else if (sourceType === 'PURCHASE_ORDER') {
        const source = await tx.proc_purchase_order.findFirst({ where: { id: sourceId, company_id: companyId }, select: { status: true } });
        if (!source) throw new NotFoundError('Purchase Order');
        if (String(source.status).toUpperCase() !== 'APPROVED') throw new ValidationError('Komitmen PO hanya dapat dicatat setelah Purchase Order berstatus APPROVED.');
      } else if (sourceType === 'INVOICE') {
        const source = await tx.fin_billing_document.findFirst({ where: { company_id: companyId, billing_type: 'SUPPLIER_INVOICE', OR: [{ id: sourceId }, { document_id: sourceId }] }, select: { status: true } });
        if (!source || ['DRAFT', 'REJECTED', 'CANCELLED'].includes(String(source.status).toUpperCase())) throw new ValidationError('Invoice pemasok tidak ditemukan atau tidak dapat dikomitmenkan.');
      }
      // Pessimistic row-level lock on budget allocation line to prevent concurrent over-commitment
      await tx.$queryRaw`SELECT id FROM fin_budget_line WHERE id = ${allocationId} AND company_id = ${companyId} FOR UPDATE`;
      const allocation = await tx.fin_budget_line.findFirst({ where: { id: allocationId, company_id: companyId, budget: { status: 'ACTIVE' } }, include: { budget: true, period_allocations: true } });
      if (!allocation || !allocation.budget || !allocation.budget_id) throw new NotFoundError('Alokasi anggaran aktif');
      const periodId = input.fiscal_period_id ? requiredText(input.fiscal_period_id, 'Periode fiskal') : null;
      const hasPeriods = allocation.period_allocations.length > 0;
      if (hasPeriods && !periodId) throw new ValidationError('Pilih periode fiskal untuk alokasi dengan kontrol periode.');
      if (periodId && hasPeriods && !allocation.period_allocations.some((period) => period.fiscal_period_id === periodId)) throw new ValidationError('Alokasi tidak memiliki pagu pada periode yang dipilih.');
      const ledger = await tx.fin_budget_ledger.aggregate({ where: { company_id: companyId, allocation_id: allocationId, ...(hasPeriods && periodId ? { fiscal_period_id: periodId } : {}) }, _sum: { allocated_delta: true, committed_delta: true, actual_delta: true } });
      const baseAllocated = hasPeriods && periodId
        ? Number(allocation.period_allocations.find((period) => period.fiscal_period_id === periodId)?.amount ?? 0)
        : Number(allocation.budget_amount ?? 0);
      const allocated = baseAllocated + Number(ledger._sum.allocated_delta ?? 0);
      const committed = Number(ledger._sum.committed_delta ?? 0);
      const actual = Number(ledger._sum.actual_delta ?? 0);
      let available = allocated - committed - actual;
      if (hasPeriods && periodId && allocation.budget.carry_forward) {
        const fiscalPeriods = await tx.fin_fiscal_period.findMany({ where: { id: { in: allocation.period_allocations.map((period) => period.fiscal_period_id) }, company_id: companyId }, select: { id: true, period_number: true } });
        const currentNumber = Number(fiscalPeriods.find((period) => period.id === periodId)?.period_number ?? 0);
        const previous = allocation.period_allocations.filter((period) => Number(fiscalPeriods.find((item) => item.id === period.fiscal_period_id)?.period_number ?? 0) < currentNumber);
        let carry = 0;
        for (const prior of previous) {
          const priorLedger = await tx.fin_budget_ledger.aggregate({ where: { company_id: companyId, allocation_id: allocationId, fiscal_period_id: prior.fiscal_period_id }, _sum: { allocated_delta: true, committed_delta: true, actual_delta: true } });
          const priorAvailable = Number(prior.amount) + Number(priorLedger._sum.allocated_delta ?? 0) - Number(priorLedger._sum.committed_delta ?? 0) - Number(priorLedger._sum.actual_delta ?? 0);
          carry += priorAvailable;
        }
        available += carry;
      }
      const overBudget = amount > available + MONEY_EPSILON;
      if (overBudget && allocation.budget.control_policy === 'HARD_STOP') throw new ConflictError(`Komitmen melebihi anggaran tersedia. Tersedia ${deltaText(available)}, diminta ${deltaText(amount)}.`);
      const pendingApproval = allocation.budget.control_policy === 'APPROVAL_ESCALATION' && overBudget;
      const duplicateSource = await tx.fin_budget_reservation.findFirst({ where: {
        company_id: companyId, allocation_id: allocationId, source_type: sourceType, source_id: sourceId,
        source_line_id: input.source_line_id ?? null, status: { in: ['PENDING_APPROVAL', 'OPEN', 'PARTIALLY_RELEASED'] },
      }, select: { id: true } });
      if (duplicateSource) throw new ConflictError('Komitmen untuk sumber transaksi dan alokasi ini sudah tercatat.');
      const reservationId = crypto.randomUUID();
      const reservation = await tx.fin_budget_reservation.create({ data: {
        id: reservationId, tenant_id: tenantId, company_id: companyId, budget_id: allocation.budget_id, allocation_id: allocation.id,
        fiscal_period_id: periodId, source_type: sourceType, source_id: sourceId, source_line_id: input.source_line_id ?? null,
        amount, remaining_amount: amount, status: pendingApproval ? 'PENDING_APPROVAL' : 'OPEN', description: input.description ? String(input.description).trim().slice(0, 1000) : null,
        created_by_id: userId,
      } });
      if (!pendingApproval) await tx.fin_budget_ledger.create({ data: {
        id: crypto.randomUUID(), tenant_id: tenantId, company_id: companyId, budget_id: allocation.budget_id, allocation_id: allocation.id,
        fiscal_period_id: periodId, source_type: 'RESERVATION', source_id: reservationId, source_line_id: input.source_line_id ?? null,
        entry_type: 'COMMITMENT', committed_delta: amount, description: reservation.description,
        idempotency_key: `BUDGET_RESERVE:${reservationId}`, posted_by_id: userId,
      } });
      return { reservation, over_budget: overBudget, available_before: available, policy: allocation.budget.control_policy };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async approveReservation(companyId: string, reservationId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const reservation = await tx.fin_budget_reservation.findFirst({ where: { id: reservationId, company_id: companyId } });
      if (!reservation) throw new NotFoundError('Reservasi anggaran');
      if (reservation.status !== 'PENDING_APPROVAL') throw new ConflictError('Reservasi tidak menunggu persetujuan.');
      if (reservation.created_by_id === userId) throw new ForbiddenError('Pembuat reservasi tidak boleh menyetujui reservasinya sendiri.');
      await tx.fin_budget_ledger.create({ data: {
        id: crypto.randomUUID(), tenant_id: reservation.tenant_id, company_id: companyId, budget_id: reservation.budget_id, allocation_id: reservation.allocation_id,
        fiscal_period_id: reservation.fiscal_period_id, source_type: 'RESERVATION', source_id: reservation.id, source_line_id: reservation.source_line_id,
        entry_type: 'COMMITMENT', committed_delta: reservation.remaining_amount, description: reservation.description,
        idempotency_key: `BUDGET_RESERVE:${reservation.id}`, posted_by_id: userId,
      } });
      return tx.fin_budget_reservation.update({ where: { id: reservation.id }, data: { status: 'OPEN' } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async rejectReservation(companyId: string, reservationId: string, userId: string, note: string) {
    const reason = requiredText(note, 'Alasan penolakan', 1000);
    const reservation = await prisma.fin_budget_reservation.findFirst({ where: { id: reservationId, company_id: companyId } });
    if (!reservation) throw new NotFoundError('Reservasi anggaran');
    if (reservation.status !== 'PENDING_APPROVAL') throw new ConflictError('Reservasi tidak sedang menunggu persetujuan.');
    if (reservation.created_by_id === userId) throw new ForbiddenError('Pembuat reservasi tidak boleh menolak reservasinya sendiri.');
    return prisma.fin_budget_reservation.update({ where: { id: reservation.id }, data: { status: 'REJECTED', description: `${reservation.description ?? ''}${reservation.description ? '\n' : ''}Ditolak: ${reason}` } });
  }

  static async releaseReservation(companyId: string, reservationId: string, userId: string, input: any, recognize = false) {
    const amount = money(input.amount, recognize ? 'Nominal realisasi' : 'Nominal pelepasan');
    const reason = requiredText(input.reason ?? (recognize ? 'Pengakuan aktual' : 'Pelepasan komitmen'), 'Alasan', 500);
    return prisma.$transaction(async (tx) => {
      const reservation = await tx.fin_budget_reservation.findFirst({ where: { id: reservationId, company_id: companyId } });
      if (!reservation) throw new NotFoundError('Reservasi anggaran');
      if (reservation.status !== 'OPEN' && reservation.status !== 'PARTIALLY_RELEASED') throw new ConflictError('Reservasi tidak memiliki komitmen terbuka.');
      if (amount > Number(reservation.remaining_amount) + MONEY_EPSILON) throw new ValidationError('Nominal melebihi sisa komitmen pada reservasi.');
      const remaining = Math.round((Number(reservation.remaining_amount) - amount) * 100) / 100;
      const key = `BUDGET_${recognize ? 'RECOGNIZE' : 'RELEASE'}:${reservation.id}:${crypto.randomUUID()}`;
      await tx.fin_budget_ledger.create({ data: {
        id: crypto.randomUUID(), tenant_id: reservation.tenant_id, company_id: companyId, budget_id: reservation.budget_id, allocation_id: reservation.allocation_id,
        fiscal_period_id: reservation.fiscal_period_id, source_type: recognize ? 'ACCRUAL' : 'RESERVATION', source_id: reservation.id,
        source_line_id: reservation.source_line_id, entry_type: recognize ? 'ACTUAL_RECOGNITION' : 'COMMITMENT_RELEASE',
        committed_delta: -amount, actual_delta: recognize ? amount : 0, description: reason, idempotency_key: key, posted_by_id: userId,
      } });
      const updated = await tx.fin_budget_reservation.update({ where: { id: reservation.id }, data: { remaining_amount: remaining, status: remaining <= MONEY_EPSILON ? (recognize ? 'RECOGNIZED' : 'RELEASED') : 'PARTIALLY_RELEASED' } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async requestRevision(companyId: string, userId: string, input: any) {
    const allocationId = requiredText(input.allocation_id, 'Alokasi anggaran');
    const type = String(input.revision_type ?? '').toUpperCase();
    if (!['INCREASE', 'DECREASE'].includes(type)) throw new ValidationError('Jenis revisi harus INCREASE atau DECREASE.');
    const amount = money(input.amount, 'Nominal revisi');
    const reason = requiredText(input.reason, 'Alasan revisi', 1000);
    const allocation = await prisma.fin_budget_line.findFirst({ where: { id: allocationId, company_id: companyId, budget: { status: 'ACTIVE' } }, include: { budget: true, period_allocations: true } });
    if (!allocation || !allocation.budget_id) throw new NotFoundError('Alokasi anggaran aktif');
    const periodId = input.fiscal_period_id ? requiredText(input.fiscal_period_id, 'Periode fiskal') : null;
    if (allocation.period_allocations.length && (!periodId || !allocation.period_allocations.some((period) => period.fiscal_period_id === periodId))) throw new ValidationError('Revisi untuk alokasi periodik harus memilih periode yang sudah dialokasikan.');
    return prisma.fin_budget_revision.create({ data: {
      id: crypto.randomUUID(), tenant_id: allocation.tenant_id, company_id: companyId, budget_id: allocation.budget_id, allocation_id: allocation.id,
      fiscal_period_id: periodId, revision_type: type, amount, reason, status: 'PENDING_APPROVAL', requested_by: userId,
    } });
  }

  static async approveRevision(companyId: string, revisionId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const revision = await tx.fin_budget_revision.findFirst({ where: { id: revisionId, company_id: companyId } });
      if (!revision) throw new NotFoundError('Revisi anggaran');
      if (revision.status !== 'PENDING_APPROVAL') throw new ConflictError('Revisi tidak sedang menunggu persetujuan.');
      if (revision.requested_by === userId) throw new ForbiddenError('Pengaju revisi tidak boleh menyetujui revisinya sendiri.');
      const allocation = await tx.fin_budget_line.findFirst({ where: { id: revision.allocation_id, company_id: companyId }, include: { budget: true, period_allocations: true } });
      if (!allocation || !allocation.budget || !allocation.budget_id || allocation.budget.status !== 'ACTIVE') throw new ConflictError('Alokasi anggaran tidak lagi aktif.');
      const sign = revision.revision_type === 'DECREASE' ? -1 : 1;
      if (revision.revision_type === 'DECREASE') {
        const sums = await tx.fin_budget_ledger.aggregate({ where: { company_id: companyId, allocation_id: allocation.id, ...(revision.fiscal_period_id ? { fiscal_period_id: revision.fiscal_period_id } : {}) }, _sum: { allocated_delta: true, committed_delta: true, actual_delta: true } });
        const baseline = revision.fiscal_period_id
          ? Number(allocation.period_allocations.find((p) => p.fiscal_period_id === revision.fiscal_period_id)?.amount ?? 0)
          : Number(allocation.budget_amount ?? 0);
        const remaining = baseline + Number(sums._sum.allocated_delta ?? 0) + sign * Number(revision.amount) - Number(sums._sum.committed_delta ?? 0) - Number(sums._sum.actual_delta ?? 0);
        if (remaining < -MONEY_EPSILON) throw new ConflictError('Pagu tidak dapat dikurangi di bawah jumlah committed dan actual.');
      }
      await tx.fin_budget_ledger.create({ data: {
        id: crypto.randomUUID(), tenant_id: revision.tenant_id, company_id: companyId, budget_id: revision.budget_id, allocation_id: revision.allocation_id,
        fiscal_period_id: revision.fiscal_period_id, source_type: 'REVISION', source_id: revision.id, entry_type: 'BUDGET_REVISION',
        allocated_delta: sign * Number(revision.amount), description: revision.reason,
        idempotency_key: `BUDGET_REVISION:${revision.id}`, posted_by_id: userId,
      } });
      return tx.fin_budget_revision.update({ where: { id: revision.id }, data: { status: 'APPROVED', approved_by: userId, approved_at: new Date() } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async rejectRevision(companyId: string, revisionId: string, userId: string, note: string) {
    const reason = requiredText(note, 'Alasan penolakan', 1000);
    const revision = await prisma.fin_budget_revision.findFirst({ where: { id: revisionId, company_id: companyId } });
    if (!revision) throw new NotFoundError('Revisi anggaran');
    if (revision.status !== 'PENDING_APPROVAL') throw new ConflictError('Revisi tidak sedang menunggu persetujuan.');
    if (revision.requested_by === userId) throw new ForbiddenError('Pengaju revisi tidak boleh menolak pengajuannya sendiri.');
    return prisma.fin_budget_revision.update({ where: { id: revision.id }, data: { status: 'REJECTED', rejected_by: userId, approval_note: reason } });
  }

  static async requestTransfer(companyId: string, userId: string, input: any) {
    const fromId = requiredText(input.from_allocation_id, 'Alokasi sumber');
    const toId = requiredText(input.to_allocation_id, 'Alokasi tujuan');
    if (fromId === toId) throw new ValidationError('Alokasi sumber dan tujuan harus berbeda.');
    const amount = money(input.amount, 'Nominal transfer');
    const reason = requiredText(input.reason, 'Alasan transfer', 1000);
    const [from, to] = await Promise.all([
      prisma.fin_budget_line.findFirst({ where: { id: fromId, company_id: companyId, budget: { status: 'ACTIVE' } }, include: { budget: true, period_allocations: true } }),
      prisma.fin_budget_line.findFirst({ where: { id: toId, company_id: companyId, budget: { status: 'ACTIVE' } }, include: { budget: true, period_allocations: true } }),
    ]);
    if (!from || !to || !from.budget || !to.budget || !from.budget_id || !to.budget_id) throw new NotFoundError('Alokasi sumber/tujuan aktif');
    if (from.budget_id !== to.budget_id) throw new ValidationError('Transfer hanya dapat dilakukan antaralokasi dalam satu Budget Plan aktif.');
    if (from.period_allocations.length || to.period_allocations.length) throw new ValidationError('Transfer alokasi periodik belum dapat dilakukan lintas periode; gunakan revisi per periode.');
    return prisma.fin_budget_transfer.create({ data: {
      id: crypto.randomUUID(), tenant_id: from.tenant_id, company_id: companyId, budget_id: from.budget_id,
      from_allocation_id: from.id, to_allocation_id: to.id, amount, reason, status: 'PENDING_APPROVAL', requested_by: userId,
    } });
  }

  static async approveTransfer(companyId: string, transferId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const transfer = await tx.fin_budget_transfer.findFirst({ where: { id: transferId, company_id: companyId } });
      if (!transfer) throw new NotFoundError('Transfer anggaran');
      if (transfer.status !== 'PENDING_APPROVAL') throw new ConflictError('Transfer tidak sedang menunggu persetujuan.');
      if (transfer.requested_by === userId) throw new ForbiddenError('Pengaju transfer tidak boleh menyetujui transfernya sendiri.');
      const from = await tx.fin_budget_line.findFirst({ where: { id: transfer.from_allocation_id, company_id: companyId }, include: { budget: true } });
      const to = await tx.fin_budget_line.findFirst({ where: { id: transfer.to_allocation_id, company_id: companyId }, include: { budget: true } });
      if (!from || !to || !from.budget || !to.budget || from.budget.status !== 'ACTIVE' || to.budget.status !== 'ACTIVE') throw new ConflictError('Alokasi transfer tidak aktif.');
      const sums = await tx.fin_budget_ledger.aggregate({ where: { company_id: companyId, allocation_id: from.id }, _sum: { allocated_delta: true, committed_delta: true, actual_delta: true } });
      const available = Number(from.budget_amount ?? 0) + Number(sums._sum.allocated_delta ?? 0) - Number(sums._sum.committed_delta ?? 0) - Number(sums._sum.actual_delta ?? 0);
      if (Number(transfer.amount) > available + MONEY_EPSILON) throw new ConflictError('Transfer melebihi saldo yang belum committed/actual.');
      const now = new Date();
      const base = { tenant_id: transfer.tenant_id, company_id: companyId, budget_id: transfer.budget_id, source_type: 'TRANSFER', source_id: transfer.id, entry_type: 'BUDGET_TRANSFER' };
      await tx.fin_budget_ledger.create({ data: { id: crypto.randomUUID(), ...base, allocation_id: from.id, allocated_delta: -Number(transfer.amount), description: transfer.reason, idempotency_key: `BUDGET_TRANSFER_OUT:${transfer.id}`, posted_by_id: userId, posted_at: now } });
      await tx.fin_budget_ledger.create({ data: { id: crypto.randomUUID(), ...base, allocation_id: to.id, allocated_delta: Number(transfer.amount), description: transfer.reason, idempotency_key: `BUDGET_TRANSFER_IN:${transfer.id}`, posted_by_id: userId, posted_at: now } });
      return tx.fin_budget_transfer.update({ where: { id: transfer.id }, data: { status: 'APPROVED', approved_by: userId, approved_at: now } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async rejectTransfer(companyId: string, transferId: string, userId: string, note: string) {
    const reason = requiredText(note, 'Alasan penolakan', 1000);
    const transfer = await prisma.fin_budget_transfer.findFirst({ where: { id: transferId, company_id: companyId } });
    if (!transfer) throw new NotFoundError('Transfer anggaran');
    if (transfer.status !== 'PENDING_APPROVAL') throw new ConflictError('Transfer tidak sedang menunggu persetujuan.');
    if (transfer.requested_by === userId) throw new ForbiddenError('Pengaju transfer tidak boleh menolak pengajuannya sendiri.');
    return prisma.fin_budget_transfer.update({ where: { id: transfer.id }, data: { status: 'REJECTED', rejected_by: userId, approval_note: reason } });
  }

  static async recordJournalActuals(tx: any, entry: any, lines: any[]) {
    if (!entry.company_id || !entry.fiscal_period_id) return;
    const period = await tx.fin_fiscal_period.findFirst({ where: { id: entry.fiscal_period_id, company_id: entry.company_id }, select: { id: true, fiscal_year_id: true } });
    if (!period?.fiscal_year_id) return;
    const [budgets, accounts] = await Promise.all([
      tx.fin_budget.findMany({ where: { company_id: entry.company_id, fiscal_year_id: period.fiscal_year_id, status: 'ACTIVE' }, include: { allocations: true } }),
      tx.fin_account.findMany({ where: { company_id: entry.company_id, account_type: 'EXPENSE' }, select: { id: true } }),
    ]);
    let linkedPurchaseOrderId: string | null = null;
    if (entry.source_document_id) {
      const invoice = await tx.fin_billing_document.findFirst({ where: { company_id: entry.company_id, OR: [{ id: entry.source_document_id }, { document_id: entry.source_document_id }] }, select: { purchase_order_id: true } });
      linkedPurchaseOrderId = invoice?.purchase_order_id ?? null;
    }
    const expenseAccountIds = new Set(accounts.map((account: any) => account.id));
    for (const line of lines) {
      if (!line.account_id || !expenseAccountIds.has(line.account_id)) continue;
      const actual = Number(line.debit_base ?? 0) - Number(line.credit_base ?? 0);
      if (Math.abs(actual) < MONEY_EPSILON) continue;
      const candidates = budgets.flatMap((budget: any) => budget.allocations.filter((allocation: any) =>
        allocation.account_id === line.account_id && (!allocation.project_id || allocation.project_id === line.project_id) &&
        (!allocation.department_id || allocation.department_id === line.department_id),
      ).map((allocation: any) => ({ budget, allocation })));
      if (!line.cost_center_id) {
        if (candidates.length) throw new ValidationError(`Cost center wajib diisi untuk akun beban ${line.account_id} yang dikendalikan Budgetary.`);
        continue;
      }
      const costCenterCandidates = candidates.filter(({ allocation }: any) => allocation.cost_center_id === line.cost_center_id);
      const exactProject = costCenterCandidates.some(({ allocation }: any) => allocation.project_id === line.project_id);
      const projectCandidates = costCenterCandidates.filter(({ allocation }: any) => exactProject ? allocation.project_id === line.project_id : !allocation.project_id);
      const exactDepartment = projectCandidates.some(({ allocation }: any) => allocation.department_id === line.department_id);
      const matches = projectCandidates.filter(({ allocation }: any) => exactDepartment ? allocation.department_id === line.department_id : !allocation.department_id);
      for (const { budget, allocation } of matches) {
        const periodAllocations = await tx.fin_budget_period_allocation.findMany({ where: { allocation_id: allocation.id }, select: { fiscal_period_id: true, amount: true } });
        const periodControlled = periodAllocations.length > 0;
        if (periodControlled && !periodAllocations.some((row: any) => row.fiscal_period_id === period.id)) throw new ValidationError('Periode jurnal belum memiliki alokasi anggaran untuk dimensi ini.');
        const ledger = await tx.fin_budget_ledger.aggregate({ where: { company_id: entry.company_id, allocation_id: allocation.id, ...(periodControlled ? { fiscal_period_id: period.id } : {}) }, _sum: { allocated_delta: true, committed_delta: true, actual_delta: true } });
        const baseline = periodControlled
          ? Number(periodAllocations.find((row: any) => row.fiscal_period_id === period.id)?.amount ?? 0)
          : Number(allocation.budget_amount ?? 0);
        const allocated = baseline + Number(ledger._sum.allocated_delta ?? 0);
        const available = allocated - Number(ledger._sum.committed_delta ?? 0) - Number(ledger._sum.actual_delta ?? 0);
        let remainingToRecognize = Math.max(0, actual);
        const linkedSourceIds = [entry.source_document_id, linkedPurchaseOrderId].filter(Boolean) as string[];
        const reservations = linkedSourceIds.length > 0 && actual > 0 ? await tx.fin_budget_reservation.findMany({
          where: {
            company_id: entry.company_id, allocation_id: allocation.id, source_id: { in: linkedSourceIds },
            status: { in: ['OPEN', 'PARTIALLY_RELEASED'] }, ...(periodControlled ? { fiscal_period_id: period.id } : {}),
          }, orderBy: { created_at: 'asc' },
        }) : [];
        for (const reservation of reservations) {
          if (remainingToRecognize <= MONEY_EPSILON) break;
          const recognized = Math.min(remainingToRecognize, Number(reservation.remaining_amount));
          const stillOpen = Math.round((Number(reservation.remaining_amount) - recognized) * 100) / 100;
          await tx.fin_budget_reservation.update({ where: { id: reservation.id }, data: { remaining_amount: stillOpen, status: stillOpen <= MONEY_EPSILON ? 'RECOGNIZED' : 'PARTIALLY_RELEASED' } });
          remainingToRecognize -= recognized;
        }
        const releasedCommitment = Math.max(0, actual) - remainingToRecognize;
        if (actual - releasedCommitment > available + MONEY_EPSILON && budget.control_policy !== 'SOFT_WARNING') {
          throw new ConflictError(`Posting beban akan melampaui pagu ${allocation.allocation_name ?? allocation.id}. Tersedia ${deltaText(available)}, realisasi bersih ${deltaText(actual - releasedCommitment)}.`);
        }
        await tx.fin_budget_ledger.create({ data: {
          id: crypto.randomUUID(), tenant_id: entry.tenant_id, company_id: entry.company_id, budget_id: budget.id, allocation_id: allocation.id,
          fiscal_period_id: period.id, source_type: 'JOURNAL_ENTRY', source_id: entry.id, source_line_id: line.id, entry_type: releasedCommitment ? 'ACTUAL_RECOGNITION' : 'ACTUAL',
          committed_delta: -releasedCommitment, actual_delta: actual, description: entry.description, idempotency_key: `BUDGET_ACTUAL:${entry.id}:${line.id}:${allocation.id}`,
          posted_by_id: entry.created_by_id, posted_at: entry.posting_date ?? new Date(),
        } });
      }
    }
  }

  static async reverseJournalActuals(tx: any, originalEntryId: string, reversalEntry: any, reversedBy: string) {
    const rows = await tx.fin_budget_ledger.findMany({ where: { source_type: 'JOURNAL_ENTRY', source_id: originalEntryId, entry_type: 'ACTUAL' } });
    for (const row of rows) await tx.fin_budget_ledger.create({ data: {
      id: crypto.randomUUID(), tenant_id: row.tenant_id, company_id: row.company_id, budget_id: row.budget_id, allocation_id: row.allocation_id,
      fiscal_period_id: reversalEntry.fiscal_period_id ?? row.fiscal_period_id, source_type: 'JOURNAL_REVERSAL', source_id: reversalEntry.id, source_line_id: row.source_line_id,
      entry_type: 'REVERSAL', actual_delta: -Number(row.actual_delta), description: reversalEntry.description,
      idempotency_key: `BUDGET_ACTUAL_REVERSAL:${reversalEntry.id}:${row.id}`, reversal_of_id: row.id, posted_by_id: reversedBy,
    } });
  }

  /**
   * Automatically commits/reserves budget when a FUND_REQUEST is approved by SPV/OM/GM,
   * matching either an explicit budget_allocation_id or the request's cost_center_id / department_id / project_id.
   */
  static async autoCommitForFundRequest(params: {
    companyId: string;
    tenantId?: string | null;
    requestId: string;
    userId: string;
    amount: number;
    allocationId?: string | null;
    costCenterId?: string | null;
    departmentId?: string | null;
    projectId?: string | null;
    description?: string | null;
  }) {
    const {
      companyId,
      tenantId = null,
      requestId,
      userId,
      amount,
      allocationId,
      costCenterId,
      departmentId,
      projectId,
      description,
    } = params;

    if (!companyId || !requestId || !Number.isFinite(amount) || amount <= 0) return null;

    // Check if an active reservation already exists for this request
    const existingReservation = await prisma.fin_budget_reservation.findFirst({
      where: {
        company_id: companyId,
        source_type: 'REQUEST',
        source_id: requestId,
        status: { in: ['PENDING_APPROVAL', 'OPEN', 'PARTIALLY_RELEASED'] },
      },
    });
    if (existingReservation) return { reservation: existingReservation, already_committed: true };

    let targetAllocationId = allocationId ? String(allocationId).trim() : '';

    if (!targetAllocationId) {
      const candidateWhere: any = {
        company_id: companyId,
        budget: { status: 'ACTIVE' },
      };
      const dimensionFilters: any[] = [];
      if (costCenterId) dimensionFilters.push({ cost_center_id: costCenterId });
      if (departmentId) dimensionFilters.push({ department_id: departmentId }, { cost_center_id: departmentId });
      if (projectId) dimensionFilters.push({ project_id: projectId });

      if (dimensionFilters.length > 0) {
        candidateWhere.OR = dimensionFilters;
      } else {
        return null;
      }

      const candidate = await prisma.fin_budget_line.findFirst({
        where: candidateWhere,
        include: { period_allocations: true },
        orderBy: { created_at: 'desc' },
      });
      if (!candidate || candidate.period_allocations.length > 0) {
        return null;
      }
      targetAllocationId = candidate.id;
    }

    const result = await this.createReservation(companyId, tenantId, userId, {
      allocation_id: targetAllocationId,
      source_type: 'REQUEST',
      source_id: requestId,
      amount,
      description: description || `Komitmen otomatis Pengajuan Dana #${requestId.slice(0, 8)}`,
    });

    await (prisma.request_ticket as any)
      .updateMany({
        where: { id: requestId, company_id: companyId },
        data: {
          budget_allocation_id: targetAllocationId,
          budget_reservation_id: result.reservation.id,
          ...(costCenterId ? { cost_center_id: costCenterId } : {}),
          ...(departmentId ? { department_id: departmentId } : {}),
        },
      })
      .catch(() => undefined);

    return result;
  }

  /**
   * Automatically releases or recognizes budget commitment when a FUND_REQUEST is
   * rejected/cancelled ('RELEASE') or disbursed/settled via LPJ ('RECOGNIZE').
   */
  static async autoReleaseOrRecognizeForFundRequest(params: {
    companyId: string;
    requestId: string;
    userId: string;
    action: 'RELEASE' | 'RECOGNIZE';
    actualAmount?: number | null;
    reason?: string;
  }) {
    const { companyId, requestId, userId, action, actualAmount, reason } = params;
    if (!companyId || !requestId) return null;

    const openReservations = await prisma.fin_budget_reservation.findMany({
      where: {
        company_id: companyId,
        source_type: 'REQUEST',
        source_id: requestId,
        status: { in: ['OPEN', 'PARTIALLY_RELEASED', 'PENDING_APPROVAL'] },
      },
      orderBy: { created_at: 'asc' },
    });

    if (!openReservations.length) return null;

    const results = [];
    for (const resv of openReservations) {
      const rem = Number(resv.remaining_amount ?? 0);
      if (rem <= MONEY_EPSILON) continue;

      if (resv.status === 'PENDING_APPROVAL') {
        if (action === 'RELEASE') {
          const rejected = await prisma.fin_budget_reservation.update({
            where: { id: resv.id },
            data: { status: 'REJECTED', description: `${resv.description ?? ''}\nDibebaskan: ${reason || 'Request ditolak/dibatalkan'}` },
          });
          results.push(rejected);
        }
        continue;
      }

      if (action === 'RELEASE') {
        const released = await this.releaseReservation(
          companyId,
          resv.id,
          userId,
          { amount: rem, reason: reason || `Pelepasan otomatis komitmen Request #${requestId.slice(0, 8)}` },
          false,
        );
        results.push(released);
      } else {
        const toRecognize =
          actualAmount !== undefined && actualAmount !== null && Number.isFinite(Number(actualAmount)) && Number(actualAmount) > 0
            ? Math.min(rem, Number(actualAmount))
            : rem;

        if (toRecognize > MONEY_EPSILON) {
          const recognized = await this.releaseReservation(
            companyId,
            resv.id,
            userId,
            { amount: toRecognize, reason: reason || `Realisasi pencairan/LPJ Request #${requestId.slice(0, 8)}` },
            true,
          );
          results.push(recognized);
        }

        const leftover = Math.round((rem - toRecognize) * 100) / 100;
        if (leftover > MONEY_EPSILON) {
          const releasedDiff = await this.releaseReservation(
            companyId,
            resv.id,
            userId,
            { amount: leftover, reason: `Pelepasan sisa pagu LPJ Request #${requestId.slice(0, 8)}` },
            false,
          );
          results.push(releasedDiff);
        }
      }
    }

    return results;
  }
}
