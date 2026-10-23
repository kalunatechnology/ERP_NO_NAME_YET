/**
 * File: backend-express/tests/test_depr.ts
 *
 * Skenario Pengujian Komprehensif Siklus Keuangan (Finance End-to-End) & Penyusutan Aset
 * Memvalidasi Alur Akuntansi Lengkap dan Dampaknya terhadap Buku Besar (General Ledger & Trial Balance).
 *
 * Alur yang diuji:
 * 1. Setup Chart of Accounts (COA) Standar & Rekening Kas/Bank
 * 2. Pengakuan Pendapatan & Piutang (Customer Invoicing)
 * 3. Penerimaan Pembayaran Pelanggan (Customer Receipt / Kas Masuk)
 * 4. Pengakuan Beban & Pembayaran Vendor (Disbursement / Kas Keluar)
 * 5. Perolehan Aset Tetap & Mesin Penyusutan Otomatis (Straight-Line Depreciation)
 * 6. Transfer Kas Internal Antar Bank (via Rekening Antara/Transit 1140)
 * 7. Jurnal Koreksi / Reversal (Storno)
 * 8. Evaluasi Buku Besar (General Ledger Detail) & Neraca Saldo (Trial Balance Balance Check)
 */

import assert from 'node:assert/strict';
import { Decimal } from '@prisma/client/runtime/library';

// Representasi Baris Buku Besar (Journal Line)
interface JournalLine {
  id: string;
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  normal_balance: 'DEBIT' | 'CREDIT';
  debit: number;
  credit: number;
  description: string;
  ref_number: string;
  date: Date;
}

// Representasi Header Jurnal
interface JournalEntry {
  id: string;
  entry_number: string;
  description: string;
  posting_date: Date;
  status: 'DRAFT' | 'POSTED' | 'REVERSED';
  lines: JournalLine[];
}

// Representasi Master Akun (COA)
interface Account {
  id: string;
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  normalBalance: 'DEBIT' | 'CREDIT';
}

// Master COA Standar ERP
const COA: Record<string, Account> = {
  KAS_BANK_UTAMA: { id: 'coa-1110', code: '1110', name: 'Kas & Rekening Bank Utama (BCA)', type: 'ASSET', normalBalance: 'DEBIT' },
  KAS_OPERASIONAL: { id: 'coa-1120', code: '1120', name: 'Kas Kecil / Operasional (Mandiri)', type: 'ASSET', normalBalance: 'DEBIT' },
  PIUTANG_USAHA: { id: 'coa-1130', code: '1130', name: 'Piutang Usaha (AR)', type: 'ASSET', normalBalance: 'DEBIT' },
  KAS_IN_TRANSIT: { id: 'coa-1140', code: '1140', name: 'Kas dalam Transit (Internal Transfer)', type: 'ASSET', normalBalance: 'DEBIT' },
  ASET_TETAP_PERALATAN: { id: 'coa-1200', code: '1200', name: 'Aset Tetap - Peralatan Proyek & IT', type: 'ASSET', normalBalance: 'DEBIT' },
  AKUMULASI_PENYUSUTAN: { id: 'coa-1210', code: '1210', name: 'Akumulasi Penyusutan Peralatan', type: 'ASSET', normalBalance: 'CREDIT' },
  HUTANG_USAHA: { id: 'coa-2110', code: '2110', name: 'Hutang Usaha / Vendor (AP)', type: 'LIABILITY', normalBalance: 'CREDIT' },
  HUTANG_PAJAK_PPN: { id: 'coa-2120', code: '2120', name: 'Hutang Pajak PPN Keluaran', type: 'LIABILITY', normalBalance: 'CREDIT' },
  MODAL_RETAINED_EARNINGS: { id: 'coa-3200', code: '3200', name: 'Laba Ditahan / Retained Earnings', type: 'EQUITY', normalBalance: 'CREDIT' },
  PENDAPATAN_PROYEK: { id: 'coa-4100', code: '4100', name: 'Pendapatan Jasa / Proyek', type: 'REVENUE', normalBalance: 'CREDIT' },
  BEBAN_OPERASIONAL: { id: 'coa-6100', code: '6100', name: 'Beban Operasional Proyek', type: 'EXPENSE', normalBalance: 'DEBIT' },
  BEBAN_PENYUSUTAN: { id: 'coa-6200', code: '6200', name: 'Beban Penyusutan Aset Tetap', type: 'EXPENSE', normalBalance: 'DEBIT' },
};

