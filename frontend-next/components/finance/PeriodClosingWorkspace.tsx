/**
 * File: frontend-next/components/finance/PeriodClosingWorkspace.tsx
 *
 * Purpose: Defines the React component and its user-facing responsibility in the Marka+/Arsalynk frontend.
 * Integration: Called by Next routing or parent components; API and browser-state effects are documented on the responsible functions below.
 * Boundary: This file owns presentation/orchestration only and relies on shared context/API modules for identity and persistence.
 */
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api/axios';
import { useAuth } from '@/contexts/AuthContext';
import { canPerform } from '@/lib/access/capability-contract';

// =============================================================================
// PERIOD CLOSING WORKSPACE
// Fitur: Status periode fiskal, Checklist Tutup Buku, Year-End Closing, Storno Rollback
// =============================================================================

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

interface PeriodClosingRequest {
  id: string;
  fiscal_period_id: string | null;
  document_id: string | null;
  closing_type: string;
  status: string;
  requested_by: string | null;
  approved_by: string | null;
  created_at: string | null;
}

const statusColor = (s: string) => {
  const m: Record<string, string> = {
    OPEN:   'bg-emerald-50 text-emerald-700 border border-emerald-200',
    CLOSED: 'bg-slate-100 text-slate-700 border border-slate-200',
    LOCKED: 'bg-rose-50 text-rose-700 border border-rose-200',
  };
  return m[s] ?? 'bg-amber-50 text-amber-700 border border-amber-200';
};

const formatRp = (v: number) => `Rp ${v.toLocaleString('id-ID')}`;
const formatDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const hasEnded = (d?: string | null) => Boolean(d && new Date(d).getTime() <= Date.now());

