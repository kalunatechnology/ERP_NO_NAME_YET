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
import { getUserFacingApiError } from '@/lib/api/error-message';
import { useAuth } from '@/contexts/AuthContext';
import { canPerform } from '@/lib/access/capability-contract';
import { Modal } from '@/components/ui/Modal';

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

interface CalendarPeriodDraft {
  start_date: string;
  end_date: string;
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
const addCalendarMonths = (dateValue: string, monthOffset: number) => {
  const [year, month, day] = dateValue.split('-').map(Number);
  const targetMonth = month - 1 + monthOffset;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const finalDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(normalizedMonth + 1).padStart(2, '0')}-${String(Math.min(day, finalDay)).padStart(2, '0')}`;
};
const previousCalendarDay = (dateValue: string) => {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};
const nextCalendarDay = (dateValue: string) => {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};
const buildCalendarPeriods = (startDate: string, endDate: string): CalendarPeriodDraft[] => Array.from({ length: 12 }, (_, index) => {
  const start = addCalendarMonths(startDate, index);
  const nextStart = addCalendarMonths(startDate, index + 1);
  return { start_date: start, end_date: index === 11 ? endDate : previousCalendarDay(nextStart) };
});

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
  const [activeSection, setActiveSection] = useState<'periods' | 'requests' | 'yearEnd' | 'rollback'>('periods');
  const currentYear = new Date().getFullYear();
  const [selectedFiscalYearId, setSelectedFiscalYearId] = useState('');
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [calendarEditingYearId, setCalendarEditingYearId] = useState<string | null>(null);
  const [calendarSaving, setCalendarSaving] = useState(false);
  const [calendarName, setCalendarName] = useState(String(currentYear));
  const [calendarStart, setCalendarStart] = useState(`${currentYear}-01-01`);
  const [calendarEnd, setCalendarEnd] = useState(`${currentYear}-12-31`);
  const [calendarPeriods, setCalendarPeriods] = useState<CalendarPeriodDraft[]>(() => buildCalendarPeriods(`${currentYear}-01-01`, `${currentYear}-12-31`));

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
        api.get('/api/v1/finance/fiscal-years?page_size=100'),
        api.get('/api/v1/finance/period-closings?page_size=100'),
      ]);
      const loadedPeriods = pJson.data ?? pJson.results ?? (Array.isArray(pJson) ? pJson : []);
      const loadedYears = yJson.results ?? yJson.data?.rows ?? yJson.data ?? (Array.isArray(yJson) ? yJson : []);
      setPeriods(loadedPeriods);
      setFiscalYears(loadedYears);
      if (!selectedFiscalYearId && loadedYears.length) setSelectedFiscalYearId(loadedYears[0].id);
      setClosingRequests(cJson.results ?? cJson.data?.rows ?? cJson.data ?? (Array.isArray(cJson) ? cJson : []));
    } catch (error) {
      showToast(getUserFacingApiError(error, 'Data periode fiskal belum dapat dimuat. Periksa akses, lalu coba lagi.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedFiscalYearId]);

  const changeCalendarStart = (startDate: string) => {
    setCalendarStart(startDate);
    if (!startDate) return;
    const endDate = previousCalendarDay(addCalendarMonths(startDate, 12));
    setCalendarEnd(endDate);
    setCalendarPeriods(buildCalendarPeriods(startDate, endDate));
    setCalendarName(startDate.slice(0, 4));
  };

  const changeCalendarEnd = (endDate: string) => {
    setCalendarEnd(endDate);
    setCalendarPeriods((current) => current.map((period, index) => index === 11 ? { ...period, end_date: endDate } : period));
  };

  const updateCalendarPeriod = (index: number, field: keyof CalendarPeriodDraft, value: string) => {
    setCalendarPeriods((current) => current.map((period, periodIndex) => periodIndex === index ? { ...period, [field]: value } : period));
  };

  const openCalendarEditor = (yearId?: string) => {
    const year = yearId ? fiscalYears.find((item) => item.id === yearId) : null;
    if (year) {
      const yearPeriods = periods.filter((period) => period.fiscal_year_id === year.id).sort((a, b) => Number(a.period_number || 0) - Number(b.period_number || 0));
      if (yearPeriods.length !== 12) {
        showToast('Kalender ini belum memiliki 12 periode lengkap dan belum dapat diedit.', 'error');
        return;
      }
      setCalendarEditingYearId(year.id);
      setCalendarName(year.fiscal_year_name);
      setCalendarStart(String(year.start_date || '').slice(0, 10));
      setCalendarEnd(String(year.end_date || '').slice(0, 10));
      setCalendarPeriods(yearPeriods.map((period) => ({ start_date: String(period.start_date || '').slice(0, 10), end_date: String(period.end_date || '').slice(0, 10) })));
    } else {
      const latestEnd = fiscalYears.map((item) => String(item.end_date || '').slice(0, 10)).filter(Boolean).sort().at(-1);
      const startDate = latestEnd ? nextCalendarDay(latestEnd) : `${currentYear}-01-01`;
      const endDate = previousCalendarDay(addCalendarMonths(startDate, 12));
      setCalendarEditingYearId(null);
      setCalendarName(startDate.slice(0, 4));
      setCalendarStart(startDate);
      setCalendarEnd(endDate);
      setCalendarPeriods(buildCalendarPeriods(startDate, endDate));
    }
    setCalendarModalOpen(true);
  };

  const saveCalendar = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!calendarStart || !calendarEnd || !calendarName.trim()) return;
    const complete = calendarPeriods.length === 12
      && calendarPeriods[0]?.start_date === calendarStart
      && calendarPeriods[11]?.end_date === calendarEnd
      && calendarPeriods.every((period, index) => period.start_date && period.end_date && period.start_date <= period.end_date
        && (index === 0 || period.start_date === nextCalendarDay(calendarPeriods[index - 1].end_date)));
    if (!complete) {
      showToast('Periksa tanggal periode. Periode harus berurutan, tanpa tanggal terlewat atau bertumpuk, dan mencakup seluruh tahun buku.', 'error');
      return;
    }

    setCalendarSaving(true);
    try {
      const payload = { fiscal_year_name: calendarName.trim(), start_date: calendarStart, end_date: calendarEnd, periods: calendarPeriods };
      const { data: response } = calendarEditingYearId
        ? await api.put(`/api/v1/finance/fiscal-calendar/${calendarEditingYearId}`, payload)
        : await api.post('/api/v1/finance/fiscal-calendar', payload);
      const result = response?.data ?? response;
      if (result?.fiscalYear?.id) setSelectedFiscalYearId(result.fiscalYear.id);
      setCalendarModalOpen(false);
      window.dispatchEvent(new CustomEvent('finance-calendar-updated', { detail: { fiscalYearId: result?.fiscalYear?.id } }));
      showToast(calendarEditingYearId ? 'Kalender fiskal berhasil diperbarui.' : 'Kalender fiskal beserta 12 periodenya berhasil disimpan.', 'success');
      await loadData();
    } catch (error) {
      showToast(getUserFacingApiError(error, 'Kalender fiskal belum dapat disimpan. Periksa tanggal dan status tahun buku.'), 'error');
    } finally {
      setCalendarSaving(false);
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
      showToast(getUserFacingApiError(err, 'Permintaan tutup periode belum dapat dibuat. Periksa status periode dan hak akses.'), 'error');
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
      showToast(getUserFacingApiError(err, 'Penutupan belum dapat disetujui. Pastikan Anda bukan pengaju dan memiliki hak akses.'), 'error');
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
      showToast(getUserFacingApiError(err, 'Penutupan periode belum dapat dijalankan. Periksa persetujuan, checklist, dan status periode.'), 'error');
    }
  };

const reopenPeriod = async (periodId: string) => {
  try {
    await api.post(`/api/v1/finance/fiscal-periods/${periodId}/reopen`);
    showToast('Periode berhasil dibuka kembali.', 'success');
    loadData();
  } catch (err: any) {
    const errorMsg = getUserFacingApiError(err, 'Periode belum dapat dibuka kembali. Periksa status periode dan hak akses.');
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
    showToast(getUserFacingApiError(err, 'Permintaan tutup buku tahunan belum dapat dibuat. Periksa tahun buku dan hak akses.'), 'error');
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
      setActiveSection('periods');
      setRollbackYearId(null);
      setRollbackReason('');
      loadData();
    } catch (err: any) {
      showToast(getUserFacingApiError(err, 'Rollback tutup buku belum dapat dilakukan. Periksa alasan, status tahun buku, dan hak akses.'), 'error');
    } finally {
      setRollbackLoading(false);
    }
  };

  const visiblePeriods = selectedFiscalYearId ? periods.filter((period) => period.fiscal_year_id === selectedFiscalYearId) : periods;
  const openPeriods  = visiblePeriods.filter(p => p.status === 'OPEN');
  const closedPeriods = visiblePeriods.filter(p => p.status !== 'OPEN');
  const closedYears  = fiscalYears.filter(y => y.status === 'CLOSED');
  useEffect(() => {
    if (!closedYears.length && activeSection === 'rollback') setActiveSection('periods');
  }, [activeSection, closedYears.length]);
  const sectionTabs: Array<{ id: typeof activeSection; label: string; count?: number }> = [
    { id: 'periods', label: 'Periode Fiskal', count: visiblePeriods.length },
    { id: 'requests', label: 'Permintaan Penutupan', count: closingRequests.length },
    { id: 'yearEnd', label: 'Tutup Buku Tahunan' },
    ...(closedYears.length ? [{ id: 'rollback' as const, label: 'Rollback Storno', count: closedYears.length }] : []),
  ];

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

      <div role="tablist" aria-label="Bagian tutup buku" className="flex items-end gap-1 overflow-x-auto border-b border-slate-200">
        {sectionTabs.map((tab) => {
          const selected = activeSection === tab.id;
          return <button
            key={tab.id}
            id={`closing-tab-${tab.id}`}
            aria-controls={`closing-panel-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => setActiveSection(tab.id)}
            className={`-mb-px inline-flex shrink-0 items-center gap-2 rounded-t-xl border px-4 py-2.5 text-xs font-semibold transition-colors ${selected ? 'border-slate-200 border-b-white bg-white text-[#203D91] shadow-sm' : 'border-transparent bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            {tab.label}
            {tab.count !== undefined && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${selected ? 'bg-blue-50 text-[#203D91]' : 'bg-slate-200 text-slate-600'}`}>{tab.count}</span>}
          </button>;
        })}
      </div>

      {/* Fiscal Periods Table */}
      {activeSection === 'periods' && <div role="tabpanel" id="closing-panel-periods" aria-labelledby="closing-tab-periods" className="min-w-0">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="section-title">Kalender Periode Fiskal</h3>
            <p className="mt-1 text-sm text-slate-600">Atur sendiri batas tanggal 12 periode bulanan. Kuartal mengikuti tiga periode berurutan.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm font-medium text-slate-700">
              Tahun buku
              <select value={selectedFiscalYearId} onChange={(event) => setSelectedFiscalYearId(event.target.value)} className="ml-2 min-w-44 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                {fiscalYears.map((year) => <option key={year.id} value={year.id}>{year.fiscal_year_name} · {formatDate(year.start_date)}–{formatDate(year.end_date)}</option>)}
                {!fiscalYears.length && <option value="">Belum dikonfigurasi</option>}
              </select>
            </label>
            {canOperateFinance && <div className="flex gap-2"><button type="button" disabled={!selectedFiscalYearId || fiscalYears.find((year) => year.id === selectedFiscalYearId)?.status !== 'OPEN'} onClick={() => openCalendarEditor(selectedFiscalYearId)} title="Kalender hanya dapat diubah jika tahun buku masih OPEN dan belum ditutup." className="rounded-lg border border-[#203D91] px-4 py-2 text-sm font-semibold text-[#203D91] hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">Ubah Kalender</button><button type="button" onClick={() => openCalendarEditor()} className="rounded-lg bg-[#203D91] px-4 py-2 text-sm font-semibold text-white hover:bg-[#182E6E]">Tahun Baru</button></div>}
          </div>
        </div>
        {loading ? (
          <div className="text-center py-8 text-slate-500 text-sm animate-pulse">Memuat...</div>
        ) : !selectedFiscalYearId || visiblePeriods.length === 0 ? (
          <div className="text-center py-8 space-y-3">
            <p className="text-slate-500 text-sm">Belum ada kalender untuk perusahaan ini. Buat tahun buku dan atur batas tanggal setiap periode sebelum transaksi diposting.</p>
            {canOperateFinance && <button type="button" onClick={() => openCalendarEditor()} className="rounded-lg bg-[#203D91] px-4 py-2 text-sm font-semibold text-white hover:bg-[#182E6E]">Buat Kalender Periode</button>}
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
                {visiblePeriods.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3 text-slate-500 font-mono text-xs">{p.period_number ?? '—'}</td>
                    <td className="py-2.5 px-3 text-slate-900 font-semibold">Periode #{p.period_number ?? '—'} <span className="ml-1 text-xs font-medium text-slate-500">Kuartal {Math.ceil(Number(p.period_number || 1) / 3)}</span></td>
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
      </div>}

      {activeSection === 'requests' && <div role="tabpanel" id="closing-panel-requests" aria-labelledby="closing-tab-requests" className="min-w-0">
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
      </div>}

      {/* Year-End Closing Section */}
      {activeSection === 'yearEnd' && <div role="tabpanel" id="closing-panel-yearEnd" aria-labelledby="closing-tab-yearEnd" className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs">
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
      </div>}

      {/* Year-End Rollback Section */}
      {closedYears.length > 0 && activeSection === 'rollback' && (
        <div role="tabpanel" id="closing-panel-rollback" aria-labelledby="closing-tab-rollback" className="bg-red-50/60 rounded-2xl border border-red-200 p-6 shadow-2xs">
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

      <Modal isOpen={calendarModalOpen} onClose={() => !calendarSaving && setCalendarModalOpen(false)} title={calendarEditingYearId ? 'Ubah Kalender Periode Fiskal' : 'Buat Kalender Periode Fiskal'} subtitle="Tetapkan rentang tahun buku dan tanggal untuk setiap periode. Kalender akan menjadi acuan posting transaksi." size="4xl">
        <form onSubmit={saveCalendar} className="space-y-4 p-1">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-semibold text-slate-700">Nama tahun buku
              <input required value={calendarName} onChange={(event) => setCalendarName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" placeholder="Contoh: FY 2026/2027" />
            </label>
            <label className="text-sm font-semibold text-slate-700">Tanggal mulai
              <input required type="date" value={calendarStart} onChange={(event) => changeCalendarStart(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" />
            </label>
            <label className="text-sm font-semibold text-slate-700">Tanggal akhir
              <input required type="date" min={calendarStart || undefined} value={calendarEnd} onChange={(event) => changeCalendarEnd(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" />
            </label>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
            Setiap periode harus tersambung tanpa tanggal yang terlewat atau tumpang tindih. Periode 1–3 membentuk Kuartal 1, 4–6 Kuartal 2, dan seterusnya.
          </div>
          <div className="max-h-[48vh] overflow-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-slate-600"><tr><th className="px-3 py-2.5">Periode</th><th className="px-3 py-2.5">Tanggal mulai</th><th className="px-3 py-2.5">Tanggal akhir</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{calendarPeriods.map((period, index) => <tr key={index}>
                <td className="px-3 py-2 font-semibold text-slate-800">Periode {String(index + 1).padStart(2, '0')} <span className="text-xs font-medium text-slate-500">· K{Math.floor(index / 3) + 1}</span></td>
                <td className="px-3 py-2"><input required type="date" min={calendarStart || undefined} max={calendarEnd || undefined} value={period.start_date} onChange={(event) => updateCalendarPeriod(index, 'start_date', event.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" /></td>
                <td className="px-3 py-2"><input required type="date" min={period.start_date || calendarStart || undefined} max={calendarEnd || undefined} value={period.end_date} onChange={(event) => updateCalendarPeriod(index, 'end_date', event.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" /></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button type="button" disabled={calendarSaving} onClick={() => setCalendarModalOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Batal</button>
            <button type="submit" disabled={calendarSaving} className="rounded-lg bg-[#203D91] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{calendarSaving ? 'Menyimpan…' : calendarEditingYearId ? 'Simpan Perubahan' : 'Simpan Kalender'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
