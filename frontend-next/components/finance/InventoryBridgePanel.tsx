"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, RotateCcw, Boxes, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import toast from "react-hot-toast";
import {
  fetchInventoryBridgeStatus,
  fetchInventoryCashflowForecast,
  retryInventoryBridgeEvent,
  syncInventoryOutboxToGl,
  InventoryBridgeStatusResponse,
  InventoryCashflowForecastResponse,
} from "@/lib/api/finance.api";
import { formatMoney } from "@/lib/utils";
import { getApiErrorDetail } from "@/lib/api/project.api";

interface InventoryBridgePanelProps {
  canOperate: boolean;
}

export function InventoryBridgePanel({ canOperate }: InventoryBridgePanelProps) {
  const [bridgeStatus, setBridgeStatus] = useState<InventoryBridgeStatusResponse | null>(null);
  const [forecast, setForecast] = useState<InventoryCashflowForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, forecastRes] = await Promise.all([
        fetchInventoryBridgeStatus(),
        fetchInventoryCashflowForecast(),
      ]);
      setBridgeStatus(statusRes);
      setForecast(forecastRes);
    } catch {
      // Non-blocking if user does not have finance bridge permission
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await syncInventoryOutboxToGl(50);
      toast.success(`Sinkronisasi GL selesai: ${res.processed} diposting, ${res.skipped} dilewati, ${res.failed} gagal.`);
      await loadAll();
    } catch (err) {
      toast.error(getApiErrorDetail(err, "Gagal menyinkronkan outbox Inventory ke GL."));
    } finally {
      setSyncing(false);
    }
  };

  const handleRetry = async (eventId: string) => {
    setRetryingId(eventId);
    try {
      await retryInventoryBridgeEvent(eventId);
      toast.success("Event berhasil diposting ulang ke Jurnal GL.");
      await loadAll();
    } catch (err) {
      toast.error(getApiErrorDetail(err, "Retry gagal."));
    } finally {
      setRetryingId(null);
    }
  };

  if (!bridgeStatus && !forecast && !loading) return null;

  const counts = bridgeStatus?.counts ?? { PENDING: 0, POSTED: 0, SKIPPED: 0, FAILED: 0 };
  const wc = forecast?.working_capital;
  const cf = forecast?.cash_outflow_forecast;

  return (
    <div className="finance-scope fin-card p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#0876CD]">
            <Boxes size={18} />
          </span>
          <div>
            <h3 className="text-sm font-bold text-text-primary">Jembatan Persediaan ↔ Buku Besar &amp; Arus Kas DDMRP</h3>
            <p className="text-xs text-text-secondary">
              Jurnal akrual otomatis dari mutasi gudang (GR/IR 2131, HPP 5101, Penghapusan 6210) serta proyeksi kebutuhan kas restock DDMRP.
            </p>
          </div>
        </div>
        {canOperate && (
          <button
            type="button"
            disabled={syncing}
            onClick={() => void handleSync()}
            className="btn-final inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs disabled:opacity-50"
          >
            <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Menyinkronkan..." : `Sinkronkan Outbox GL (${counts.PENDING || 0} Menunggu)`}
          </button>
        )}
      </div>

      {/* Working Capital & DDMRP Forecast KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="kpi-card" data-accent="blue">
          <span className="text-xs font-semibold text-text-secondary">Modal Kerja Persediaan (Baik)</span>
          <p className="mt-1 text-base font-semibold tabular-nums text-text-primary">{formatMoney(wc?.total_inventory_value ?? 0)}</p>
          <span className="text-3xs text-text-secondary">Kelebihan stok tertahan: {formatMoney(wc?.overstock_trapped_cash ?? 0)}</span>
        </div>
        <div className="kpi-card" data-accent="rose">
          <span className="text-xs font-semibold text-text-secondary">Proyeksi Kas Restock (Zona Merah)</span>
          <p className="mt-1 text-base font-semibold tabular-nums text-text-primary">{formatMoney(cf?.immediate_red_zone_outflow ?? 0)}</p>
          <span className="text-3xs text-text-secondary">Zona Kuning: {formatMoney(cf?.upcoming_yellow_zone_outflow ?? 0)}</span>
        </div>
        <div className="kpi-card" data-accent="amber">
          <span className="text-xs font-semibold text-text-secondary">Komitmen Utang PO Belum Lunas</span>
          <p className="mt-1 text-base font-semibold tabular-nums text-text-primary">{formatMoney(cf?.committed_unpaid_po_invoices ?? 0)}</p>
          <span className="text-3xs text-text-secondary">Total kebutuhan DDMRP: {formatMoney(cf?.total_ddmrp_restock_outflow ?? 0)}</span>
        </div>
        <div className="kpi-card" data-accent="navy">
          <span className="text-xs font-semibold text-text-secondary">Status Outbox Jurnal GL</span>
          <div className="mt-1.5 flex flex-wrap gap-2 text-2xs font-semibold">
            <span className="status-label is-ok"><CheckCircle2 size={12} /> {counts.POSTED || 0} Diposting</span>
            <span className="status-label is-warn"><Clock size={12} /> {counts.PENDING || 0} Menunggu</span>
            {(counts.FAILED || 0) > 0 && (
              <span className="status-label is-idle"><AlertTriangle size={12} /> {counts.FAILED} Gagal</span>
            )}
          </div>
        </div>
      </div>

      {/* Recent GL Bridge Events */}
      {(bridgeStatus?.recent_events?.length ?? 0) > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full data-table text-left text-xs">
            <thead className="bg-slate-50 text-2xs font-semibold text-text-secondary">
              <tr>
                <th className="px-3 py-2">Jenis Kejadian</th>
                <th className="px-3 py-2">Dokumen / Agregat</th>
                <th className="px-3 py-2">Status GL</th>
                <th className="px-3 py-2">ID Jurnal</th>
                <th className="px-3 py-2 col-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bridgeStatus!.recent_events.slice(0, 8).map((ev) => (
                <tr key={ev.id} className="hover:bg-slate-50/60">
                  <td className="px-3 py-2 text-2xs text-text-primary">{ev.event_type}</td>
                  <td className="px-3 py-2 text-2xs text-text-secondary">{ev.aggregate_id.slice(0, 12)}…</td>
                  <td className="px-3 py-2">
                    <span
                      className={`status-label ${
                        ev.gl_status === "POSTED"
                          ? "is-ok"
                          : ev.gl_status === "FAILED"
                            ? "is-warn"
                            : ev.gl_status === "SKIPPED"
                              ? "is-idle"
                              : "is-warn"
                      }`}
                    >
                      {ev.gl_status === "POSTED" ? "Diposting" : ev.gl_status === "FAILED" ? "Gagal" : ev.gl_status === "SKIPPED" ? "Dilewati" : "Menunggu"}
                    </span>
                    {ev.gl_error && <p className="mt-0.5 text-3xs text-rose-600">{ev.gl_error}</p>}
                  </td>
                  <td className="px-3 py-2 text-2xs text-text-secondary">
                    {ev.gl_journal_entry_id ? ev.gl_journal_entry_id.slice(0, 12) + "…" : "-"}
                  </td>
                  <td className="px-3 py-2 col-center">
                    {canOperate && ev.gl_status === "FAILED" && (
                      <button
                        type="button"
                        disabled={retryingId === ev.id}
                        onClick={() => void handleRetry(ev.id)}
                        className="btn-outline-soft inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs disabled:opacity-50"
                      >
                        <RotateCcw size={10} />
                        Coba Lagi
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