class GeneralLedgerEngine {
  private journalEntries: JournalEntry[] = [];

  // 1. Posting Jurnal ke Buku Besar (Double-Entry Guard)
  public postJournal(entryNumber: string, description: string, date: Date, lines: { account: Account; debit: number; credit: number }[]) {
    const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);

    // Keseimbangan Jurnal Wajib Seimbang (Debit == Credit)
    assert.equal(
      Math.round(totalDebit * 100),
      Math.round(totalCredit * 100),
      `Jurnal ${entryNumber} TIDAK BALANCE! Total Debit: ${totalDebit} vs Total Credit: ${totalCredit}`
    );

    const fullLines: JournalLine[] = lines.map((l, idx) => ({
      id: `${entryNumber}-line-${idx + 1}`,
      account_id: l.account.id,
      account_code: l.account.code,
      account_name: l.account.name,
      account_type: l.account.type,
      normal_balance: l.account.normalBalance,
      debit: l.debit,
      credit: l.credit,
      description,
      ref_number: entryNumber,
      date,
    }));

    const entry: JournalEntry = {
      id: `je-${entryNumber}`,
      entry_number: entryNumber,
      description,
      posting_date: date,
      status: 'POSTED',
      lines: fullLines,
    };

    this.journalEntries.push(entry);
    return entry;
  }

  // 2. Kalkulasi Trial Balance (Neraca Saldo) dari Seluruh Transaksi yang Terposting
  public getTrialBalance() {
    const accountMap: Record<string, { account: Account; totalDebit: number; totalCredit: number; netBalance: number }> = {};

    // Inisialisasi seluruh akun di COA
    for (const key of Object.keys(COA)) {
      const acc = COA[key];
      accountMap[acc.code] = { account: acc, totalDebit: 0, totalCredit: 0, netBalance: 0 };
    }

    // Akumulasi dari semua postingan jurnal
    for (const je of this.journalEntries) {
      if (je.status !== 'POSTED') continue;
      for (const line of je.lines) {
        if (!accountMap[line.account_code]) {
          accountMap[line.account_code] = {
            account: { id: line.account_id, code: line.account_code, name: line.account_name, type: line.account_type, normalBalance: line.normal_balance },
            totalDebit: 0,
            totalCredit: 0,
            netBalance: 0,
          };
        }
        accountMap[line.account_code].totalDebit += line.debit;
        accountMap[line.account_code].totalCredit += line.credit;
      }
    }

    let grandDebit = 0;
    let grandCredit = 0;

    const rows = Object.values(accountMap).map(row => {
      grandDebit += row.totalDebit;
      grandCredit += row.totalCredit;

      // Net balance dihitung sesuai saldo normal
      row.netBalance = row.account.normalBalance === 'DEBIT'
        ? row.totalDebit - row.totalCredit
        : row.totalCredit - row.totalDebit;

      return row;
    }).sort((a, b) => a.account.code.localeCompare(b.account.code));

    const isBalanced = Math.abs(grandDebit - grandCredit) < 0.01;

    return {
      rows,
      grandDebit,
      grandCredit,
      isBalanced,
    };
  }

  // 3. Ambil Buku Besar Spesifik Per Akun
  public getAccountLedger(accountCode: string) {
    const lines: JournalLine[] = [];
    for (const je of this.journalEntries) {
      if (je.status !== 'POSTED') continue;
      for (const line of je.lines) {
        if (line.account_code === accountCode) {
          lines.push(line);
        }
      }
    }
    return lines.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  public getEntries() {
    return this.journalEntries;
  }
}

