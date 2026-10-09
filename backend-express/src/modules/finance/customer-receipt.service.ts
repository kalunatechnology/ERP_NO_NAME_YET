import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import prisma from '../../config/database';
import { AccountingError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import { FinanceService } from './finance.service';
import { FinanceDocumentService } from './finance-document.service';
import { PeriodClosingService } from './period-closing.service';

export class CustomerReceiptService {
  static assertReviewer(payment: { created_by_id?: string | null; submitted_by_id?: string | null }, userId: string) {
    if (!userId) throw new ValidationError('User penerimaan tidak valid.');
    const makerId = payment.created_by_id || payment.submitted_by_id;
    if (makerId === userId) {
      throw new ForbiddenError('Finance pembuat tidak dapat menyetujui atau memposting penerimaan sendiri. Gunakan Finance kedua untuk Setujui & Posting.');
    }
  }

  /** Finance A creates/submits; Finance B approves and posts in one transaction. */
  static async approveAndPost(paymentId: string, userId: string, companyId: string) {
    return prisma.$transaction(async tx => {
      const payment = await tx.fin_payment.findFirst({ where: { id: paymentId, company_id: companyId, payment_type: 'CUSTOMER_RECEIPT' } });
      if (!payment) throw new NotFoundError('Penerimaan pelanggan');
      this.assertReviewer(payment, userId);
      if (payment.status === 'SUBMITTED') {
        const approved = await tx.fin_payment.updateMany({
          where: { id: payment.id, company_id: companyId, status: 'SUBMITTED' },
          data: { status: 'APPROVED', approved_by_id: userId, approved_at: new Date() },
        });
        if (approved.count !== 1) throw new ConflictError('Status penerimaan berubah. Muat ulang sebelum Setujui & Posting.');
      } else if (!['APPROVED', 'POSTED'].includes(payment.status)) {
        throw new ConflictError('Penerimaan harus diajukan sebelum Setujui & Posting.');
      }
      return this.postInTransaction(tx, paymentId, userId, companyId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 30000 });
  }

  /** All accounting effects and the terminal state commit together, once. */
  static async post(paymentId: string, userId: string, companyId: string) {
    if (!userId) throw new ValidationError('User posting tidak valid.');
    return prisma.$transaction(tx => this.postInTransaction(tx, paymentId, userId, companyId), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 30000 });
  }

  private static async postInTransaction(tx: Prisma.TransactionClient, paymentId: string, userId: string, companyId: string) {
      const payment = await tx.fin_payment.findFirst({ where: { id: paymentId, company_id: companyId } });
      if (!payment || payment.payment_type !== 'CUSTOMER_RECEIPT') throw new NotFoundError('Penerimaan pelanggan');
      this.assertReviewer(payment, userId);
      if (payment.status === 'POSTED' && payment.journal_entry_id) return payment;
      if (payment.status !== 'APPROVED') throw new ConflictError('Hanya penerimaan APPROVED yang dapat diposting.');
      const amount = new Decimal(payment.amount ?? 0);
      if (!amount.isFinite() || amount.lt(1000)) throw new ValidationError('Nominal penerimaan minimal Rp 1.000.');
      if (!payment.reference_number.trim() || !payment.payment_date) throw new ValidationError('Tanggal penerimaan dan nomor bukti wajib diisi sebelum posting.');
      const postingDate = payment.payment_date;
      const scope = { company_id: companyId, tenant_id: payment.tenant_id };
      const bank = await tx.fin_bank_account.findFirst({ where: { ...scope, id: payment.bank_account_id ?? '', status: 'ACTIVE' } });
      const bankLedger = bank?.ledger_account_id
        ? await tx.fin_account.findFirst({ where: { company_id: companyId, id: bank.ledger_account_id, status: 'ACTIVE' } }) : null;
      if (!bankLedger || bankLedger.account_type !== 'ASSET' || bankLedger.normal_balance !== 'DEBIT') {
        throw new AccountingError('Rekening penerima harus terhubung ke ledger kas / bank aktif bertipe aset dan saldo normal debit.');
      }
      const company = await tx.core_company.findFirst({ where: { id: companyId } });
      const baseCurrency = company?.base_currency_id;
      for (const currency of [payment.currency_id, bank?.currency_id]) {
        if (currency && currency !== baseCurrency) throw new ValidationError('Posting valuta asing memerlukan konversi kurs; gunakan rekening dan transaksi dalam mata uang dasar perusahaan.');
      }
      const plan = (payment.allocation_plan ?? {}) as Record<string, any>;
      const allocations = await tx.fin_payment_allocation.findMany({ where: { ...scope, payment_id: payment.id } });
      const targets = new Map<string, Decimal>();
      for (const allocation of allocations) {
        if (!allocation.billing_document_id || allocation.schedule_id || Number(allocation.discount_amount ?? 0) || Number(allocation.write_off_amount ?? 0) || Number(allocation.exchange_difference ?? 0)) {
          throw new ValidationError('Alokasi penerimaan harus berupa pembayaran invoice tanpa diskon, penghapusan, selisih kurs, atau jadwal cicilan.');
        }
        const allocated = new Decimal(allocation.allocated_amount ?? 0);
        if (!allocated.isFinite() || allocated.lte(0)) throw new ValidationError('Nominal alokasi invoice harus lebih dari nol.');
        targets.set(allocation.billing_document_id, (targets.get(allocation.billing_document_id) ?? new Decimal(0)).plus(allocated));
      }
      let createAllocation = false;
      if (!allocations.length && (plan.invoice_id || String(plan.invoice_ref ?? '').trim())) {
        const matches = await tx.fin_billing_document.findMany({ where: {
          ...scope, billing_type: 'CUSTOMER_INVOICE',
          ...(plan.invoice_id ? { id: String(plan.invoice_id) } : { invoice_number: String(plan.invoice_ref).trim() }),
        }, take: 2 });
        if (matches.length !== 1) throw new ValidationError('Invoice penerimaan tidak ditemukan atau ambigu pada company ini. Pilih invoice pelanggan yang valid.');
        targets.set(matches[0].id, amount);
        createAllocation = true;
      }
      if (targets.size && !Array.from(targets.values()).reduce((sum, value) => sum.plus(value), new Decimal(0)).equals(amount)) {
        throw new ValidationError('Total alokasi invoice harus sama dengan nominal penerimaan.');
      }
      let partyId = payment.party_id;
      const bills: Array<{ bill: any; allocated: Decimal; paid: Decimal; outstanding: Decimal }> = [];
      for (const [id, allocated] of targets) {
        const bill = await tx.fin_billing_document.findFirst({ where: { ...scope, id, billing_type: 'CUSTOMER_INVOICE', status: 'POSTED' } });
        if (!bill) throw new ValidationError('Penerimaan hanya dapat melunasi invoice pelanggan yang sudah POSTED pada company ini.');
        if (bill.currency_id && bill.currency_id !== baseCurrency) throw new ValidationError('Invoice harus menggunakan mata uang dasar perusahaan.');
        if (partyId && bill.party_id !== partyId) throw new ValidationError('Klien pada invoice berbeda dari penerimaan.');
        partyId = bill.party_id;
        const paid = new Decimal(bill.paid_amount ?? 0).plus(allocated);
        const outstanding = new Decimal(bill.total_amount ?? 0).minus(paid);
        if (outstanding.lt(0)) throw new ConflictError('Nominal penerimaan melebihi sisa piutang invoice.');
        bills.push({ bill, allocated, paid, outstanding });
      }
      const coa = await FinanceService.ensureStandardCOA(companyId, tx);
      const creditAccount = coa.get(targets.size ? '1130' : '2140');
      if (!creditAccount || creditAccount.status !== 'ACTIVE' || creditAccount.account_type !== (targets.size ? 'ASSET' : 'LIABILITY') || creditAccount.normal_balance !== (targets.size ? 'DEBIT' : 'CREDIT')) {
        throw new AccountingError('Akun Piutang Usaha / Uang Muka Pelanggan tidak aktif atau tipe akunnya tidak sesuai.');
      }
      if (creditAccount.id === bankLedger.id) throw new AccountingError('Ledger rekening penerima harus berbeda dari akun piutang / uang muka pelanggan.');
      const period = await PeriodClosingService.ensureOpenPostingPeriod(tx, postingDate, companyId, payment.tenant_id, userId);
      const journal = await tx.fin_journal.findFirst({ where: { company_id: companyId, journal_code: 'GJ', status: 'ACTIVE' } })
        ?? await tx.fin_journal.create({ data: { ...scope, id: crypto.randomUUID(), created_by_id: userId, journal_code: 'GJ', journal_name: 'General Journal', journal_type: 'GENERAL', status: 'ACTIVE' } });
      const document = await FinanceDocumentService.ensure(tx, {
        tenantId: payment.tenant_id, companyId, userId, existingDocumentId: payment.document_id,
        documentType: 'CUSTOMER_RECEIPT', documentNumber: `RCPT-${payment.id}`, documentDate: postingDate, status: 'APPROVED',
      });
      const journalEntryId = crypto.randomUUID();
      await tx.fin_journal_entry.create({ data: {
        ...scope, id: journalEntryId, created_by_id: userId, journal_id: journal.id, fiscal_period_id: period.id,
        entry_number: `RCPT-${payment.id}`, posting_date: postingDate, description: `Penerimaan pelanggan ${payment.reference_number}`,
        source_document_id: document.id, status: 'POSTED',
      } });
      await tx.fin_journal_line.createMany({ data: [
        { ...scope, id: crypto.randomUUID(), created_by_id: userId, journal_entry_id: journalEntryId, account_id: bankLedger.id, party_id: partyId, debit_base: amount, credit_base: new Decimal(0), transaction_amount: amount },
        { ...scope, id: crypto.randomUUID(), created_by_id: userId, journal_entry_id: journalEntryId, account_id: creditAccount.id, party_id: partyId, debit_base: new Decimal(0), credit_base: amount, transaction_amount: amount },
      ] });
      for (const { bill, allocated, paid, outstanding } of bills) {
        if (createAllocation) await tx.fin_payment_allocation.create({ data: {
          ...scope, id: crypto.randomUUID(), created_by_id: userId, payment_id: payment.id, billing_document_id: bill.id, allocated_amount: allocated,
        } });
        await tx.fin_billing_document.update({ where: { id: bill.id }, data: {
          paid_amount: paid, outstanding_amount: outstanding, payment_status: outstanding.isZero() ? 'PAID' : 'PARTIALLY_PAID',
        } });
      }
      await FinanceDocumentService.markPosted(tx, document.id, userId, postingDate);
      return tx.fin_payment.update({ where: { id: payment.id }, data: {
        status: 'POSTED', document_id: document.id, journal_entry_id: journalEntryId, party_id: partyId,
        executed_by_id: userId, executed_at: new Date(), execution_reference: payment.reference_number,
      } });
  }
}
