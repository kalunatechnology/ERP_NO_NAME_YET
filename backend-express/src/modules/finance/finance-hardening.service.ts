import crypto from 'crypto';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { AccountingError, ConflictError, NotFoundError, ValidationError } from '../../utils/errors';
import { PeriodClosingService } from './period-closing.service';
import { FinanceService } from './finance.service';

type PaymentInput = {
  amount: number;
  bank_account_id: string;
  payment_date: Date;
  reference_number: string;
  payment_method?: string;
  description?: string;
};

type BillingIssueInput = {
  invoice_number?: string;
  invoice_date?: Date;
  due_date?: Date;
  currency_id?: string;
  payment_term_id?: string;
};

export class FinanceHardeningService {
  private static async fiscalPeriodId(tx: Prisma.TransactionClient, companyId: string, date: Date) {
    const period = await tx.fin_fiscal_period.findFirst({
      where: { company_id: companyId, start_date: { lte: date }, end_date: { gte: date } },
      select: { id: true, status: true },
    });
    if (period && ['CLOSED', 'LOCKED'].includes(period.status)) {
      throw new AccountingError(`Periode fiskal berstatus ${period.status} dan tidak dapat menerima posting.`);
    }
    return period?.id ?? null;
  }

  private static async journal(tx: Prisma.TransactionClient, companyId: string, tenantId: string | null, userId: string) {
    const existing = await tx.fin_journal.findFirst({ where: { company_id: companyId, journal_code: 'GJ' } });
    if (existing) return existing;
    return tx.fin_journal.create({
      data: {
        id: crypto.randomUUID(), tenant_id: tenantId, company_id: companyId, created_by_id: userId,
        journal_code: 'GJ', journal_name: 'General Journal', journal_type: 'GENERAL', status: 'ACTIVE',
      },
    });
  }

  static async validateProjectCostEntry(entryId: string, userId: string, companyId: string) {
    return prisma.$transaction(async (tx) => {
      const entry = await tx.fin_project_cost_entry.findFirst({ where: { id: entryId, company_id: companyId } });
      if (!entry) throw new NotFoundError('ProjectCostEntry');
      if (entry.status === 'VALIDATED') return entry;
      if (entry.status !== 'DRAFT') throw new ConflictError(`Cost entry berstatus ${entry.status}; hanya DRAFT yang dapat divalidasi.`);
      if (Number(entry.total_cost) <= 0) throw new ValidationError('Nilai cost entry harus lebih dari 0.');
      const project = await tx.project_project.findFirst({ where: { id: entry.project_id, company_id: companyId }, select: { id: true } });
      if (!project) throw new ValidationError('Project cost entry tidak berada pada project company aktif.');
      return tx.fin_project_cost_entry.update({
        where: { id: entry.id },
        data: { status: 'VALIDATED', validated_by_id: userId, validated_at: new Date(), validation_note: 'Validated through finance command' },
      });
    });
  }

