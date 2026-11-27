import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors';
import { FinanceService } from './finance.service';
import { FinanceDocumentService } from './finance-document.service';
import { PeriodClosingService } from './period-closing.service';
import { isUsableModuleAssignment } from '../../utils/module-assignments';

async function notifyFinanceOfGeneratedPayroll(tx: Prisma.TransactionClient, params: {
  companyId: string;
  tenantId: string | null;
  actorId: string | null;
  run: { id: string; run_number: string; net_total: Prisma.Decimal | number; status: string };
}) {
  const scope = { company_id: params.companyId };
  const tenantScope = params.tenantId ? { tenant_id: params.tenantId } : {};
  const now = new Date();
  const entitlement = await tx.iam_company_module_access.findFirst({
    where: {
      ...scope,
      ...tenantScope,
      module_code: 'FINANCE',
      enabled: true,
      allow_read: true,
      AND: [
        { OR: [{ effective_from: null }, { effective_from: { lte: now } }] },
        { OR: [{ effective_until: null }, { effective_until: { gte: now } }] },
      ],
    },
    select: { id: true },
  });
  if (!entitlement) return 0;

  const memberships = await tx.iam_user_company_membership.findMany({
    where: { company_id: params.companyId, status: 'ACTIVE' },
    select: { user_id: true },
  });
  const memberIds = memberships.map((membership) => membership.user_id);
  if (!memberIds.length) return 0;

  const assignments = await tx.iam_user_module_assignment.findMany({
    where: {
      ...scope,
      ...tenantScope,
      user_id: { in: memberIds },
      module_code: 'FINANCE',
      status: 'ACTIVE',
      tier_level: 1,
      AND: [
        { OR: [{ effective_from: null }, { effective_from: { lte: now } }] },
        { OR: [{ effective_until: null }, { effective_until: { gte: now } }] },
      ],
    },
    include: { role_profile: { select: { profile_code: true, is_active: true } } },
  });
  const recipientIds = [...new Set(assignments
    .filter((assignment) => isUsableModuleAssignment({
      ...assignment,
      profile_active: assignment.role_profile?.is_active,
      profile_code: assignment.role_profile?.profile_code ?? assignment.profile_code,
    }, 'FINANCE'))
    .map((assignment) => assignment.user_id))];
  if (!recipientIds.length) return 0;

  const activeUsers = await tx.iam_user.findMany({
    where: { ...tenantScope, id: { in: recipientIds }, status: 'ACTIVE', is_active: true },
    select: { id: true },
  });
  if (!activeUsers.length) return 0;

  const targetUrl = '/finance?tab=payroll';
  const nextStep = params.run.status === 'POSTED'
    ? 'Payroll sudah diposting. Finance dapat melanjutkan pengelolaan pembayarannya.'
    : params.run.status === 'APPROVED'
      ? 'Payroll sudah disetujui. Finance dapat mem-posting ke GL lalu mengelola pembayarannya.'
      : params.run.status === 'HR_APPROVED'
        ? 'Payroll menunggu review Finance. Setelah disetujui dan diposting, Finance dapat mengelola pembayarannya.'
        : 'Setelah HR menyetujui, Finance dapat meninjau payroll, mem-posting ke GL, lalu mengelola pembayarannya.';
  const rows = activeUsers.map((user) => {
    const hash = crypto.createHash('sha256').update(`payroll-generated:${params.run.id}:${user.id}`).digest('hex');
    const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    return {
      ...scope,
      id,
      created_by_id: params.actorId,
      actor_id: params.actorId,
      recipient_id: user.id,
      category: 'PAYROLL_GENERATED',
      title: 'Payroll baru perlu dikelola',
      description: `Payroll ${params.run.run_number} berhasil dibuat dengan total gaji bersih Rp ${Number(params.run.net_total).toLocaleString('id-ID')}. ${nextStep}`,
      target_url: targetUrl,
      is_read: false,
      created_at: now,
      updated_at: now,
      reference_type: 'PAYROLL_RUN',
      reference_id: params.run.id,
    };
  });
  return (await tx.core_app_notification.createMany({ data: rows, skipDuplicates: true })).count;
}