export default function PeriodClosingWorkspace() {
  const { user, userRole } = useAuth();
  const canOperateFinance = canPerform('finance:operate', userRole, {
    enabledModules: user?.enabled_modules,
    moduleAccess: user?.module_access,
  });
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [closingRequests, setClosingRequests] = useState<PeriodClosingRequest[]>([]);
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
      const [{ data: pJson }, { data: yJson }, { data: cJson }] = await Promise.all([
        api.get('/api/v1/finance/fiscal-periods/status'),
        api.get('/api/v1/finance/fiscal-years?page_size=10'),
        api.get('/api/v1/finance/period-closings?page_size=100'),
      ]);
      setPeriods(pJson.data ?? pJson.results ?? (Array.isArray(pJson) ? pJson : []));
      setFiscalYears(yJson.results ?? yJson.data?.rows ?? yJson.data ?? (Array.isArray(yJson) ? yJson : []));
      setClosingRequests(cJson.results ?? cJson.data?.rows ?? cJson.data ?? (Array.isArray(cJson) ? cJson : []));
    } catch {
      showToast('Gagal memuat data periode fiskal.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInitialize = async () => {
    setLoading(true);
    try {
      await api.post('/api/v1/finance/fiscal-periods/initialize');
      showToast('Inisialisasi periode fiskal berhasil.', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message ?? err.message ?? 'Gagal inisialisasi periode.', 'error');
    } finally {
      await loadData();
    }
  };

  useEffect(() => { loadData(); }, [loadData]);

  const closePeriod = async (periodId: string) => {
    setClosingPeriodId(periodId);
    setClosingLoading(true);
    try {
      await api.post('/api/v1/finance/period-closings/request', { closing_type: 'MONTHLY', fiscal_period_id: periodId });
      showToast('Permintaan tutup periode tercatat dan menunggu persetujuan Finance.', 'success');
      loadData();
    } catch (err: any) {
      showToast(err.response?.data?.message ?? err.message ?? 'Gagal menutup periode.', 'error');
    } finally {
      setClosingLoading(false);
      setClosingPeriodId(null);
    }
  };

  const approveClosing = async (requestId: string) => {
    try {
      await api.post(`/api/v1/finance/period-closings/${requestId}/approve`);
      showToast('Permintaan penutupan disetujui.', 'success');
      await loadData();
    } catch (err: any) {
      showToast(err.response?.data?.message ?? err.message ?? 'Gagal menyetujui penutupan.', 'error');
    }
  };

  const executeClosing = async (requestId: string) => {
    try {
      const { data: response } = await api.post(`/api/v1/finance/period-closings/${requestId}/execute`);
      const request = closingRequests.find((item) => item.id === requestId);
      const result = response?.data ?? response;
      if (request?.closing_type === 'YEAR_END' && result?.fiscal_year_name) setYearEndResult(result);
      showToast('Penutupan periode berhasil dijalankan.', 'success');
      await loadData();
    } catch (err: any) {
      showToast(err.response?.data?.message ?? err.message ?? 'Gagal menjalankan penutupan.', 'error');
    }
  };

const reopenPeriod = async (periodId: string) => {
  try {
    await api.post(`/api/v1/finance/fiscal-periods/${periodId}/reopen`);
    showToast('Periode berhasil dibuka kembali.', 'success');
    loadData();
  } catch (err: any) {
    // Ambil pesan error spesifik dari response backend jika ada
    const errorMsg = err.response?.data?.message ?? err.message ?? 'Gagal membuka kembali periode.';
    showToast(errorMsg, 'error');
  }
};

const executeYearEnd = async () => {
  if (!selectedYearId) return;
  setYearEndLoading(true);
  setYearEndResult(null);
  try {
    // Tangkap response dari API backend
    await api.post('/api/v1/finance/period-closings/request', {
      closing_type: 'YEAR_END', 
      fiscal_year_id: selectedYearId 
    });
    showToast('Permintaan tutup buku tahunan tercatat dan menunggu persetujuan Finance.', 'success');
    await loadData();
  } catch (err: any) {
    showToast(err.response?.data?.message ?? err.message ?? 'Gagal menutup buku tahunan.', 'error');
  } finally {
    setYearEndLoading(false);
  }
};

  const executeRollback = async () => {
    if (!rollbackYearId || rollbackReason.trim().length < 10) return;
    setRollbackLoading(true);
    try {
      await api.post(`/api/v1/finance/fiscal-years/${rollbackYearId}/reopen-year-end`, { reason: rollbackReason });
      showToast('Rollback tutup buku tahunan berhasil. Jurnal Storno diterbitkan.', 'success');
      setRollbackYearId(null);
      setRollbackReason('');
      loadData();
    } catch (err: any) {
      showToast(err.response?.data?.message ?? err.message ?? 'Gagal rollback tutup buku.', 'error');
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
          ${toast.type === 'success' ? 'bg-brand-green text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div>
        <h2 className="page-title">Tutup Buku & Manajemen Periode</h2>
        <p className="text-xs text-text-secondary mt-0.5">
          Period Guard · Checklist Validator · Year-End Closing · Storno Rollback
        </p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-4 text-center shadow-2xs">
          <p className="text-3xl font-black text-emerald-700">{openPeriods.length}</p>
          <p className="text-xs text-slate-600 mt-1 font-medium">Periode Aktif (OPEN)</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center shadow-2xs">
          <p className="text-3xl font-black text-slate-600">{closedPeriods.length}</p>
          <p className="text-xs text-slate-600 mt-1 font-medium">Periode Ditutup</p>
        </div>
        <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-4 text-center shadow-2xs">
          <p className="text-3xl font-black text-[#203D91]">{fiscalYears.length}</p>
          <p className="text-xs text-slate-600 mt-1 font-medium">Tahun Fiskal</p>
        </div>
      </div>

      {/* Fiscal Periods Table */}
      <div>
        <h3 className="section-title mb-3">Status Periode Fiskal</h3>
        {loading ? (
          <div className="text-center py-8 text-slate-500 text-sm animate-pulse">Memuat...</div>
        ) : periods.length === 0 ? (
          <div className="text-center py-8 space-y-3">
            <p className="text-slate-500 text-sm">Belum ada periode fiskal terdaftar untuk tahun ini.</p>
            {/* Tombol aksi pemicu pembuatan periode */}
            <button
              onClick={handleInitialize}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#EAF6FF] text-[#203D91] border border-[#BFDBFE] hover:bg-[#203D91] hover:text-white transition-all shadow-2xs"
            >
              Muat Ulang / Inisialisasi Periode
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  {['#', 'Periode', 'Tanggal Mulai', 'Tanggal Akhir', 'Status', 'Aksi'].map(h => (
                    <th key={h} className="py-2.5 px-3 text-left text-xs font-semibold text-slate-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {periods.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3 text-slate-500 font-mono text-xs">{p.period_number ?? '—'}</td>
                    <td className="py-2.5 px-3 text-slate-900 font-semibold">Periode #{p.period_number ?? '—'}</td>
                    <td className="py-2.5 px-3 text-slate-600 text-xs">{formatDate(p.start_date)}</td>
                    <td className="py-2.5 px-3 text-slate-600 text-xs">{formatDate(p.end_date)}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColor(p.status)}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex gap-1.5">
                        {p.status === 'OPEN' && canOperateFinance && (
                          <button
                            onClick={() => closePeriod(p.id)}
                            disabled={!hasEnded(p.end_date) || (closingLoading && closingPeriodId === p.id)}
                            title={!hasEnded(p.end_date) ? 'Penutupan tersedia setelah periode berakhir.' : undefined}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#EAF6FF] text-[#203D91] border border-[#BFDBFE] hover:bg-[#203D91] hover:text-white transition-all shadow-2xs disabled:opacity-50"
                          >
                            {closingLoading && closingPeriodId === p.id ? 'Memproses…' : hasEnded(p.end_date) ? 'Ajukan Penutupan' : 'Menunggu Akhir Periode'}
                          </button>
                        )}
                        {p.status === 'CLOSED' && (
                          <button
                            onClick={() => reopenPeriod(p.id)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-600 hover:text-white transition-all shadow-2xs"
                          >
                            Buka kembali
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

      <div>
        <h3 className="section-title mb-3">Permintaan Penutupan</h3>
        {closingRequests.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">Belum ada permintaan penutupan periode.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 bg-slate-50/80">
                {['Diajukan', 'Jenis', 'Periode', 'Status', 'Aksi'].map((heading) => <th key={heading} className="py-2.5 px-3 text-left text-xs font-semibold text-slate-600">{heading}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {closingRequests.map((request) => {
                  const period = periods.find((item) => item.id === request.fiscal_period_id);
                  const year = fiscalYears.find((item) => item.id === request.document_id);
                  return <tr key={request.id}>
                    <td className="py-2.5 px-3 text-xs text-slate-600">{formatDate(request.created_at)}</td>
                    <td className="py-2.5 px-3 text-xs">{request.closing_type === 'YEAR_END' ? 'Tahunan' : 'Bulanan'}</td>
                    <td className="py-2.5 px-3 text-xs">{period ? `Periode #${period.period_number}` : year?.fiscal_year_name ?? '—'}</td>
                    <td className="py-2.5 px-3"><span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColor(request.status)}`}>{request.status}</span></td>
                    <td className="py-2.5 px-3"><div className="flex gap-1.5">
                      {request.status === 'PENDING_APPROVAL' && canOperateFinance && (
                        <button onClick={() => approveClosing(request.id)} disabled={request.requested_by === user?.id} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#EAF6FF] text-[#203D91] border border-[#BFDBFE] disabled:opacity-50" title={request.requested_by === user?.id ? 'Pemohon tidak dapat menyetujui permintaannya sendiri.' : undefined}>Setujui</button>
                      )}
                      {request.status === 'APPROVED' && canOperateFinance && (
                        <button onClick={() => executeClosing(request.id)} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#203D91] text-white">Jalankan Penutupan</button>
                      )}
                      {request.status === 'COMPLETED' && <span className="text-xs text-slate-500">Selesai</span>}
                    </div></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Year-End Closing Section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs">
        <h3 className="section-title mb-1">Tutup Buku Tahunan</h3>
        <p className="text-xs text-slate-500 mb-4">
          Zero-out akun nominal (4xxx, 5xxx, 6xxx) → selisih laba/rugi masuk ke <span className="font-mono text-[#203D91] font-semibold">3200 Laba Ditahan</span>
        </p>

        <div className="flex gap-3 items-center flex-wrap">
          <select
            value={selectedYearId}
            onChange={e => setSelectedYearId(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#203D91]/30"
          >
            <option value="">— Pilih Tahun Fiskal yang Telah Berakhir —</option>
            {fiscalYears.filter(y => y.status === 'OPEN' && hasEnded(y.end_date)).map(y => (
              <option key={y.id} value={y.id}>{y.fiscal_year_name}</option>
            ))}
          </select>
          <button
            onClick={executeYearEnd}
            disabled={!selectedYearId || yearEndLoading}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#203D91] text-white hover:bg-[#182E6E] transition-colors shadow-2xs disabled:opacity-50"
          >
            {yearEndLoading ? 'Memproses…' : 'Ajukan Tutup Buku Tahunan'}
          </button>
        </div>

        {/* Year-End Result */}
        {yearEndResult && (
          <div className="mt-4 p-4 rounded-xl border border-slate-200 bg-slate-50/70">
            <p className="text-xs font-bold text-slate-800 mb-2">Hasil Tutup Buku: {yearEndResult.fiscal_year_name}</p>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-slate-500">Total Pendapatan</p>
                <p className="text-sm font-bold text-emerald-700">{formatRp(yearEndResult.total_revenue)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Total Beban</p>
                <p className="text-sm font-bold text-red-600">{formatRp(yearEndResult.total_expense)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Laba / Rugi Bersih</p>
                <p className={`text-sm font-black ${yearEndResult.is_profit ? 'text-emerald-700' : 'text-red-600'}`}>
                  {yearEndResult.is_profit ? '+' : '-'}{formatRp(Math.abs(yearEndResult.net_profit_loss))}
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2 text-center">
              Jurnal Penutup ID: <span className="font-mono text-xs text-slate-700">{yearEndResult.closing_entry_id.slice(0, 8)}...</span>
              · {yearEndResult.nominal_accounts_closed} akun nominal ditutup
            </p>
          </div>
        )}
      </div>

      {/* Year-End Rollback Section */}
      {closedYears.length > 0 && (
        <div className="bg-red-50/60 rounded-2xl border border-red-200 p-6 shadow-2xs">
          <h3 className="text-sm font-bold text-red-700 mb-1">Rollback Tutup Buku Tahunan (Storno)</h3>
          <p className="text-xs text-slate-500 mb-4">
            Hanya Superadmin / Direktur. Menerbitkan jurnal pembalik atas jurnal penutup tahunan.
            Riwayat data historis tetap tersimpan (Immutable Audit Trail).
          </p>
          <div className="flex gap-3 flex-wrap">
            <select
              value={rollbackYearId ?? ''}
              onChange={e => setRollbackYearId(e.target.value || null)}
              className="px-3 py-2 text-sm rounded-lg border border-red-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500/30"
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
                className="w-full px-3 py-2 text-sm rounded-lg border border-red-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500/30"
              />
              <button
                onClick={executeRollback}
                disabled={rollbackLoading || rollbackReason.trim().length < 10}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors shadow-2xs disabled:opacity-50"
              >
                {rollbackLoading ? 'Memproses Storno...' : 'Konfirmasi Rollback via Storno'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
