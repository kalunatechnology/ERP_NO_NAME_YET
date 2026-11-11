import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors';
import { BudgetingService } from './budgeting.service';

const toDate = (value: unknown, label: string) => {
  const date = value instanceof Date ? value : new Date(String(value ?? ''));
  if (!Number.isFinite(date.getTime())) throw new ValidationError(`${label} tidak valid.`);
  return date;
};
const money = (value: unknown) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError('Nominal biaya berulang harus lebih dari nol.');
  return new Prisma.Decimal(amount.toFixed(2));
};
const monthKey = (date: Date) => `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
const addMonth = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
const monthEnd = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));

export class RecurringExpenseService {
  static list(companyId: string) {
    return prisma.fin_recurring_payment_rule.findMany({ where: { company_id: companyId }, orderBy: [{ status: 'asc' }, { next_run_date: 'asc' }] });
  }

  static async listRuns(companyId: string) {
    const runs = await prisma.fin_recurring_payment_run.findMany({ where: { company_id: companyId }, orderBy: [{ scheduled_date: 'desc' }, { created_at: 'desc' }], take: 200 });
    const billIds = runs.map((run) => run.billing_document_id).filter((id): id is string => Boolean(id));
    const bills = billIds.length ? await prisma.fin_billing_document.findMany({ where: { company_id: companyId, id: { in: billIds } }, select: { id: true, invoice_number: true, status: true, total_amount: true } }) : [];
    const billMap = new Map(bills.map((bill) => [bill.id, bill]));
    return runs.map((run) => ({ ...run, billing_document: run.billing_document_id ? billMap.get(run.billing_document_id) ?? null : null }));
  }

  static async save(companyId: string, tenantId: string | null, userId: string, input: any, id?: string) {
    const ruleCode = String(input.rule_code ?? '').trim().toUpperCase();
    const description = String(input.description ?? '').trim();
    const recurrence = String(input.recurrence_rule ?? 'MONTHLY').toUpperCase();
    if (!ruleCode || !description) throw new ValidationError('Kode aturan dan nama biaya wajib diisi.');
    if (!['MONTHLY', 'QUARTERLY', 'YEARLY'].includes(recurrence)) throw new ValidationError('Frekuensi harus bulanan, triwulanan, atau tahunan.');
    const amount = money(input.amount);
    const partyId = String(input.party_id ?? '').trim();
    const accountId = String(input.expense_account_id ?? '').trim();
    const allocationId = String(input.budget_allocation_id ?? '').trim();
    const projectId = String(input.project_id ?? '').trim() || null;
    const costCenterId = String(input.cost_center_id ?? '').trim() || null;
    if (!partyId || !accountId || !allocationId) throw new ValidationError('Vendor, akun beban, dan alokasi anggaran wajib dipilih.');
    const [party, account, allocation] = await Promise.all([
      prisma.master_party.findFirst({ where: { id: partyId, company_id: companyId, status: 'ACTIVE' }, select: { id: true, party_type: true } }),
      prisma.fin_account.findFirst({ where: { id: accountId, company_id: companyId, status: 'ACTIVE', account_type: 'EXPENSE' }, select: { id: true } }),
      prisma.fin_budget_line.findFirst({ where: { id: allocationId, company_id: companyId, budget: { status: 'ACTIVE' } }, select: { id: true, account_id: true, project_id: true, cost_center_id: true } }),
    ]);
    const vendorRole = party && !['VENDOR', 'SUPPLIER'].includes(String(party.party_type).toUpperCase())
      ? await prisma.master_party_role.findFirst({ where: { company_id: companyId, party_id: party.id, active: true, role_type: { in: ['VENDOR', 'SUPPLIER'] } }, select: { id: true } })
      : party;
    if (!party || !vendorRole) throw new NotFoundError('Vendor aktif');
    if (!account) throw new NotFoundError('Akun beban aktif');
    if (!allocation || allocation.account_id !== account.id || String(allocation.project_id ?? '') !== String(projectId ?? '')) throw new ValidationError('Alokasi harus aktif dan cocok dengan akun serta proyek yang dipilih.');
    if (costCenterId && allocation.cost_center_id !== costCenterId) throw new ValidationError('Cost center aturan tidak sama dengan alokasi anggarannya.');
    const nextRunDate = toDate(input.next_run_date, 'Tanggal biaya berikutnya');
    const endDate = input.end_date ? toDate(input.end_date, 'Tanggal akhir') : null;
    if (endDate && endDate < nextRunDate) throw new ValidationError('Tanggal akhir harus sama atau setelah tanggal biaya berikutnya.');
    const taxIds = [input.input_tax_code_id].filter(Boolean).map(String);
    const taxCodes = taxIds.length ? await prisma.master_tax_code.findMany({ where: { id: { in: taxIds }, company_id: companyId, status: 'ACTIVE' } }) : [];
    if (taxCodes.length !== new Set(taxIds).size) throw new ValidationError('Kode pajak tidak aktif atau bukan milik perusahaan ini.');
    const inputTax = taxCodes.find((row) => row.id === input.input_tax_code_id);
    if (inputTax && String(inputTax.tax_direction ?? '').toUpperCase() !== 'INPUT_VAT') throw new ValidationError('Kode pajak masukan harus bertipe INPUT_VAT.');
    const duplicate = await prisma.fin_recurring_payment_rule.findFirst({ where: { company_id: companyId, rule_code: ruleCode, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
    if (duplicate) throw new ConflictError('Kode aturan biaya berulang sudah digunakan.');
    const data = {
      tenant_id: tenantId, company_id: companyId, created_by_id: userId, rule_code: ruleCode, description,
      party_id: partyId, expense_account_id: accountId, project_id: projectId, cost_center_id: costCenterId,
      budget_allocation_id: allocationId, input_tax_code_id: input.input_tax_code_id || null,
      amount, recurrence_rule: recurrence,
      next_run_date: nextRunDate, end_date: endDate, approval_required: true, status: String(input.status ?? 'ACTIVE').toUpperCase(),
    };
    if (!['ACTIVE', 'INACTIVE'].includes(data.status)) throw new ValidationError('Status aturan harus ACTIVE atau INACTIVE.');
    if (id) {
      const existing = await prisma.fin_recurring_payment_rule.findFirst({ where: { id, company_id: companyId }, select: { id: true } });
      if (!existing) throw new NotFoundError('Aturan biaya berulang');
      return prisma.fin_recurring_payment_rule.update({ where: { id: existing.id }, data });
    }
    return prisma.fin_recurring_payment_rule.create({ data });
  }

  static async generate(companyId: string, tenantId: string | null, userId: string, throughValue?: unknown) {
    const through = throughValue ? toDate(throughValue, 'Periode generate') : new Date();
    const endOfMonth = monthEnd(through);
    const rules = await prisma.fin_recurring_payment_rule.findMany({ where: { company_id: companyId, status: 'ACTIVE', next_run_date: { lte: endOfMonth } }, orderBy: { next_run_date: 'asc' } });
    const generated: any[] = [];
    for (const rule of rules) {
      let scheduled = rule.next_run_date ? new Date(rule.next_run_date) : null;
      if (!scheduled) continue;
      while (scheduled <= endOfMonth && (!rule.end_date || scheduled <= rule.end_date)) {
        const scheduledDate = new Date(Date.UTC(scheduled.getUTCFullYear(), scheduled.getUTCMonth(), scheduled.getUTCDate()));
        const number = `RCR-${rule.rule_code}-${monthKey(scheduledDate)}`;
        const runKey = `${rule.id}:${monthKey(scheduledDate)}`;
        const existingRun = await prisma.fin_recurring_payment_run.findFirst({ where: { run_key: runKey }, select: { id: true, billing_document_id: true } });
        if (!existingRun) {
          const amount = new Prisma.Decimal(Number(rule.amount ?? 0));
          const inputTax = rule.input_tax_code_id ? await prisma.master_tax_code.findFirst({ where: { id: rule.input_tax_code_id, company_id: companyId, status: 'ACTIVE' } }) : null;
          if (inputTax && ((inputTax.effective_from && inputTax.effective_from > scheduledDate) || (inputTax.effective_to && inputTax.effective_to < scheduledDate))) {
            throw new ValidationError(`Kode pajak aturan ${rule.rule_code} tidak berlaku pada tanggal tagihan.`);
          }
          const rate = Number(inputTax?.tax_rate ?? 0);
          const taxAmount = new Prisma.Decimal((Number(amount) * rate / 100).toFixed(2));
          if (Number(amount) <= 0 || (inputTax && !inputTax.input_account_id)) throw new ValidationError(`Pemetaan pajak aturan ${rule.rule_code} belum lengkap.`);
          const total = amount.add(taxAmount);
          let billId = '';
          try {
            await prisma.$transaction(async (tx) => {
              const bill = await tx.fin_billing_document.create({ data: {
                id: crypto.randomUUID(), tenant_id: tenantId, company_id: companyId, created_by_id: userId, party_id: rule.party_id,
                project_id: rule.project_id, billing_type: 'SUPPLIER_INVOICE', invoice_number: number,
                invoice_date: scheduledDate, due_date: scheduledDate, subtotal: amount, tax_amount: taxAmount, total_amount: total,
                paid_amount: new Prisma.Decimal(0), outstanding_amount: total, payment_status: 'UNPAID', status: 'DRAFT', rejection_reason: '',
              } });
              billId = bill.id;
              await tx.fin_billing_document_line.create({ data: {
                id: crypto.randomUUID(), tenant_id: tenantId, company_id: companyId, created_by_id: userId, billing_document_id: bill.id,
                account_id: rule.expense_account_id, project_id: rule.project_id, cost_center_id: rule.cost_center_id,
                quantity: new Prisma.Decimal(1), unit_price: amount, discount_amount: new Prisma.Decimal(0),
                tax_code_id: rule.input_tax_code_id, line_total: amount,
              } });
              await tx.fin_recurring_payment_run.create({ data: {
                id: crypto.randomUUID(), tenant_id: tenantId, company_id: companyId, created_by_id: userId, recurring_rule_id: rule.id,
                billing_document_id: bill.id, run_key: runKey, scheduled_date: scheduledDate, run_status: 'DRAFT_GENERATED', failure_reason: '',
              } });
            }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
            const period = await prisma.fin_fiscal_period.findFirst({ where: { company_id: companyId, start_date: { lte: scheduledDate }, end_date: { gte: scheduledDate } }, select: { id: true } });
            const allocationAmount = inputTax?.is_recoverable === false ? amount.add(taxAmount) : amount;
            await BudgetingService.createReservation(companyId, tenantId, userId, {
              allocation_id: rule.budget_allocation_id, source_type: 'INVOICE', source_id: billId,
              amount: allocationAmount, fiscal_period_id: period?.id ?? null, description: `Biaya berulang ${rule.description} (${number})`,
            });
            generated.push({ id: billId, invoice_number: number, scheduled_date: scheduledDate, status: 'DRAFT' });
          } catch (error) {
            if (billId) await prisma.$transaction(async (tx) => {
              await tx.fin_recurring_payment_run.deleteMany({ where: { company_id: companyId, billing_document_id: billId } });
              await tx.fin_billing_document_line.deleteMany({ where: { company_id: companyId, billing_document_id: billId } });
              await tx.fin_billing_document.deleteMany({ where: { company_id: companyId, id: billId, status: 'DRAFT' } });
            }).catch(() => undefined);
            throw error;
          }
        }
        if (rule.recurrence_rule === 'MONTHLY') scheduled = addMonth(scheduled);
        else if (rule.recurrence_rule === 'QUARTERLY') scheduled = new Date(Date.UTC(scheduled.getUTCFullYear(), scheduled.getUTCMonth() + 3, 1));
        else scheduled = new Date(Date.UTC(scheduled.getUTCFullYear() + 1, scheduled.getUTCMonth(), 1));
      }
      if (scheduled.getTime() !== new Date(rule.next_run_date ?? scheduled).getTime()) {
        await prisma.fin_recurring_payment_rule.update({ where: { id: rule.id }, data: { next_run_date: scheduled, ...(rule.end_date && scheduled > rule.end_date ? { status: 'INACTIVE' } : {}) } });
      }
    }
    return generated;
  }
}