const amount = (value: unknown, label: string, allowZero = true) => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || (allowZero ? n < 0 : n <= 0)) throw new ValidationError(`${label} harus berupa nominal ${allowZero ? 'nol atau lebih' : 'lebih dari nol'}.`);
  return Math.round((n + Number.EPSILON) * 100) / 100;
};

const decimalSum = (values: Array<Prisma.Decimal | number | string | null | undefined>): Prisma.Decimal =>
  values.reduce<Prisma.Decimal>((sum, value) => sum.plus(value ?? 0), new Prisma.Decimal(0));

function normalizeLines(lines: any[]) {
  if (!Array.isArray(lines) || lines.length === 0) throw new ValidationError('Tambahkan setidaknya satu karyawan ke payroll run.');
  const seen = new Set<string>();
  return lines.map((row) => {
    const employeeId = String(row.employee_id ?? '').trim();
    if (!employeeId || seen.has(employeeId)) throw new ValidationError('Karyawan wajib dipilih dan tidak boleh tercatat dua kali dalam satu payroll run.');
    seen.add(employeeId);
    const gross = amount(row.gross_salary, 'Gaji pokok', false);
    const allowances = amount(row.allowances, 'Tunjangan');
    const overtimeHours = amount(row.overtime_hours, 'Jam lembur');
    const overtimePay = amount(row.overtime_pay, 'Upah lembur');
    const tax = amount(row.employee_tax, 'PPh 21 karyawan');
    const employeeBpjs = amount(row.employee_bpjs, 'Potongan BPJS karyawan');
    const employerBpjs = amount(row.employer_bpjs, 'Iuran BPJS perusahaan');
    if (tax + employeeBpjs > gross + allowances) throw new ValidationError('Total potongan karyawan melebihi gaji dan tunjangan.');
    return {
      employee_id: employeeId,
      cost_center_id: row.cost_center_id ? String(row.cost_center_id) : null,
      gross_salary: gross,
      allowances,
      overtime_hours: overtimeHours,
      overtime_pay: overtimePay,
      employee_tax: tax,
      employee_bpjs: employeeBpjs,
      employer_bpjs: employerBpjs,
      net_salary: Math.round((gross + allowances + overtimePay - tax - employeeBpjs + Number.EPSILON) * 100) / 100,
    };
  });
}

export class PayrollService {
  static async listEmployeeCostCenters(companyId: string) {
    return prisma.master_cost_center.findMany({
      where: { company_id: companyId, status: 'ACTIVE' },
      select: { id: true, cost_center_code: true, cost_center_name: true, status: true },
      orderBy: { cost_center_code: 'asc' },
    });
  }

  static async listEmployees(companyId: string) {
    const rows = await prisma.master_employee.findMany({
      // Keep inactive and former employees visible in the master table so their
      // history can be reviewed and they can be reactivated when appropriate.
      // Payroll creation independently enforces ACTIVE status for each line.
      where: { company_id: companyId },
      orderBy: [{ employee_number: 'asc' }],
    });
    const partyIds = [...new Set(rows.map((row) => row.party_id).filter((id): id is string => Boolean(id)))];
    const parties = partyIds.length ? await prisma.master_party.findMany({ where: { company_id: companyId, id: { in: partyIds } }, select: { id: true, display_name: true, legal_name: true } }) : [];
    const partyById = new Map(parties.map((party) => [party.id, party]));
    const userIds = [...new Set(rows.map((row) => row.user_id).filter((id): id is string => Boolean(id)))];
    const users = userIds.length ? await prisma.iam_user.findMany({ where: { id: { in: userIds } }, select: { id: true, full_name: true, email: true } }) : [];
    const userById = new Map(users.map((user) => [user.id, user]));
    return rows.map((row) => {
      const storedName = String(row.employee_name ?? '').trim();
      const employeeName = storedName && storedName !== row.employee_number
        ? storedName
        : partyById.get(row.party_id ?? '')?.display_name
          || partyById.get(row.party_id ?? '')?.legal_name
          || userById.get(row.user_id ?? '')?.full_name
          || userById.get(row.user_id ?? '')?.email
          || storedName;
      return {
        ...row,
        employee_name: employeeName,
        linked_user: row.user_id ? userById.get(row.user_id) ?? null : null,
      };
    });
  }

