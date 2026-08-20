/**
 * Reporting and Financial Observability Page Controller
 */

import { state } from "../core/state.js";
import { router } from "../core/router.js";
import { setPageHeader } from "../components/topbar.js";
import { REPORTING_TABS } from "../config/navigation.js";
import { esc, attr } from "../utils/dom.js";
import { formatMoney, number, formatDate } from "../utils/formatters.js";
import { emptyState, loadingState } from "../components/state-views.js";
import { loadReportingData } from "../services/reporting.service.js";
import { toast } from "../components/toast.js";

export async function renderReportingPage({ params = {} } = {}) {
  setPageHeader("Executive & Observability", "Reporting & Financial Observability");
  const workspace = document.getElementById("workspace");
  if (!workspace) return;

  if (params.tab) {
    state.reporting.tab = params.tab;
  }

  if (!state.reporting.loaded && !state.reporting.loading) {
    workspace.innerHTML = loadingState("Memuat laporan finansial & laba/rugi...");
    try {
      await loadReportingData();
      renderReportingPage({ params });
    } catch (err) {
      toast("Gagal Memuat Laporan", err.message, "error");
      workspace.innerHTML = emptyState("Gagal memuat laporan.");
    }
    return;
  }

  const d = state.reporting.data || {};
  const projects = d.projects?.length ? d.projects : state.pm.projects || [];
  const selectedProj =
    projects.find(p => String(p.id) === String(state.reporting.selectedProjectId)) || projects[0];
  const currentTab = state.reporting.tab || "project-pnl";

  const heroHTML = `
    <section class="flow-hero" style="border-color:#a488f2;background:linear-gradient(135deg,#fcfaff,#f3edff);padding:22px;border-radius:18px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <span class="eyebrow" style="color:#7746e8;">Executive Intelligence</span>
        <h2 style="margin:5px 0;">Pelaporan Laba/Rugi Proyek & Observabilitas Finansial</h2>
        <p style="margin:0;color:var(--muted);">Visibilitas real-time pendapatan (Revenue), biaya aktual (Labor/Material), Gross Margin, dan General Ledger.</p>
      </div>
      <button id="btnRefreshReporting" class="button secondary small">🔄 Segarkan Laporan</button>
    </section>
  `;

  const tabsHTML = `
    <nav class="accounting-tabs finance-domain-tabs" style="margin:14px 0;">
      ${REPORTING_TABS.map(
        ([id, label]) => `
        <button data-report-tab="${esc(id)}" class="${currentTab === id ? "active" : ""}">${esc(label)}</button>
      `
      ).join("")}
    </nav>
  `;

  let contentHTML = "";
  if (currentTab === "executive") {
    contentHTML = renderExecutiveDashboard(d);
  } else if (currentTab === "journals") {
    contentHTML = renderGeneralLedgerJournals(d);
  } else {
    contentHTML = renderProjectPnL(selectedProj, projects, d);
  }

  workspace.innerHTML = `${heroHTML}${tabsHTML}<main class="reporting-content">${contentHTML}</main>`;
  bindReportingEvents(workspace);
}

