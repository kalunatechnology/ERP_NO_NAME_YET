"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, BarChart3, TrendingUp, DollarSign, FileText,
  Download, CalendarDays, ChevronDown, Layers, Building2,
  ArrowUpRight, ArrowDownRight, Book,
} from "lucide-react";
import { cn, formatMoney, formatDate, getStatusColor } from "@/lib/utils";
import api from "@/lib/api/axios";
import { normalizeList } from "@/lib/api/auth.api";
import toast from "react-hot-toast";

/* ── Tab Config ──────────────────────────────────── */
const REPORT_TABS = [
  { id: "project-pnl", label: "Project P&L",    icon: BarChart3    },
  { id: "executive",   label: "Executive View",  icon: Building2    },
  { id: "journals",    label: "General Ledger",  icon: Book         },
];

/* ── Data Loading ────────────────────────────────── */
async function loadReportingData() {
  const pairs = await Promise.allSettled([
    api.get("/api/v1/projects/projects/?page_size=100").then(r => normalizeList<any>(r.data).rows),
    api.get("/api/v1/finance/cost-entries/?page_size=500").then(r => normalizeList<any>(r.data).rows),
    api.get("/api/v1/finance/billing-proposals/?page_size=200").then(r => normalizeList<any>(r.data).rows),
    api.get("/api/v1/sales/orders/?page_size=200").then(r => normalizeList<any>(r.data).rows),
    api.get("/api/v1/finance/journal-entries/?page_size=200").then(r => normalizeList<any>(r.data).rows).catch(() => []),
  ]);

  return {
    projects:    pairs[0].status === "fulfilled" ? pairs[0].value : [],
    costEntries: pairs[1].status === "fulfilled" ? pairs[1].value : [],
    billings:    pairs[2].status === "fulfilled" ? pairs[2].value : [],
    orders:      pairs[3].status === "fulfilled" ? pairs[3].value : [],
    journals:    pairs[4].status === "fulfilled" ? pairs[4].value : [],
  };
}

/* ── Shared Components ───────────────────────────── */
function MetricCard({ label, value, sub, valueColor, icon: Icon, iconBg, iconColor }: {
  label: string; value: string; sub?: string;
  valueColor?: string; icon: React.ElementType; iconBg: string; iconColor: string;
}) {
  return (
    <div className="card rounded-xl p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
        <Icon size={20} style={{ color: iconColor }} />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-text-secondary">{label}</div>
        <div className="text-xl font-bold" style={{ color: valueColor || "inherit" }}>{value}</div>
        {sub && <div className="text-xs text-text-secondary">{sub}</div>}
      </div>
    </div>
  );
}

function ProgressBarSimple({ value, color = "#16A34A" }: { value: number; color?: string }) {
  return (
    <div className="w-full bg-gray-100 rounded-full overflow-hidden h-1.5">
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex px-2 py-0.5 rounded-full text-2xs font-semibold", getStatusColor(status))}>
      {status}
    </span>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="py-10 text-center text-sm text-text-secondary">{msg}</div>
  );
}

