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
}
