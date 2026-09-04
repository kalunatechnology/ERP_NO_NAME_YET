/**
 * File: backend-express/src/modules/finance/period-closing.service.ts
 *
 * Purpose: Implements domain service responsibilities for the finance domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import prisma from '../../config/database';
import { Decimal } from '@prisma/client/runtime/library';
import { AccountingError, NotFoundError, ValidationError } from '../../utils/errors';
import { AuditService } from '../core/audit.service';

// =============================================================================
// PERIOD CLOSING SERVICE
// Mengimplementasikan:
//   - assertPeriodOpen     : Defense-in-depth guard di level service
//   - closeFiscalPeriod    : Tutup buku bulanan + generate snapshot saldo
//   - executeYearEndClosing: Tutup buku tahunan + zero-out nominal accounts
//   - reopenFiscalYear     : Rollback via Storno (Otorisasi Direktur/Superadmin)
// Schema facts:
//   fin_fiscal_year  : id, fiscal_year_name, start_date, end_date, status, company_id
//   fin_fiscal_period: id, fiscal_year_id, period_number, start_date, end_date, status
//   fin_account      : id, account_code, account_name, account_type, normal_balance, status
// =============================================================================

export class PeriodClosingService {

  // ---------------------------------------------------------------------------
  // 1. PERIOD GUARD (Defense-in-Depth)
  //    Dipanggil dari DALAM core service method, bukan hanya HTTP router.
  // ---------------------------------------------------------------------------

/**
 * assertPeriodOpen implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `fin_fiscal_period`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async assertPeriodOpen(postingDate: Date, companyId?: string | null): Promise<void> {
    const period = await prisma.fin_fiscal_period.findFirst({
      where: {
        ...(companyId ? { company_id: companyId } : {}),
        start_date: { lte: postingDate },
        end_date:   { gte: postingDate },
      },
    });

    if (!period) return; // Tidak ada periode terdaftar — biarkan lewat (data awal)

    if (period.status === 'CLOSED' || period.status === 'LOCKED') {
      throw new AccountingError(
        `Periode fiskal #${period.period_number ?? 'N/A'} sudah ditutup (${period.status}). ` +
        `Jurnal tidak dapat diposting. Hubungi Finance Manager untuk membuka kembali periode.`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 2. MONTHLY PERIOD CLOSING (Tutup Buku Bulanan)
  //    Validasi checklist -> Generate Snapshot -> Tutup periode
  // ---------------------------------------------------------------------------

/**
 * closeFiscalPeriod implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `fin_fiscal_period`, `fin_journal_entry`, `fin_journal_line`, `fin_account`, `fin_financial_snapshot`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async closeFiscalPeriod(periodId: string, closedByUserId: string) {
    const period = await prisma.fin_fiscal_period.findUnique({ where: { id: periodId } });
    if (!period) throw new NotFoundError('FiscalPeriod');
    if (period.status !== 'OPEN') throw new ValidationError(`Periode sudah berstatus ${period.status}.`);

    // Checklist: tidak ada jurnal DRAFT di periode ini
    const draftJournals = await prisma.fin_journal_entry.count({
      where: {
        ...(period.company_id ? { company_id: period.company_id } : {}),
        status: 'DRAFT',
        posting_date: {
          gte: period.start_date ?? undefined,
          lte: period.end_date   ?? undefined,
        },
      },
    });
    if (draftJournals > 0) {
      throw new AccountingError(
        `Masih ada ${draftJournals} jurnal berstatus DRAFT di periode ini. Posting atau hapus sebelum menutup buku.`
      );
    }

    // Generate Period Financial Snapshot (ringkasan P&L periode)
    const postedIds = await prisma.fin_journal_entry.findMany({
      where: {
        ...(period.company_id ? { company_id: period.company_id } : {}),
        status:       'POSTED',
        posting_date: {
          gte: period.start_date ?? undefined,
          lte: period.end_date   ?? undefined,
        },
      },
      select: { id: true },
    }).then(r => r.map(e => e.id));

    const lines = await prisma.fin_journal_line.findMany({
      where: { journal_entry_id: { in: postedIds } },
    });

    // Hitung revenue vs expense untuk periode ini
    const accounts = await prisma.fin_account.findMany({
      where: period.company_id ? { company_id: period.company_id } : undefined,
      select: { id: true, account_type: true, normal_balance: true },
    });
    const accTypeMap = new Map(accounts.map(a => [a.id, a]));

    let revenuePeriod = 0;
    let expensePeriod = 0;
    for (const line of lines) {
      const acc = accTypeMap.get(line.account_id ?? '');
      if (!acc) continue;
      const net = acc.normal_balance === 'DEBIT'
        ? Number(line.debit_base ?? 0) - Number(line.credit_base ?? 0)
        : Number(line.credit_base ?? 0) - Number(line.debit_base ?? 0);
      if (acc.account_type === 'REVENUE') revenuePeriod += net;
      if (acc.account_type === 'EXPENSE') expensePeriod += net;
    }

    // Simpan snapshot ringkasan ke fin_financial_snapshot
    await prisma.fin_financial_snapshot.create({
      data: {
        id:                  crypto.randomUUID(),
        fiscal_period_id:    periodId,
        tenant_id:           period.tenant_id,
        company_id:          period.company_id,
        snapshot_at:         new Date(),
        revenue_amount:      new Decimal(revenuePeriod),
        expense_amount:      new Decimal(expensePeriod),
        profit_loss_amount:  new Decimal(revenuePeriod - expensePeriod),
        snapshot_status:     'PERIOD_CLOSE',
      },
    }).catch(() => {
      // Skip jika snapshot table tidak ada — tidak kritis
      console.warn('[PeriodClosing] fin_financial_snapshot upsert skipped');
    });

    // Tutup periode
    const updatedPeriod = await prisma.fin_fiscal_period.update({
      where: { id: periodId },
      data:  { status: 'CLOSED' },
    });

    await AuditService.logDeltaEvent({
      entity:      'fin_fiscal_period',
      entityId:    periodId,
      action:      'PERIOD_CLOSE',
      before:      { status: 'OPEN' },
      after:       { status: 'CLOSED' },
      userId:      closedByUserId,
      description: `Tutup buku bulanan periode #${period.period_number}`,
    });

    return {
      period_id:        periodId,
      period_number:    period.period_number,
      status:           updatedPeriod.status,
      period_revenue:   revenuePeriod,
      period_expense:   expensePeriod,
      period_pl:        revenuePeriod - expensePeriod,
      journal_count:    postedIds.length,
      closed_by:        closedByUserId,
      closed_at:        new Date(),
    };
  }

  // ---------------------------------------------------------------------------
  // 3. YEAR-END CLOSING (Tutup Buku Tahunan)
  //    Zero-out akun nominal (4xxx, 5xxx, 6xxx) → Laba Ditahan 3200
  // ---------------------------------------------------------------------------

/**
 * executeYearEndClosing implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `fin_fiscal_year`, `fin_account`, `fin_journal_entry`, `fin_journal_line`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async executeYearEndClosing(fiscalYearId: string, companyId: string, closedByUserId: string) {
    const fiscalYear = await prisma.fin_fiscal_year.findUnique({ where: { id: fiscalYearId } });
    if (!fiscalYear) throw new NotFoundError('FiscalYear');
    if (fiscalYear.company_id && fiscalYear.company_id !== companyId) throw new ValidationError('Tahun fiskal berada di luar company aktif.');
    if (fiscalYear.status === 'CLOSED') throw new ValidationError('Tahun fiskal sudah pernah ditutup.');

    // Ambil akun nominal (Revenue 4xxx & Expense 5xxx/6xxx)
    const nominalAccounts = await prisma.fin_account.findMany({
      where: {
        ...(companyId ? { company_id: companyId } : {}),
        account_type: { in: ['REVENUE', 'EXPENSE'] },
      },
    });

    const yearStart = fiscalYear.start_date ?? new Date(`${new Date().getFullYear()}-01-01`);
    const yearEnd   = fiscalYear.end_date   ?? new Date(`${new Date().getFullYear()}-12-31`);

    const postedIds = await prisma.fin_journal_entry.findMany({
      where: {
        company_id: companyId,
        status:       'POSTED',
        posting_date: { gte: yearStart, lte: yearEnd },
      },
      select: { id: true },
    }).then(r => r.map(e => e.id));

    const lines = await prisma.fin_journal_line.findMany({
      where: { journal_entry_id: { in: postedIds } },
    });

    // Akumulasi saldo per akun nominal
    const accMap = new Map<string, number>();
    for (const line of lines) {
      if (!line.account_id) continue;
      const account = nominalAccounts.find(a => a.id === line.account_id);
      if (!account) continue;
      const netMutation = account.normal_balance === 'DEBIT'
        ? Number(line.debit_base ?? 0) - Number(line.credit_base ?? 0)
        : Number(line.credit_base ?? 0) - Number(line.debit_base ?? 0);
      accMap.set(line.account_id, (accMap.get(line.account_id) ?? 0) + netMutation);
    }

    let totalRevenue = 0;
    let totalExpense = 0;
    for (const acc of nominalAccounts) {
      const balance = accMap.get(acc.id) ?? 0;
      if (acc.account_type === 'REVENUE') totalRevenue += balance;
      if (acc.account_type === 'EXPENSE') totalExpense += balance;
    }
    const netProfitLoss = totalRevenue - totalExpense;

    // Pastikan akun 3200 (Laba Ditahan) tersedia
    let retainedEarningsAccount = await prisma.fin_account.findFirst({
      where: { account_code: '3200', ...(companyId ? { company_id: companyId } : {}) },
    });
    if (!retainedEarningsAccount) {
      retainedEarningsAccount = await prisma.fin_account.create({
        data: {
          id:                      crypto.randomUUID(),
          account_code:            '3200',
          account_name:            'Laba Ditahan (Retained Earnings)',
          account_type:            'EQUITY',
          normal_balance:          'CREDIT',
          company_id:              companyId,
          allow_manual_posting:    false,
          reconciliation_required: false,
          status:                  'ACTIVE',
        },
      });
    }

    // Buat Jurnal Penutup
    const closingEntryResult = await prisma.$transaction(async (tx) => {
      const entryId = crypto.randomUUID();
      const closingEntry = await tx.fin_journal_entry.create({
        data: {
          id:                entryId,
          entry_number:      `CLOSE-YEAR-${fiscalYear.fiscal_year_name}-${Date.now()}`,
          description:       `Jurnal Penutup Tahunan ${fiscalYear.fiscal_year_name}`,
          status:            'POSTED',
          posting_date:      yearEnd,
          source_document_id: fiscalYearId,
          company_id:         companyId,
          tenant_id:          fiscalYear.tenant_id,
        },
      });

      let linesCreated = 0;
      for (const acc of nominalAccounts) {
        const balance = accMap.get(acc.id) ?? 0;
        if (Math.abs(balance) < 0.01) continue;

        const isRevenue = acc.account_type === 'REVENUE';
        await tx.fin_journal_line.create({
          data: {
            id:               crypto.randomUUID(),
            journal_entry_id: entryId,
            account_id:       acc.id,
            // Revenue (CREDIT normal): Debit untuk zero-out
            // Expense (DEBIT normal): Credit untuk zero-out
            debit_base:  isRevenue ? new Decimal(Math.abs(balance)) : null,
            credit_base: isRevenue ? null : new Decimal(Math.abs(balance)),
          },
        });
        linesCreated++;
      }

      // Offset ke Laba Ditahan 3200
      if (Math.abs(netProfitLoss) > 0.01) {
        await tx.fin_journal_line.create({
          data: {
            id:               crypto.randomUUID(),
            journal_entry_id: entryId,
            account_id:       retainedEarningsAccount!.id,
            debit_base:  netProfitLoss < 0 ? new Decimal(Math.abs(netProfitLoss)) : null,
            credit_base: netProfitLoss >= 0 ? new Decimal(netProfitLoss) : null,
          },
        });
        linesCreated++;
      }

      // Tutup semua periode & tahun fiskal
      await tx.fin_fiscal_period.updateMany({
        where: { fiscal_year_id: fiscalYearId, company_id: companyId },
        data:  { status: 'CLOSED' },
      });
      await tx.fin_fiscal_year.update({
        where: { id: fiscalYearId },
        data:  { status: 'CLOSED' },
      });

      return { closingEntry, linesCreated };
    });

    await AuditService.logDeltaEvent({
      entity:      'fin_fiscal_year',
      entityId:    fiscalYearId,
      action:      'YEAR_END_CLOSING',
      before:      { status: 'OPEN', net_profit_loss: null },
      after:       { status: 'CLOSED', net_profit_loss: netProfitLoss },
      userId:      closedByUserId,
      description: `Tutup buku tahunan ${fiscalYear.fiscal_year_name}. Net P&L: ${netProfitLoss}`,
    });

    return {
      fiscal_year_id:          fiscalYearId,
      fiscal_year_name:        fiscalYear.fiscal_year_name,
      total_revenue:           totalRevenue,
      total_expense:           totalExpense,
      net_profit_loss:         netProfitLoss,
      is_profit:               netProfitLoss >= 0,
      closing_entry_id:        closingEntryResult.closingEntry.id,
      nominal_accounts_closed: closingEntryResult.linesCreated,
      closed_by:               closedByUserId,
      closed_at:               new Date(),
    };
  }

  // ---------------------------------------------------------------------------
  // 4. YEAR-END REOPEN (Rollback via Storno — Superadmin/Direktur Only)
  // ---------------------------------------------------------------------------

/**
 * reopenFiscalYear implements a named method within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `fin_fiscal_year`, `fin_journal_entry`, `fin_journal_line`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
  static async reopenFiscalYear(fiscalYearId: string, reason: string, reopenedByUserId: string) {
    if (!reason || reason.trim().length < 10) {
      throw new ValidationError('Alasan pembukaan kembali buku tahunan wajib diisi minimal 10 karakter.');
    }

    const fiscalYear = await prisma.fin_fiscal_year.findUnique({ where: { id: fiscalYearId } });
    if (!fiscalYear) throw new NotFoundError('FiscalYear');
    if (fiscalYear.status !== 'CLOSED') throw new ValidationError('Tahun fiskal belum ditutup.');

    // Temukan jurnal penutup tahunan
    const closingEntry = await prisma.fin_journal_entry.findFirst({
      where: {
        source_document_id: fiscalYearId,
        description:        { contains: 'Jurnal Penutup Tahunan' },
        status:             'POSTED',
      },
    });

    if (!closingEntry) {
      throw new AccountingError('Jurnal penutup tahunan tidak ditemukan. Tidak dapat me-rollback.');
    }

    const originalLines = await prisma.fin_journal_line.findMany({
      where: { journal_entry_id: closingEntry.id },
    });

    await prisma.$transaction(async (tx) => {
      const reversalEntryId = crypto.randomUUID();

      await tx.fin_journal_entry.create({
        data: {
          id:                   reversalEntryId,
          entry_number:         `REV-CLOSE-${fiscalYear.fiscal_year_name}-${Date.now()}`,
          description:          `ROLLBACK Jurnal Penutup ${fiscalYear.fiscal_year_name}: ${reason}`,
          status:               'POSTED',
          posting_date:         new Date(),
          reversal_of_entry_id: closingEntry.id,
          source_document_id:   fiscalYearId,
        },
      });

      // Balik semua baris (debit ↔ credit)
      for (const line of originalLines) {
        await tx.fin_journal_line.create({
          data: {
            id:               crypto.randomUUID(),
            journal_entry_id: reversalEntryId,
            account_id:       line.account_id,
            debit_base:       line.credit_base, // swap
            credit_base:      line.debit_base,  // swap
          },
        });
      }

      // Tandai jurnal penutup asli sebagai REVERSED
      await tx.fin_journal_entry.update({
        where: { id: closingEntry.id },
        data:  { status: 'REVERSED' },
      });

      // Buka kembali semua periode & tahun fiskal
      await tx.fin_fiscal_period.updateMany({
        where: { fiscal_year_id: fiscalYearId },
        data:  { status: 'OPEN' },
      });
      await tx.fin_fiscal_year.update({
        where: { id: fiscalYearId },
        data:  { status: 'OPEN' },
      });
    });

    await AuditService.logDeltaEvent({
      entity:      'fin_fiscal_year',
      entityId:    fiscalYearId,
      action:      'YEAR_END_REOPEN',
      before:      { status: 'CLOSED' },
      after:       { status: 'OPEN' },
      userId:      reopenedByUserId,
      description: `Reopen tahun fiskal ${fiscalYear.fiscal_year_name}: ${reason}`,
    });

    return {
      fiscal_year_id:   fiscalYearId,
      fiscal_year_name: fiscalYear.fiscal_year_name,
      status:           'OPEN',
      reversal_lines:   originalLines.length,
      reason,
      reopened_by:      reopenedByUserId,
      reopened_at:      new Date(),
    };
  }
}
