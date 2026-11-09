import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';

const MONEY_EPSILON = 0.005;
const CONTROL_POLICIES = new Set(['HARD_STOP', 'SOFT_WARNING', 'APPROVAL_ESCALATION']);
const PERIOD_MODES = new Set(['ANNUAL', 'MONTHLY', 'QUARTERLY']);
const RESERVATION_SOURCE_TYPES = new Set(['REQUEST', 'PURCHASE_ORDER', 'INVOICE', 'OTHER']);

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
    const [fiscalYears, fiscalPeriods, accounts, costCenters, projects, departments] = await Promise.all([
      prisma.fin_fiscal_year.findMany({ where: { company_id: companyId }, orderBy: { start_date: 'desc' } }),
      prisma.fin_fiscal_period.findMany({ where: { company_id: companyId }, orderBy: { period_number: 'asc' } }),
      prisma.fin_account.findMany({ where: { company_id: companyId, status: 'ACTIVE', account_type: 'EXPENSE' }, orderBy: { account_code: 'asc' } }),
      prisma.master_cost_center.findMany({ where: { company_id: companyId, status: 'ACTIVE' }, orderBy: { cost_center_code: 'asc' } }),
      prisma.project_project.findMany({ where: { company_id: companyId, lifecycle_status: { not: 'CANCELLED' } }, select: { id: true, project_code: true, project_name: true }, orderBy: { project_code: 'asc' } }),
      prisma.master_department.findMany({ where: { company_id: companyId, status: 'ACTIVE' }, orderBy: { department_code: 'asc' } }),
    ]);
    return { fiscal_years: fiscalYears, fiscal_periods: fiscalPeriods, accounts, cost_centers: costCenters, projects, departments };
  }

  static async listPlans(companyId: string) {
    return prisma.fin_budget.findMany({
      where: { company_id: companyId },
      include: { allocations: { include: { period_allocations: true } } },
      orderBy: [{ created_at: 'desc' }, { budget_name: 'asc' }],
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

  static async createPlan(companyId: string, tenantId: string | null, userId: string, input: any) {
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
      const [account, center, project, department] = await Promise.all([
        prisma.fin_account.findFirst({ where: { id: accountId, company_id: companyId, status: 'ACTIVE', account_type: 'EXPENSE' }, select: { id: true, account_code: true, account_name: true } }),
        prisma.master_cost_center.findFirst({ where: { id: costCenterId, company_id: companyId, status: 'ACTIVE' }, select: { id: true, cost_center_code: true, cost_center_name: true } }),
        projectId ? prisma.project_project.findFirst({ where: { id: projectId, company_id: companyId }, select: { id: true } }) : null,
        departmentId ? prisma.master_department.findFirst({ where: { id: departmentId, company_id: companyId, status: 'ACTIVE' }, select: { id: true } }) : null,
      ]);
      if (!account) throw new ValidationError('Akun alokasi harus akun beban aktif pada perusahaan ini.');
      if (!center) throw new ValidationError('Cost center tidak ditemukan atau tidak aktif pada perusahaan ini.');
      if (projectId && !project) throw new ValidationError('Proyek alokasi tidak ditemukan pada perusahaan ini.');
      if (departmentId && !department) throw new ValidationError('Departemen tidak ditemukan atau tidak aktif pada perusahaan ini.');
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
      normalized.push({ id: crypto.randomUUID(), allocation_name: String(row.allocation_name ?? '').trim() || `${account!.account_code} ${account!.account_name} · ${center!.cost_center_code} ${center!.cost_center_name}`, description: row.description ? String(row.description).trim().slice(0, 1000) : null, account_id: accountId, cost_center_id: costCenterId, project_id: projectId, department_id: departmentId, budget_amount: amount, periods });
    }
    const total = normalized.reduce((sum, row) => sum + row.budget_amount, 0);
    return prisma.$transaction(async (tx) => {
      const plan = await tx.fin_budget.create({ data: {
        id: crypto.randomUUID(), tenant_id: tenantId, company_id: companyId, created_by_id: userId,
        budget_name: name, budget_type: budgetType, fiscal_year_id: fiscalYearId, currency_id: input.currency_id ?? null,
        control_policy: policy, period_mode: periodMode, carry_forward: Boolean(input.carry_forward), status: 'DRAFT',
      } });
      for (const allocation of normalized) {
        await tx.fin_budget_line.create({ data: {
          id: allocation.id, tenant_id: tenantId, company_id: companyId, created_by_id: userId, budget_id: plan.id,
          account_id: allocation.account_id, cost_center_id: allocation.cost_center_id, project_id: allocation.project_id,
          department_id: allocation.department_id, budget_amount: allocation.budget_amount,
          allocation_name: allocation.allocation_name, description: allocation.description,
        } });
        if (allocation.periods.length) await tx.fin_budget_period_allocation.createMany({ data: allocation.periods.map((period) => ({
          id: crypto.randomUUID(), tenant_id: tenantId, company_id: companyId, budget_id: plan.id, allocation_id: allocation.id,
          fiscal_period_id: period.fiscal_period_id, amount: period.amount, created_by_id: userId,
        })) });
      }
      return { ...plan, total_allocated: total, allocation_count: normalized.length };
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
        if (!source || ['DRAFT', 'CANCELLED', 'REJECTED'].includes(String(source.status).toUpperCase())) throw new ValidationError('Request tidak ditemukan, belum terdaftar, atau sudah dibatalkan.');
      } else if (sourceType === 'PURCHASE_ORDER') {
        const source = await tx.proc_purchase_order.findFirst({ where: { id: sourceId, company_id: companyId }, select: { status: true } });
        if (!source) throw new NotFoundError('Purchase Order');
        if (String(source.status).toUpperCase() !== 'APPROVED') throw new ValidationError('Komitmen PO hanya dapat dicatat setelah Purchase Order berstatus APPROVED.');
      } else if (sourceType === 'INVOICE') {
        const source = await tx.fin_billing_document.findFirst({ where: { company_id: companyId, billing_type: 'SUPPLIER_INVOICE', OR: [{ id: sourceId }, { document_id: sourceId }] }, select: { status: true } });
        if (!source || ['DRAFT', 'REJECTED', 'CANCELLED'].includes(String(source.status).toUpperCase())) throw new ValidationError('Invoice pemasok tidak ditemukan atau tidak dapat dikomitmenkan.');
      }
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
}
