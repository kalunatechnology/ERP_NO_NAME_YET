import { Decimal } from '@prisma/client/runtime/library';
import prisma from '../../config/database';
import { AccountingError, NotFoundError, ValidationError } from '../../utils/errors';
import { PeriodClosingService } from '../finance/period-closing.service';
import { AuditService } from '../core/audit.service';

// =============================================================================
// ASSET SERVICE — Enterprise Fixed Asset Engine
// Mengimplementasikan:
//   - runMonthlyDepreciation : Garis lurus + Idempotency Guard + Decimal Residual Adjustment
//   - runBatchDepreciation   : Chunked batch (50 aset/batch) anti-timeout & row-locking
//   - getDepreciationSchedule: Preview jadwal penyusutan sepanjang umur ekonomis
//   - disposeAsset           : Pelepasan aset + auto-jurnal GL Laba/Rugi
// =============================================================================

// Kode akun default untuk modul aset (sesuai Standard COA)
const COA_ACCUMULATED_DEPRECIATION = '1200'; // Akun Kontra Aset — Akumulasi Penyusutan
const COA_DEPRECIATION_EXPENSE     = '6200'; // Beban Penyusutan
const COA_ASSET_DISPOSAL_GAIN      = '4200'; // Pendapatan Lain-lain (Laba Pelepasan Aset)
const COA_ASSET_DISPOSAL_LOSS      = '6200'; // Beban Operasional (Rugi Pelepasan Aset)

export class AssetService {

  // ---------------------------------------------------------------------------
  // HELPER: Resolve akun GL dari kategori aset atau fallback ke COA default
  // ---------------------------------------------------------------------------

  private static async resolveAssetAccounts(categoryId: string | null, companyId: string | null) {
    const category = categoryId
      ? await prisma.asset_category.findUnique({ where: { id: categoryId } })
      : null;

    const findAccount = async (accountId: string | null | undefined, fallbackCode: string) => {
      if (accountId) {
        const acc = await prisma.fin_account.findUnique({ where: { id: accountId } });
        if (acc) return acc;
      }
      // Fallback ke akun berdasarkan kode
      return await prisma.fin_account.findFirst({
        where: {
          account_code: fallbackCode,
          ...(companyId ? { company_id: companyId } : {}),
        },
      });
    };

    const [depreciationExpenseAccount, accumulatedDeprAccount] = await Promise.all([
      findAccount(category?.depreciation_expense_account_id, COA_DEPRECIATION_EXPENSE),
      findAccount(category?.accumulated_depreciation_account_id, COA_ACCUMULATED_DEPRECIATION),
    ]);

    return { depreciationExpenseAccount, accumulatedDeprAccount };
  }

  // ---------------------------------------------------------------------------
  // 1. MONTHLY DEPRECIATION ENGINE (Single Asset)
  //    Straight-Line Method + Idempotency Guard + Decimal Residual Adjustment
  // ---------------------------------------------------------------------------