  static async postProjectCostEntryToWip(entryId: string, creditAccountId: string, userId: string, companyId: string) {
    if (!creditAccountId) throw new ValidationError('credit_account_id wajib diisi agar sumber posting dapat dibuktikan.');
    await FinanceService.ensureStandardCOA(companyId);
    const postingDate = new Date();
    await PeriodClosingService.assertPeriodOpen(postingDate, companyId);

    return prisma.$transaction(async (tx) => {
      const entry = await tx.fin_project_cost_entry.findFirst({ where: { id: entryId, company_id: companyId } });
      if (!entry) throw new NotFoundError('ProjectCostEntry');
      if (entry.status === 'POSTED_TO_WIP' && entry.journal_entry_id) return entry;
      if (entry.status !== 'VALIDATED') throw new ConflictError('Cost entry harus berstatus VALIDATED sebelum diposting ke WIP.');

      const [wipAccount, creditAccount, project] = await Promise.all([
        tx.fin_account.findFirst({ where: { company_id: companyId, account_code: '1150', status: 'ACTIVE' } }),
        tx.fin_account.findFirst({ where: { company_id: companyId, id: creditAccountId, status: 'ACTIVE' } }),
        tx.project_project.findFirst({ where: { company_id: companyId, id: entry.project_id }, select: { id: true } }),
      ]);
      if (!wipAccount) throw new AccountingError('Akun WIP 1150 belum tersedia. Jalankan setup standard COA.');
      if (!creditAccount) throw new ValidationError('Akun sumber kredit tidak valid untuk company aktif.');
      if (!project) throw new ValidationError('Project cost entry tidak valid untuk company aktif.');

      const amount = Number(entry.total_cost);
      if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError('Nilai cost entry harus lebih dari 0.');
      const periodId = await this.fiscalPeriodId(tx, companyId, postingDate);
      const journal = await this.journal(tx, companyId, entry.tenant_id, userId);
      const journalEntryId = crypto.randomUUID();
      await tx.fin_journal_entry.create({
        data: {
          id: journalEntryId, tenant_id: entry.tenant_id, company_id: companyId, created_by_id: userId,
          journal_id: journal.id, fiscal_period_id: periodId, entry_number: `WIP-${entry.id.slice(0, 8)}`,
          posting_date: postingDate, description: `Posting WIP: ${entry.description}`,
          source_document_id: entry.id, status: 'POSTED',
        },
      });
      await tx.fin_journal_line.createMany({ data: [
        {
          id: crypto.randomUUID(), tenant_id: entry.tenant_id, company_id: companyId, created_by_id: userId,
          journal_entry_id: journalEntryId, account_id: wipAccount.id, project_id: entry.project_id,
          debit_base: new Decimal(amount), credit_base: new Decimal(0), transaction_amount: new Decimal(amount),
        },
        {
          id: crypto.randomUUID(), tenant_id: entry.tenant_id, company_id: companyId, created_by_id: userId,
          journal_entry_id: journalEntryId, account_id: creditAccount.id, project_id: entry.project_id,
          debit_base: new Decimal(0), credit_base: new Decimal(amount), transaction_amount: new Decimal(amount),
        },
      ] });
      return tx.fin_project_cost_entry.update({
        where: { id: entry.id },
        data: { status: 'POSTED_TO_WIP', posted_by_id: userId, posted_at: postingDate, journal_entry_id: journalEntryId },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async issueBillingDocument(proposalId: string, input: BillingIssueInput, userId: string, companyId: string) {
    return prisma.$transaction(async (tx) => {
      const proposal = await tx.fin_billing_proposal.findFirst({ where: { id: proposalId, company_id: companyId } });
      if (!proposal) throw new NotFoundError('BillingProposal');
      if (proposal.billing_document_id) {
        const existing = await tx.fin_billing_document.findFirst({ where: { id: proposal.billing_document_id, company_id: companyId } });
        if (existing) return existing;
      }
      if (proposal.status !== 'APPROVED') throw new ConflictError('Billing proposal harus APPROVED sebelum diterbitkan.');
      const project = await tx.project_project.findFirst({ where: { id: proposal.project_id, company_id: companyId } });
      if (!project) throw new ValidationError('Project proposal tidak valid untuk company aktif.');
      if (!proposal.customer_id) throw new ValidationError('Billing proposal belum memiliki customer_id.');
      const customer = await tx.master_party.findFirst({ where: { id: proposal.customer_id, company_id: companyId, status: 'ACTIVE' } });
      if (!customer) throw new ValidationError('Customer proposal tidak valid untuk company aktif.');

      const invoiceNumber = String(input.invoice_number || `INV-${proposal.id.slice(0, 8).toUpperCase()}`).trim();
      const duplicate = await tx.fin_billing_document.findFirst({ where: { company_id: companyId, invoice_number: invoiceNumber } });
      if (duplicate) throw new ConflictError('Nomor invoice sudah digunakan pada company aktif.');
      const invoiceDate = input.invoice_date ?? new Date();
      const document = await tx.fin_billing_document.create({
        data: {
          id: crypto.randomUUID(), tenant_id: proposal.tenant_id, company_id: companyId, created_by_id: userId,
          party_id: customer.id, project_id: project.id, currency_id: input.currency_id ?? customer.default_currency_id,
          tax_scheme: proposal.tax_scheme,
          payment_term_id: input.payment_term_id, billing_type: 'CUSTOMER_INVOICE', invoice_number: invoiceNumber,
          invoice_date: invoiceDate, due_date: input.due_date, subtotal: proposal.subtotal,
          tax_amount: proposal.tax_amount, total_amount: proposal.total_amount, paid_amount: new Decimal(0),
          outstanding_amount: proposal.total_amount, payment_status: 'UNPAID', status: 'DRAFT', rejection_reason: '',
        },
      });
      await tx.fin_billing_document_line.create({
        data: {
          id: crypto.randomUUID(), tenant_id: proposal.tenant_id, company_id: companyId, created_by_id: userId,
          billing_document_id: document.id, project_id: project.id, quantity: new Decimal(1),
          unit_price: proposal.subtotal, discount_amount: new Decimal(0), line_total: proposal.subtotal,
        },
      });
      await tx.fin_billing_proposal.update({
        where: { id: proposal.id },
        data: { status: 'ISSUED', billing_document_id: document.id },
      });
      return document;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async createAndSubmitPayment(billingDocumentId: string, input: PaymentInput, userId: string, companyId: string) {
    if (!Number.isFinite(input.amount) || input.amount <= 0) throw new ValidationError('amount harus lebih dari 0.');
    if (!input.reference_number?.trim()) throw new ValidationError('reference_number wajib diisi.');
    return prisma.$transaction(async (tx) => {
      const bill = await tx.fin_billing_document.findFirst({ where: { id: billingDocumentId, company_id: companyId } });
      if (!bill) throw new NotFoundError('BillingDocument');
      if (bill.billing_type !== 'SUPPLIER_INVOICE') throw new ValidationError('AP Payment hanya dapat dibuat untuk SUPPLIER_INVOICE.');
      if (bill.status !== 'POSTED') throw new ConflictError('Supplier invoice harus POSTED sebelum payment dibuat.');
      const outstanding = Number(bill.outstanding_amount ?? bill.total_amount ?? 0);
      if (input.amount > outstanding) throw new ValidationError('Jumlah payment melebihi outstanding invoice.');
      const bank = await tx.fin_bank_account.findFirst({ where: { id: input.bank_account_id, company_id: companyId, status: 'ACTIVE' } });
      if (!bank?.ledger_account_id) throw new ValidationError('Bank account tidak valid atau belum memiliki ledger account.');
      const duplicate = await tx.fin_payment.findFirst({ where: { company_id: companyId, reference_number: input.reference_number } });
      if (duplicate) throw new ConflictError('Reference payment sudah digunakan pada company aktif.');

      const payment = await tx.fin_payment.create({
        data: {
          id: crypto.randomUUID(), tenant_id: bill.tenant_id, company_id: companyId, created_by_id: userId,
          party_id: bill.party_id, bank_account_id: bank.id, currency_id: bill.currency_id,
          payment_type: 'OUTGOING', payment_date: input.payment_date, amount: new Decimal(input.amount),
          payment_method: input.payment_method || 'BANK_TRANSFER', reference_number: input.reference_number.trim(),
          status: 'SUBMITTED', allocation_plan: {}, submitted_by_id: userId, submitted_at: new Date(),
          execution_reference: '', execution_note: input.description || '', failure_reason: '',
        },
      });
      await tx.fin_payment_allocation.create({
        data: {
          id: crypto.randomUUID(), tenant_id: bill.tenant_id, company_id: companyId, created_by_id: userId,
          payment_id: payment.id, billing_document_id: bill.id, allocated_amount: new Decimal(input.amount),
          discount_amount: new Decimal(0), write_off_amount: new Decimal(0), exchange_difference: new Decimal(0),
        },
      });
      return payment;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async executePayment(paymentId: string, executionReference: string, userId: string, companyId: string) {
    if (!executionReference?.trim()) throw new ValidationError('execution_reference wajib diisi.');
    await FinanceService.ensureStandardCOA(companyId);
    const postingDate = new Date();
    await PeriodClosingService.assertPeriodOpen(postingDate, companyId);
    return prisma.$transaction(async (tx) => {
      const payment = await tx.fin_payment.findFirst({ where: { id: paymentId, company_id: companyId } });
      if (!payment) throw new NotFoundError('Payment');
      if (payment.status === 'POSTED' && payment.journal_entry_id) return payment;
      if (payment.status !== 'APPROVED') throw new ConflictError('Payment harus APPROVED sebelum dieksekusi.');
      const allocations = await tx.fin_payment_allocation.findMany({ where: { payment_id: payment.id, company_id: companyId } });
      if (!allocations.length) throw new ValidationError('Payment belum memiliki allocation.');
      const allocated = allocations.reduce((sum, row) => sum + Number(row.allocated_amount ?? 0), 0);
      if (Math.abs(allocated - Number(payment.amount ?? 0)) > 0.01) throw new ValidationError('Total allocation harus sama dengan amount payment.');
      const bank = await tx.fin_bank_account.findFirst({ where: { id: payment.bank_account_id ?? '', company_id: companyId, status: 'ACTIVE' } });
      const ap = await tx.fin_account.findFirst({ where: { company_id: companyId, account_code: '2110', status: 'ACTIVE' } });
      if (!bank?.ledger_account_id || !ap) throw new AccountingError('Akun AP atau ledger bank belum dikonfigurasi.');
      const periodId = await this.fiscalPeriodId(tx, companyId, postingDate);
      const journal = await this.journal(tx, companyId, payment.tenant_id, userId);
      const entryId = crypto.randomUUID();
      const amount = Number(payment.amount ?? 0);
      await tx.fin_journal_entry.create({ data: {
        id: entryId, tenant_id: payment.tenant_id, company_id: companyId, created_by_id: userId,
        journal_id: journal.id, fiscal_period_id: periodId, entry_number: `PAY-${payment.id.slice(0, 8)}`,
        posting_date: postingDate, description: `AP payment ${payment.reference_number}`,
        source_document_id: payment.id, status: 'POSTED',
      } });
      await tx.fin_journal_line.createMany({ data: [
        { id: crypto.randomUUID(), tenant_id: payment.tenant_id, company_id: companyId, created_by_id: userId, journal_entry_id: entryId, account_id: ap.id, party_id: payment.party_id, debit_base: new Decimal(amount), credit_base: new Decimal(0), transaction_amount: new Decimal(amount) },
        { id: crypto.randomUUID(), tenant_id: payment.tenant_id, company_id: companyId, created_by_id: userId, journal_entry_id: entryId, account_id: bank.ledger_account_id, party_id: payment.party_id, debit_base: new Decimal(0), credit_base: new Decimal(amount), transaction_amount: new Decimal(amount) },
      ] });
      for (const allocation of allocations) {
        if (!allocation.billing_document_id) continue;
        const bill = await tx.fin_billing_document.findFirst({ where: { id: allocation.billing_document_id, company_id: companyId } });
        if (!bill) throw new ValidationError('Allocation mengacu pada billing document yang tidak valid.');
        const paid = Number(bill.paid_amount ?? 0) + Number(allocation.allocated_amount ?? 0);
        const total = Number(bill.total_amount ?? 0);
        if (paid > total + 0.01) throw new ConflictError('Eksekusi payment menyebabkan overpayment.');
        const outstanding = Math.max(total - paid, 0);
        await tx.fin_billing_document.update({ where: { id: bill.id }, data: {
          paid_amount: new Decimal(paid), outstanding_amount: new Decimal(outstanding),
          payment_status: outstanding <= 0.01 ? 'PAID' : 'PARTIALLY_PAID',
        } });
      }
      return tx.fin_payment.update({ where: { id: payment.id }, data: {
        status: 'POSTED', journal_entry_id: entryId, executed_by_id: userId, executed_at: postingDate,
        execution_reference: executionReference.trim(), payment_date: postingDate,
      } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async taxProjection(companyId: string, query: Record<string, unknown>) {
    const page = Math.max(Number(query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(query.page_size) || 50, 1), 200);
    const where: Prisma.fin_tax_transactionWhereInput = { company_id: companyId };
    if (query.status) where.status = String(query.status);
    if (query.from_date || query.to_date) where.tax_date = {
      ...(query.from_date ? { gte: new Date(String(query.from_date)) } : {}),
      ...(query.to_date ? { lte: new Date(String(query.to_date)) } : {}),
    };
    const [rows, count] = await Promise.all([
      prisma.fin_tax_transaction.findMany({ where, orderBy: [{ tax_date: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.fin_tax_transaction.count({ where }),
    ]);
    const billingIds = rows.map((row) => row.billing_document_id).filter((id): id is string => Boolean(id));
    const bills = billingIds.length ? await prisma.fin_billing_document.findMany({ where: { id: { in: billingIds }, company_id: companyId } }) : [];
    const partyIds = bills.map((row) => row.party_id).filter((id): id is string => Boolean(id));
    const projectIds = bills.map((row) => row.project_id).filter((id): id is string => Boolean(id));
    const [parties, projects] = await Promise.all([
      partyIds.length ? prisma.master_party.findMany({ where: { id: { in: partyIds }, company_id: companyId }, select: { id: true, legal_name: true, display_name: true } }) : [],
      projectIds.length ? prisma.project_project.findMany({ where: { id: { in: projectIds }, company_id: companyId }, select: { id: true, project_name: true } }) : [],
    ]);
    const billMap = new Map(bills.map((row) => [row.id, row]));
    const partyMap = new Map(parties.map((row) => [row.id, row.display_name || row.legal_name]));
    const projectMap = new Map(projects.map((row) => [row.id, row.project_name]));
    return {
      count, page, page_size: pageSize, total_pages: Math.ceil(count / pageSize),
      results: rows.map((row) => {
        const bill = row.billing_document_id ? billMap.get(row.billing_document_id) : undefined;
        return {
          ...row,
          invoice_number: bill?.invoice_number ?? null,
          customer_name: bill?.party_id ? partyMap.get(bill.party_id) ?? null : null,
          project_id: bill?.project_id ?? null,
          project_name: bill?.project_id ? projectMap.get(bill.project_id) ?? null : null,
          tax_scheme: bill?.tax_scheme ?? null,
        };
      }),
    };
  }
}
