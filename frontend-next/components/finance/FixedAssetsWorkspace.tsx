/**
 * File: frontend-next/components/finance/FixedAssetsWorkspace.tsx
 *
 * Purpose: Defines the React component and its user-facing responsibility in the Marka+/Arsalynk frontend.
 * Integration: Called by Next routing or parent components; API and browser-state effects are documented on the responsible functions below.
 * Boundary: This file owns presentation/orchestration only and relies on shared context/API modules for identity and persistence.
 */
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api/axios';

// =============================================================================
// FIXED ASSETS WORKSPACE
// Fitur: Register aset, Depreciation Schedule, Batch Depreciation, Disposal
// =============================================================================

interface Asset {
  id: string;
  asset_code: string;
  asset_name: string;
  serial_number: string;
  status: string;
  acquisition_cost?: number;
  salvage_value?: number;
  useful_life_months?: number;
  acquisition_date?: string;
  available_for_use_date?: string;
  category_id?: string;
}

interface AssetBook {
  id: string;
  asset_id: string;
  net_book_value?: number;
  accumulated_depreciation?: number;
  cost_basis?: number;
  useful_life_periods?: number;
}

interface DepreciationLine {
  period_number: number;
  period_date: string;
  opening_book_value: number;
  depreciation_amount: number;
  accumulated_depreciation: number;
  closing_book_value: number;
  is_residual_adjustment: boolean;
}

interface BatchResult {
  total_assets: number;
  processed: number;
  skipped: number;
  errors: number;
  period_date: string;
  executed_at: string;
  details: Array<{ asset_id: string; asset_name: string; status: string; reason?: string }>;
}

const formatRp = (v?: number | null) =>
  v == null ? 'Rp 0' : `Rp ${v.toLocaleString('id-ID')}`;

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-700',
    DISPOSED: 'bg-red-100 text-red-600',
    DEPRECIATING: 'bg-blue-100 text-blue-700',
    IDLE: 'bg-yellow-100 text-yellow-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[s] ?? 'bg-gray-100 text-gray-600'}`}>
      {s}
    </span>
  );
};

