import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors';
import { FinanceService } from './finance.service';
import { FinanceDocumentService } from './finance-document.service';
import { PeriodClosingService } from './period-closing.service';
import { BudgetingService } from './budgeting.service';

const amount = (value: unknown, label: string, allowZero = true) => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || (allowZero ? n < 0 : n <= 0)) throw new ValidationError(`${label} harus berupa nominal ${allowZero ? 'nol atau lebih' : 'lebih dari nol'}.`);
  return Math.round((n + Number.EPSILON) * 100) / 100;
};

function normalizeLines(lines: any[]) {
  if (!Array.isArray(lines) || lines.length === 0) throw new ValidationError('Tambahkan setidaknya satu karyawan ke payroll run.');
  const seen = new Set<string>();
  return lines.map((row) => {
    const employeeId = String(row.employee_id ?? '').trim();
    if (!employeeId || seen.has(employeeId)) throw new ValidationError('Karyawan wajib dipilih dan tidak boleh tercatat dua kali dalam satu payroll run.');
    seen.add(employeeId);
    const gross = amount(row.gross_salary, 'Gaji pokok', false);
    const allowances = amount(row.allowances, 'Tunjangan');
    const tax = amount(row.employee_tax, 'PPh 21 karyawan');
    const employeeBpjs = amount(row.employee_bpjs, 'Potongan BPJS karyawan');
    const employerBpjs = amount(row.employer_bpjs, 'Iuran BPJS perusahaan');
    if (tax + employeeBpjs > gross + allowances) throw new ValidationError('Total potongan karyawan melebihi gaji dan tunjangan.');
    return {
      employee_id: employeeId,
      cost_center_id: row.cost_center_id ? String(row.cost_center_id) : null,
      gross_salary: gross,
      allowances,
      employee_tax: tax,
      employee_bpjs: employeeBpjs,
      employer_bpjs: employerBpjs,
      net_salary: Math.round((gross + allowances - tax - employeeBpjs + Number.EPSILON) * 100) / 100,
    };
  });
}