function renderProjectPnL(selectedProj, projects, d) {
  if (!selectedProj) return emptyState("Belum ada proyek untuk dihitung laba ruginya.");

  const costEntries = (d.costEntries || []).filter(c => String(c.project) === String(selectedProj.id));
  const materialCost = costEntries.filter(c => c.cost_element === "MATERIAL").reduce((sum, c) => sum + Number(c.total_cost || 0), 0);
  const laborCost = costEntries.filter(c => c.cost_element === "LABOR").reduce((sum, c) => sum + Number(c.total_cost || 0), 0);
  const overheadCost = costEntries.filter(c => c.cost_element === "OVERHEAD").reduce((sum, c) => sum + Number(c.total_cost || 0), 0);
  const otherCost = costEntries.filter(c => !["MATERIAL", "LABOR", "OVERHEAD"].includes(c.cost_element)).reduce((sum, c) => sum + Number(c.total_cost || 0), 0);
  const totalCost = materialCost + laborCost + overheadCost + otherCost || Number(selectedProj.actual_cost || 0);

  const revenue = Number(selectedProj.budget_amount || selectedProj.budget || 0);
  const grossProfit = revenue - totalCost;
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  return `
    <div class="content-toolbar" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;background:#fff;padding:12px;border:1px solid var(--line);border-radius:12px;">
      <label style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:12px;">
        <span>Pilih Proyek:</span>
        <select id="reportProjectSelect" style="padding:6px 10px;border-radius:8px;border:1px solid var(--line);font-size:12px;">
          ${projects.map(p => `<option value="${attr(p.id)}" ${p.id === selectedProj.id ? "selected" : ""}>${esc(p.project_code || p.code || p.id)} - ${esc(p.project_name || p.name)}</option>`).join("")}
        </select>
      </label>
    </div>

    <div class="finance-kpis" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px;">
      <article class="metric"><span>Nilai Kontrak (Revenue)</span><strong>${formatMoney(revenue)}</strong><small>Target Pendapatan</small></article>
      <article class="metric"><span>Total Biaya Aktual</span><strong style="color:var(--danger);">${formatMoney(totalCost)}</strong><small>Cost of Goods Sold (HPP)</small></article>
      <article class="metric"><span>Gross Profit</span><strong style="color:${grossProfit >= 0 ? "var(--success)" : "var(--danger)"};">${formatMoney(grossProfit)}</strong><small>Laba Kotor Proyek</small></article>
      <article class="metric"><span>Gross Margin %</span><strong style="color:${grossMarginPct >= 0 ? "var(--success)" : "var(--danger)"};">${number(grossMarginPct.toFixed(1))}%</strong><small>Efisiensi Margin</small></article>
    </div>

    <div class="two-grid">
      <section class="panel">
        <header class="panel-head"><div><h2>Rincian Beban Biaya (Cost Breakdown)</h2><p>Komposisi HPP proyek berdasarkan elemen biaya.</p></div></header>
        <div class="panel-body">
          <div style="display:grid;gap:8px;">
            <div style="display:flex;justify-content:space-between;padding:10px;border:1px solid var(--line);border-radius:8px;"><span>Biaya Material / Bahan Baku</span><strong>${formatMoney(materialCost)}</strong></div>
            <div style="display:flex;justify-content:space-between;padding:10px;border:1px solid var(--line);border-radius:8px;"><span>Biaya Tenaga Kerja (Labor / Timesheet)</span><strong>${formatMoney(laborCost)}</strong></div>
            <div style="display:flex;justify-content:space-between;padding:10px;border:1px solid var(--line);border-radius:8px;"><span>Biaya Overhead & Peralatan</span><strong>${formatMoney(overheadCost)}</strong></div>
            <div style="display:flex;justify-content:space-between;padding:10px;border:1px solid var(--line);border-radius:8px;"><span>Biaya Lain-lain / Subkontraktor</span><strong>${formatMoney(otherCost)}</strong></div>
          </div>
        </div>
      </section>

      <section class="panel">
        <header class="panel-head"><div><h2>Riwayat Pencatatan Cost Terakhir</h2><p>${costEntries.length} Catatan Biaya</p></div></header>
        <div class="panel-body" style="max-height:280px;overflow-y:auto;">
          ${costEntries.slice(0, 8).map(c => `
            <div style="padding:8px 10px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;">
              <div><strong>${esc(c.description || "-")}</strong><small style="display:block;color:var(--muted);">${esc(c.cost_element)} · ${formatDate(c.transaction_date)}</small></div>
              <strong>${formatMoney(c.total_cost)}</strong>
            </div>
          `).join("") || emptyState("Belum ada cost entry.")}
        </div>
      </section>
    </div>
  `;
}

function renderExecutiveDashboard(d) {
  const orders = d.orders || [];
  const billings = d.billings || [];
  const totalRev = orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const totalPayable = billings.reduce((sum, b) => sum + Number(b.outstanding_amount || 0), 0);

  return `
    <div class="finance-kpis" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:16px;">
      <article class="metric"><span>Total Sales Order Booked</span><strong>${formatMoney(totalRev)}</strong><small>${orders.length} Order</small></article>
      <article class="metric"><span>Accounts Payable Outstanding</span><strong style="color:var(--danger);">${formatMoney(totalPayable)}</strong><small>Hutang ke Vendor</small></article>
      <article class="metric"><span>Active Cost Projects</span><strong>${(d.projects || []).length}</strong><small>Proyek Berjalan</small></article>
    </div>
  `;
}

function renderGeneralLedgerJournals(d) {
  const journals = d.journals || [];
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>No. Jurnal</th><th>Tanggal</th><th>Deskripsi</th><th>Status</th></tr></thead>
        <tbody>
          ${journals.map(j => `
            <tr>
              <td><strong>${esc(j.journal_number || j.id)}</strong></td>
              <td>${formatDate(j.entry_date)}</td>
              <td>${esc(j.description || "-")}</td>
              <td><span class="badge success">${esc(j.status || "POSTED")}</span></td>
            </tr>
          `).join("") || `<tr><td colspan="4">${emptyState("Belum ada jurnal umum.")}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function bindReportingEvents(workspace) {
  document.getElementById("btnRefreshReporting")?.addEventListener("click", async () => {
    try {
      await loadReportingData(true);
      renderReportingPage();
      toast("Laporan Diperbarui", "Data finansial & P&L disinkronkan.", "success");
    } catch (err) {
      toast("Gagal Refresh Laporan", err.message, "error");
    }
  });

  workspace.querySelectorAll("[data-report-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.reportTab;
      router.navigate(`/reporting/${tab}`);
    });
  });

  document.getElementById("reportProjectSelect")?.addEventListener("change", e => {
    state.reporting.selectedProjectId = e.target.value;
    renderReportingPage();
  });
}
