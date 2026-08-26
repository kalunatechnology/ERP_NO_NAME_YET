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
import { feedApi } from "@/lib/api/feed.api";

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
    api.get("/api/v1/finance/project-cost-entries/?page_size=500").then(r => normalizeList<any>(r.data).rows),
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Nilai Kontrak (Revenue)" value={formatMoney(revenue)} sub="Target Pendapatan" icon={DollarSign} iconBg="#F0FDF4" iconColor="#16A34A" />
        <MetricCard label="Total Biaya Aktual" value={formatMoney(totalCost)} sub="Cost of Goods Sold (HPP)" icon={TrendingUp} iconBg="#FEF2F2" iconColor="#DC2626" valueColor="#DC2626" />
        <MetricCard
          label="Gross Profit" value={formatMoney(grossProfit)} sub="Laba Kotor Proyek" icon={grossProfit >= 0 ? ArrowUpRight : ArrowDownRight}
          iconBg={grossProfit >= 0 ? "#F0FDF4" : "#FEF2F2"} iconColor={grossProfit >= 0 ? "#16A34A" : "#DC2626"}
          valueColor={grossProfit >= 0 ? "#16A34A" : "#DC2626"}
        />
        <MetricCard
          label="Gross Margin" value={`${grossMarginPct.toFixed(1)}%`} sub={`Target: > 20%`} icon={BarChart3}
          iconBg={grossMarginPct >= 20 ? "#F0FDF4" : "#FFFBEB"} iconColor={grossMarginPct >= 20 ? "#16A34A" : "#D97706"}
          valueColor={grossMarginPct >= 20 ? "#16A34A" : "#D97706"}
        />
      </div>

      {/* Cost Breakdown + Progress */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Breakdown Card */}
        <div className="card rounded-xl p-4 flex flex-col gap-3">
          <div className="text-xs font-bold text-text-primary uppercase tracking-wide">Rincian Komponen Biaya Aktual</div>
          <div className="flex flex-col gap-2.5">
            {breakdownRows.map((row, i) => {
              const pct = totalCost > 0 ? (row.value / totalCost) * 100 : 0;
              return (
                <div key={i} className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-text-secondary">{row.label}</span>
                    <span className="font-semibold text-text-primary">{formatMoney(row.value)} ({pct.toFixed(0)}%)</span>
                  </div>
                  <ProgressBarSimple value={pct} color={["#16A34A","#2563EB","#7C3AED","#EA580C"][i]} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Financial Summary Card */}
        <div className="card rounded-xl p-4 flex flex-col gap-3 justify-between">
          <div className="text-xs font-bold text-text-primary uppercase tracking-wide">Ringkasan Margin & Kontrak</div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-text-tertiary/40">
              <span className="text-text-secondary">Customer:</span>
              <span className="font-semibold">{selectedProj.customer_name || selectedProj.party_name || "Client Proyek"}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-text-tertiary/40">
              <span className="text-text-secondary">Target Selesai:</span>
              <span className="font-semibold">{formatDate(selectedProj.planned_end_date)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-text-tertiary/40">
              <span className="text-text-secondary">Cost Variance:</span>
              <span className={cn("font-semibold", revenue - totalCost >= 0 ? "text-emerald-600" : "text-red-600")}>
                {revenue - totalCost >= 0 ? "Under Budget (Hemat)" : "Over Budget"}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-text-secondary">Health Status:</span>
              <StatusBadge status={grossMarginPct >= 20 ? "HEALTHY" : grossMarginPct > 0 ? "WARNING" : "CRITICAL"} />
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-bg-lighter text-2xs text-text-secondary">
            💡 Proyek ini berkontribusi terhadap total gross revenue portofolio aktif.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   TAB: EXECUTIVE VIEW
══════════════════════════════════════════════════ */
function TabExecutive({ data }: { data: ReturnType<typeof createDefaultData> }) {
  const totalRevenue   = data.projects.reduce((s, p) => s + Number(p.budget_amount || p.budget || 0), 0);
  const totalActualCost = data.projects.reduce((s, p) => s + Number(p.actual_cost || 0), 0);
  const totalGrossProfit = totalRevenue - totalActualCost;
  const avgMargin = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;
  const activeProjects = data.projects.filter(p => ["ACTIVE","IN_PROGRESS","PLANNING"].includes(p.status || "")).length;

  return (
    <div className="flex flex-col gap-5">
      {/* Portfolio KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Total Portofolio Kontrak" value={formatMoney(totalRevenue)} sub={`${data.projects.length} Proyek Terdaftar`} icon={DollarSign} iconBg="#F0FDF4" iconColor="#16A34A" />
        <MetricCard label="Total Pengeluaran Riil" value={formatMoney(totalActualCost)} sub="Seluruh Proyek Aktif" icon={TrendingUp} iconBg="#FEF2F2" iconColor="#DC2626" valueColor="#DC2626" />
        <MetricCard label="Total Laba Kotor" value={formatMoney(totalGrossProfit)} sub={`Rata-rata Margin ${avgMargin.toFixed(1)}%`} icon={ArrowUpRight} iconBg="#F0FDF4" iconColor="#16A34A" valueColor="#16A34A" />
        <MetricCard label="Proyek Berjalan" value={`${activeProjects} Aktif`} sub={`${data.projects.length - activeProjects} Selesai/Draft`} icon={Layers} iconBg="#EFF6FF" iconColor="#2563EB" />
      </div>

      {/* Portfolio Table */}
      <div className="card rounded-2xl overflow-hidden border border-text-tertiary bg-white">
        <div className="p-4 border-b border-text-tertiary flex items-center justify-between">
          <h3 className="text-sm font-bold text-text-primary">Kinerja Finansial Seluruh Proyek</h3>
          <span className="text-xs text-text-secondary">{data.projects.length} Proyek</span>
        </div>
        <div className="table-scroll-wrapper">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-text-tertiary bg-bg-lighter">
                <th className="text-left text-xs font-semibold text-text-secondary px-4 py-3">Kode & Nama Proyek</th>
                <th className="text-left text-xs font-semibold text-text-secondary px-4 py-3">Status</th>
                <th className="text-right text-xs font-semibold text-text-secondary px-4 py-3">Revenue (Budget)</th>
                <th className="text-right text-xs font-semibold text-text-secondary px-4 py-3">Actual Cost</th>
                <th className="text-right text-xs font-semibold text-text-secondary px-4 py-3">Gross Profit</th>
                <th className="text-right text-xs font-semibold text-text-secondary px-4 py-3">Margin %</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.map((p, i) => {
                const pBudget = Number(p.budget_amount || p.budget || 0);
                const pCost   = Number(p.actual_cost || 0);
                const pProfit = pBudget - pCost;
                const pMargin = pBudget > 0 ? (pProfit / pBudget) * 100 : 0;
                return (
                  <tr key={p.id} className={cn("border-b border-text-tertiary/50 hover:bg-bg-lighter", i % 2 === 0 && "bg-white")}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-brand-deep-green">{p.project_name || p.name}</div>
                      <div className="text-2xs text-text-secondary">{p.project_code || p.code || p.id}</div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={p.status || "DRAFT"} /></td>
                    <td className="px-4 py-3 text-right font-medium">{formatMoney(pBudget)}</td>
                    <td className="px-4 py-3 text-right font-medium text-red-600">{formatMoney(pCost)}</td>
                    <td className="px-4 py-3 text-right font-bold" style={{ color: pProfit >= 0 ? "#16A34A" : "#DC2626" }}>
                      {formatMoney(pProfit)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold" style={{ color: pMargin >= 20 ? "#16A34A" : "#D97706" }}>
                      {pMargin.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
    <div className="card rounded-2xl overflow-hidden border border-text-tertiary bg-white">
      <div className="p-4 border-b border-text-tertiary flex items-center justify-between">
        <h3 className="text-sm font-bold text-text-primary">Buku Besar Akuntansi (General Ledger Entries)</h3>
        <span className="text-xs text-text-secondary">{journals.length} Jurnal Tercatat</span>
      </div>
      {journals.length === 0 ? (
        <div className="py-12 text-center text-sm text-text-secondary">Belum ada jurnal umum tercatat.</div>
      ) : (
        <div className="table-scroll-wrapper">
          <table className="w-full text-sm min-w-[600px]">
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

  /* Track recently opened Reporting */
  useEffect(() => {
    feedApi.trackRecentItem({
      item_type: "REPORT",
      object_id: `rep-${activeTab}`,
      title: `Laporan — ${REPORT_TABS.find(t => t.id === activeTab)?.label || "Executive"}`,
      target_url: "/reporting",
    }).catch(() => {});
  }, [activeTab]);

  const handleExport = (format: "csv" | "pdf") => {
    if (format === "csv") {
      toast("Mengunduh laporan CSV...", { icon: "📊" });
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
      toast.success("File CSV berhasil diunduh.");
    } else if (format === "pdf") {
      toast("Membuka dialog cetak PDF...", { icon: "🖨️" });
      const reportElement = document.getElementById("printable-report-area");
      if (!reportElement) {
        window.print();
        return;
      }

      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Laporan Finansial & Observabilitas Proyek - Marka+ ERP</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 32px; color: #1e293b; }
                h2 { color: #1e3a1e; border-bottom: 2px solid #3E9B4B; padding-bottom: 8px; margin-bottom: 16px; }
                table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
                th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; }
                th { background-color: #f1f5f9; font-weight: bold; }
                .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
                @media print {
                  button { display: none; }
                }
              </style>
            </head>
            <body>
              <h2>Marka+ ERP — Laporan Finansial Proyek</h2>
              <p style="font-size: 12px; color: #64748b;">Tanggal Cetak: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })}</p>
              ${reportElement.innerHTML}
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 300);
      } else {
        window.print();
      }
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ── Header ─────────────────────────── */}
      <div className="card rounded-2xl p-5 flex items-center justify-between flex-wrap gap-4" style={{ background: "linear-gradient(135deg, #fcfaff, #f3edff)", border: "1px solid #a488f2" }}>
        <div>
          <div className="text-xs font-bold text-purple-600 uppercase tracking-wider mb-1">Executive Intelligence</div>
          <h1 className="text-xl font-bold text-text-primary">Pelaporan Laba/Rugi Proyek & Observabilitas Finansial</h1>
          <p className="text-xs text-text-secondary mt-0.5">Visibilitas real-time: Revenue, Biaya Aktual (Labor/Material), Gross Margin, dan General Ledger.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => handleExport("pdf")} className="btn-outline text-xs gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-50">
            <FileText size={13} /> Cetak / PDF
          </button>
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

      {/* ── Content (Printable Area) ───────── */}
      <div id="printable-report-area">
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
    </div>
  );
}