export class PayrollService {
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
    return rows.map((row) => ({ ...row, employee_name: row.employee_name || partyById.get(row.party_id ?? '')?.display_name || partyById.get(row.party_id ?? '')?.legal_name || row.employee_number }));
  }

  static async createEmployee(companyId: string, tenantId: string | null, userId: string, input: any) {
    const employeeNumber = String(input.employee_number ?? '').trim();
    const employeeName = String(input.employee_name ?? '').trim();
    if (!employeeNumber || !employeeName) throw new ValidationError('Nomor dan nama karyawan wajib diisi.');
    const salary = amount(input.monthly_salary, 'Gaji bulanan', false);
    const costCenterId = String(input.cost_center_id ?? '').trim();
    if (!costCenterId || !await prisma.master_cost_center.findFirst({ where: { id: costCenterId, company_id: companyId, status: 'ACTIVE' }, select: { id: true } })) throw new ValidationError('Pilih cost center aktif milik perusahaan ini.');
    const duplicate = await prisma.master_employee.findFirst({ where: { company_id: companyId, employee_number: employeeNumber } });
    if (duplicate) throw new ConflictError('Nomor karyawan sudah digunakan pada perusahaan ini.');
    return prisma.master_employee.create({ data: {
      id: crypto.randomUUID(), company_id: companyId, tenant_id: tenantId, created_by_id: userId,
      employee_number: employeeNumber, employee_name: employeeName, monthly_salary: salary,
      employment_status: 'ACTIVE', department_id: input.department_id || null, cost_center_id: input.cost_center_id || null,
      party_id: input.party_id || null, standard_hourly_rate: null, user_id: null,
    } });
  }

  static async updateEmployee(companyId: string, employeeId: string, input: any) {
    const employee = await prisma.master_employee.findFirst({ where: { company_id: companyId, id: employeeId } });
    if (!employee) throw new NotFoundError('Karyawan');
    if (input.employee_number && input.employee_number !== employee.employee_number) {
      const duplicate = await prisma.master_employee.findFirst({ where: { company_id: companyId, employee_number: String(input.employee_number), id: { not: employeeId } } });
      if (duplicate) throw new ConflictError('Nomor karyawan sudah digunakan pada perusahaan ini.');
    }
    const data: any = {};
    if (input.employee_number !== undefined) data.employee_number = String(input.employee_number).trim();
    if (input.employee_name !== undefined) data.employee_name = String(input.employee_name).trim();
    if (input.monthly_salary !== undefined) data.monthly_salary = amount(input.monthly_salary, 'Gaji bulanan', false);
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
    return prisma.master_employee.update({ where: { id: employeeId }, data });
  }

  static async listRuns(companyId: string) {
    return prisma.fin_payroll_run.findMany({ where: { company_id: companyId }, include: { lines: true }, orderBy: [{ period_start: 'desc' }, { created_at: 'desc' }], take: 100 });
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
          gross_salary: line.gross_salary, allowances: line.allowances, employee_tax: line.employee_tax,
          employee_bpjs: line.employee_bpjs, employer_bpjs: line.employer_bpjs, net_salary: line.net_salary,
        };
      });
      const grossTotal = lineData.reduce((sum, line) => sum + Number(line.gross_salary) + Number(line.allowances), 0);
      const deductionTotal = lineData.reduce((sum, line) => sum + Number(line.employee_tax) + Number(line.employee_bpjs), 0);
      const employerTotal = lineData.reduce((sum, line) => sum + Number(line.employer_bpjs), 0);
      const netTotal = grossTotal - deductionTotal;
      const number = run?.run_number ?? `PAY-${start.toISOString().slice(0, 7).replace('-', '')}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      const savedRun = runId
        ? await tx.fin_payroll_run.update({ where: { id: runId }, data: { period_start: start, period_end: end, gross_total: grossTotal, deduction_total: deductionTotal, employer_contribution_total: employerTotal, net_total: netTotal } })
        : await tx.fin_payroll_run.create({ data: { id: crypto.randomUUID(), tenant_id: tenantId, company_id: companyId, created_by_id: userId, run_number: number, period_start: start, period_end: end, status: 'DRAFT', gross_total: grossTotal, deduction_total: deductionTotal, employer_contribution_total: employerTotal, net_total: netTotal } });
      await tx.fin_payroll_line.deleteMany({ where: { company_id: companyId, payroll_run_id: savedRun.id } });
      await tx.fin_payroll_line.createMany({ data: lineData.map((line) => ({ ...line, payroll_run_id: savedRun.id })) });
      return tx.fin_payroll_run.findFirst({ where: { id: savedRun.id, company_id: companyId }, include: { lines: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async deleteDraft(companyId: string, runId: string) {
    const run = await prisma.fin_payroll_run.findFirst({ where: { id: runId, company_id: companyId } });
    if (!run) throw new NotFoundError('Payroll run');
    if (run.status !== 'DRAFT') throw new ConflictError('Payroll hanya dapat dihapus saat masih DRAFT.');
    return prisma.fin_payroll_run.delete({ where: { id: runId } });
  }

  static async setStatus(companyId: string, runId: string, userId: string, action: 'SUBMIT' | 'APPROVE') {
    const run = await prisma.fin_payroll_run.findFirst({ where: { id: runId, company_id: companyId } });
    if (!run) throw new NotFoundError('Payroll run');
    if (action === 'SUBMIT') {
      if (run.status !== 'DRAFT') throw new ConflictError('Hanya payroll DRAFT yang dapat diajukan.');
      return prisma.fin_payroll_run.update({ where: { id: runId }, data: { status: 'PENDING_APPROVAL' } });
    }
    if (run.status !== 'PENDING_APPROVAL') throw new ConflictError('Payroll run tidak menunggu persetujuan.');
    if (run.created_by_id === userId) throw new ConflictError('Pembuat payroll tidak boleh menyetujui payroll yang sama.');
    return prisma.fin_payroll_run.update({ where: { id: runId }, data: { status: 'APPROVED', approved_by_id: userId, approved_at: new Date() } });
  }

  static async post(companyId: string, tenantId: string | null, runId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const run = await tx.fin_payroll_run.findFirst({ where: { id: runId, company_id: companyId }, include: { lines: true } });
      if (!run) throw new NotFoundError('Payroll run');
      if (run.status === 'POSTED' && run.journal_entry_id) return run;
      if (run.status !== 'APPROVED') throw new ConflictError('Payroll harus disetujui sebelum diposting.');
      if (run.created_by_id === userId) throw new ConflictError('Pembuat payroll tidak boleh memposting payroll yang sama.');
      if (!run.lines.length) throw new ValidationError('Payroll run tidak memiliki rincian karyawan.');
      const date = new Date(run.period_end);
      const period = await PeriodClosingService.ensureOpenPostingPeriod(tx, date, companyId, tenantId, userId);
      const costCenterIds = [...new Set(run.lines.map((line) => line.cost_center_id).filter((id): id is string => Boolean(id)))];
      const activeCostCenters = await tx.master_cost_center.findMany({ where: { company_id: companyId, id: { in: costCenterIds }, status: 'ACTIVE' }, select: { id: true, cost_center_code: true, cost_center_name: true } });
      if (activeCostCenters.length !== costCenterIds.length) throw new ValidationError('Setiap baris payroll harus memakai cost center aktif milik perusahaan.');
      const employees = await tx.master_employee.findMany({ where: { company_id: companyId, id: { in: run.lines.map((line) => line.employee_id) } }, select: { id: true, department_id: true } });
      const departmentByEmployeeId = new Map(employees.map((employee) => [employee.id, employee.department_id]));
      const [masterDepartments, coreDepartments] = await Promise.all([
        tx.master_department.findMany({ where: { company_id: companyId, status: 'ACTIVE' }, select: { id: true, department_code: true } }),
        (tx as any).core_department.findMany({ where: { company_id: companyId, is_active: true }, select: { id: true, code: true, is_cost_center: true } }).catch(() => []),
      ]);
      const departmentIdsByCode = new Map<string, string[]>();
      for (const department of masterDepartments) {
        const code = String(department.department_code ?? '').trim().toUpperCase();
        if (code) departmentIdsByCode.set(code, [...(departmentIdsByCode.get(code) ?? []), department.id]);
      }
      for (const department of coreDepartments.filter((row: any) => row.is_cost_center !== false)) {
        const code = String(department.code ?? '').trim().toUpperCase();
        if (code) departmentIdsByCode.set(code, [...(departmentIdsByCode.get(code) ?? []), department.id]);
      }
      const defaultDepartmentIdsByCostCenterId = new Map(activeCostCenters.map((center) => [
        center.id,
        departmentIdsByCode.get(String(center.cost_center_code ?? '').trim().toUpperCase()) ?? [],
      ]));
      await FinanceService.ensureStandardCOA(companyId, tx);
      const [expense, salaryPayable, taxPayable, bpjsPayable] = await Promise.all([
        tx.fin_account.findFirst({ where: { company_id: companyId, account_code: '6100', status: 'ACTIVE', account_type: 'EXPENSE' } }),
        tx.fin_account.findFirst({ where: { company_id: companyId, account_code: '2150', status: 'ACTIVE', account_type: 'LIABILITY' } }),
        tx.fin_account.findFirst({ where: { company_id: companyId, account_code: '2160', status: 'ACTIVE', account_type: 'LIABILITY' } }),
        tx.fin_account.findFirst({ where: { company_id: companyId, account_code: '2170', status: 'ACTIVE', account_type: 'LIABILITY' } }),
      ]);
      if (!expense || !salaryPayable || !taxPayable || !bpjsPayable) throw new ValidationError('COA Payroll belum lengkap. Pastikan 6100, 2150, 2160, dan 2170 aktif.');
      const fiscalPeriod = await tx.fin_fiscal_period.findFirst({ where: { id: period.id, company_id: companyId }, select: { fiscal_year_id: true } });
      const budgetLines = fiscalPeriod?.fiscal_year_id ? await tx.fin_budget_line.findMany({
        where: { company_id: companyId, account_id: expense.id, cost_center_id: { in: costCenterIds }, project_id: null, budget: { status: 'ACTIVE', fiscal_year_id: fiscalPeriod.fiscal_year_id } },
        select: { cost_center_id: true, department_id: true, period_allocations: { select: { fiscal_period_id: true, amount: true } } },
      }) : [];
      const uncoveredLines: typeof run.lines = [];
      const budgetDepartmentByEmployeeId = new Map<string, string | null>();
      for (const line of run.lines) {
        const employeeDepartmentId = departmentByEmployeeId.get(line.employee_id) ?? null;
        const candidates = budgetLines.filter((budgetLine) => budgetLine.cost_center_id === line.cost_center_id
          && (!budgetLine.period_allocations.length || budgetLine.period_allocations.some((allocation) => allocation.fiscal_period_id === period.id && Number(allocation.amount) > 0)));
        const inferredDepartments = line.cost_center_id ? defaultDepartmentIdsByCostCenterId.get(line.cost_center_id) ?? [] : [];
        const matching = employeeDepartmentId
          ? candidates.filter((budgetLine) => !budgetLine.department_id || budgetLine.department_id === employeeDepartmentId)
          : candidates.filter((budgetLine) => !budgetLine.department_id || inferredDepartments.includes(budgetLine.department_id));
        if (matching.length) {
          budgetDepartmentByEmployeeId.set(line.employee_id, matching.find((budgetLine) => budgetLine.department_id)?.department_id ?? null);
          continue;
        }
        uncoveredLines.push(line);
      }
      if (uncoveredLines.length) {
        const missing = [...new Set(uncoveredLines.map((line) => {
          const center = activeCostCenters.find((item) => item.id === line.cost_center_id);
          return center ? `${center.cost_center_code} — ${center.cost_center_name}` : String(line.cost_center_id);
        }))];
        throw new ValidationError(`Budget aktif akun 6100 untuk tahun/periode ${String(run.period_end).slice(0, 10)} belum mencakup Cost Center: ${missing.join(', ')}. Cocokkan akun, Cost Center, departemen karyawan, dan alokasi periode.`);
      }
      const journalBook = await FinanceService.ensureJournal(companyId, 'GJ', 'General Journal', 'GENERAL', tx);
      const doc = await FinanceDocumentService.ensure(tx, { tenantId, companyId, userId, documentType: 'PAYROLL', documentNumber: run.run_number, documentDate: run.period_end, postingDate: date, status: 'POSTED' });
      const journalId = crypto.randomUUID();
      await tx.fin_journal_entry.create({ data: { id: journalId, tenant_id: tenantId, company_id: companyId, created_by_id: userId, journal_id: journalBook.id, fiscal_period_id: period.id, entry_number: run.run_number, posting_date: date, description: `Akrual payroll ${run.run_number}`, source_document_id: doc.id, status: 'POSTED' } });
      const journalLines: any[] = run.lines.map((line) => ({ id: crypto.randomUUID(), tenant_id: tenantId, company_id: companyId, created_by_id: userId, journal_entry_id: journalId, account_id: expense.id, cost_center_id: line.cost_center_id, department_id: budgetDepartmentByEmployeeId.get(line.employee_id) ?? departmentByEmployeeId.get(line.employee_id) ?? null, debit_base: new Prisma.Decimal(Number(line.gross_salary) + Number(line.allowances) + Number(line.employer_bpjs)), credit_base: new Prisma.Decimal(0), transaction_amount: new Prisma.Decimal(Number(line.gross_salary) + Number(line.allowances) + Number(line.employer_bpjs)) }));
      const taxTotal = run.lines.reduce((sum, line) => sum + Number(line.employee_tax), 0);
      const bpjsTotal = run.lines.reduce((sum, line) => sum + Number(line.employee_bpjs) + Number(line.employer_bpjs), 0);
      journalLines.push({ id: crypto.randomUUID(), tenant_id: tenantId, company_id: companyId, created_by_id: userId, journal_entry_id: journalId, account_id: salaryPayable.id, credit_base: new Prisma.Decimal(Number(run.net_total)), debit_base: new Prisma.Decimal(0), transaction_amount: new Prisma.Decimal(Number(run.net_total)) });
      if (taxTotal) journalLines.push({ id: crypto.randomUUID(), tenant_id: tenantId, company_id: companyId, created_by_id: userId, journal_entry_id: journalId, account_id: taxPayable.id, credit_base: new Prisma.Decimal(taxTotal), debit_base: new Prisma.Decimal(0), transaction_amount: new Prisma.Decimal(taxTotal) });
      if (bpjsTotal) journalLines.push({ id: crypto.randomUUID(), tenant_id: tenantId, company_id: companyId, created_by_id: userId, journal_entry_id: journalId, account_id: bpjsPayable.id, credit_base: new Prisma.Decimal(bpjsTotal), debit_base: new Prisma.Decimal(0), transaction_amount: new Prisma.Decimal(bpjsTotal) });
      await tx.fin_journal_line.createMany({ data: journalLines });
      const journal = { id: journalId, tenant_id: tenantId, company_id: companyId, fiscal_period_id: period.id, posting_date: date, description: `Akrual payroll ${run.run_number}`, created_by_id: userId };
      await BudgetingService.recordJournalActuals(tx, journal, journalLines);
      await FinanceDocumentService.markPosted(tx, doc.id, userId, date);
      return tx.fin_payroll_run.update({ where: { id: run.id }, data: { status: 'POSTED', journal_entry_id: journalId } });
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
      return tx.fin_payroll_run.update({ where: { id: run.id }, data: { status: 'PAID', payment_date: date, bank_account_id: bank.id, payment_journal_entry_id: journalId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 30000 });
  }
}