  static async runMonthlyDepreciation(assetId: string, periodDate: Date, userId: string) {
    const asset = await prisma.asset_asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundError('Asset');
    if (asset.status !== 'ACTIVE') {
      throw new ValidationError(`Aset "${asset.asset_name}" tidak aktif (status: ${asset.status}).`);
    }

    // Cari asset_book (GAAP/Commercial book)
    const book = await prisma.asset_book.findFirst({ where: { asset_id: assetId } });
    if (!book) throw new NotFoundError('AssetBook');

    // ==== IDEMPOTENCY GUARD ====
    // Cek apakah sudah pernah disusutkan pada bulan & tahun yang sama
    const periodMonth = periodDate.getMonth();
    const periodYear  = periodDate.getFullYear();

    const existingDepreciation = await prisma.asset_depreciation_line.findFirst({
      where: {
        asset_book_id: book.id,
        depreciation_date: {
          gte: new Date(periodYear, periodMonth, 1),
          lte: new Date(periodYear, periodMonth + 1, 0), // Last day of month
        },
      },
    });

    if (existingDepreciation) {
      return {
        skipped:        true,
        reason:         'IDEMPOTENT — Aset sudah disusutkan pada periode ini.',
        asset_id:       assetId,
        asset_name:     asset.asset_name,
        period_date:    periodDate,
        existing_line:  existingDepreciation.id,
      };
    }

    // ==== PERIOD GUARD (Defense-in-Depth di level service) ====
    await PeriodClosingService.assertPeriodOpen(periodDate, asset.company_id ?? null);

    // ==== KALKULASI DEPRESIASI (Decimal Precision) ====
    const costBasis      = new Decimal(book.cost_basis      ?? asset.acquisition_cost ?? 0);
    const salvageValue   = new Decimal(book.salvage_value   ?? asset.salvage_value    ?? 0);
    const usefulLifeMonths = book.useful_life_periods ?? asset.useful_life_months ?? 60;
    const currentBookValue = new Decimal(book.net_book_value ?? costBasis);
    const accumulatedDepr  = new Decimal(book.accumulated_depreciation ?? 0);

    // Hitung berapa bulan penyusutan yang sudah terjadi
    const startDate = book.depreciation_start_date ?? asset.available_for_use_date ?? asset.acquisition_date;
    const monthsDepreciated = startDate
      ? Math.floor((periodDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44))
      : 0;
    const isLastPeriod = monthsDepreciated >= (usefulLifeMonths - 1);

    // ==== DECIMAL RESIDUAL ADJUSTMENT ====
    // Pada bulan terakhir: ambil seluruh sisa nilai buku - salvage value
    // Ini mencegah selisih pembulatan (penny discrepancy) di akhir masa manfaat
    let depreciationAmount: Decimal;
    if (isLastPeriod && currentBookValue.greaterThan(salvageValue)) {
      depreciationAmount = currentBookValue.minus(salvageValue);
    } else {
      // Straight-line: (Cost - Salvage) / Useful Life Months
      const depreciableBase = costBasis.minus(salvageValue);
      depreciationAmount    = depreciableBase.dividedBy(usefulLifeMonths).toDecimalPlaces(2);
    }

    // Pastikan tidak melebihi sisa nilai buku
    const maxDepreciation = currentBookValue.minus(salvageValue);
    if (depreciationAmount.greaterThan(maxDepreciation)) {
      depreciationAmount = maxDepreciation;
    }

    if (depreciationAmount.lessThanOrEqualTo(0)) {
      return {
        skipped:    true,
        reason:     'Nilai buku sudah mencapai salvage value — tidak ada penyusutan lebih lanjut.',
        asset_id:   assetId,
        asset_name: asset.asset_name,
      };
    }

    const newAccumulatedDepr = accumulatedDepr.plus(depreciationAmount);
    const newBookValue       = currentBookValue.minus(depreciationAmount);

    // ==== RESOLVE AKUN GL ====
    const { depreciationExpenseAccount, accumulatedDeprAccount } =
      await this.resolveAssetAccounts(asset.category_id, asset.company_id);

    if (!depreciationExpenseAccount || !accumulatedDeprAccount) {
      throw new AccountingError(
        'Akun GL untuk Beban Penyusutan (6200) atau Akumulasi Penyusutan (1200) tidak ditemukan. ' +
        'Jalankan /api/v1/finance/accounts/setup-standard terlebih dahulu.'
      );
    }

    // ==== POST JURNAL GL & UPDATE BUKU ASET dalam satu transaction ====
    const result = await prisma.$transaction(async (tx) => {
      // Buat Journal Entry
      const entryId = crypto.randomUUID();
      const journalEntry = await tx.fin_journal_entry.create({
        data: {
          id:           entryId,
          entry_number: `DEP-${asset.asset_code}-${periodYear}${String(periodMonth + 1).padStart(2, '0')}`,
          description:  `Penyusutan Bulanan: ${asset.asset_name} — ${periodDate.toLocaleString('id-ID', { month: 'long', year: 'numeric' })}`,
          status:       'POSTED',
          posting_date: periodDate,
          source_document_id: assetId,
        },
      });

      // Debit Beban Penyusutan (6200)
      await tx.fin_journal_line.create({
        data: {
          id:               crypto.randomUUID(),
          journal_entry_id: entryId,
          account_id:       depreciationExpenseAccount.id,
          debit_base:       depreciationAmount,
          credit_base:      null,
        },
      });

      // Credit Akumulasi Penyusutan (1200)
      await tx.fin_journal_line.create({
        data: {
          id:               crypto.randomUUID(),
          journal_entry_id: entryId,
          account_id:       accumulatedDeprAccount.id,
          debit_base:       null,
          credit_base:      depreciationAmount,
        },
      });

      // Catat Depreciation Line
      const deprLine = await tx.asset_depreciation_line.create({
        data: {
          id:                      crypto.randomUUID(),
          asset_book_id:           book.id,
          depreciation_date:       periodDate,
          opening_book_value:      currentBookValue,
          depreciation_amount:     depreciationAmount,
          accumulated_depreciation: newAccumulatedDepr,
          closing_book_value:      newBookValue,
          journal_entry_id:        entryId,
          status:                  'POSTED',
        },
      });

      // Update Asset Book
      await tx.asset_book.update({
        where: { id: book.id },
        data: {
          accumulated_depreciation: newAccumulatedDepr,
          net_book_value:           newBookValue,
        },
      });

      return { journalEntry, deprLine };
    });

    await AuditService.logDeltaEvent({
      entity:      'asset_book',
      entityId:    book.id,
      action:      'DEPRECIATION_RUN',
      before:      { net_book_value: String(currentBookValue), accumulated_depreciation: String(accumulatedDepr) },
      after:       { net_book_value: String(newBookValue), accumulated_depreciation: String(newAccumulatedDepr) },
      userId,
      description: `Penyusutan ${periodDate.toLocaleString('id-ID', { month: 'long', year: 'numeric' })} untuk aset ${asset.asset_name}`,
    });

    return {
      skipped:                  false,
      asset_id:                 assetId,
      asset_name:               asset.asset_name,
      period_date:              periodDate,
      opening_book_value:       currentBookValue.toNumber(),
      depreciation_amount:      depreciationAmount.toNumber(),
      accumulated_depreciation: newAccumulatedDepr.toNumber(),
      closing_book_value:       newBookValue.toNumber(),
      is_residual_adjustment:   isLastPeriod,
      journal_entry_id:         result.journalEntry.id,
      depreciation_line_id:     result.deprLine.id,
    };
  }