  static async listUnlinkedEmployeeUsers(companyId: string) {
    const [memberships, linkedEmployees] = await Promise.all([
      prisma.iam_user_company_membership.findMany({
        where: { company_id: companyId, status: 'ACTIVE' },
        select: { user_id: true },
      }),
      prisma.master_employee.findMany({
        where: { company_id: companyId, user_id: { not: null } },
        select: { user_id: true },
      }),
    ]);
    const linkedIds = new Set(linkedEmployees.map((row) => row.user_id).filter((id): id is string => Boolean(id)));
    const candidateIds = [...new Set(memberships.map((row) => row.user_id))].filter((id) => !linkedIds.has(id));
    if (!candidateIds.length) return [];
    return prisma.iam_user.findMany({
      where: { id: { in: candidateIds }, is_active: true, status: 'ACTIVE' },
      select: { id: true, full_name: true, email: true },
      orderBy: { full_name: 'asc' },
    });
  }

  static async createEmployee(companyId: string, tenantId: string | null, userId: string, input: any) {
    const employeeNumber = String(input.employee_number ?? '').trim();
    const employeeName = String(input.employee_name ?? '').trim();
    if (!employeeNumber || !employeeName) throw new ValidationError('Nomor dan nama karyawan wajib diisi.');
    const salary = input.monthly_salary === undefined || input.monthly_salary === null || String(input.monthly_salary).trim() === ''
      ? null
      : amount(input.monthly_salary, 'Gaji bulanan', false);
    const hourlyRate = input.standard_hourly_rate === undefined || input.standard_hourly_rate === null || String(input.standard_hourly_rate).trim() === ''
      ? null
      : amount(input.standard_hourly_rate, 'Tarif per jam', false);
    const overtimeRate = input.overtime_hourly_rate === undefined || input.overtime_hourly_rate === null || String(input.overtime_hourly_rate).trim() === ''
      ? null
      : amount(input.overtime_hourly_rate, 'Tarif lembur per jam', false);
    const costCenterId = String(input.cost_center_id ?? '').trim();
    if (costCenterId && !await prisma.master_cost_center.findFirst({ where: { id: costCenterId, company_id: companyId, status: 'ACTIVE' }, select: { id: true } })) throw new ValidationError('Cost center tidak aktif atau bukan milik perusahaan ini.');
    const duplicate = await prisma.master_employee.findFirst({ where: { company_id: companyId, employee_number: employeeNumber } });
    if (duplicate) throw new ConflictError('Nomor karyawan sudah digunakan pada perusahaan ini.');
    const employmentStatus = String(input.employment_status ?? 'ACTIVE').toUpperCase();
    if (!['ACTIVE', 'INACTIVE', 'TERMINATED'].includes(employmentStatus)) throw new ValidationError('Status karyawan tidak valid.');
    return prisma.master_employee.create({ data: {
      id: crypto.randomUUID(), company_id: companyId, tenant_id: tenantId, created_by_id: userId,
      employee_number: employeeNumber, employee_name: employeeName, monthly_salary: salary,
      employment_status: employmentStatus, department_id: input.department_id || null, cost_center_id: costCenterId || null,
      party_id: input.party_id || null, standard_hourly_rate: hourlyRate, overtime_hourly_rate: overtimeRate, user_id: null,
    } });
  }

