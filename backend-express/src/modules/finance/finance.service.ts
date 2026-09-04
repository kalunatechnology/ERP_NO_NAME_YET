/**
 * File: backend-express/src/modules/finance/finance.service.ts
 *
 * Purpose: Implements domain service responsibilities for the finance domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Decimal } from '@prisma/client/runtime/library';
import prisma from '../../config/database';
import { AccountingError, NotFoundError, ValidationError } from '../../utils/errors';
// NOTE: PeriodClosingService is imported lazily to avoid circular deps
// It is called via dynamic import below


// =============================================================================
// CHART OF ACCOUNTS - STANDARD HIERARCHICAL (1000–6000)
// Sesuai blueprint audit enterprise ERP
// =============================================================================

export const DEFAULT_COA = [
  // 1000 - ASET
  { code: '1110', name: 'Kas Operasional', type: 'ASSET', balance: 'DEBIT', parent_code: null },
  { code: '1120', name: 'Bank Perusahaan', type: 'ASSET', balance: 'DEBIT', parent_code: null },
  { code: '1130', name: 'Piutang Usaha (AR)', type: 'ASSET', balance: 'DEBIT', parent_code: null },
  { code: '1140', name: 'Uang Muka & Cash in Transit', type: 'ASSET', balance: 'DEBIT', parent_code: null },
  { code: '1200', name: 'Aset Tetap (Fixed Assets)', type: 'ASSET', balance: 'DEBIT', parent_code: null },
  // 2000 - KEWAJIBAN
  { code: '2110', name: 'Hutang Usaha (AP)', type: 'LIABILITY', balance: 'CREDIT', parent_code: null },
  { code: '2120', name: 'Hutang Pajak (PPN / PPh)', type: 'LIABILITY', balance: 'CREDIT', parent_code: null },
  { code: '2130', name: 'Beban Yang Masih Harus Dibayar (Accrued)', type: 'LIABILITY', balance: 'CREDIT', parent_code: null },
  // 3000 - EKUITAS
  { code: '3100', name: 'Modal Disetor (Capital Stock)', type: 'EQUITY', balance: 'CREDIT', parent_code: null },
  { code: '3200', name: 'Laba Ditahan (Retained Earnings)', type: 'EQUITY', balance: 'CREDIT', parent_code: null },
  // 4000 - PENDAPATAN
  { code: '4100', name: 'Pendapatan Proyek & Jasa', type: 'REVENUE', balance: 'CREDIT', parent_code: null },
  { code: '4200', name: 'Pendapatan Lain-lain', type: 'REVENUE', balance: 'CREDIT', parent_code: null },
  // 5000 - HPP / COGS
  { code: '5100', name: 'Biaya Langsung Proyek (Direct Cost)', type: 'EXPENSE', balance: 'DEBIT', parent_code: null },
  // 6000 - BEBAN OPERASIONAL
  { code: '6100', name: 'Beban Gaji & SDM', type: 'EXPENSE', balance: 'DEBIT', parent_code: null },
  { code: '6200', name: 'Beban Operasional Kantor', type: 'EXPENSE', balance: 'DEBIT', parent_code: null },
];

// =============================================================================
// FINANCE SERVICE - ENTERPRISE GRADE
// Mencakup: COA, Journal Posting, Computed Balance, Storno/Reversal,
//           Internal Transfer (Cash in Transit), Banking, Reconciliation,
//           Financial Reports (Trial Balance, P&L, Balance Sheet)
// =============================================================================

export class FinanceService {

  // ---------------------------------------------------------------------------
  // 1. COA & JOURNAL SETUP
  // ---------------------------------------------------------------------------

/**
 * ensureStandardCOA implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `fin_account`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
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

/**
 * ensureJournal implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `fin_journal`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
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

  // ---------------------------------------------------------------------------
  // 2. JOURNAL POSTING (Double-Entry Validation)
  // ---------------------------------------------------------------------------

/**
 * postJournalEntry implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async postJournalEntry(entryId: string) {
    return prisma.$transaction(async (tx) => {
      const entry = await tx.fin_journal_entry.findUnique({ where: { id: entryId } });
      if (!entry) throw new NotFoundError('JournalEntry');
      if (entry.status === 'POSTED') throw new ValidationError('Jurnal sudah dalam status POSTED.');
      if (entry.status === 'REVERSED') throw new ValidationError('Jurnal yang sudah di-reverse tidak dapat di-post ulang.');

      // ==== PERIOD GUARD (Defense-in-Depth) ====
      const postingDate = entry.posting_date ?? new Date();
      const { PeriodClosingService } = await import('./period-closing.service');
      await PeriodClosingService.assertPeriodOpen(postingDate);

      const lines = await tx.fin_journal_line.findMany({ where: { journal_entry_id: entryId } });
      if (lines.length < 2) throw new AccountingError('Jurnal harus memiliki minimal 2 baris (Debit & Credit).');

      let totalDebit = 0;
      let totalCredit = 0;
      for (const line of lines) {
        totalDebit += Number(line.debit_base ?? 0);
        totalCredit += Number(line.credit_base ?? 0);
      }

      if (Math.abs(totalDebit - totalCredit) > 0.001) {
        throw new AccountingError(
          `Jurnal tidak seimbang. Total Debit: ${totalDebit.toFixed(2)}, Total Credit: ${totalCredit.toFixed(2)}.`,
        );
      }

      return tx.fin_journal_entry.update({
        where: { id: entryId },
        data: { status: 'POSTED', posting_date: new Date() },
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 3. COMPUTED BALANCE ENGINE
  //    Saldo selalu dihitung dari akumulasi Debit/Kredit jurnal — TIDAK pernah
  //    di-UPDATE secara langsung ke kolom statis.
  // ---------------------------------------------------------------------------

/**
 * getAccountBalance implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `fin_account`, `fin_journal_entry`, `fin_journal_line`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async getAccountBalance(accountId: string, companyId?: string | null) {
    const account = await prisma.fin_account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundError('Account');

    // Ambil posted entry IDs dulu, lalu filter journal lines berdasarkan ID tersebut
    const postedEntries = await prisma.fin_journal_entry.findMany({
      where: { status: 'POSTED' },
      select: { id: true },
    });
    const postedEntryIds = postedEntries.map((e) => e.id);

    const lines = await prisma.fin_journal_line.findMany({
      where: {
        account_id: accountId,
        journal_entry_id: { in: postedEntryIds },
      },
    });

    let totalDebit = 0;
    let totalCredit = 0;
    for (const l of lines) {
      totalDebit += Number(l.debit_base ?? 0);
      totalCredit += Number(l.credit_base ?? 0);
    }

    const netBalance =
      account.normal_balance === 'DEBIT'
        ? totalDebit - totalCredit
        : totalCredit - totalDebit;

    return {
      account_id: accountId,
      account_code: account.account_code,
      account_name: account.account_name,
      account_type: account.account_type,
      normal_balance: account.normal_balance,
      total_debit: totalDebit,
      total_credit: totalCredit,
      net_balance: netBalance,
      computed_at: new Date().toISOString(),
    };
  }

/**
 * getBankAccountBalance implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `fin_bank_account`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async getBankAccountBalance(bankAccountId: string) {
    const bankAccount = await prisma.fin_bank_account.findUnique({ where: { id: bankAccountId } });
    if (!bankAccount) throw new NotFoundError('BankAccount');

    if (!bankAccount.ledger_account_id) {
      return { bank_account_id: bankAccountId, balance: 0, note: 'No ledger account linked' };
    }

    const balanceData = await this.getAccountBalance(bankAccount.ledger_account_id, bankAccount.company_id);
    return {
      bank_account_id: bankAccountId,
      bank_name: bankAccount.bank_name,
      account_number: bankAccount.account_number,
      account_name: bankAccount.account_name,
      ledger_account_id: bankAccount.ledger_account_id,
      balance: balanceData.net_balance,
      total_debit: balanceData.total_debit,
      total_credit: balanceData.total_credit,
      computed_at: balanceData.computed_at,
    };
  }

  // ---------------------------------------------------------------------------
  // 4. JURNAL REVERSAL / STORNO ENGINE
  //    Pembatalan transaksi yang immutable — TIDAK menghapus data asli.
  //    Menerbitkan jurnal pembalik yang meniadakan efek jurnal asal.
  // ---------------------------------------------------------------------------

/**
 * reverseJournalEntry implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async reverseJournalEntry(entryId: string, reason: string, reversedByUserId: string) {
    return prisma.$transaction(async (tx) => {
      const entry = await tx.fin_journal_entry.findUnique({ where: { id: entryId } });
      if (!entry) throw new NotFoundError('JournalEntry');
      if (entry.status === 'REVERSED') throw new ValidationError('Jurnal ini sudah pernah di-reverse sebelumnya.');
      if (entry.status !== 'POSTED') throw new ValidationError('Hanya jurnal dengan status POSTED yang dapat di-reverse.');

      const originalLines = await tx.fin_journal_line.findMany({ where: { journal_entry_id: entryId } });
      if (originalLines.length === 0) throw new AccountingError('Jurnal tidak memiliki baris transaksi.');

      const journal = await tx.fin_journal.findUnique({ where: { id: entry.journal_id ?? '' } });

      // Buat jurnal pembalik (Storno)
      const reversalEntry = await tx.fin_journal_entry.create({
        data: {
          id: crypto.randomUUID(),
          journal_id: entry.journal_id,
          fiscal_period_id: entry.fiscal_period_id,
          currency_id: entry.currency_id,
          entry_number: `REV-${entry.entry_number}`,
          posting_date: new Date(),
          exchange_rate: entry.exchange_rate,
          description: `[REVERSAL] ${entry.description} — Alasan: ${reason}`,
          source_document_id: entry.source_document_id,
          reversal_of_entry_id: entryId,
          status: 'POSTED',
        },
      });

      // Buat baris pembalik — Debit dan Kredit dibalik
      for (const line of originalLines) {
        await tx.fin_journal_line.create({
          data: {
            id: crypto.randomUUID(),
            journal_entry_id: reversalEntry.id,
            account_id: line.account_id,
            party_id: line.party_id,
            project_id: line.project_id,
            cost_center_id: line.cost_center_id,
            department_id: line.department_id,
            debit_base: line.credit_base,   // Debit <-> Credit dibalik
            credit_base: line.debit_base,
            transaction_currency_id: line.transaction_currency_id,
            transaction_amount: line.transaction_amount,
            due_date: line.due_date,
            source_document_line_id: line.source_document_line_id,
          },
        });
      }

      // Tandai jurnal asal sebagai REVERSED
      await tx.fin_journal_entry.update({
        where: { id: entryId },
        data: { status: 'REVERSED' },
      });

      return {
        original_entry_id: entryId,
        reversal_entry_id: reversalEntry.id,
        reversal_entry_number: reversalEntry.entry_number,
        reason,
        reversed_by: reversedByUserId,
        reversed_at: new Date().toISOString(),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // 5. INTERNAL FUND TRANSFER ENGINE (via Cash in Transit - Akun 1140)
  //    Transfer antar rekening bank internal harus melalui akun perantara 1140.
  // ---------------------------------------------------------------------------

/**
 * executeInternalTransfer implements this operation using the typed arguments declared in its signature.
 *
 * @param input - Parameters declared by the function/method.
 * @returns The synchronous result or Promise produced below.
 * Database/side effects: delegates only to the visible local/imported dependencies.
 */
  static async executeInternalTransfer(payload: {
    fromBankAccountId: string;
    toBankAccountId: string;
    amount: number;
    description: string;
    companyId: string;
    executedByUserId: string;
    referenceNumber?: string;
  }) {
    const { fromBankAccountId, toBankAccountId, amount, description, companyId, executedByUserId, referenceNumber } = payload;

    if (amount <= 0) throw new ValidationError('Jumlah transfer harus lebih dari 0.');
    if (fromBankAccountId === toBankAccountId) throw new ValidationError('Rekening pengirim dan penerima tidak boleh sama.');

    return prisma.$transaction(async (tx) => {
      const fromBank = await tx.fin_bank_account.findUnique({ where: { id: fromBankAccountId } });
      const toBank = await tx.fin_bank_account.findUnique({ where: { id: toBankAccountId } });
      if (!fromBank) throw new NotFoundError('Bank Account Pengirim');
      if (!toBank) throw new NotFoundError('Bank Account Penerima');
      if (!fromBank.ledger_account_id) throw new ValidationError('Bank pengirim tidak memiliki akun buku besar yang tertaut.');
      if (!toBank.ledger_account_id) throw new ValidationError('Bank penerima tidak memiliki akun buku besar yang tertaut.');

      const coaMap = await this.ensureStandardCOA(companyId);
      const transitAccount = coaMap.get('1140');
      if (!transitAccount) throw new AccountingError('Akun Cash in Transit (1140) tidak ditemukan. Jalankan setup COA terlebih dahulu.');

      const journal = await this.ensureJournal(companyId, 'BNK', 'Bank Journal', 'BANK');
      const transferRef = referenceNumber ?? `TRF-${Date.now()}`;

      // --- LANGKAH 1: Sisi Pengirim (Debit Transit, Kredit Bank Pengirim) ---
      const entryOut = await tx.fin_journal_entry.create({
        data: {
          id: crypto.randomUUID(),
          journal_id: journal.id,
          entry_number: `${transferRef}-OUT`,
          posting_date: new Date(),
          description: `[TRANSFER OUT] ${description} — dari ${fromBank.bank_name} ${fromBank.account_number}`,
          status: 'POSTED',
        },
      });

      await tx.fin_journal_line.createMany({
        data: [
          {
            id: crypto.randomUUID(),
            journal_entry_id: entryOut.id,
            account_id: transitAccount.id,
            debit_base: amount,
            credit_base: 0,
            transaction_amount: amount,
          },
          {
            id: crypto.randomUUID(),
            journal_entry_id: entryOut.id,
            account_id: fromBank.ledger_account_id,
            debit_base: 0,
            credit_base: amount,
            transaction_amount: amount,
          },
        ],
      });

      // --- LANGKAH 2: Sisi Penerima (Debit Bank Penerima, Kredit Transit) ---
      const entryIn = await tx.fin_journal_entry.create({
        data: {
          id: crypto.randomUUID(),
          journal_id: journal.id,
          entry_number: `${transferRef}-IN`,
          posting_date: new Date(),
          description: `[TRANSFER IN] ${description} — ke ${toBank.bank_name} ${toBank.account_number}`,
          status: 'POSTED',
        },
      });

      await tx.fin_journal_line.createMany({
        data: [
          {
            id: crypto.randomUUID(),
            journal_entry_id: entryIn.id,
            account_id: toBank.ledger_account_id,
            debit_base: amount,
            credit_base: 0,
            transaction_amount: amount,
          },
          {
            id: crypto.randomUUID(),
            journal_entry_id: entryIn.id,
            account_id: transitAccount.id,
            debit_base: 0,
            credit_base: amount,
            transaction_amount: amount,
          },
        ],
      });

      return {
        reference_number: transferRef,
        from_bank: `${fromBank.bank_name} ${fromBank.account_number}`,
        to_bank: `${toBank.bank_name} ${toBank.account_number}`,
        amount,
        description,
        entry_out_id: entryOut.id,
        entry_in_id: entryIn.id,
        executed_by: executedByUserId,
        executed_at: new Date().toISOString(),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // 6. BANKING: Statement Import & Reconciliation
  // ---------------------------------------------------------------------------

/**
 * importBankStatement implements this operation using the typed arguments declared in its signature.
 *
 * @param input - Parameters declared by the function/method.
 * @returns The synchronous result or Promise produced below.
 * Database/side effects: uses `fin_bank_account`, `fin_bank_statement_line`, `fin_bank_reconciliation`; transaction scope is exactly the coded scope.
 */
  static async importBankStatement(bankAccountId: string, statementDate: Date, statementLines: Array<{
    transaction_date: Date;
    reference_number: string;
    description: string;
    debit_amount?: number;
    credit_amount?: number;
    running_balance?: number;
  }>) {
    const bankAccount = await prisma.fin_bank_account.findUnique({ where: { id: bankAccountId } });
    if (!bankAccount) throw new NotFoundError('BankAccount');

    return prisma.$transaction(async (tx) => {
      const statement = await tx.fin_bank_statement.create({
        data: {
          id: crypto.randomUUID(),
          bank_account_id: bankAccountId,
          statement_date: statementDate,
          opening_balance: 0,
          closing_balance: 0,
          status: 'UNRECONCILED',
        },
      });

      const createdLines = [];
      for (const line of statementLines) {
        const created = await tx.fin_bank_statement_line.create({
          data: {
            id: crypto.randomUUID(),
            bank_statement_id: statement.id,
            transaction_date: line.transaction_date,
            reference_number: line.reference_number,
            description: line.description,
            debit_amount: line.debit_amount ?? 0,
            credit_amount: line.credit_amount ?? 0,
            running_balance: line.running_balance ?? 0,
          },
        });
        createdLines.push(created);
      }

      return {
        statement_id: statement.id,
        bank_account_id: bankAccountId,
        lines_imported: createdLines.length,
        status: 'UNRECONCILED',
        imported_at: new Date().toISOString(),
      };
    });
  }

/**
 * reconcileBankTransaction implements this operation using the typed arguments declared in its signature.
 *
 * @param input - Parameters declared by the function/method.
 * @returns The synchronous result or Promise produced below.
 * Database/side effects: uses `fin_bank_statement_line`, `fin_bank_reconciliation`, `fin_account`, `fin_journal_entry`, `fin_journal_line`; transaction scope is exactly the coded scope.
 */
  static async reconcileBankTransaction(payload: {
    statementLineId: string;
    paymentId?: string;
    journalLineId?: string;
    matchedAmount: number;
    matchType: string;
    reconciledByUserId: string;
  }) {
    const { statementLineId, paymentId, journalLineId, matchedAmount, matchType, reconciledByUserId } = payload;

    const statementLine = await prisma.fin_bank_statement_line.findUnique({ where: { id: statementLineId } });
    if (!statementLine) throw new NotFoundError('BankStatementLine');

    const existing = await prisma.fin_bank_reconciliation.findFirst({
      where: { bank_statement_line_id: statementLineId },
    });
    if (existing) throw new ValidationError('Baris mutasi ini sudah direkonsiliasi sebelumnya.');

    return prisma.fin_bank_reconciliation.create({
      data: {
        id: crypto.randomUUID(),
        bank_statement_line_id: statementLineId,
        payment_id: paymentId ?? null,
        journal_line_id: journalLineId ?? null,
        matched_amount: matchedAmount,
        match_type: matchType,
        status: 'MATCHED',
      },
    });
  }

  // ---------------------------------------------------------------------------
  // 7. FINANCIAL REPORTS (Berbasis General Ledger — 100% Computed)
  // ---------------------------------------------------------------------------

/**
 * getTrialBalance implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `fin_account`, `fin_journal_entry`, `fin_journal_line`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async getTrialBalance(companyId?: string | null) {
    await this.ensureStandardCOA(companyId);
    const accounts = await prisma.fin_account.findMany({
      where: companyId ? { company_id: companyId } : undefined,
      orderBy: { account_code: 'asc' },
    });

    // Two-step query: get posted entry IDs, then fetch lines
    const postedEntries = await prisma.fin_journal_entry.findMany({
      where: { status: 'POSTED' },
      select: { id: true },
    });
    const postedEntryIds = postedEntries.map((e) => e.id);
    const lines = await prisma.fin_journal_line.findMany({
      where: { journal_entry_id: { in: postedEntryIds } },
    });

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
      generated_at: new Date().toISOString(),
    };
  }

/**
 * getProfitAndLoss implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `fin_account`, `fin_journal_entry`, `fin_journal_line`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async getProfitAndLoss(companyId?: string | null, startDate?: Date, endDate?: Date) {
    const accounts = await prisma.fin_account.findMany({
      where: {
        ...(companyId ? { company_id: companyId } : {}),
        account_type: { in: ['REVENUE', 'EXPENSE'] },
      },
      orderBy: { account_code: 'asc' },
    });

    // Two-step query for P&L lines
    const postingDateFilter: any = {};
    if (startDate) postingDateFilter['gte'] = startDate;
    if (endDate) postingDateFilter['lte'] = endDate;

    const postedPLEntries = await prisma.fin_journal_entry.findMany({
      where: {
        status: 'POSTED',
        ...(startDate || endDate ? { posting_date: postingDateFilter } : {}),
      },
      select: { id: true },
    });
    const postedPLIds = postedPLEntries.map((e) => e.id);
    const lines = await prisma.fin_journal_line.findMany({
      where: { journal_entry_id: { in: postedPLIds } },
    });

    const accountLinesMap = new Map<string, { debit: number; credit: number }>();
    for (const l of lines) {
      if (!l.account_id) continue;
      const cur = accountLinesMap.get(l.account_id) ?? { debit: 0, credit: 0 };
      cur.debit += Number(l.debit_base ?? 0);
      cur.credit += Number(l.credit_base ?? 0);
      accountLinesMap.set(l.account_id, cur);
    }

    let totalRevenue = 0;
    let totalExpense = 0;

    const revenues: any[] = [];
    const expenses: any[] = [];

    for (const acc of accounts) {
      const totals = accountLinesMap.get(acc.id) ?? { debit: 0, credit: 0 };
      const net = acc.account_type === 'REVENUE'
        ? totals.credit - totals.debit
        : totals.debit - totals.credit;

      if (acc.account_type === 'REVENUE') {
        totalRevenue += net;
        revenues.push({ account_code: acc.account_code, account_name: acc.account_name, amount: net });
      } else {
        totalExpense += net;
        expenses.push({ account_code: acc.account_code, account_name: acc.account_name, amount: net });
      }
    }

    return {
      period_start: startDate?.toISOString() ?? null,
      period_end: endDate?.toISOString() ?? null,
      revenues,
      expenses,
      total_revenue: totalRevenue,
      total_expense: totalExpense,
      net_profit_loss: totalRevenue - totalExpense,
      is_profit: totalRevenue >= totalExpense,
      generated_at: new Date().toISOString(),
    };
  }

/**
 * getBalanceSheet implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `fin_account`, `fin_journal_entry`, `fin_journal_line`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async getBalanceSheet(companyId?: string | null, asOfDate?: Date) {
    const accounts = await prisma.fin_account.findMany({
      where: {
        ...(companyId ? { company_id: companyId } : {}),
        account_type: { in: ['ASSET', 'LIABILITY', 'EQUITY'] },
      },
      orderBy: { account_code: 'asc' },
    });

    // Two-step query for Balance Sheet
    const bsPostedEntries = await prisma.fin_journal_entry.findMany({
      where: {
        status: 'POSTED',
        ...(asOfDate ? { posting_date: { lte: asOfDate } } : {}),
      },
      select: { id: true },
    });
    const bsPostedIds = bsPostedEntries.map((e) => e.id);
    const lines = await prisma.fin_journal_line.findMany({
      where: { journal_entry_id: { in: bsPostedIds } },
    });

    const accountLinesMap = new Map<string, { debit: number; credit: number }>();
    for (const l of lines) {
      if (!l.account_id) continue;
      const cur = accountLinesMap.get(l.account_id) ?? { debit: 0, credit: 0 };
      cur.debit += Number(l.debit_base ?? 0);
      cur.credit += Number(l.credit_base ?? 0);
      accountLinesMap.set(l.account_id, cur);
    }

    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;

    const assets: any[] = [];
    const liabilities: any[] = [];
    const equity: any[] = [];

    for (const acc of accounts) {
      const totals = accountLinesMap.get(acc.id) ?? { debit: 0, credit: 0 };
      const net = acc.normal_balance === 'DEBIT'
        ? totals.debit - totals.credit
        : totals.credit - totals.debit;

      const row = { account_code: acc.account_code, account_name: acc.account_name, amount: net };

      if (acc.account_type === 'ASSET') { totalAssets += net; assets.push(row); }
      else if (acc.account_type === 'LIABILITY') { totalLiabilities += net; liabilities.push(row); }
      else { totalEquity += net; equity.push(row); }
    }

    return {
      as_of_date: asOfDate?.toISOString() ?? new Date().toISOString(),
      assets,
      liabilities,
      equity,
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      total_equity: totalEquity,
      is_balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
      generated_at: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // 8. BILLING DOCUMENT & TAX (existing - preserved & enhanced)
  // ---------------------------------------------------------------------------

/**
 * decideFunding implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `fin_project_funding`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
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

/**
 * postBillingDocument implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async postBillingDocument(billingId: string, userId?: string) {
    return prisma.$transaction(async (tx) => {
      const doc = await tx.fin_billing_document.findUnique({ where: { id: billingId } });
      if (!doc) throw new NotFoundError('BillingDocument');

      // ==== PERIOD GUARD (Defense-in-Depth) ====
      const { PeriodClosingService } = await import('./period-closing.service');
      await PeriodClosingService.assertPeriodOpen(new Date(), doc.company_id ?? null);

      const subtotal = Number(doc.subtotal ?? 0);
      const taxAmount = Number(doc.tax_amount ?? 0);
      const totalAmount = Number(doc.total_amount ?? subtotal + taxAmount);

      const updated = await tx.fin_billing_document.update({
        where: { id: billingId },
        data: {
          status: 'POSTED',
          posting_date: new Date(),
          approved_by_id: userId ?? doc.approved_by_id,
          approved_at: doc.approved_at ?? new Date(),
        },
      });

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

      // Post GL Journal Entry
      const coaMap = await this.ensureStandardCOA(doc.company_id);
      const arAccount = coaMap.get('1130');    // Piutang Usaha (AR)
      const revenueAccount = coaMap.get('4100'); // Pendapatan Proyek
      const ppnLiability = coaMap.get('2120');   // Hutang Pajak
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

/**
 * getTaxSummary implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `fin_tax_transaction`, `fin_account`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
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

  // ---------------------------------------------------------------------------
  // WIP CAPITALIZATION ENGINE (Fase 3)
  //    Pindahkan biaya proyek dari akun WIP (1108) ke COGS/HPP (5100)
  //    Dengan guard: nominal tidak boleh melebihi saldo aktual WIP
  //    Cost Overrun dialokasikan ke fin_cost_variance, bukan mengendap di WIP
  // ---------------------------------------------------------------------------

/**
 * capitalizeProjectWIP implements this operation using the typed arguments declared in its signature.
 *
 * @param input - Parameters declared by the function/method.
 * @returns The synchronous result or Promise produced below.
 * Database/side effects: uses `fin_account`; transaction scope is exactly the coded scope.
 */
  static async capitalizeProjectWIP(
    projectId:   string,
    amount:      number,
    description: string,
    userId:      string,
    companyId?:  string | null,
  ) {
    // Period Guard
    const { PeriodClosingService } = await import('./period-closing.service');
    await PeriodClosingService.assertPeriodOpen(new Date(), companyId ?? null);

    const coaMap    = await this.ensureStandardCOA(companyId);
    const wipAccount = await prisma.fin_account.findFirst({
      where: { account_code: '1108', ...(companyId ? { company_id: companyId } : {}) },
    }) ?? coaMap.get('1140'); // Fallback ke Cash in Transit jika 1108 belum ada
    const cogsAccount = coaMap.get('5100');

    if (!wipAccount || !cogsAccount) {
      throw new AccountingError('Akun WIP (1108) atau COGS (5100) tidak ditemukan. Jalankan setup-standard COA.');
    }

    // Hitung saldo aktual WIP dari GL (Hybrid Balance)
    const wipBalanceData = await this.getAccountBalance(wipAccount.id, companyId);
    const actualWIPBalance = wipBalanceData.net_balance;

    // ==== WIP OVER-CAPITALIZATION GUARD ====
    const capitalizeAmount = Math.min(amount, actualWIPBalance);
    const overrunAmount    = amount - capitalizeAmount;

    if (capitalizeAmount <= 0) {
      throw new AccountingError(
        `Saldo WIP proyek (${actualWIPBalance.toLocaleString('id-ID')}) tidak mencukupi untuk dikapitalisasi. ` +
        `Nominal WIP yang tersedia harus lebih besar dari 0.`
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const journal = await this.ensureJournal(companyId ?? null, 'GJ', 'General Journal');
      const entryId = crypto.randomUUID();

      await tx.fin_journal_entry.create({
        data: {
          id:           entryId,
          journal_id:   journal?.id ?? null,
          entry_number: `WIP-CAP-${projectId.slice(0, 8)}-${Date.now()}`,
          description:  description || `Kapitalisasi WIP Proyek ${projectId}`,
          status:       'POSTED',
          posting_date: new Date(),
          source_document_id: projectId,
        },
      });

      // Debit COGS 5100 (pengakuan biaya langsung proyek)
      await tx.fin_journal_line.create({
        data: {
          id:               crypto.randomUUID(),
          journal_entry_id: entryId,
          account_id:       cogsAccount.id,
          project_id:       projectId,
          debit_base:       new Decimal(capitalizeAmount),
          credit_base:      null,
        },
      });

      // Credit WIP 1108 (mengurangi saldo WIP)
      await tx.fin_journal_line.create({
        data: {
          id:               crypto.randomUUID(),
          journal_entry_id: entryId,
          account_id:       wipAccount.id,
          project_id:       projectId,
          debit_base:       null,
          credit_base:      new Decimal(capitalizeAmount),
        },
      });

      // ==== COST OVERRUN ALLOCATION ====
      // Jika ada kelebihan biaya, catat ke fin_cost_variance (bukan mengendap di WIP)
      let costVarianceId: string | null = null;
      if (overrunAmount > 0) {
        const variance = await tx.fin_cost_variance.create({
          data: {
            id:              crypto.randomUUID(),
            project_id:      projectId,
            ideal_amount:    new Decimal(actualWIPBalance),
            actual_amount:   new Decimal(amount),
            variance_amount: new Decimal(overrunAmount),
            variance_percent: new Decimal((overrunAmount / Math.max(actualWIPBalance, 1)) * 100),
            calculated_at:   new Date(),
          },
        }).catch(() => null);
        costVarianceId = variance?.id ?? null;
      }

      return { entryId, costVarianceId };
    });

    return {
      project_id:            projectId,
      capitalized_amount:    capitalizeAmount,
      cost_overrun_amount:   overrunAmount,
      actual_wip_balance:    actualWIPBalance,
      journal_entry_id:      result.entryId,
      cost_variance_id:      result.costVarianceId,
      has_cost_overrun:      overrunAmount > 0,
      capitalized_by:        userId,
      capitalized_at:        new Date(),
    };
  }

  // ---------------------------------------------------------------------------
  // NTPN RECORDING (Tax Compliance — Fase 3)
  //    Validasi dan catat Nomor Transaksi Penerimaan Negara untuk pajak
  // ---------------------------------------------------------------------------

/**
 * recordNTPN implements this operation using the typed arguments declared in its signature.
 *
 * @param input - Parameters declared by the function/method.
 * @returns The synchronous result or Promise produced below.
 * Database/side effects: uses `fin_tax_transaction`, `fin_bank_account`, `fin_bank_statement`; transaction scope is exactly the coded scope.
 */
  static async recordNTPN(
    taxTxId:      string,
    ntpn:         string,
    paymentRef:   string,
    paidAt:       Date,
  ) {
    const taxTx = await prisma.fin_tax_transaction.findUnique({ where: { id: taxTxId } });
    if (!taxTx) throw new NotFoundError('TaxTransaction');
    if (taxTx.status === 'PAID') throw new ValidationError('NTPN sudah pernah dicatat untuk transaksi pajak ini.');

    if (!ntpn || ntpn.trim().length < 4) {
      throw new ValidationError('NTPN tidak valid. NTPN harus berupa kode unik minimal 4 karakter.');
    }

    const updated = await prisma.fin_tax_transaction.update({
      where: { id: taxTxId },
      data: {
        ntpn,
        payment_reference: paymentRef,
        paid_at:           paidAt,
        status:            'PAID',
        validated_at:      new Date(),
      },
    });

    return {
      tax_transaction_id: taxTxId,
      ntpn,
      payment_reference:  paymentRef,
      paid_at:            paidAt,
      status:             'PAID',
      tax_amount:         updated.tax_amount,
      tax_direction:      updated.tax_direction,
      recorded_at:        new Date(),
    };
  }

  // ---------------------------------------------------------------------------
  // AUTO-IMPORT STATEMENT CSV & AUTO-MATCHING (Perbankan Tanpa Lisensi Mahal)
  // ---------------------------------------------------------------------------

/**
 * importBankStatementCSV implements this operation using the typed arguments declared in its signature.
 *
 * @param input - Parameters declared by the function/method.
 * @returns The synchronous result or Promise produced below.
 * Database/side effects: uses `fin_bank_account`, `fin_bank_statement`; transaction scope is exactly the coded scope.
 */
  static async importBankStatementCSV(params: {
    bankAccountId: string;
    csvContent:    string;
    companyId?:    string | null;
    userId?:       string;
  }) {
    const { bankAccountId, csvContent, companyId, userId } = params;

    const bankAcc = await prisma.fin_bank_account.findUnique({ where: { id: bankAccountId } });
    if (!bankAcc) throw new NotFoundError('BankAccount');

    const lines = csvContent
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length <= 1) {
      throw new ValidationError('File CSV kosong atau tidak memiliki baris transaksi.');
    }

    // Identifikasi header baris pertama
    const headerLine = lines[0].toLowerCase();
    const rows = lines.slice(1);

    const statementId = crypto.randomUUID();
    const statementNumber = `STMT-${Date.now().toString().slice(-6)}`;
    const now = new Date();

    const statement = await prisma.fin_bank_statement.create({
      data: {
        id:                 statementId,
        bank_account_id:    bankAccountId,
        statement_date:     now,
        opening_balance:    new Decimal(0),
        closing_balance:    new Decimal(0),
        status:             'IMPORTED',
      },
    });

    let importedCount = 0;
    let matchedCount = 0;
    let totalInflow = 0;
    let totalOutflow = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cols = row.includes(';') ? row.split(';') : row.split(',');
      if (cols.length < 3) continue;

      let dateStr = cols[0].replace(/['"]/g, '').trim();
/**
 * descStr implements a named function within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
      let descStr = (cols[1] || 'Transaksi Bank').replace(/['"]/g, '').trim();
/**
 * amountRaw implements a named function within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: No database operation is implied unless explicitly present in the implementation.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
      let amountRaw = (cols[2] || '0').replace(/['"]/g, '').trim();
/**
 * typeRaw implements a named function within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `fin_payment`, `fin_bank_statement_line`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
      let typeRaw = (cols[3] || '').replace(/['"]/g, '').trim().toUpperCase();

      let cleanAmount = amountRaw
        .replace(/rp/gi, '')
        .replace(/\s/g, '');

      let isNegative = cleanAmount.includes('-') || typeRaw === 'DB' || typeRaw === 'D' || typeRaw === 'DEBET';
      cleanAmount = cleanAmount.replace(/-/g, '');

      if (cleanAmount.includes('.') && cleanAmount.includes(',')) {
        cleanAmount = cleanAmount.replace(/\./g, '').replace(',', '.');
      } else if (cleanAmount.includes(',')) {
        cleanAmount = cleanAmount.replace(',', '.');
      }

      const numAmount = Math.abs(parseFloat(cleanAmount) || 0);
      if (numAmount <= 0) continue;

      let txDate = new Date();
      if (dateStr) {
        const parts = dateStr.split(/[\/\-]/);
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            txDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          } else {
            txDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
          }
        }
      }

      if (isNegative) totalOutflow += numAmount;
      else totalInflow += numAmount;

      const matchedPayment = await prisma.fin_payment.findFirst({
        where: {
          amount: new Decimal(numAmount),
          status: { in: ['POSTED', 'PAID', 'PENDING'] },
        },
      }).catch(() => null);

      const lineId = crypto.randomUUID();
      await prisma.fin_bank_statement_line.create({
        data: {
          id:                 lineId,
          bank_statement_id:  statementId,
          transaction_date:   isNaN(txDate.getTime()) ? now : txDate,
          reference_number:   `REF-${lineId.slice(-6)}`,
          description:        descStr,
          debit_amount:       isNegative ? new Decimal(numAmount) : new Decimal(0),
          credit_amount:      !isNegative ? new Decimal(numAmount) : new Decimal(0),
          running_balance:    new Decimal(0),
        },
      });

      importedCount++;
      if (matchedPayment) matchedCount++;
    }

    return {
      statement_id:         statementId,
      statement_number:     statementNumber,
      total_rows_imported:  importedCount,
      auto_matched_count:   matchedCount,
      unmatched_count:      importedCount - matchedCount,
      total_inflow:         totalInflow,
      total_outflow:        totalOutflow,
      imported_at:          now,
    };
  }

  // ---------------------------------------------------------------------------
  // EXECUTIVE GOVERNANCE & FINANCIAL AUDIT REPORT (Satu Lembar Direksi)
  // ---------------------------------------------------------------------------

/**
 * getExecutiveAuditReport implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `core_audit_event`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async getExecutiveAuditReport(companyId?: string | null, year?: number) {
    const targetYear = year || new Date().getFullYear();
    const startDate = new Date(targetYear, 0, 1);
    const endDate = new Date(targetYear, 11, 31, 23, 59, 59);

    // 1. Agregat Fund Requests & LPJ
    const fundAuditLogs = await prisma.core_audit_event.findMany({
      where: {
        entity_name: 'core_internal_request',
        event_type:  'CREATE_REQUEST',
        occurred_at: { gte: startDate, lte: endDate },
        ...(companyId ? { company_id: companyId } : {}),
      },
    }).catch(() => []);

    let totalFundRequested = 0;
    let totalFundDisbursed = 0;
    let totalLPJRealization = 0;
    let countFund = 0;
    let countDisbursed = 0;
    let countLPJClosed = 0;

    for (const log of fundAuditLogs) {
/**
 * p implements a named function within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `fin_cost_variance`, `fin_journal_entry`, `fin_fiscal_period`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
      const p = (log.after_data as any) || {};
      if (p.request_type === 'FUND_REQUEST' || p.amount) {
        countFund++;
        const amt = Number(p.amount || 0);
        totalFundRequested += amt;

        if (p.status === 'DISBURSED' || p.status === 'PENDING_LPJ_VERIFICATION' || p.status === 'COMPLETED') {
          countDisbursed++;
          totalFundDisbursed += amt;
        }

        if (p.status === 'COMPLETED') {
          countLPJClosed++;
          totalLPJRealization += Number(p.lpj?.realization_amount || amt);
        }
      }
    }

    // 2. Budget Variance Proyek
    const costVariances = await prisma.fin_cost_variance.findMany({
      where: {
        calculated_at: { gte: startDate, lte: endDate },
      },
      take: 10,
    }).catch(() => []);

    // 3. Jurnal Transaksi
    const journalEntries = await prisma.fin_journal_entry.findMany({
      where: {
        posting_date: { gte: startDate, lte: endDate },
      },
      select: {
        id:                    true,
        entry_number:          true,
        posting_date:          true,
        description:           true,
        reversal_of_entry_id:  true,
      },
      orderBy: { posting_date: 'desc' },
      take: 30,
    }).catch(() => []);

    // 4. Status Periode Tutup Buku
    const closedPeriods = await prisma.fin_fiscal_period.findMany({
      where: {
        status: { in: ['CLOSED', 'LOCKED'] },
      },
      take: 12,
    }).catch(() => []);

    return {
      year:               targetYear,
      company_id:         companyId,
      generated_at:       new Date(),
      fund_summary: {
        total_requests:    countFund,
        total_requested:   totalFundRequested,
        disbursed_count:   countDisbursed,
        total_disbursed:   totalFundDisbursed,
        lpj_closed_count:  countLPJClosed,
        total_realization: totalLPJRealization,
        lpj_compliance_rate: countDisbursed > 0 ? Math.round((countLPJClosed / countDisbursed) * 100) : 100,
      },
      budget_variance:     costVariances,
      critical_transactions: journalEntries.map(j => ({
        id:           j.id,
        entry_number: j.entry_number,
        date:         j.posting_date,
        description:  j.description,
        is_reversal:  Boolean(j.reversal_of_entry_id),
      })),
      adjustments:         journalEntries.filter(j => 
        Boolean(j.reversal_of_entry_id) || 
        j.description.toLowerCase().includes('penyesuaian') || 
        j.description.toLowerCase().includes('koreksi')
      ).map(a => ({
        id:           a.id,
        entry_number: a.entry_number,
        date:         a.posting_date,
        description:  a.description,
        is_reversal:  Boolean(a.reversal_of_entry_id),
      })),
      closed_periods_count: closedPeriods.length,
    };
  }
}
