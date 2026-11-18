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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#0876CD]">
            <Boxes size={18} />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Inventory ↔ Finance GL Bridge &amp; DDMRP Cash Flow</h3>
            <p className="text-xs text-slate-500">
              Jurnal akrual otomatis dari mutasi gudang (GR/IR 2131, HPP 5101, Write-off 6210) serta proyeksi kebutuhan kas restock DDMRP.
            </p>
          </div>
        </div>
        {canOperate && (
          <button
            type="button"
            disabled={syncing}
            onClick={() => void handleSync()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0876CD] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#163D64] disabled:opacity-50"
          >
            <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Menyinkronkan..." : `Sinkronkan Outbox GL (${counts.PENDING || 0} Pending)`}
          </button>
        )}
      </div>

      {/* Working Capital & DDMRP Forecast KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
          <span className="text-[11px] font-semibold text-slate-500">Modal Kerja Persediaan (Good)</span>
          <p className="mt-1 text-base font-extrabold text-slate-900">{formatMoney(wc?.total_inventory_value ?? 0)}</p>
          <span className="text-[10px] text-slate-500">Overstock tertahan: {formatMoney(wc?.overstock_trapped_cash ?? 0)}</span>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5">
          <span className="text-[11px] font-semibold text-rose-700">Proyeksi Kas Restock (Red Zone)</span>
          <p className="mt-1 text-base font-extrabold text-rose-800">{formatMoney(cf?.immediate_red_zone_outflow ?? 0)}</p>
          <span className="text-[10px] text-rose-600">Yellow Zone: {formatMoney(cf?.upcoming_yellow_zone_outflow ?? 0)}</span>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5">
          <span className="text-[11px] font-semibold text-amber-800">Komitmen AP PO Belum Lunas</span>
          <p className="mt-1 text-base font-extrabold text-amber-900">{formatMoney(cf?.committed_unpaid_po_invoices ?? 0)}</p>
          <span className="text-[10px] text-amber-700">Total kebutuhan DDMRP: {formatMoney(cf?.total_ddmrp_restock_outflow ?? 0)}</span>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3.5">
          <span className="text-[11px] font-semibold text-[#163D64]">Status Outbox Jurnal GL</span>
          <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] font-bold">
            <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={12} /> {counts.POSTED || 0} Posted</span>
            <span className="inline-flex items-center gap-1 text-amber-700"><Clock size={12} /> {counts.PENDING || 0} Pending</span>
            {(counts.FAILED || 0) > 0 && (
              <span className="inline-flex items-center gap-1 text-rose-700"><AlertTriangle size={12} /> {counts.FAILED} Failed</span>
            )}
          </div>
        </div>
      </div>

      {/* Recent GL Bridge Events */}
      {(bridgeStatus?.recent_events?.length ?? 0) > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600">
              <tr>
                <th className="px-3 py-2">Event Type</th>
                <th className="px-3 py-2">Dokumen / Aggregate</th>
                <th className="px-3 py-2">Status GL</th>
                <th className="px-3 py-2">Journal Entry ID</th>
                <th className="px-3 py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bridgeStatus!.recent_events.slice(0, 8).map((ev) => (
                <tr key={ev.id} className="hover:bg-slate-50/60">
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-800">{ev.event_type}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-500">{ev.aggregate_id.slice(0, 12)}…</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        ev.gl_status === "POSTED"
                          ? "bg-emerald-50 text-emerald-700"
                          : ev.gl_status === "FAILED"
                            ? "bg-rose-50 text-rose-700"
                            : ev.gl_status === "SKIPPED"
                              ? "bg-slate-100 text-slate-600"
                              : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {ev.gl_status}
                    </span>
                    {ev.gl_error && <p className="mt-0.5 text-[10px] text-rose-600">{ev.gl_error}</p>}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-600">
                    {ev.gl_journal_entry_id ? ev.gl_journal_entry_id.slice(0, 12) + "…" : "-"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {canOperate && ev.gl_status === "FAILED" && (
                      <button
                        type="button"
                        disabled={retryingId === ev.id}
                        onClick={() => void handleRetry(ev.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        <RotateCcw size={10} />
                        Retry
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