  // ---------------------------------------------------------------------------
  // 2. BATCH DEPRECIATION (Chunked 50 aset/batch — Anti-Timeout & Anti-Locking)
  // ---------------------------------------------------------------------------

  static async runBatchDepreciation(periodDate: Date, companyId: string, userId: string) {
    // Ambil semua aset aktif milik perusahaan
    const allActiveAssets = await prisma.asset_asset.findMany({
      where: {
        status:     'ACTIVE',
        ...(companyId ? { company_id: companyId } : {}),
      },
      select: { id: true, asset_name: true },
    });

    const CHUNK_SIZE = 50;
    const results: Array<{
      asset_id:   string;
      asset_name: string;
      status:     'PROCESSED' | 'SKIPPED' | 'ERROR';
      reason?:    string;
    }> = [];

    // Proses per chunk untuk mencegah row-locking massal
    for (let i = 0; i < allActiveAssets.length; i += CHUNK_SIZE) {
      const chunk = allActiveAssets.slice(i, i + CHUNK_SIZE);
      await Promise.allSettled(
        chunk.map(async (asset) => {
          try {
            const result = await this.runMonthlyDepreciation(asset.id, periodDate, userId);
            results.push({
              asset_id:   asset.id,
              asset_name: asset.asset_name,
              status:     result.skipped ? 'SKIPPED' : 'PROCESSED',
              reason:     result.skipped ? (result as any).reason : undefined,
            });
          } catch (err: unknown) {
            results.push({
              asset_id:   asset.id,
              asset_name: asset.asset_name,
              status:     'ERROR',
              reason:     err instanceof Error ? err.message : 'Unknown error',
            });
          }
        })
      );
    }

    const summary = {
      total_assets: allActiveAssets.length,
      processed:    results.filter(r => r.status === 'PROCESSED').length,
      skipped:      results.filter(r => r.status === 'SKIPPED').length,
      errors:       results.filter(r => r.status === 'ERROR').length,
      period_date:  periodDate,
      company_id:   companyId,
      executed_by:  userId,
      executed_at:  new Date(),
      details:      results,
    };

    return summary;
  }

  // ---------------------------------------------------------------------------
  // 3. DEPRECIATION SCHEDULE PREVIEW
  //    Generate jadwal penyusutan lengkap sepanjang umur ekonomis aset.
  // ---------------------------------------------------------------------------