  static async deactivateEmployee(companyId: string, employeeId: string) {
    const employee = await prisma.master_employee.findFirst({ where: { company_id: companyId, id: employeeId }, select: { id: true } });
    if (!employee) throw new NotFoundError('Karyawan');
    return prisma.master_employee.update({ where: { id: employeeId }, data: { employment_status: 'INACTIVE' } });
  }

  static async updateEmployee(companyId: string, employeeId: string, input: any) {
    const employee = await prisma.master_employee.findFirst({ where: { company_id: companyId, id: employeeId } });
    if (!employee) throw new NotFoundError('Karyawan');
    if (input.employee_number !== undefined) {
      const employeeNumber = String(input.employee_number).trim();
      if (!employeeNumber) throw new ValidationError('Nomor karyawan wajib diisi.');
      if (employeeNumber !== employee.employee_number) {
        const duplicate = await prisma.master_employee.findFirst({ where: { company_id: companyId, employee_number: employeeNumber, id: { not: employeeId } } });
        if (duplicate) throw new ConflictError('Nomor karyawan sudah digunakan pada perusahaan ini.');
      }
    }
    if (input.employee_name !== undefined && !String(input.employee_name).trim()) {
      throw new ValidationError('Nama karyawan wajib diisi.');
    }
    const data: any = {};
    if (input.user_id !== undefined) {
      const userId = input.user_id === null || String(input.user_id).trim() === '' ? null : String(input.user_id).trim();
      if (userId && userId !== employee.user_id) {
        const membership = await prisma.iam_user_company_membership.findFirst({ where: { company_id: companyId, user_id: userId, status: 'ACTIVE' } });
        const user = membership ? await prisma.iam_user.findFirst({ where: { id: userId, is_active: true, status: 'ACTIVE' }, select: { id: true } }) : null;
        if (!user) throw new ValidationError('Pilih user aktif yang terdaftar pada perusahaan ini.');
        const linked = await prisma.master_employee.findFirst({ where: { company_id: companyId, user_id: userId, id: { not: employeeId } }, select: { employee_number: true } });
        if (linked) throw new ConflictError(`Akun user sudah terhubung ke karyawan ${linked.employee_number}.`);
      }
      data.user_id = userId;
    }
    if (input.employee_number !== undefined) data.employee_number = String(input.employee_number).trim();
    if (input.employee_name !== undefined) data.employee_name = String(input.employee_name).trim();
    if (input.monthly_salary !== undefined) {
      const rawSalary = input.monthly_salary;
      data.monthly_salary = rawSalary === null || String(rawSalary).trim() === ''
        ? null
        : amount(rawSalary, 'Gaji bulanan', false);
    }
    if (input.standard_hourly_rate !== undefined) {
      const rawRate = input.standard_hourly_rate;
      if (rawRate === null || String(rawRate).trim() === '') {
        data.standard_hourly_rate = null;
      } else {
        data.standard_hourly_rate = amount(rawRate, 'Tarif per jam');
        if (data.standard_hourly_rate <= 0) throw new ValidationError('Tarif per jam harus lebih dari nol atau dikosongkan.');
      }
    }
    if (input.overtime_hourly_rate !== undefined) {
      const rawRate = input.overtime_hourly_rate;
      if (rawRate === null || String(rawRate).trim() === '') {
        data.overtime_hourly_rate = null;
      } else {
        data.overtime_hourly_rate = amount(rawRate, 'Tarif lembur per jam');
        if (data.overtime_hourly_rate <= 0) throw new ValidationError('Tarif lembur per jam harus lebih dari nol atau dikosongkan untuk memakai tarif umum.');
      }
    }
    if (input.department_id !== undefined) data.department_id = input.department_id || null;
    if (input.cost_center_id !== undefined) {
      const costCenterId = String(input.cost_center_id ?? '').trim();
      if (costCenterId && !await prisma.master_cost_center.findFirst({ where: { id: costCenterId, company_id: companyId, status: 'ACTIVE' }, select: { id: true } })) throw new ValidationError('Cost center tidak aktif atau bukan milik perusahaan ini.');
      data.cost_center_id = costCenterId || null;
    }
    if (input.employment_status !== undefined) {
      const status = String(input.employment_status).toUpperCase();
      if (!['ACTIVE', 'INACTIVE', 'TERMINATED'].includes(status)) throw new ValidationError('Status karyawan tidak valid.');
      data.employment_status = status;
    }
    try {
      return await prisma.master_employee.update({ where: { id: employeeId }, data });
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictError('Akun user sudah terhubung ke karyawan lain.');
      throw error;
    }
  }