// Mesin Simulasi Penyusutan Garis Lurus (Straight-Line)
function calculateStraightLineDepreciation(params: {
  acquisitionCost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  currentAccumulatedDepreciation: number;
  monthIndex: number; // Bulan ke-n (1 .. usefulLifeMonths)
}) {
  const cost = new Decimal(params.acquisitionCost);
  const salvage = new Decimal(params.salvageValue);
  const depreciableAmount = cost.minus(salvage);
  const life = new Decimal(params.usefulLifeMonths);

  if (params.monthIndex >= params.usefulLifeMonths) {
    // Bulan terakhir: selesaikan seluruh sisa pembulatan (residual adjustment)
    const remainingToDepreciate = depreciableAmount.minus(params.currentAccumulatedDepreciation);
    return Math.max(0, remainingToDepreciate.toNumber());
  }

  // Bulanan: depreciableAmount / usefulLifeMonths
  const monthly = depreciableAmount.dividedBy(life).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return monthly.toNumber();
}

async function runFinanceE2EScenario() {
  console.log('================================================================');
  console.log('   PENGUJIAN SKENARIO LENGKAP KEUANGAN & PEMANTAUAN BUKU BESAR  ');
  console.log('================================================================\n');

  const gl = new GeneralLedgerEngine();
  const formatIDR = (val: number) => `Rp ${val.toLocaleString('id-ID')}`;

  // ---------------------------------------------------------------------------
  // SKENARIO 1: Saldo Awal / Setoran Modal Awal
  // ---------------------------------------------------------------------------
  console.log('▶ [1/7] Inisialisasi Modal Awal Perusahaan');
  gl.postJournal('JE-001', 'Setoran Modal Pemegang Saham ke Bank Utama', new Date('2026-01-01'), [
    { account: COA.KAS_BANK_UTAMA, debit: 500_000_000, credit: 0 },
    { account: COA.MODAL_RETAINED_EARNINGS, debit: 0, credit: 500_000_000 },
  ]);
  console.log('   ✓ Terposting: Kas Bank Utama (+500 Jt) | Modal Laba Ditahan (+500 Jt)');

  // ---------------------------------------------------------------------------
  // SKENARIO 2: Pengakuan Pendapatan & Piutang (Customer Invoice Proyek)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [2/7] Penerbitan Invoice Tagihan Proyek Termin 1');
  const invoiceTotal = 111_000_000;
  const revenueSubtotal = 100_000_000;
  const ppn11 = 11_000_000;
  gl.postJournal('INV-2026-001', 'Tagihan Termin 1 Proyek Pembangunan Tower A', new Date('2026-01-05'), [
    { account: COA.PIUTANG_USAHA, debit: invoiceTotal, credit: 0 },
    { account: COA.PENDAPATAN_PROYEK, debit: 0, credit: revenueSubtotal },
    { account: COA.HUTANG_PAJAK_PPN, debit: 0, credit: ppn11 },
  ]);
  console.log('   ✓ Terposting: Piutang Usaha (+111 Jt) | Pendapatan Proyek (+100 Jt) | PPN (+11 Jt)');

  // ---------------------------------------------------------------------------
  // SKENARIO 3: Penerimaan Pembayaran Pelanggan (Customer Receipt)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [3/7] Pembayaran Invoice oleh Klien (Customer Receipt)');
  gl.postJournal('CR-2026-001', 'Penerimaan Pelunasan Invoice INV-2026-001 via Transfer Bank', new Date('2026-01-10'), [
    { account: COA.KAS_BANK_UTAMA, debit: invoiceTotal, credit: 0 },
    { account: COA.PIUTANG_USAHA, debit: 0, credit: invoiceTotal },
  ]);
  console.log('   ✓ Terposting: Kas Bank Utama (+111 Jt) | Piutang Usaha Lunas (-111 Jt)');

  // ---------------------------------------------------------------------------
  // SKENARIO 4: Pengeluaran Beban Operasional & Vendor (Disbursement)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [4/7] Pembayaran Beban Operasional Proyek');
  const biayaOps = 35_000_000;
  gl.postJournal('PV-2026-001', 'Pembayaran Sewa Crane & Operasional Lapangan', new Date('2026-01-15'), [
    { account: COA.BEBAN_OPERASIONAL, debit: biayaOps, credit: 0 },
    { account: COA.KAS_BANK_UTAMA, debit: 0, credit: biayaOps },
  ]);
  console.log('   ✓ Terposting: Beban Operasional Proyek (+35 Jt) | Kas Bank Utama (-35 Jt)');

  // ---------------------------------------------------------------------------
  // SKENARIO 5: Perolehan Aset Tetap & Mesin Penyusutan Otomatis (Depreciation)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [5/7] Perolehan Aset Tetap & Eksekusi Penyusutan Bulanan (Depreciation Engine)');
  const hargaPerolehanAset = 60_000_000;
  const nilaiSisa = 0;
  const umurEkonomisBulan = 24; // 2 tahun

  // 5a. Pembelian Aset Tetap
  gl.postJournal('AST-2026-001', 'Pembelian 5 Unit Laptop High-End & Server Proyek', new Date('2026-01-18'), [
    { account: COA.ASET_TETAP_PERALATAN, debit: hargaPerolehanAset, credit: 0 },
    { account: COA.KAS_BANK_UTAMA, debit: 0, credit: hargaPerolehanAset },
  ]);
  console.log('   ✓ Pembelian Aset: Aset Tetap Peralatan (+60 Jt) | Kas Bank Utama (-60 Jt)');

  // 5b. Eksekusi Penyusutan Bulan ke-1 (Januari 2026)
  const deprBulan1 = calculateStraightLineDepreciation({
    acquisitionCost: hargaPerolehanAset,
    salvageValue: nilaiSisa,
    usefulLifeMonths: umurEkonomisBulan,
    currentAccumulatedDepreciation: 0,
    monthIndex: 1,
  });
  assert.equal(deprBulan1, 2_500_000, 'Penyusutan per bulan harus 60jt / 24 = 2.5jt');

  gl.postJournal('DEP-AST-202601', 'Penyusutan Bulanan Aset Tetap - Periode Januari 2026', new Date('2026-01-31'), [
    { account: COA.BEBAN_PENYUSUTAN, debit: deprBulan1, credit: 0 },
    { account: COA.AKUMULASI_PENYUSUTAN, debit: 0, credit: deprBulan1 },
  ]);
  console.log(`   ✓ Penyusutan Bln 1: Beban Penyusutan (+${formatIDR(deprBulan1)}) | Akumulasi Penyusutan (+${formatIDR(deprBulan1)})`);

  // 5c. Eksekusi Penyusutan Bulan ke-2 (Februari 2026)
  const deprBulan2 = calculateStraightLineDepreciation({
    acquisitionCost: hargaPerolehanAset,
    salvageValue: nilaiSisa,
    usefulLifeMonths: umurEkonomisBulan,
    currentAccumulatedDepreciation: deprBulan1,
    monthIndex: 2,
  });
  gl.postJournal('DEP-AST-202602', 'Penyusutan Bulanan Aset Tetap - Periode Februari 2026', new Date('2026-02-28'), [
    { account: COA.BEBAN_PENYUSUTAN, debit: deprBulan2, credit: 0 },
    { account: COA.AKUMULASI_PENYUSUTAN, debit: 0, credit: deprBulan2 },
  ]);
  console.log(`   ✓ Penyusutan Bln 2: Beban Penyusutan (+${formatIDR(deprBulan2)}) | Akumulasi Penyusutan (+${formatIDR(deprBulan2)})`);

  // ---------------------------------------------------------------------------
  // SKENARIO 6: Transfer Kas Internal Antar Bank (via Rekening Antara / Transit 1140)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [6/7] Transfer Kas Internal dari Bank Utama ke Rekening Operasional Kas Kecil');
  const transferAmount = 25_000_000;
  // Step 1: Uang keluar dari Bank Utama menuju transit
  gl.postJournal('TRF-OUT-001', 'Transfer Dana Internal Bank Utama -> Kas Transit', new Date('2026-02-05'), [
    { account: COA.KAS_IN_TRANSIT, debit: transferAmount, credit: 0 },
    { account: COA.KAS_BANK_UTAMA, debit: 0, credit: transferAmount },
  ]);
  // Step 2: Uang diterima di Rekening Kas Operasional dari transit
  gl.postJournal('TRF-IN-001', 'Penerimaan Transfer Dana di Kas Operasional dari Kas Transit', new Date('2026-02-05'), [
    { account: COA.KAS_OPERASIONAL, debit: transferAmount, credit: 0 },
    { account: COA.KAS_IN_TRANSIT, debit: 0, credit: transferAmount },
  ]);
  console.log('   ✓ Kas Transit (1140) ter-offset menjadi Rp 0 (Zero Balance Transit)');
  console.log('   ✓ Saldo Bank Operasional bertambah Rp 25 Jt');

  // ---------------------------------------------------------------------------
  // SKENARIO 7: Jurnal Koreksi / Storno (Reversal)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [7/7] Jurnal Koreksi / Reversal (Storno) Sesuai Aturan Segregation of Duties');
  // Contoh: Salah pencatatan biaya perlengkapan 1 jt, kemudian dibatalkan dengan jurnal pembalik
  gl.postJournal('JE-ERR-001', 'Pencatatan Biaya Salah (Akan Dibatalkan)', new Date('2026-02-10'), [
    { account: COA.BEBAN_OPERASIONAL, debit: 1_000_000, credit: 0 },
    { account: COA.KAS_OPERASIONAL, debit: 0, credit: 1_000_000 },
  ]);
  gl.postJournal('REV-JE-ERR-001', 'Storno/Pembalikan: Pembatalan Transaksi Salah JE-ERR-001', new Date('2026-02-11'), [
    { account: COA.KAS_OPERASIONAL, debit: 1_000_000, credit: 0 },
    { account: COA.BEBAN_OPERASIONAL, debit: 0, credit: 1_000_000 },
  ]);
  console.log('   ✓ Transaksi salah dinetralkan kembali secara transparan di Buku Besar tanpa menghapus audit trail.');

  // ===========================================================================
  // EVALUASI BUKU BESAR & TRIAL BALANCE
  // ===========================================================================
  console.log('\n================================================================');
  console.log('     PEMANTAUAN HASIL PADA BUKU BESAR & NERACA SALDO (GL)       ');
  console.log('================================================================\n');

  const trialBalance = gl.getTrialBalance();

  console.log('KODE  | NAMA AKUN                            | TIPE     | TOTAL DEBIT     | TOTAL KREDIT    | SALDO AKHIR');
  console.log('------+--------------------------------------+----------+-----------------+-----------------+-----------------');
  for (const row of trialBalance.rows) {
    if (row.totalDebit === 0 && row.totalCredit === 0) continue;
    const code = row.account.code.padEnd(5);
    const name = row.account.name.padEnd(36).substring(0, 36);
    const type = row.account.type.padEnd(8);
    const deb = formatIDR(row.totalDebit).padStart(15);
    const crd = formatIDR(row.totalCredit).padStart(15);
    const net = `${row.account.normalBalance === 'CREDIT' ? '-' : ''}${formatIDR(row.netBalance)}`.padStart(15);
    console.log(`${code} | ${name} | ${type} | ${deb} | ${crd} | ${net}`);
  }
  console.log('------+--------------------------------------+----------+-----------------+-----------------+-----------------');
  console.log(`TOTAL GRAND AGGREGATION                      : DEBIT = ${formatIDR(trialBalance.grandDebit)} | KREDIT = ${formatIDR(trialBalance.grandCredit)}`);

  console.log('\n--- VALIDASI INTEGRITAS AKUNTANSI ---');
  console.log(`1. Status Keseimbangan (Trial Balance) : ${trialBalance.isBalanced ? '✅ SEIMBANG (BALANCED)' : '❌ TIDAK SEIMBANG'}`);
  assert.equal(trialBalance.isBalanced, true, 'Buku besar harus 100% seimbang!');

  // Validasi Saldo Spesifik
  const kasBank = trialBalance.rows.find(r => r.account.code === '1110')!;
  // Saldo Bank Utama = 500jt (modal) + 111jt (terima piutang) - 35jt (biaya) - 60jt (beli aset) - 25jt (transfer) = 491jt
  console.log(`2. Saldo Kas & Bank Utama (1110)       : ${formatIDR(kasBank.netBalance)} (Expected: Rp 491.000.000)`);
  assert.equal(kasBank.netBalance, 491_000_000);

  const piutang = trialBalance.rows.find(r => r.account.code === '1130')!;
  console.log(`3. Saldo Piutang Usaha (1130)          : ${formatIDR(piutang.netBalance)} (Expected: Rp 0 / LUNAS)`);
  assert.equal(piutang.netBalance, 0);

  const transit = trialBalance.rows.find(r => r.account.code === '1140')!;
  console.log(`4. Saldo Kas in Transit (1140)         : ${formatIDR(transit.netBalance)} (Expected: Rp 0 / ZEROED)`);
  assert.equal(transit.netBalance, 0);

  const asetTetap = trialBalance.rows.find(r => r.account.code === '1200')!;
  console.log(`5. Saldo Aset Tetap Peralatan (1200)   : ${formatIDR(asetTetap.netBalance)} (Expected: Rp 60.000.000)`);
  assert.equal(asetTetap.netBalance, 60_000_000);

  const akumPenyusutan = trialBalance.rows.find(r => r.account.code === '1210')!;
  console.log(`6. Akumulasi Penyusutan (1210)         : ${formatIDR(akumPenyusutan.netBalance)} (Expected: Rp 5.000.000)`);
  assert.equal(akumPenyusutan.netBalance, 5_000_000);

  const nilaiBukuAset = asetTetap.netBalance - akumPenyusutan.netBalance;
  console.log(`7. Net Book Value Aset Tetap (NBV)     : ${formatIDR(nilaiBukuAset)} (Expected: Rp 55.000.000)`);
  assert.equal(nilaiBukuAset, 55_000_000);

  const bebanPenyusutan = trialBalance.rows.find(r => r.account.code === '6200')!;
  console.log(`8. Beban Penyusutan Berjalan (6200)    : ${formatIDR(bebanPenyusutan.netBalance)} (Expected: Rp 5.000.000)`);
  assert.equal(bebanPenyusutan.netBalance, 5_000_000);

  // Detail Buku Besar Akun Penyusutan
  console.log('\n--- MUTASI BUKU BESAR AKUN PENYUSUTAN (Detail General Ledger: 6200 & 1210) ---');
  const ledgerBebanDepr = gl.getAccountLedger('6200');
  for (const line of ledgerBebanDepr) {
    console.log(`   [${line.date.toISOString().slice(0, 10)}] ${line.ref_number} - ${line.description} | Debit: ${formatIDR(line.debit)}`);
  }

  console.log('\n================================================================');
  console.log('   SEMUA SKENARIO FINANCE & BUKU BESAR BERHASIL TERVALIDASI!   ');
  console.log('================================================================\n');
}

runFinanceE2EScenario().catch(err => {
  console.error('FAILED:', err);
  process.exitCode = 1;
});