  static async getDepreciationSchedule(assetId: string) {
    const asset = await prisma.asset_asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundError('Asset');

    const book = await prisma.asset_book.findFirst({ where: { asset_id: assetId } });
    if (!book) throw new NotFoundError('AssetBook');

    const costBasis        = new Decimal(book.cost_basis      ?? asset.acquisition_cost ?? 0);
    const salvageValue     = new Decimal(book.salvage_value   ?? asset.salvage_value    ?? 0);
    const usefulLifeMonths = book.useful_life_periods ?? asset.useful_life_months ?? 60;
    const startDate        = book.depreciation_start_date ?? asset.available_for_use_date ?? asset.acquisition_date ?? new Date();
    const monthlyDepr      = costBasis.minus(salvageValue).dividedBy(usefulLifeMonths).toDecimalPlaces(2);

    const schedule: Array<{
      period_number:          number;
      period_date:            Date;
      opening_book_value:     number;
      depreciation_amount:    number;
      accumulated_depreciation: number;
      closing_book_value:     number;
      is_residual_adjustment: boolean;
    }> = [];

    let currentBookValue    = new Decimal(costBasis);
    let accumulatedDepr     = new Decimal(0);

    for (let month = 0; month < usefulLifeMonths; month++) {
      const periodDate        = new Date(startDate);
      periodDate.setMonth(periodDate.getMonth() + month);
      const isLastPeriod      = month === usefulLifeMonths - 1;

      let deprAmount: Decimal;
      if (isLastPeriod) {
        deprAmount = currentBookValue.minus(salvageValue);
      } else {
        deprAmount = monthlyDepr;
      }

      // Pastikan tidak minus
      if (deprAmount.lessThan(0)) deprAmount = new Decimal(0);

      accumulatedDepr = accumulatedDepr.plus(deprAmount);
      const closingValue = currentBookValue.minus(deprAmount);

      schedule.push({
        period_number:           month + 1,
        period_date:             periodDate,
        opening_book_value:      currentBookValue.toNumber(),
        depreciation_amount:     deprAmount.toNumber(),
        accumulated_depreciation: accumulatedDepr.toNumber(),
        closing_book_value:      closingValue.toNumber(),
        is_residual_adjustment:  isLastPeriod,
      });

      currentBookValue = closingValue;
    }

    return {
      asset_id:            assetId,
      asset_name:          asset.asset_name,
      asset_code:          asset.asset_code,
      cost_basis:          costBasis.toNumber(),
      salvage_value:       salvageValue.toNumber(),
      useful_life_months:  usefulLifeMonths,
      monthly_depreciation: monthlyDepr.toNumber(),
      total_depreciation:  costBasis.minus(salvageValue).toNumber(),
      schedule,
    };
  }

  // ---------------------------------------------------------------------------
  // 4. ASSET DISPOSAL ENGINE
  //    Pelepasan aset + auto-jurnal GL (Laba / Rugi Pelepasan Aset)
  // ---------------------------------------------------------------------------