export default function FixedAssetsWorkspace() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [books, setBooks] = useState<Record<string, AssetBook>>({});
  const [loading, setLoading] = useState(true);
  const [scheduleAsset, setScheduleAsset] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<DepreciationLine[] | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [depreciationPeriod, setDepreciationPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [singleDepAsset, setSingleDepAsset] = useState<string | null>(null);
  const [singleDepLoading, setSingleDepLoading] = useState(false);
  const [disposeAssetId, setDisposeAssetId] = useState<string | null>(null);
  const [disposeProceeds, setDisposeProceeds] = useState('');
  const [disposeDate, setDisposeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [disposeLoading, setDisposeLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [activeTab, setActiveTab] = useState<'register' | 'schedule' | 'batch'>('register');

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const { data: json } = await api.get('/api/v1/assets/assets?page=1&page_size=100');
      const list: Asset[] = json.data?.rows ?? json.data ?? json.rows ?? [];
      setAssets(list);

      // Load books for each asset
      const bookMap: Record<string, AssetBook> = {};
      await Promise.allSettled(list.map(async (a) => {
        const { data: j } = await api.get(`/api/v1/assets/books?asset_id=${a.id}&page_size=1`);
        const book = j.data?.rows?.[0] ?? j.data?.[0];
        if (book) bookMap[a.id] = book;
      }));
      setBooks(bookMap);
    } catch {
      showToast('Gagal memuat data aset.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  const loadSchedule = async (assetId: string) => {
    setScheduleAsset(assetId);
    setScheduleLoading(true);
    setSchedule(null);
    setActiveTab('schedule');
    try {
      const { data: json } = await api.get(`/api/v1/assets/assets/${assetId}/depreciation-schedule`);
      setSchedule(json.data?.schedule ?? []);
    } catch {
      showToast('Gagal memuat jadwal penyusutan.', 'error');
    } finally {
      setScheduleLoading(false);
    }
  };

  const runSingleDepreciation = async (assetId: string) => {
    setSingleDepAsset(assetId);
    setSingleDepLoading(true);
    try {
      const { data: json } = await api.post(`/api/v1/assets/assets/${assetId}/depreciate`, { period_date: depreciationPeriod });
      if (json.data?.skipped) {
        showToast(`⏭ ${json.data.reason}`, 'error');
      } else {
        showToast(`Penyusutan berhasil diposting. Jurnal: ${json.data?.journal_entry_id?.slice(0, 8)}...`, 'success');
        loadAssets();
      }
    } catch {
      showToast('Gagal menjalankan penyusutan.', 'error');
    } finally {
      setSingleDepLoading(false);
      setSingleDepAsset(null);
    }
  };

  const runBatchDepreciation = async () => {
    setBatchLoading(true);
    setBatchResult(null);
    try {
      const { data: json } = await api.post('/api/v1/assets/assets/batch-depreciate', { period_date: depreciationPeriod });
      setBatchResult(json.data);
      showToast(`Batch selesai: ${json.data?.processed} diproses, ${json.data?.skipped} dilewati.`, 'success');
      loadAssets();
    } catch {
      showToast('Gagal menjalankan batch penyusutan.', 'error');
    } finally {
      setBatchLoading(false);
    }
  };

  const runDispose = async () => {
    if (!disposeAssetId || !disposeProceeds) return;
    setDisposeLoading(true);
    try {
      const { data: json } = await api.post(`/api/v1/assets/assets/${disposeAssetId}/dispose`, { disposal_date: disposeDate, proceeds_amount: Number(disposeProceeds) });
      const gl = json.data?.is_gain ? 'Laba' : 'Rugi';
      showToast(`Aset berhasil dilepas. ${gl}: ${formatRp(Math.abs(json.data?.gain_or_loss ?? 0))}`, 'success');
      setDisposeAssetId(null);
      setDisposeProceeds('');
      loadAssets();
    } catch {
      showToast('Gagal melakukan pelepasan aset.', 'error');
    } finally {
      setDisposeLoading(false);
    }
  };

  const selectedScheduleAsset = assets.find(a => a.id === scheduleAsset);

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all
          ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-text-primary">📦 Register Aset Tetap</h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Straight-line depreciation engine · Idempotency Guard · Decimal Residual Adjustment
          </p>
        </div>
        <div className="ml-auto flex gap-2 items-center">
          <label className="text-xs text-text-secondary">Periode Penyusutan:</label>
          <input
            type="date"
            value={depreciationPeriod}
            onChange={e => setDepreciationPeriod(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg border border-white/10 bg-white/5 text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-green/40"
          />
          <button
            onClick={() => { setActiveTab('batch'); runBatchDepreciation(); }}
            disabled={batchLoading}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-brand-deep-green text-white hover:bg-brand-green transition-colors disabled:opacity-50"
          >
            {batchLoading ? 'Memproses...' : 'Proses Penyusutan Massal'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10">
        {[
          { id: 'register', label: 'Daftar Aset' },
          { id: 'schedule', label: 'Jadwal Penyusutan' },
          { id: 'batch',    label: 'Hasil Batch' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px
              ${activeTab === t.id
                ? 'border-brand-green text-brand-green'
                : 'border-transparent text-text-secondary hover:text-text-primary'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Asset Register */}
      {activeTab === 'register' && (
        <div className="overflow-x-auto">
          {loading ? (
            <div className="text-center py-12 text-text-secondary text-sm animate-pulse">Memuat data aset...</div>
          ) : assets.length === 0 ? (
            <div className="text-center py-12 text-text-secondary text-sm">Belum ada aset terdaftar.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  {['Kode', 'Nama Aset', 'Status', 'Harga Perolehan', 'Nilai Buku', 'Akm. Penyusutan', 'UE (Bulan)', 'Aksi'].map(h => (
                    <th key={h} className="py-2 px-3 text-xs font-semibold text-text-secondary">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {assets.map(asset => {
                  const book = books[asset.id];
                  return (
                    <tr key={asset.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-xs text-text-secondary">{asset.asset_code}</td>
                      <td className="py-2.5 px-3 font-medium text-text-primary">{asset.asset_name}</td>
                      <td className="py-2.5 px-3">{statusBadge(asset.status)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{formatRp(book?.cost_basis ?? asset.acquisition_cost)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-brand-deep-green font-semibold">
                        {formatRp(book?.net_book_value)}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-orange-400">
                        {formatRp(book?.accumulated_depreciation)}
                      </td>
                      <td className="py-2.5 px-3 text-center text-text-secondary">
                        {book?.useful_life_periods ?? asset.useful_life_months ?? '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => loadSchedule(asset.id)}
                            className="px-2 py-1 text-xs rounded-md bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                          >
                            Jadwal
                          </button>
                          {asset.status === 'ACTIVE' && (
                            <>
                              <button
                                onClick={() => runSingleDepreciation(asset.id)}
                                disabled={singleDepLoading && singleDepAsset === asset.id}
                                className="px-2 py-1 text-xs rounded-md bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
                              >
                                {singleDepLoading && singleDepAsset === asset.id ? 'Memproses' : 'Susutkan'}
                              </button>
                              <button
                                onClick={() => { setDisposeAssetId(asset.id); }}
                                className="px-2 py-1 text-xs rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                              >
                                🗑 Lepas
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Depreciation Schedule */}
      {activeTab === 'schedule' && (
        <div>
          {!scheduleAsset ? (
            <div className="text-center py-12 text-text-secondary text-sm">
              Pilih aset dari tab Daftar Aset, lalu buka jadwal penyusutannya.
            </div>
          ) : scheduleLoading ? (
            <div className="text-center py-12 text-text-secondary text-sm animate-pulse">Memuat jadwal penyusutan...</div>
          ) : schedule && schedule.length > 0 ? (
            <>
              <h3 className="text-sm font-semibold text-text-primary mb-3">
                Jadwal Penyusutan: <span className="text-brand-green">{selectedScheduleAsset?.asset_name}</span>
              </h3>
              <div className="overflow-auto max-h-96">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-surface-primary/90 backdrop-blur">
                    <tr className="border-b border-white/10">
                      {['Bulan ke-', 'Tanggal', 'Nilai Buku Awal', 'Beban Penyusutan', 'Akm. Penyusutan', 'Nilai Buku Akhir', 'Catatan'].map(h => (
                        <th key={h} className="py-2 px-2 text-left font-semibold text-text-secondary">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {schedule.map((row) => (
                      <tr
                        key={row.period_number}
                        className={`hover:bg-white/5 transition-colors ${row.is_residual_adjustment ? 'bg-yellow-500/5' : ''}`}
                      >
                        <td className="py-1.5 px-2 text-center font-mono text-text-secondary">{row.period_number}</td>
                        <td className="py-1.5 px-2 text-text-secondary">
                          {new Date(row.period_date).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{formatRp(row.opening_book_value)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-orange-400 font-semibold">
                          {formatRp(row.depreciation_amount)}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-red-400">{formatRp(row.accumulated_depreciation)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-brand-deep-green font-semibold">
                          {formatRp(row.closing_book_value)}
                        </td>
                        <td className="py-1.5 px-2">
                          {row.is_residual_adjustment && (
                            <span className="px-1.5 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400">Residual Adj.</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-text-secondary text-sm">Tidak ada data jadwal tersedia.</div>
          )}
        </div>
      )}

      {/* Tab: Batch Result */}
      {activeTab === 'batch' && (
        <div>
          {!batchResult ? (
            <div className="text-center py-12 text-text-secondary text-sm">
              Jalankan proses penyusutan massal untuk melihat hasil batch.
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                  { label: 'Total Aset', val: batchResult.total_assets, color: 'text-text-primary' },
                  { label: 'Diproses', val: batchResult.processed, color: 'text-emerald-400' },
                  { label: 'Di-skip (Idempotent)', val: batchResult.skipped, color: 'text-yellow-400' },
                  { label: 'Error', val: batchResult.errors, color: 'text-red-400' },
                ].map(c => (
                  <div key={c.label} className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <p className="text-xs text-text-secondary mb-1">{c.label}</p>
                    <p className={`text-2xl font-black ${c.color}`}>{c.val}</p>
                  </div>
                ))}
              </div>
              {/* Detail Table */}
              <div className="overflow-auto max-h-72">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10">
                      {['Nama Aset', 'Status', 'Keterangan'].map(h => (
                        <th key={h} className="py-2 px-3 text-left font-semibold text-text-secondary">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {batchResult.details.map((d, i) => (
                      <tr key={i} className="hover:bg-white/5">
                        <td className="py-1.5 px-3 text-text-primary">{d.asset_name}</td>
                        <td className="py-1.5 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold
                            ${d.status === 'PROCESSED' ? 'bg-emerald-100 text-emerald-700'
                            : d.status === 'SKIPPED' ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'}`}>
                            {d.status}
                          </span>
                        </td>
                        <td className="py-1.5 px-3 text-text-secondary">{d.reason ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal: Asset Disposal */}
      {disposeAssetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-card rounded-2xl border border-white/10 p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-red-400 mb-1">🗑 Pelepasan Aset</h3>
            <p className="text-xs text-text-secondary mb-4">
              Aset: <span className="font-semibold text-text-primary">
                {assets.find(a => a.id === disposeAssetId)?.asset_name}
              </span>
              <br />Jurnal GL akan dibuat otomatis (Laba/Rugi Pelepasan Aset).
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-secondary block mb-1">Tanggal Pelepasan</label>
                <input type="date" value={disposeDate} onChange={e => setDisposeDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-white/10 bg-white/5 text-text-primary focus:outline-none focus:ring-2 focus:ring-red-500/40" />
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">Hasil Penjualan / Proceeds (Rp)</label>
                <input type="number" value={disposeProceeds} onChange={e => setDisposeProceeds(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-white/10 bg-white/5 text-text-primary focus:outline-none focus:ring-2 focus:ring-red-500/40" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setDisposeAssetId(null)}
                className="px-4 py-2 text-sm rounded-lg bg-white/10 text-text-secondary hover:bg-white/15 transition-colors">
                Batal
              </button>
              <button onClick={runDispose} disabled={disposeLoading || !disposeProceeds}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50">
                {disposeLoading ? 'Memproses...' : 'Konfirmasi Pelepasan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
