import prisma from '../../config/database';
import { AccountingError, NotFoundError, ValidationError } from '../../utils/errors';

export const DEFAULT_COA = [
  { code: '1101', name: 'Kas dan Rekening Bank', type: 'ASSET', balance: 'DEBIT' },
  { code: '1103', name: 'Piutang Usaha (AR)', type: 'ASSET', balance: 'DEBIT' },
  { code: '1105', name: 'Persediaan Bahan & Barang', type: 'ASSET', balance: 'DEBIT' },
  { code: '1108', name: 'Pekerjaan Dalam Proses (WIP Proyek)', type: 'ASSET', balance: 'DEBIT' },
  { code: '2101', name: 'Hutang Usaha (AP)', type: 'LIABILITY', balance: 'CREDIT' },
  { code: '2103', name: 'Hutang Pajak Pertambahan Nilai (PPN)', type: 'LIABILITY', balance: 'CREDIT' },
  { code: '3101', name: 'Modal Disetor / Ekuitas', type: 'EQUITY', balance: 'CREDIT' },
  { code: '3102', name: 'Laba Ditahan', type: 'EQUITY', balance: 'CREDIT' },
  { code: '4101', name: 'Pendapatan Proyek & Jasa', type: 'REVENUE', balance: 'CREDIT' },
  { code: '5101', name: 'Beban Pokok Proyek (HPP / COGS)', type: 'EXPENSE', balance: 'DEBIT' },
  { code: '6101', name: 'Beban Operasional & Umum', type: 'EXPENSE', balance: 'DEBIT' },
];

export class FinanceService {
  static async ensureStandardCOA(companyId?: string | null) {
    const map = new Map<string, any>();
    for (const item of DEFAULT_COA) {
      let acc = await prisma.fin_account.findFirst({
        where: {
          account_code: item.code,
          ...(companyId ? { company_id: companyId } : {}),
        },
      });

      if (!acc) {
        acc = await prisma.fin_account.create({
          data: {
            id: crypto.randomUUID(),
            company_id: companyId ?? null,
            account_code: item.code,
            account_name: item.name,
            account_type: item.type,
            normal_balance: item.balance,
            allow_manual_posting: true,
            reconciliation_required: false,
            status: 'ACTIVE',
          },
        });
      }
      map.set(item.code, acc);
    }
    return map;
  }

  static async ensureJournal(companyId: string | null, code: string, name: string, type = 'GENERAL') {
    let journal = await prisma.fin_journal.findFirst({
      where: {
        journal_code: code,
        ...(companyId ? { company_id: companyId } : {}),
      },
    });

    if (!journal) {
      journal = await prisma.fin_journal.create({
        data: {
          id: crypto.randomUUID(),
          company_id: companyId,
          journal_code: code,
          journal_name: name,
          journal_type: type,
          status: 'ACTIVE',
        },
      });
    }
    return journal;
  }

  static async postJournalEntry(entryId: string) {
    return prisma.$transaction(async (tx) => {
      const entry = await tx.fin_journal_entry.findUnique({
        where: { id: entryId },
      });
      if (!entry) throw new NotFoundError('JournalEntry');

      const lines = await tx.fin_journal_line.findMany({
        where: { journal_entry_id: entryId },
      });

      let totalDebit = 0;
      let totalCredit = 0;
      for (const line of lines) {
        totalDebit += Number(line.debit_base ?? 0);
        totalCredit += Number(line.credit_base ?? 0);
      }

      if (Math.abs(totalDebit - totalCredit) > 0.001) {
        throw new AccountingError(
          `Jurnal tidak seimbang. Total Debit: ${totalDebit}, Total Credit: ${totalCredit}.`,
        );
      }

      return tx.fin_journal_entry.update({
        where: { id: entryId },
        data: { status: 'POSTED', posting_date: new Date() },
      });
    });
  }

  static async getTrialBalance(companyId?: string | null) {
    await this.ensureStandardCOA(companyId);
    const accounts = await prisma.fin_account.findMany({
      where: companyId ? { company_id: companyId } : undefined,
    });

    const lines = await prisma.fin_journal_line.findMany();

    const accountLinesMap = new Map<string, { debit: number; credit: number }>();
    for (const l of lines) {
      if (!l.account_id) continue;
      const cur = accountLinesMap.get(l.account_id) ?? { debit: 0, credit: 0 };
      cur.debit += Number(l.debit_base ?? 0);
      cur.credit += Number(l.credit_base ?? 0);
      accountLinesMap.set(l.account_id, cur);
    }

    let grandDebit = 0;
    let grandCredit = 0;

    const list = accounts.map((acc) => {
      const totals = accountLinesMap.get(acc.id) ?? { debit: 0, credit: 0 };
      const net =
        acc.normal_balance === 'DEBIT'
          ? totals.debit - totals.credit
          : totals.credit - totals.debit;

      grandDebit += totals.debit;
      grandCredit += totals.credit;

      return {
        account_id: acc.id,
        account_code: acc.account_code,
        account_name: acc.account_name,
        account_type: acc.account_type,
        normal_balance: acc.normal_balance,
        total_debit: totals.debit,
        total_credit: totals.credit,
        net_balance: net,
      };
    });

    return {
      accounts: list,
      total_debit: grandDebit,
      total_credit: grandCredit,
      is_balanced: Math.abs(grandDebit - grandCredit) < 0.001,
    };
  }