  static async listRuns(companyId: string) {
    return prisma.fin_payroll_run.findMany({ where: { company_id: companyId }, include: { lines: true }, orderBy: [{ period_start: 'desc' }, { created_at: 'desc' }], take: 100 });
  }

  static async backfillGeneratedNotifications(dateStart: Date, dateEnd: Date) {
    const runs = await prisma.fin_payroll_run.findMany({
      where: {
        created_at: { gte: dateStart, lt: dateEnd },
        status: { in: ['DRAFT', 'HR_APPROVED', 'APPROVED', 'POSTED'] },
      },
      select: {
        id: true, tenant_id: true, company_id: true, created_by_id: true,
        run_number: true, net_total: true, status: true,
      },
      orderBy: [{ company_id: 'asc' }, { created_at: 'asc' }],
    });
    let notificationsCreated = 0;
    for (const run of runs) {
      notificationsCreated += await prisma.$transaction((tx) => notifyFinanceOfGeneratedPayroll(tx, {
        companyId: run.company_id,
        tenantId: run.tenant_id,
        actorId: run.created_by_id,
        run,
      }));
    }
    return { payrollRuns: runs.length, notificationsCreated };
  }

  static async createRun(companyId: string, tenantId: string | null, userId: string, input: any, runId?: string) {
    const start = new Date(input.period_start);
    const end = new Date(input.period_end);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) throw new ValidationError('Rentang periode payroll tidak valid.');
    const lines = normalizeLines(input.lines);
    return prisma.$transaction(async (tx) => {
      let run: any;
      if (runId) {
        run = await tx.fin_payroll_run.findFirst({ where: { id: runId, company_id: companyId }, include: { lines: true } });
        if (!run) throw new NotFoundError('Payroll run');
        if (run.status !== 'DRAFT') throw new ConflictError('Payroll run hanya dapat diubah saat masih DRAFT.');
      }
      const employees = await tx.master_employee.findMany({ where: { company_id: companyId, id: { in: lines.map((line) => line.employee_id) }, employment_status: 'ACTIVE' } });
      if (employees.length !== lines.length) throw new ValidationError('Semua karyawan payroll harus terdaftar dan berstatus ACTIVE.');
      const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
      const lineData = lines.map((line) => {
        const employee = employeeById.get(line.employee_id)!;
        if (!line.cost_center_id) throw new ValidationError(`Cost center wajib dipilih untuk karyawan ${employee.employee_name || employee.employee_number}.`);
        return {
          id: crypto.randomUUID(), tenant_id: tenantId, company_id: companyId,
          payroll_run_id: runId ?? '', employee_id: employee.id, employee_number: employee.employee_number,
          employee_name: employee.employee_name || employee.employee_number, cost_center_id: line.cost_center_id,
          gross_salary: line.gross_salary, allowances: line.allowances,
          overtime_hours: line.overtime_hours, overtime_pay: line.overtime_pay,
          employee_tax: line.employee_tax,
          employee_bpjs: line.employee_bpjs, employer_bpjs: line.employer_bpjs, net_salary: line.net_salary,
        };
      });
      const grossTotal = decimalSum(lineData.flatMap((line) => [line.gross_salary, line.allowances, line.overtime_pay]));
      const deductionTotal = decimalSum(lineData.flatMap((line) => [line.employee_tax, line.employee_bpjs]));
      const employerTotal = decimalSum(lineData.map((line) => line.employer_bpjs));
      const netTotal = grossTotal.minus(deductionTotal);
      const number = run?.run_number ?? `PAY-${start.toISOString().slice(0, 7).replace('-', '')}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      const savedRun = runId
        ? await tx.fin_payroll_run.update({ where: { id: runId }, data: { period_start: start, period_end: end, gross_total: grossTotal, deduction_total: deductionTotal, employer_contribution_total: employerTotal, net_total: netTotal } })
        : await tx.fin_payroll_run.create({ data: { id: crypto.randomUUID(), tenant_id: tenantId, company_id: companyId, created_by_id: userId, run_number: number, period_start: start, period_end: end, status: 'DRAFT', gross_total: grossTotal, deduction_total: deductionTotal, employer_contribution_total: employerTotal, net_total: netTotal } });
      await tx.fin_payroll_line.deleteMany({ where: { company_id: companyId, payroll_run_id: savedRun.id } });
      await tx.fin_payroll_line.createMany({ data: lineData.map((line) => ({ ...line, payroll_run_id: savedRun.id })) });
      const result = await tx.fin_payroll_run.findFirst({ where: { id: savedRun.id, company_id: companyId }, include: { lines: true } });
      if (!runId && result) {
        await notifyFinanceOfGeneratedPayroll(tx, { companyId, tenantId, actorId: userId, run: result });
      }
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async deleteRun(companyId: string, runId: string, actor: 'HR' | 'FINANCE') {
    return prisma.$transaction(async (tx) => {
      const run = await tx.fin_payroll_run.findFirst({ where: { id: runId, company_id: companyId } });
      if (!run) throw new NotFoundError('Payroll run');
      if (run.status === 'POSTED' || run.status === 'PAID' || run.journal_entry_id || run.payment_journal_entry_id) {
        throw new ConflictError('Payroll yang sudah diposting atau dibayar tidak dapat dihapus.');
      }
      if (actor === 'HR' && run.status !== 'DRAFT') {
        throw new ConflictError('HR hanya dapat menghapus payroll sebelum ACC HR (status DRAFT).');
      }
      if (actor === 'FINANCE' && !['DRAFT', 'PENDING_APPROVAL', 'HR_APPROVED', 'APPROVED'].includes(run.status)) {
        throw new ConflictError('Finance hanya dapat menghapus payroll yang belum diposting.');
      }
      return tx.fin_payroll_run.delete({ where: { id: runId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async setStatus(companyId: string, runId: string, userId: string, action: 'SUBMIT' | 'APPROVE') {
    const run = await prisma.fin_payroll_run.findFirst({ where: { id: runId, company_id: companyId } });
    if (!run) throw new NotFoundError('Payroll run');
    if (action === 'SUBMIT') {
      if (run.status !== 'DRAFT') throw new ConflictError('Hanya payroll DRAFT yang dapat diajukan.');
      return prisma.fin_payroll_run.update({ where: { id: runId }, data: { status: 'PENDING_APPROVAL' } });
    }
    if (run.status !== 'PENDING_APPROVAL') throw new ConflictError('Payroll run tidak menunggu persetujuan.');
    return prisma.fin_payroll_run.update({ where: { id: runId }, data: { status: 'APPROVED', approved_by_id: userId, approved_at: new Date() } });
  }

  static async post(companyId: string, tenantId: string | null, runId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const run = await tx.fin_payroll_run.findFirst({ where: { id: runId, company_id: companyId }, include: { lines: true } });
      if (!run) throw new NotFoundError('Payroll run');
      if (run.status === 'POSTED' && run.journal_entry_id) return run;
      if (run.status !== 'APPROVED') throw new ConflictError('Payroll harus disetujui sebelum diposting.');
      if (!run.lines.length) throw new ValidationError('Payroll run tidak memiliki rincian karyawan.');
      const date = new Date(run.period_end);
      const period = await PeriodClosingService.ensureOpenPostingPeriod(tx, date, companyId, tenantId, userId);
      const payrollAccounts = await FinanceService.ensurePayrollCOA(companyId, tx);
      const expense = payrollAccounts.get('6101');
      const salaryPayable = payrollAccounts.get('2150');
      const taxPayable = payrollAccounts.get('2160');
      const bpjsPayable = payrollAccounts.get('2170');
      if (!expense || !salaryPayable || !taxPayable || !bpjsPayable) throw new ValidationError('COA Payroll belum lengkap. Pastikan 6101, 2150, 2160, dan 2170 aktif.');
      const grossTotal = decimalSum(run.lines.flatMap((line) => [line.gross_salary, line.allowances, line.overtime_pay]));
      const deductionTotal = decimalSum(run.lines.flatMap((line) => [line.employee_tax, line.employee_bpjs]));
      const netTotal = grossTotal.minus(deductionTotal);
      const journalBook = await FinanceService.ensureJournal(companyId, 'GJ', 'General Journal', 'GENERAL', tx);
      const doc = await FinanceDocumentService.ensure(tx, { tenantId, companyId, userId, documentType: 'PAYROLL', documentNumber: run.run_number, documentDate: run.period_end, postingDate: date, status: 'POSTED' });
      const journalId = crypto.randomUUID();
      await tx.fin_journal_entry.create({ data: { id: journalId, tenant_id: tenantId, company_id: companyId, created_by_id: userId, journal_id: journalBook.id, fiscal_period_id: period.id, entry_number: run.run_number, posting_date: date, description: `Akrual payroll ${run.run_number}`, source_document_id: doc.id, status: 'POSTED' } });
      const expenseTotal = decimalSum(run.lines.flatMap((line) => [line.gross_salary, line.allowances, line.overtime_pay, line.employer_bpjs]));
      const journalLines: any[] = [{ id: crypto.randomUUID(), tenant_id: tenantId, company_id: companyId, created_by_id: userId, journal_entry_id: journalId, account_id: expense.id, cost_center_id: null, department_id: null, debit_base: expenseTotal, credit_base: new Prisma.Decimal(0), transaction_amount: expenseTotal }];
      const taxTotal = decimalSum(run.lines.map((line) => line.employee_tax));
      const bpjsTotal = decimalSum(run.lines.flatMap((line) => [line.employee_bpjs, line.employer_bpjs]));
      journalLines.push({ id: crypto.randomUUID(), tenant_id: tenantId, company_id: companyId, created_by_id: userId, journal_entry_id: journalId, account_id: salaryPayable.id, credit_base: netTotal, debit_base: new Prisma.Decimal(0), transaction_amount: netTotal });
      if (!taxTotal.isZero()) journalLines.push({ id: crypto.randomUUID(), tenant_id: tenantId, company_id: companyId, created_by_id: userId, journal_entry_id: journalId, account_id: taxPayable.id, credit_base: taxTotal, debit_base: new Prisma.Decimal(0), transaction_amount: taxTotal });
      if (!bpjsTotal.isZero()) journalLines.push({ id: crypto.randomUUID(), tenant_id: tenantId, company_id: companyId, created_by_id: userId, journal_entry_id: journalId, account_id: bpjsPayable.id, credit_base: bpjsTotal, debit_base: new Prisma.Decimal(0), transaction_amount: bpjsTotal });
      await tx.fin_journal_line.createMany({ data: journalLines });
      await FinanceDocumentService.markPosted(tx, doc.id, userId, date);
      return tx.fin_payroll_run.update({ where: { id: run.id }, data: { gross_total: grossTotal, deduction_total: deductionTotal, net_total: netTotal, status: 'POSTED', journal_entry_id: journalId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 30000 });
  }

  static async pay(companyId: string, tenantId: string | null, runId: string, userId: string, input: any) {
    const bankId = String(input.bank_account_id ?? '').trim();
    const reference = String(input.reference_number ?? '').trim();
    const date = new Date(input.payment_date ?? new Date());
    if (!bankId || !reference || !Number.isFinite(date.getTime())) throw new ValidationError('Rekening bank, tanggal, dan referensi pembayaran wajib diisi.');
    return prisma.$transaction(async (tx) => {
      const run = await tx.fin_payroll_run.findFirst({ where: { id: runId, company_id: companyId } });
      if (!run) throw new NotFoundError('Payroll run');
      if (run.status === 'PAID' && run.payment_journal_entry_id) return run;
      if (run.status !== 'POSTED') throw new ConflictError('Payroll harus diposting sebelum gaji dapat dibayar.');
      const bank = await tx.fin_bank_account.findFirst({ where: { id: bankId, company_id: companyId, status: 'ACTIVE' } });
      const bankLedger = bank?.ledger_account_id ? await tx.fin_account.findFirst({ where: { id: bank.ledger_account_id, company_id: companyId, status: 'ACTIVE' } }) : null;
      const payable = await tx.fin_account.findFirst({ where: { company_id: companyId, account_code: '2150', status: 'ACTIVE' } });
      if (!bank || !bankLedger || !payable) throw new ValidationError('Rekening bank atau akun utang gaji tidak valid.');
      const period = await PeriodClosingService.ensureOpenPostingPeriod(tx, date, companyId, tenantId, userId);
      const journalBook = await FinanceService.ensureJournal(companyId, 'GJ', 'General Journal', 'GENERAL', tx);
      const paymentDoc = await FinanceDocumentService.ensure(tx, { tenantId, companyId, userId, documentType: 'PAYROLL_PAYMENT', documentNumber: `${run.run_number}-PAY`, documentDate: date, postingDate: date, status: 'POSTED' });
      const journalId = crypto.randomUUID();
      await tx.fin_journal_entry.create({ data: { id: journalId, tenant_id: tenantId, company_id: companyId, created_by_id: userId, journal_id: journalBook.id, fiscal_period_id: period.id, entry_number: `${run.run_number}-PAY`, posting_date: date, description: `Pembayaran gaji bersih ${run.run_number}`, source_document_id: paymentDoc.id, status: 'POSTED' } });
      await tx.fin_journal_line.createMany({ data: [
        { id: crypto.randomUUID(), tenant_id: tenantId, company_id: companyId, created_by_id: userId, journal_entry_id: journalId, account_id: payable.id, debit_base: new Prisma.Decimal(Number(run.net_total)), credit_base: new Prisma.Decimal(0), transaction_amount: new Prisma.Decimal(Number(run.net_total)) },
        { id: crypto.randomUUID(), tenant_id: tenantId, company_id: companyId, created_by_id: userId, journal_entry_id: journalId, account_id: bankLedger.id, debit_base: new Prisma.Decimal(0), credit_base: new Prisma.Decimal(Number(run.net_total)), transaction_amount: new Prisma.Decimal(Number(run.net_total)) },
      ] });
      await tx.fin_payment.create({ data: { id: crypto.randomUUID(), tenant_id: tenantId, company_id: companyId, created_by_id: userId, document_id: paymentDoc.id, bank_account_id: bank.id, payment_type: 'PAYROLL', payment_date: date, amount: run.net_total, payment_method: input.payment_method || 'BANK_TRANSFER', reference_number: reference, journal_entry_id: journalId, status: 'POSTED', allocation_plan: { payroll_run_id: run.id }, submitted_by_id: userId, submitted_at: date, approved_by_id: null, approved_at: null, executed_by_id: userId, executed_at: date, execution_reference: reference, execution_note: `Pembayaran gaji bersih payroll ${run.run_number}.`, failure_reason: '' } });
      await FinanceDocumentService.markPosted(tx, paymentDoc.id, userId, date);
      await (tx as any).hr_overtime_request?.updateMany?.({
        where: { company_id: companyId, payroll_run_id: run.id, status: 'APPROVED' },
        data: { status: 'PAID' },
      }).catch(() => {});
      return tx.fin_payroll_run.update({ where: { id: run.id }, data: { status: 'PAID', payment_date: date, bank_account_id: bank.id, payment_journal_entry_id: journalId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 30000 });
  }
}