/* ══════════════════════════════════════════════════
   TAB: PROJECT P&L
══════════════════════════════════════════════════ */
function TabProjectPnL({ data }: { data: ReturnType<typeof createDefaultData> }) {
  const [selectedId, setSelectedId] = useState<string>("");

  const projects = data.projects;
  const selectedProj = projects.find(p => String(p.id) === selectedId) || projects[0];

  useEffect(() => {
    if (projects.length > 0 && !selectedId) setSelectedId(String(projects[0].id));
  }, [projects, selectedId]);

  if (!selectedProj) return <EmptyState msg="Belum ada proyek untuk ditampilkan P&L-nya." />;

  const costEntries = data.costEntries.filter(c => String(c.project) === String(selectedProj.id));
  const materialCost  = costEntries.filter(c => c.cost_element === "MATERIAL").reduce((s, c) => s + Number(c.total_cost || 0), 0);
  const laborCost     = costEntries.filter(c => c.cost_element === "LABOR").reduce((s, c) => s + Number(c.total_cost || 0), 0);
  const overheadCost  = costEntries.filter(c => c.cost_element === "OVERHEAD").reduce((s, c) => s + Number(c.total_cost || 0), 0);
  const otherCost     = costEntries.filter(c => !["MATERIAL","LABOR","OVERHEAD"].includes(c.cost_element)).reduce((s, c) => s + Number(c.total_cost || 0), 0);
  const totalCost     = materialCost + laborCost + overheadCost + otherCost || Number(selectedProj.actual_cost || 0);
  const revenue       = Number(selectedProj.budget_amount || selectedProj.budget || 0);
  const grossProfit   = revenue - totalCost;
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  const breakdownRows = [
    { label: "Biaya Material / Bahan Baku", value: materialCost },
    { label: "Biaya Tenaga Kerja (Labor / Timesheet)", value: laborCost },
    { label: "Biaya Overhead & Peralatan", value: overheadCost },
    { label: "Biaya Lain-lain / Subkontraktor", value: otherCost },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Project selector */}
      <div className="card rounded-xl p-3 flex items-center gap-3">
        <CalendarDays size={16} className="text-text-secondary" />
        <span className="text-xs font-semibold text-text-secondary">Pilih Proyek:</span>
        <select
          className="flex-1 border border-text-tertiary rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-brand-green bg-white"
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
        >
          {projects.map(p => (
            <option key={p.id} value={String(p.id)}>
              {p.project_code || p.code || p.id} — {p.project_name || p.name}
            </option>
          ))}
        </select>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Nilai Kontrak (Revenue)" value={formatMoney(revenue)} sub="Target Pendapatan" icon={DollarSign} iconBg="#F0FDF4" iconColor="#16A34A" />
        <MetricCard label="Total Biaya Aktual" value={formatMoney(totalCost)} sub="Cost of Goods Sold (HPP)" icon={TrendingUp} iconBg="#FEF2F2" iconColor="#DC2626" valueColor="#DC2626" />
        <MetricCard
          label="Gross Profit" value={formatMoney(grossProfit)} sub="Laba Kotor Proyek" icon={grossProfit >= 0 ? ArrowUpRight : ArrowDownRight}
          iconBg={grossProfit >= 0 ? "#F0FDF4" : "#FEF2F2"} iconColor={grossProfit >= 0 ? "#16A34A" : "#DC2626"}
          valueColor={grossProfit >= 0 ? "#16A34A" : "#DC2626"}
        />
        <MetricCard
          label="Gross Margin %" value={`${grossMarginPct.toFixed(1)}%`} sub="Efisiensi Margin" icon={BarChart3}
          iconBg={grossMarginPct >= 0 ? "#F0FDF4" : "#FEF2F2"} iconColor={grossMarginPct >= 0 ? "#16A34A" : "#DC2626"}
          valueColor={grossMarginPct >= 0 ? "#16A34A" : "#DC2626"}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Cost Breakdown */}
        <div className="card rounded-xl p-4">
          <h3 className="text-sm font-bold text-text-primary mb-3">Rincian Beban Biaya (Cost Breakdown)</h3>
          <p className="text-xs text-text-secondary mb-3">Komposisi HPP proyek berdasarkan elemen biaya.</p>
          <div className="flex flex-col gap-2">
            {breakdownRows.map(row => (
              <div key={row.label} className="flex flex-col gap-1">
                <div className="flex justify-between text-xs">
                  <span className="text-text-secondary">{row.label}</span>
                  <span className="font-semibold text-text-primary">{formatMoney(row.value)}</span>
                </div>
                <ProgressBarSimple
                  value={totalCost > 0 ? (row.value / totalCost) * 100 : 0}
                  color={row.label.includes("Material") ? "#1D4ED8" : row.label.includes("Tenaga") ? "#7E22CE" : row.label.includes("Overhead") ? "#D97706" : "#6B7280"}
                />
              </div>
            ))}
          </div>
          {/* Cost breakdown visual bar */}
          {totalCost > 0 && (
            <div className="mt-4">
              <div className="text-xs text-text-secondary mb-1.5 font-medium">Proporsi biaya:</div>
              <div className="flex h-4 rounded-full overflow-hidden gap-px">
                {[
                  { value: materialCost, color: "#1D4ED8" },
                  { value: laborCost,    color: "#7E22CE"  },
                  { value: overheadCost, color: "#D97706"  },
                  { value: otherCost,    color: "#6B7280"  },
                ].filter(r => r.value > 0).map((r, i) => (
                  <div key={i} style={{ flex: r.value / totalCost, background: r.color }} title={formatMoney(r.value)} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Cost History */}
        <div className="card rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-text-primary">Riwayat Pencatatan Cost</h3>
            <span className="text-xs text-text-secondary">{costEntries.length} catatan</span>
          </div>
          {costEntries.length === 0 ? <EmptyState msg="Belum ada cost entry untuk proyek ini." /> : (
            <div className="flex flex-col divide-y divide-text-tertiary/50 max-h-60 overflow-y-auto">
              {costEntries.slice(0,10).map(c => (
                <div key={c.id} className="flex justify-between items-start py-2">
                  <div>
                    <div className="text-sm font-medium text-text-primary">{c.description || "-"}</div>
                    <div className="text-xs text-text-secondary">{c.cost_element} · {formatDate(c.transaction_date)}</div>
                  </div>
                  <span className="text-sm font-semibold text-text-primary">{formatMoney(c.total_cost)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   TAB: EXECUTIVE VIEW
══════════════════════════════════════════════════ */
function TabExecutive({ data }: { data: ReturnType<typeof createDefaultData> }) {
  const totalRev     = data.orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const totalPayable = data.billings.reduce((s, b) => s + Number(b.outstanding_amount || 0), 0);
  const totalCostAll = data.costEntries.reduce((s, c) => s + Number(c.total_cost || 0), 0);
  const grossAll     = totalRev - totalCostAll;
  const margAll      = totalRev > 0 ? ((grossAll / totalRev) * 100).toFixed(1) : "0.0";

  const activeProjects = data.projects.filter(p => !["COMPLETED","CLOSED","DONE"].includes((p.status||"").toUpperCase()));

  return (
    <div className="flex flex-col gap-5">
      {/* Executive KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="Total Sales Order Booked" value={formatMoney(totalRev)} sub={`${data.orders.length} Order`} icon={DollarSign} iconBg="#F0FDF4" iconColor="#16A34A" />
        <MetricCard label="Accounts Payable Outstanding" value={formatMoney(totalPayable)} sub="Hutang ke Vendor" icon={TrendingUp} iconBg="#FEF2F2" iconColor="#DC2626" valueColor="#DC2626" />
        <MetricCard label="Active Cost Projects" value={String(activeProjects.length)} sub="Proyek Berjalan" icon={Layers} iconBg="#EFF6FF" iconColor="#1D4ED8" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="card rounded-xl p-4">
          <h3 className="text-sm font-bold mb-3">Company Gross Profit Summary</h3>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between p-2.5 rounded-lg border border-text-tertiary/60">
              <span className="text-text-secondary">Total Revenue</span>
              <span className="font-semibold text-brand-green">{formatMoney(totalRev)}</span>
            </div>
            <div className="flex justify-between p-2.5 rounded-lg border border-text-tertiary/60">
              <span className="text-text-secondary">Total Cost</span>
              <span className="font-semibold text-red-600">{formatMoney(totalCostAll)}</span>
            </div>
            <div className="flex justify-between p-2.5 rounded-xl bg-brand-light-green border border-brand-green/20 font-bold">
              <span>Gross Profit</span>
              <span className={grossAll >= 0 ? "text-brand-green" : "text-red-600"}>{formatMoney(grossAll)}</span>
            </div>
            <div className="flex justify-between p-2.5 rounded-lg border border-text-tertiary/60">
              <span className="text-text-secondary">Gross Margin</span>
              <span className={cn("font-bold", Number(margAll) >= 0 ? "text-brand-green" : "text-red-600")}>{margAll}%</span>
            </div>
          </div>
        </div>

        {/* Project performance table */}
        <div className="card rounded-xl p-4">
          <h3 className="text-sm font-bold mb-3">Project Performance Overview</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-text-tertiary bg-bg-lighter">
                  <th className="text-left px-2 py-1.5 font-semibold text-text-secondary">Proyek</th>
                  <th className="text-right px-2 py-1.5 font-semibold text-text-secondary">Budget</th>
                  <th className="text-right px-2 py-1.5 font-semibold text-text-secondary">Actual</th>
                  <th className="text-right px-2 py-1.5 font-semibold text-text-secondary">Margin</th>
                </tr>
              </thead>
              <tbody>
                {data.projects.slice(0,8).map(p => {
                  const pCost = data.costEntries.filter(c => String(c.project) === String(p.id)).reduce((s, c) => s + Number(c.total_cost || 0), 0) || Number(p.actual_cost || 0);
                  const budget = Number(p.budget_amount || p.budget || 0);
                  const mgn = budget > 0 ? ((budget - pCost) / budget * 100).toFixed(0) : "-";
                  return (
                    <tr key={p.id} className="border-b border-text-tertiary/50 hover:bg-bg-lighter">
                      <td className="px-2 py-1.5 font-medium truncate max-w-32">{p.project_name || p.name}</td>
                      <td className="px-2 py-1.5 text-right">{formatMoney(budget)}</td>
                      <td className="px-2 py-1.5 text-right text-red-600">{formatMoney(pCost)}</td>
                      <td className={cn("px-2 py-1.5 text-right font-bold", Number(mgn) >= 0 ? "text-brand-green" : "text-red-600")}>{mgn}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   TAB: GENERAL LEDGER / JOURNALS
══════════════════════════════════════════════════ */
function TabJournals({ data }: { data: ReturnType<typeof createDefaultData> }) {
  const journals = data.journals;
  return (
    <div className="card rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-text-tertiary bg-bg-lighter flex items-center justify-between">
        <h3 className="text-sm font-bold">General Ledger — Journal Entries</h3>
        <span className="text-xs text-text-secondary">{journals.length} entri</span>
      </div>
      {journals.length === 0 ? (
        <div className="py-12 text-center text-sm text-text-secondary">Belum ada jurnal umum tercatat.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-text-tertiary bg-bg-lighter">
                <th className="text-left text-xs font-semibold text-text-secondary px-4 py-3">No. Jurnal</th>
                <th className="text-left text-xs font-semibold text-text-secondary px-4 py-3">Tanggal</th>
                <th className="text-left text-xs font-semibold text-text-secondary px-4 py-3">Deskripsi</th>
                <th className="text-right text-xs font-semibold text-text-secondary px-4 py-3">Debit</th>
                <th className="text-right text-xs font-semibold text-text-secondary px-4 py-3">Kredit</th>
                <th className="text-left text-xs font-semibold text-text-secondary px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {journals.map((j, i) => (
                <tr key={j.id} className={cn("border-b border-text-tertiary/50 hover:bg-bg-lighter", i % 2 === 0 && "bg-white")}>
                  <td className="px-4 py-2.5 font-medium text-brand-deep-green">{j.journal_number || j.id}</td>
                  <td className="px-4 py-2.5 text-text-secondary">{formatDate(j.entry_date)}</td>
                  <td className="px-4 py-2.5 text-text-primary max-w-48 truncate">{j.description || "-"}</td>
                  <td className="px-4 py-2.5 text-right font-medium">{j.total_debit ? formatMoney(j.total_debit) : "-"}</td>
                  <td className="px-4 py-2.5 text-right font-medium">{j.total_credit ? formatMoney(j.total_credit) : "-"}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={j.status || "POSTED"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Default data ─────────────────────────────── */
function createDefaultData() {
  return { projects: [] as any[], costEntries: [] as any[], billings: [] as any[], orders: [] as any[], journals: [] as any[] };
}

/* ══════════════════════════════════════════════════
   MAIN REPORTING CLIENT
══════════════════════════════════════════════════ */
export default function ReportingClient() {
  const [activeTab, setActiveTab] = useState("project-pnl");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(createDefaultData());

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const d = await loadReportingData();
      setData(d);
    } catch {
      toast.error("Gagal memuat data laporan.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleExport = (format: "csv" | "pdf") => {
    toast(`Export ${format.toUpperCase()} sedang disiapkan...`, { icon: "📊" });
    // Simple CSV export for current tab data
    if (format === "csv" && activeTab === "project-pnl") {
      const rows = [
        ["Proyek", "Budget", "Actual Cost", "Gross Profit", "Margin %"],
        ...data.projects.map(p => {
          const pCost = data.costEntries.filter(c => String(c.project) === String(p.id)).reduce((s, c) => s + Number(c.total_cost || 0), 0);
          const budget = Number(p.budget_amount || p.budget || 0);
          const gp = budget - pCost;
          const mgn = budget > 0 ? ((gp / budget) * 100).toFixed(1) : "0";
          return [p.project_name || p.name, budget, pCost, gp, mgn + "%"];
        })
      ];
      const csv = rows.map(r => r.join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `marka_report_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ── Header ─────────────────────────── */}
      <div className="card rounded-2xl p-5 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #fcfaff, #f3edff)", border: "1px solid #a488f2" }}>
        <div>
          <div className="text-xs font-bold text-purple-600 uppercase tracking-wider mb-1">Executive Intelligence</div>
          <h1 className="text-xl font-bold text-text-primary">Pelaporan Laba/Rugi Proyek & Observabilitas Finansial</h1>
          <p className="text-xs text-text-secondary mt-0.5">Visibilitas real-time: Revenue, Biaya Aktual (Labor/Material), Gross Margin, dan General Ledger.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => handleExport("csv")} className="btn-ghost text-xs gap-1.5">
            <Download size={13} /> Export CSV
          </button>
          <button onClick={() => loadData(true)} disabled={refreshing} className="btn-ghost text-xs gap-1.5">
            <RefreshCw size={13} className={cn(refreshing && "animate-spin")} />
            {refreshing ? "Memuat..." : "Segarkan"}
          </button>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────── */}
      <div className="flex gap-1.5 p-1.5 bg-bg-lighter rounded-xl border border-text-tertiary/50">
        {REPORT_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all",
              activeTab === id
                ? "bg-white text-brand-deep-green shadow-sm border border-text-tertiary/30"
                : "text-text-secondary hover:text-text-primary hover:bg-white/60"
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Content ────────────────────────── */}
      {loading ? (
        <div className="flex flex-col gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="card rounded-xl p-4 h-20 animate-pulse"><div className="h-4 bg-gray-200 rounded w-1/3" /></div>)}
        </div>
      ) : (
        <>
          {activeTab === "project-pnl" && <TabProjectPnL data={data} />}
          {activeTab === "executive"   && <TabExecutive data={data} />}
          {activeTab === "journals"    && <TabJournals data={data} />}
        </>
      )}
    </div>
  );
}
