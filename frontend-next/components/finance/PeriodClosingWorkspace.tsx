'use client';

import React, { useState, useEffect, useCallback } from 'react';

// =============================================================================
// PERIOD CLOSING WORKSPACE
// Fitur: Status periode fiskal, Checklist Tutup Buku, Year-End Closing, Storno Rollback
// =============================================================================

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

interface FiscalPeriod {
  id: string;
  period_number: number | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  fiscal_year_id: string | null;
}

interface FiscalYear {
  id: string;
  fiscal_year_name: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
}

interface YearEndResult {
  fiscal_year_name: string;
  total_revenue: number;
  total_expense: number;
  net_profit_loss: number;
  is_profit: boolean;
  closing_entry_id: string;
  nominal_accounts_closed: number;
}

const statusColor = (s: string) => {
  const m: Record<string, string> = {
    OPEN:   'bg-emerald-100 text-emerald-700',
    CLOSED: 'bg-gray-300 text-gray-700',
    LOCKED: 'bg-red-100 text-red-700',
  };
  return m[s] ?? 'bg-yellow-100 text-yellow-700';
};

const formatRp = (v: number) => `Rp ${v.toLocaleString('id-ID')}`;
const formatDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function PeriodClosingWorkspace() {
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Period close states
  const [closingPeriodId, setClosingPeriodId] = useState<string | null>(null);
  const [closingLoading, setClosingLoading] = useState(false);

  // Year-end closing states
  const [selectedYearId, setSelectedYearId] = useState<string>('');
  const [yearEndLoading, setYearEndLoading] = useState(false);
  const [yearEndResult, setYearEndResult] = useState<YearEndResult | null>(null);

  // Rollback states
  const [rollbackYearId, setRollbackYearId] = useState<string | null>(null);
  const [rollbackReason, setRollbackReason] = useState('');
  const [rollbackLoading, setRollbackLoading] = useState(false);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, yRes] = await Promise.all([
        fetch(`${API}/api/v1/finance/fiscal-periods/status`),
        fetch(`${API}/api/v1/finance/fiscal-years?page_size=10`),
      ]);
      const pJson = await pRes.json();
      const yJson = await yRes.json();
      setPeriods(pJson.data ?? []);
      setFiscalYears(yJson.data?.rows ?? yJson.data ?? []);
    } catch {
      showToast('Gagal memuat data periode fiskal.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const closePeriod = async (periodId: string) => {
    setClosingPeriodId(periodId);
    setClosingLoading(true);
    try {
      const res = await fetch(`${API}/api/v1/finance/fiscal-periods/${periodId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Gagal');
      showToast(`✅ Periode #${json.data?.period_number} berhasil ditutup. Snapshot disimpan.`, 'success');
      loadData();
    } catch (err: any) {
      showToast(`❌ ${err.message ?? 'Gagal menutup periode.'}`, 'error');
    } finally {
      setClosingLoading(false);
      setClosingPeriodId(null);
    }
  };

  const reopenPeriod = async (periodId: string) => {
    try {
      const res = await fetch(`${API}/api/v1/finance/fiscal-periods/${periodId}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Gagal');
      showToast('✅ Periode berhasil dibuka kembali.', 'success');
      loadData();
    } catch {
      showToast('❌ Gagal membuka kembali periode.', 'error');
    }
  };

  const executeYearEnd = async () => {
    if (!selectedYearId) return;
    setYearEndLoading(true);
    setYearEndResult(null);
    try {
      const res = await fetch(`${API}/api/v1/finance/fiscal-years/${selectedYearId}/year-end-closing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Gagal');
      setYearEndResult(json.data);
      showToast(`✅ Tutup buku tahunan ${json.data?.fiscal_year_name} berhasil!`, 'success');
      loadData();
    } catch (err: any) {
      showToast(`❌ ${err.message ?? 'Gagal menutup buku tahunan.'}`, 'error');
    } finally {
      setYearEndLoading(false);
    }
  };

  const executeRollback = async () => {
    if (!rollbackYearId || rollbackReason.trim().length < 10) return;
    setRollbackLoading(true);
    try {
      const res = await fetch(`${API}/api/v1/finance/fiscal-years/${rollbackYearId}/reopen-year-end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rollbackReason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Gagal');
      showToast(`✅ Rollback tutup buku tahunan berhasil. Jurnal Storno diterbitkan.`, 'success');
      setRollbackYearId(null);
      setRollbackReason('');
      loadData();
    } catch (err: any) {
      showToast(`❌ ${err.message ?? 'Gagal rollback tutup buku.'}`, 'error');
    } finally {
      setRollbackLoading(false);
    }
  };

  const openPeriods  = periods.filter(p => p.status === 'OPEN');
  const closedPeriods = periods.filter(p => p.status !== 'OPEN');
  const closedYears  = fiscalYears.filter(y => y.status === 'CLOSED');

  return (
    <div className="space-y-8">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium max-w-sm
          ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-text-primary">📅 Tutup Buku & Manajemen Periode</h2>
        <p className="text-xs text-text-secondary mt-0.5">
          Period Guard · Checklist Validator · Year-End Closing · Storno Rollback
        </p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
          <p className="text-3xl font-black text-emerald-400">{openPeriods.length}</p>
          <p className="text-xs text-text-secondary mt-1">Periode Aktif (OPEN)</p>
        </div>
        <div className="bg-gray-500/10 border border-gray-500/20 rounded-xl p-4 text-center">
          <p className="text-3xl font-black text-gray-400">{closedPeriods.length}</p>
          <p className="text-xs text-text-secondary mt-1">Periode Ditutup</p>
        </div>
        <div className="bg-brand-deep-green/10 border border-brand-deep-green/20 rounded-xl p-4 text-center">
          <p className="text-3xl font-black text-brand-deep-green">{fiscalYears.length}</p>
          <p className="text-xs text-text-secondary mt-1">Tahun Fiskal</p>
        </div>
      </div>

      {/* Fiscal Periods Table */}
      <div>
        <h3 className="text-sm font-bold text-text-primary mb-3">📋 Status Periode Fiskal</h3>
        {loading ? (
          <div className="text-center py-8 text-text-secondary text-sm animate-pulse">Memuat...</div>
        ) : periods.length === 0 ? (
          <div className="text-center py-8 text-text-secondary text-sm">Belum ada periode fiskal terdaftar.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  {['#', 'Periode', 'Tanggal Mulai', 'Tanggal Akhir', 'Status', 'Aksi'].map(h => (
                    <th key={h} className="py-2 px-3 text-left text-xs font-semibold text-text-secondary">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {periods.map(p => (
                  <tr key={p.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-2.5 px-3 text-text-secondary font-mono text-xs">{p.period_number ?? '—'}</td>
                    <td className="py-2.5 px-3 text-text-primary font-medium">Periode #{p.period_number ?? '—'}</td>
                    <td className="py-2.5 px-3 text-text-secondary text-xs">{formatDate(p.start_date)}</td>
                    <td className="py-2.5 px-3 text-text-secondary text-xs">{formatDate(p.end_date)}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor(p.status)}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex gap-1.5">
                        {p.status === 'OPEN' && (
                          <button
                            onClick={() => closePeriod(p.id)}
                            disabled={closingLoading && closingPeriodId === p.id}
                            className="px-2 py-1 text-xs rounded-md bg-gray-500/20 text-gray-300 hover:bg-gray-500/30 transition-colors disabled:opacity-50"
                          >
                            {closingLoading && closingPeriodId === p.id ? '⏳...' : '🔒 Tutup Buku'}
                          </button>
                        )}
                        {p.status === 'CLOSED' && (
                          <button
                            onClick={() => reopenPeriod(p.id)}
                            className="px-2 py-1 text-xs rounded-md bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors"
                          >
                            🔓 Buka Kembali
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Year-End Closing Section */}
      <div className="bg-white/5 rounded-2xl border border-white/10 p-6">
        <h3 className="text-sm font-bold text-text-primary mb-1">📆 Tutup Buku Tahunan (Year-End Closing)</h3>
        <p className="text-xs text-text-secondary mb-4">
          Zero-out akun nominal (4xxx, 5xxx, 6xxx) → selisih laba/rugi masuk ke <span className="font-mono text-brand-green">3200 Laba Ditahan</span>
        </p>

        <div className="flex gap-3 items-center flex-wrap">
          <select
            value={selectedYearId}
            onChange={e => setSelectedYearId(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-white/10 bg-white/5 text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-green/40"
          >
            <option value="">— Pilih Tahun Fiskal —</option>
            {fiscalYears.filter(y => y.status === 'OPEN').map(y => (
              <option key={y.id} value={y.id}>{y.fiscal_year_name}</option>
            ))}
          </select>
          <button
            onClick={executeYearEnd}
            disabled={!selectedYearId || yearEndLoading}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-brand-deep-green text-white hover:bg-brand-green transition-colors disabled:opacity-50"
          >
            {yearEndLoading ? '⏳ Memproses Year-End...' : '⚡ Eksekusi Tutup Buku Tahunan'}
          </button>
        </div>

        {/* Year-End Result */}
        {yearEndResult && (
          <div className="mt-4 p-4 rounded-xl border border-white/10 bg-white/5">
            <p className="text-xs font-bold text-text-primary mb-2">✅ Hasil Tutup Buku: {yearEndResult.fiscal_year_name}</p>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-text-secondary">Total Pendapatan</p>
                <p className="text-sm font-bold text-brand-deep-green">{formatRp(yearEndResult.total_revenue)}</p>
              </div>
              <div>
                <p className="text-xs text-text-secondary">Total Beban</p>
                <p className="text-sm font-bold text-red-400">{formatRp(yearEndResult.total_expense)}</p>
              </div>
              <div>
                <p className="text-xs text-text-secondary">Laba / Rugi Bersih</p>
                <p className={`text-sm font-black ${yearEndResult.is_profit ? 'text-emerald-400' : 'text-red-400'}`}>
                  {yearEndResult.is_profit ? '+' : '-'}{formatRp(Math.abs(yearEndResult.net_profit_loss))}
                </p>
              </div>
            </div>
            <p className="text-xs text-text-secondary mt-2 text-center">
              Jurnal Penutup ID: <span className="font-mono text-xs">{yearEndResult.closing_entry_id.slice(0, 8)}...</span>
              · {yearEndResult.nominal_accounts_closed} akun nominal ditutup
            </p>
          </div>
        )}
      </div>

      {/* Year-End Rollback Section */}
      {closedYears.length > 0 && (
        <div className="bg-red-500/5 rounded-2xl border border-red-500/20 p-6">
          <h3 className="text-sm font-bold text-red-400 mb-1">↩️ Rollback Tutup Buku Tahunan (Storno)</h3>
          <p className="text-xs text-text-secondary mb-4">
            Hanya Superadmin / Direktur. Menerbitkan jurnal pembalik atas jurnal penutup tahunan.
            Riwayat data historis tetap tersimpan (Immutable Audit Trail).
          </p>
          <div className="flex gap-3 flex-wrap">
            <select
              value={rollbackYearId ?? ''}
              onChange={e => setRollbackYearId(e.target.value || null)}
              className="px-3 py-2 text-sm rounded-lg border border-red-500/20 bg-white/5 text-text-primary focus:outline-none focus:ring-2 focus:ring-red-500/40"
            >
              <option value="">— Pilih Tahun yang Akan Di-rollback —</option>
              {closedYears.map(y => (
                <option key={y.id} value={y.id}>{y.fiscal_year_name} (CLOSED)</option>
              ))}
            </select>
          </div>
          {rollbackYearId && (
            <div className="mt-3 space-y-2">
              <input
                type="text"
                value={rollbackReason}
                onChange={e => setRollbackReason(e.target.value)}
                placeholder="Alasan pembukaan kembali (min. 10 karakter)..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-red-500/20 bg-white/5 text-text-primary focus:outline-none focus:ring-2 focus:ring-red-500/40"
              />
              <button
                onClick={executeRollback}
                disabled={rollbackLoading || rollbackReason.trim().length < 10}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {rollbackLoading ? '⏳ Memproses Storno...' : '↩️ Konfirmasi Rollback via Storno'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
