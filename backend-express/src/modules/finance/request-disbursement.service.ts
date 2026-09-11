import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ValidationError, NotFoundError } from '../../utils/errors';
import { PeriodClosingService } from './period-closing.service';

/** Records an externally executed advance; this command does not initiate a bank transfer. */
export async function postRequestDisbursement(requestId: string, bankId: string, reference: string, userId: string, companyId: string) {
  if (!bankId || !reference.trim()) throw new ValidationError('Rekening bank dan referensi pencairan aktual wajib diisi.');
  const date = new Date();
  await PeriodClosingService.assertPeriodOpen(date, companyId);
  return prisma.$transaction(async tx => {
    const instance = await tx.core_workflow_instance.findFirst({ where: { id: requestId, company_id: companyId } });
    if (!instance) throw new NotFoundError('Request');
    const prior = await tx.fin_payment.findFirst({ where: { document_id: requestId, company_id: companyId, payment_type: 'REQUEST_ADVANCE', status: 'POSTED' } });
    if (prior && instance.current_state === 'DISBURSED') return { id: requestId, status: 'DISBURSED', disbursement: { payment_id: prior.id, journal_entry_id: prior.journal_entry_id, reference_number: prior.reference_number, account_id: prior.bank_account_id } };
    if (instance.current_state !== 'REGISTERED' || instance.workflow_code !== 'INTERNAL_FUND_REQUEST') throw new ValidationError('Hanya FUND_REQUEST yang disetujui dapat dicairkan.');
    const approval = await tx.core_workflow_approval.findFirst({ where: { company_id: companyId, workflow_instance_id: requestId, decision: 'APPROVED', approval_level: 'EXECUTIVE_PM' } });
    if (!approval) throw new ValidationError('Bukti approval executive tidak ditemukan.');
    const source = await tx.core_audit_event.findFirst({ where: { company_id: companyId, entity_id: requestId, entity_name: 'core_internal_request', event_type: 'CREATE_REQUEST' }, orderBy: { occurred_at: 'asc' } });
    const payload = source?.after_data as Record<string, unknown> | undefined;
    const amountNumber = Number(payload?.amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) throw new ValidationError('Nominal request tersimpan tidak valid.');
    const bank = await tx.fin_bank_account.findFirst({ where: { id: bankId, company_id: companyId, status: 'ACTIVE' } });
    const bankLedger = await tx.fin_account.findFirst({ where: { id: bank?.ledger_account_id ?? '', company_id: companyId, status: 'ACTIVE' } });
    const advance = await tx.fin_account.findFirst({ where: { company_id: companyId, account_code: '1140', status: 'ACTIVE' } });
    if (!bank || !bankLedger || !advance || bankLedger.id === advance.id) throw new ValidationError('Akun bank dan uang muka 1140 harus valid dan berbeda.');
    if (await tx.fin_payment.findFirst({ where: { company_id: companyId, reference_number: reference.trim() } })) throw new ValidationError('Referensi pencairan telah digunakan.');
    const period = await tx.fin_fiscal_period.findFirst({ where: { company_id: companyId, start_date: { lte: date }, end_date: { gte: date } } });
    if (!period || ['CLOSED', 'LOCKED'].includes(period.status)) throw new ValidationError('Periode fiskal terbuka wajib tersedia.');
    const amount = new Prisma.Decimal(amountNumber);
    const scope = { company_id: companyId, tenant_id: instance.tenant_id, created_by_id: userId };
    const journalBook = await tx.fin_journal.findFirst({ where: { company_id: companyId, journal_code: 'GJ', status: 'ACTIVE' } })
      ?? await tx.fin_journal.create({ data: { ...scope, journal_code: 'GJ', journal_name: 'General Journal', journal_type: 'GENERAL', status: 'ACTIVE' } });
    const journal = await tx.fin_journal_entry.create({ data: { ...scope, journal_id: journalBook.id, entry_number: `ADV-${requestId}`, posting_date: date, fiscal_period_id: period.id, description: `Pencairan request ${requestId}`, source_document_id: requestId, status: 'POSTED' } });
    await tx.fin_journal_line.createMany({ data: [
      { ...scope, journal_entry_id: journal.id, account_id: advance.id, debit_base: amount, credit_base: 0 },
      { ...scope, journal_entry_id: journal.id, account_id: bankLedger.id, debit_base: 0, credit_base: amount },
    ] });
    const payment = await tx.fin_payment.create({ data: { ...scope, document_id: requestId, bank_account_id: bank.id, payment_type: 'REQUEST_ADVANCE', payment_date: date, amount, payment_method: 'BANK_TRANSFER', reference_number: reference.trim(), journal_entry_id: journal.id, status: 'POSTED', allocation_plan: { request_id: requestId }, approved_by_id: approval.approver_user_id, approved_at: approval.decided_at, executed_by_id: userId, executed_at: date, execution_reference: reference.trim(), execution_note: 'Request advance; settlement through LPJ remains separate.', failure_reason: '' } });
    const disbursement = { payment_id: payment.id, journal_entry_id: journal.id, account_id: bank.id, reference_number: reference.trim(), disbursed_by_id: userId, disbursed_at: date.toISOString() };
    await tx.core_workflow_instance.update({ where: { id: requestId }, data: { current_state: 'DISBURSED' } });
    await tx.core_audit_event.create({ data: { ...scope, user_id: userId, entity_name: 'core_internal_request', entity_id: requestId, event_type: 'DISBURSE_FUND', before_data: { status: 'REGISTERED' }, after_data: { status: 'DISBURSED', disbursement }, occurred_at: date } });
    return { id: requestId, status: 'DISBURSED', disbursement };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