  static async decideFunding(fundingId: string, decision: string, remarks = '', userId?: string) {
    const dec = decision.toUpperCase();
    if (!['APPROVED', 'REJECTED'].includes(dec)) {
      throw new ValidationError('Decision must be APPROVED or REJECTED.');
    }

    return prisma.fin_project_funding.update({
      where: { id: fundingId },
      data: {
        status: dec,
        approved_by_id: userId,
        approved_at: new Date(),
      },
    });
  }

  static async postBillingDocument(billingId: string, userId?: string) {
    return prisma.$transaction(async (tx) => {
      const doc = await tx.fin_billing_document.findUnique({
        where: { id: billingId },
      });
      if (!doc) throw new NotFoundError('BillingDocument');

      const subtotal = Number(doc.subtotal ?? 0);
      const taxAmount = Number(doc.tax_amount ?? 0);
      const totalAmount = Number(doc.total_amount ?? subtotal + taxAmount);

      // 1. Update billing status
      const updated = await tx.fin_billing_document.update({
        where: { id: billingId },
        data: {
          status: 'POSTED',
          posting_date: new Date(),
          approved_by_id: userId ?? doc.approved_by_id,
          approved_at: doc.approved_at ?? new Date(),
        },
      });

      // 2. Create Tax Transaction if not yet exists
      const existingTax = await tx.fin_tax_transaction.findFirst({
        where: { billing_document_id: billingId },
      });

      if (!existingTax && taxAmount > 0) {
        await tx.fin_tax_transaction.create({
          data: {
            id: crypto.randomUUID(),
            company_id: doc.company_id,
            billing_document_id: doc.id,
            taxable_amount: subtotal,
            tax_rate: 11,
            tax_amount: taxAmount,
            tax_direction: doc.billing_type === 'SUPPLIER_INVOICE' ? 'INPUT' : 'OUTPUT',
            tax_date: new Date(),
            status: 'CALCULATED',
            validation_note: 'Auto-generated from posted billing document',
            billing_code: `EFAKTUR-${doc.invoice_number}`,
            payment_reference: '',
            ntpn: '',
          },
        });
      }

      // 3. Post General Ledger Journal Entry
      const coaMap = await this.ensureStandardCOA(doc.company_id);
      const arAccount = coaMap.get('1103'); // Piutang Usaha (AR)
      const revenueAccount = coaMap.get('4101'); // Pendapatan Proyek
      const ppnLiability = coaMap.get('2103'); // Hutang PPN Keluaran
      const journal = await this.ensureJournal(doc.company_id, 'GJ', 'General Journal');

      if (arAccount && revenueAccount && journal) {
        const entry = await tx.fin_journal_entry.create({
          data: {
            id: crypto.randomUUID(),
            journal_id: journal.id,
            entry_number: `JE-BILL-${doc.invoice_number}`,
            posting_date: new Date(),
            description: `Pengakuan Piutang & PPN Invoice ${doc.invoice_number}`,
            source_document_id: doc.id,
            status: 'POSTED',
          },
        });

        // Debit: Piutang Usaha (AR)
        await tx.fin_journal_line.create({
          data: {
            id: crypto.randomUUID(),
            journal_entry_id: entry.id,
            account_id: arAccount.id,
            project_id: doc.project_id,
            party_id: doc.party_id,
            debit_base: totalAmount,
            credit_base: 0,
            transaction_amount: totalAmount,
          },
        });

        // Kredit: Pendapatan Proyek (Revenue)
        await tx.fin_journal_line.create({
          data: {
            id: crypto.randomUUID(),
            journal_entry_id: entry.id,
            account_id: revenueAccount.id,
            project_id: doc.project_id,
            party_id: doc.party_id,
            debit_base: 0,
            credit_base: subtotal,
            transaction_amount: subtotal,
          },
        });

        // Kredit: Hutang PPN Keluaran (jika ada)
        if (taxAmount > 0 && ppnLiability) {
          await tx.fin_journal_line.create({
            data: {
              id: crypto.randomUUID(),
              journal_entry_id: entry.id,
              account_id: ppnLiability.id,
              project_id: doc.project_id,
              party_id: doc.party_id,
              debit_base: 0,
              credit_base: taxAmount,
              transaction_amount: taxAmount,
            },
          });
        }
      }

      return updated;
    });
  }

  static async getTaxSummary(companyId?: string | null) {
    const taxTxs = await prisma.fin_tax_transaction.findMany({
      where: companyId ? { company_id: companyId } : undefined,
    });

    let totalDpp = 0;
    let totalPpnOutput = 0;
    let totalPpnInput = 0;

    for (const tx of taxTxs) {
      const taxable = Number(tx.taxable_amount ?? 0);
      const tax = Number(tx.tax_amount ?? 0);
      totalDpp += taxable;
      if (tx.tax_direction === 'INPUT') {
        totalPpnInput += tax;
      } else {
        totalPpnOutput += tax;
      }
    }

    return {
      total_dpp: totalDpp,
      total_ppn_output: totalPpnOutput,
      total_ppn_input: totalPpnInput,
      net_ppn_payable: totalPpnOutput - totalPpnInput,
      transaction_count: taxTxs.length,
      transactions: taxTxs,
    };
  }
}