  static async disposeAsset(assetId: string, disposalDate: Date, proceedsAmount: number, userId: string) {
    const asset = await prisma.asset_asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundError('Asset');
    if (asset.status !== 'ACTIVE') throw new ValidationError('Hanya aset aktif yang dapat dilepas.');

    await PeriodClosingService.assertPeriodOpen(disposalDate, asset.company_id);

    const book = await prisma.asset_book.findFirst({ where: { asset_id: assetId } });
    if (!book) throw new NotFoundError('AssetBook');

    const netBookValue   = new Decimal(book.net_book_value ?? 0);
    const proceeds       = new Decimal(proceedsAmount);
    const gainOrLoss     = proceeds.minus(netBookValue); // Positif = Laba, Negatif = Rugi
    const isGain         = gainOrLoss.greaterThanOrEqualTo(0);

    // Resolve akun GL
    const assetAccount = await prisma.fin_account.findFirst({
      where: {
        account_code: COA_ACCUMULATED_DEPRECIATION,
        ...(asset.company_id ? { company_id: asset.company_id } : {}),
      },
    });
    const gainLossAccount = await prisma.fin_account.findFirst({
      where: {
        account_code: isGain ? COA_ASSET_DISPOSAL_GAIN : COA_ASSET_DISPOSAL_LOSS,
        ...(asset.company_id ? { company_id: asset.company_id } : {}),
      },
    });
    const cashAccount = await prisma.fin_account.findFirst({
      where: {
        account_code: '1110',
        ...(asset.company_id ? { company_id: asset.company_id } : {}),
      },
    });

    if (!assetAccount || !gainLossAccount || !cashAccount) {
      throw new AccountingError('Akun GL untuk pelepasan aset tidak lengkap. Jalankan setup-standard COA.');
    }

    const disposalRecord = await prisma.$transaction(async (tx) => {
      const entryId = crypto.randomUUID();

      await tx.fin_journal_entry.create({
        data: {
          id:                entryId,
          entry_number:      `DISP-${asset.asset_code}-${disposalDate.getTime()}`,
          description:       `Pelepasan Aset: ${asset.asset_name} — ${isGain ? 'Laba' : 'Rugi'} Rp ${Math.abs(gainOrLoss.toNumber()).toLocaleString()}`,
          status:            'POSTED',
          posting_date:      disposalDate,
          source_document_id: assetId,
        },
      });

      // Debit Kas/Bank (proceeds diterima)
      if (proceeds.greaterThan(0)) {
        await tx.fin_journal_line.create({
          data: {
            id: crypto.randomUUID(),
            journal_entry_id: entryId,
            account_id:  cashAccount.id,
            debit_base:  proceeds,
            credit_base: null,
          },
        });
      }

      // Debit Akumulasi Penyusutan (menghapus saldo kontra aset)
      const accumulatedDepr = new Decimal(book.accumulated_depreciation ?? 0);
      if (accumulatedDepr.greaterThan(0)) {
        await tx.fin_journal_line.create({
          data: {
            id: crypto.randomUUID(),
            journal_entry_id: entryId,
            account_id:  assetAccount.id,
            debit_base:  accumulatedDepr,
            credit_base: null,
          },
        });
      }

      // Credit Aset Tetap (menghapus nilai perolehan)
      const costBasis = new Decimal(book.cost_basis ?? asset.acquisition_cost ?? 0);
      await tx.fin_journal_line.create({
        data: {
          id: crypto.randomUUID(),
          journal_entry_id: entryId,
          account_id:  assetAccount.id,
          debit_base:  null,
          credit_base: costBasis,
        },
      });

      // Laba atau Rugi Pelepasan
      if (isGain && gainOrLoss.greaterThan(0)) {
        await tx.fin_journal_line.create({
          data: {
            id: crypto.randomUUID(),
            journal_entry_id: entryId,
            account_id:  gainLossAccount.id,
            debit_base:  null,
            credit_base: gainOrLoss,
          },
        });
      } else if (!isGain && gainOrLoss.lessThan(0)) {
        await tx.fin_journal_line.create({
          data: {
            id: crypto.randomUUID(),
            journal_entry_id: entryId,
            account_id:  gainLossAccount.id,
            debit_base:  gainOrLoss.abs(),
            credit_base: null,
          },
        });
      }

      // Catat disposal record
      const disposal = await tx.asset_disposal.create({
        data: {
          id:                crypto.randomUUID(),
          asset_id:          assetId,
          disposal_date:     disposalDate,
          disposal_proceeds: proceeds,
          net_book_value:    netBookValue,
          gain_or_loss:      gainOrLoss,
          journal_entry_id:  entryId,
          status:            'COMPLETED',
        },
      });

      // Update status aset menjadi DISPOSED
      await tx.asset_asset.update({
        where: { id: assetId },
        data:  { status: 'DISPOSED' },
      });

      return { disposal, entryId };
    });

    await AuditService.logDeltaEvent({
      entity:    'asset_asset',
      entityId:  assetId,
      action:    'ASSET_DISPOSED',
      before:    { status: 'ACTIVE', net_book_value: netBookValue.toNumber() },
      after:     { status: 'DISPOSED', gain_or_loss: gainOrLoss.toNumber() },
      userId,
      description: `Pelepasan aset ${asset.asset_name}. ${isGain ? 'Laba' : 'Rugi'}: Rp ${gainOrLoss.abs().toNumber().toLocaleString()}`,
    });

    return {
      asset_id:        assetId,
      asset_name:      asset.asset_name,
      disposal_date:   disposalDate,
      proceeds_amount: proceeds.toNumber(),
      net_book_value:  netBookValue.toNumber(),
      gain_or_loss:    gainOrLoss.toNumber(),
      is_gain:         isGain,
      journal_entry_id: disposalRecord.entryId,
      disposal_id:     disposalRecord.disposal.id,
    };
  }
}
