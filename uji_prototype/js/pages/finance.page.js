/**
 * Accounting and Finance Workspace Page Controller
 */

import { state } from "../core/state.js";
import { router } from "../core/router.js";
import { setPageHeader } from "../components/topbar.js";
import { FINANCE_DOMAINS } from "../config/navigation.js";
import { esc, attr } from "../utils/dom.js";
import { formatMoney, number, formatDate } from "../utils/formatters.js";
import { renderMetricCard, renderMoneyMetricCard } from "../components/kpi-card.js";
import { statusBadge } from "../components/badge.js";
import { emptyState, loadingState } from "../components/state-views.js";
import { Modal } from "../components/modal.js";
import { toast } from "../components/toast.js";
import { eventBus } from "../core/event-bus.js";
import {
  loadFinanceData,
  createSupplierBilling,
  createBillingLine,
  verifyBilling,
  approveBilling,
  postBilling,
  rejectBilling,
  createBillingDocument,
  createPaymentBatch,
  createProjectCostEntry,
  createBillingProposal,
  submitPayment,
  approvePayment,
  executePayment,
  autoReconcileStatement,
  decideFundingRequest,
  validateCostEntry,
  postCostEntryToWIP,
  approveBillingProposal,
  createInvoiceFromProposal,
  deleteBillingDocument,
  deletePaymentBatch,
  deleteProjectCostEntry,
  deleteBillingProposal,
  deleteFundingRequest,
  updateCustomerCreditLimit,
  calculateCreditSnapshot,
} from "../services/finance.service.js";
import { createFundingRequest } from "../services/project.service.js";
import { requestJSON } from "../core/http.js";

export async function renderFinancePage({ params = {} } = {}) {
  setPageHeader("Accounting & Finance", "Operational Workspace");
  const workspace = document.getElementById("workspace");
  if (!workspace) return;

  if (params.tab) {
    state.finance.tab = params.tab;
  }

  if (!state.finance.data || Object.keys(state.finance.data).length === 0) {
    if (!state.finance.loading) {
      loadFinanceData()
        .then(() => renderFinancePage({ params }))
        .catch(err => console.warn("Finance auto-load error:", err));
      workspace.innerHTML = loadingState("Memuat domain data finance & akuntansi...");
      return;
    } else {
      workspace.innerHTML = loadingState("Memuat domain data finance & akuntansi...");
      return;
    }
  }

  const d = state.finance.data;
  const currentTab = state.finance.tab || "overview";

const tabsHTML = `
    <div class="finance-subnav-bar">
      <nav class="accounting-tabs finance-domain-tabs">
        ${FINANCE_DOMAINS.map(([id, label]) => {
          const isActive = currentTab === id || (id === "payable" && currentTab === "billing");
          const count = getTabCount(id, d);
          return `<button data-finance-tab="${esc(id)}" class="${isActive ? "active" : ""}">${esc(label)}${count}</button>`;
        }).join("")}
      </nav>
    </div>
  `;

  let panelHTML = "";
  switch (currentTab) {
    case "payable":
    case "billing":
      panelHTML = renderAccountsPayable(d);
      break;
    case "profitability":
      panelHTML = renderProjectProfitability(d);
      break;
    case "funding":
      panelHTML = renderFundingApproval(d);
      break;
    case "costing":
      panelHTML = renderProjectCosting(d);
      break;
    case "project-billing":
      panelHTML = renderProjectBilling(d);
      break;
    case "invoice-control":
      panelHTML = renderInvoiceControl(d);
      break;
    case "tax":
      panelHTML = renderTaxCompliance(d);
      break;
    case "accounting":
      panelHTML = renderGeneralAccounting(d);
      break;
    case "receivable":
      panelHTML = renderProjectReceivable(d);
      break;
    case "assets":
      panelHTML = renderAssetFinance(d);
      break;
    case "approval":
      panelHTML = renderApprovalQueue(d);
      break;
    case "payments":
      panelHTML = renderPayments(d);
      break;
    case "reconcile":
      panelHTML = renderReconciliation(d);
      break;
    case "overview":
    default:
      panelHTML = renderFinanceOverview(d);
      break;
  }

  workspace.innerHTML = `${tabsHTML}${panelHTML}`;
  bindFinanceEvents(workspace);
}

function getTabCount(id, d) {
  if (id === "funding") {
    const c = (d.fundings || []).length;
    return c ? `<span>${c}</span>` : "";
  }
  if (id === "billing" || id === "payable") {
    const c = (d.billings || []).length;
    return c ? `<span>${c}</span>` : "";
  }
  if (id === "costing") {
    const c = (d.costEntries || []).length;
    return c ? `<span>${c}</span>` : "";
  }
  if (id === "project-billing") {
    const c = (d.billingProposals || []).length;
    return c ? `<span>${c}</span>` : "";
  }
  if (id === "payments") {
    const c = (d.payments || []).length;
    return c ? `<span>${c}</span>` : "";
  }
  return "";
}

function renderFinanceOverview(d) {
  const bills = d.billings || [];
  const payments = d.payments || [];
  const fundings = d.fundings || [];
  const costEntries = d.costEntries || [];
  const proposals = d.billingProposals || [];

  const out = bills.reduce((n, b) => n + Number(b.outstanding_amount || 0), 0);
  const pendingFunding = fundings.filter(f => ["SUBMITTED", "VERIFIED"].includes(String(f.status).toUpperCase()));
  const pendingCost = costEntries.filter(c => ["CAPTURED", "VALIDATED", "DRAFT"].includes(String(c.status).toUpperCase()));
  const pendingProps = proposals.filter(p => ["SUBMITTED", "APPROVED", "DRAFT"].includes(String(p.status).toUpperCase()));
  const pendingBills = bills.filter(b => ["DRAFT", "VERIFIED", "APPROVED"].includes(String(b.status).toUpperCase()));

  const activeInbox = state.finance.inboxTab || "funding";

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:linear-gradient(135deg,#f9fbff,#edf5ff);border:1px solid #cbdcf7;border-radius:14px;margin-bottom:16px;flex-wrap:wrap;gap:12px;">
      <div>
        <h3 style="margin:0;font-size:18px;color:#1e293b;">Accounting & Financial Operations</h3>
        <p style="margin:2px 0 0;color:var(--muted);font-size:12px;">Pusat kontrol persetujuan dana proyek, verifikasi biaya aktual (WIP), dan kontrol invoice.</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button id="btnQuickNewBill" class="button secondary small">+ Tagihan Vendor</button>
        <button id="btnQuickNewFunding" class="button secondary small">+ Ajukan Funding</button>
        <button id="btnQuickNewCost" class="button secondary small">+ Catat Biaya</button>
        <button id="btnQuickNewPayment" class="button primary small" style="background:#2563eb;">+ Buat Pembayaran</button>
      </div>
    </div>

    <section class="finance-kpis" style="margin-bottom:18px;">
      ${renderMetricCard("Supplier bills", bills.length, "Seluruh tagihan")}
      ${renderMoneyMetricCard("Outstanding AP", out)}
      ${renderMetricCard("Pengajuan Dana", fundings.length, `${pendingFunding.length} pending approval`)}
      ${renderMetricCard("Biaya Proyek (WIP)", costEntries.length, `${pendingCost.length} perlu diposting`)}
      ${renderMetricCard("Proposal Termin", proposals.length, `${pendingProps.length} siap invoice`)}
    </section>

    <!-- Unified Inbox & Queue Selector -->
    <section class="panel" style="background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="button small ${activeInbox === "funding" ? "primary" : "secondary"}" data-inbox-tab="funding" style="${activeInbox === "funding" ? "background:#2563eb;" : ""}">
            💰 Pengajuan Dana Proyek (${fundings.length})
          </button>
          <button class="button small ${activeInbox === "costing" ? "primary" : "secondary"}" data-inbox-tab="costing" style="${activeInbox === "costing" ? "background:#257743;" : ""}">
            📥 Biaya Aktual ke WIP (${costEntries.length})
          </button>
          <button class="button small ${activeInbox === "billing" ? "primary" : "secondary"}" data-inbox-tab="billing" style="${activeInbox === "billing" ? "background:#7746e8;" : ""}">
            📑 Proposal Termin Billing (${proposals.length})
          </button>
          <button class="button small ${activeInbox === "payable" ? "primary" : "secondary"}" data-inbox-tab="payable" style="${activeInbox === "payable" ? "background:#d97706;" : ""}">
            🧾 Tagihan Vendor AP (${bills.length})
          </button>
        </div>
      </div>

      <!-- Content for Selected Queue -->
      <div class="table-wrap">
        ${activeInbox === "funding" ? `
          <table class="data-table small">
            <thead>
              <tr>
                <th>Tujuan Kebutuhan Dana</th>
                <th>Pemohon</th>
                <th>Nilai Diajukan</th>
                <th>Approved Limit</th>
                <th>Status</th>
                <th style="text-align:right;">Persetujuan Finance</th>
              </tr>
            </thead>
            <tbody>
              ${fundings.map(f => `
                <tr>
                  <td><strong>${esc(f.purpose || f.funding_type || "Funding Request")}</strong></td>
                  <td><code>${esc(String(f.requested_by || "-").slice(0, 8))}</code></td>
                  <td>${formatMoney(f.requested_amount)}</td>
                  <td><strong>${formatMoney(f.approved_limit)}</strong></td>
                  <td>${statusBadge(f.status)}</td>
                  <td style="text-align:right;">
                    <div class="inline-actions" style="justify-content:flex-end;display:flex;gap:4px;">
                      ${f.status === "SUBMITTED" ? `<button class="button small secondary" data-funding-act="verify" data-id="${attr(f.id)}">Verify</button><button class="button small danger" data-funding-act="reject" data-id="${attr(f.id)}">Reject</button>` : ""}
                      ${f.status === "VERIFIED" ? `<button class="button small primary" data-funding-act="approve" data-id="${attr(f.id)}">Approve</button><button class="button small danger" data-funding-act="reject" data-id="${attr(f.id)}">Reject</button>` : ""}
                      ${f.status === "APPROVED" ? `<span class="badge info">Approved</span>` : ""}
                      ${f.status === "ACTIVE" ? `<span class="badge success">Active</span>` : ""}
                    </div>
                  </td>
                </tr>
              `).join("") || `<tr><td colspan="6">${emptyState("Belum ada pengajuan dana proyek.")}</td></tr>`}
            </tbody>
          </table>
        ` : activeInbox === "costing" ? `
          <table class="data-table small">
            <thead>
              <tr>
                <th>Deskripsi Transaksi</th>
                <th>Elemen Biaya</th>
                <th>Tanggal</th>
                <th>Total Biaya (Rp)</th>
                <th>Status Posting</th>
                <th style="text-align:right;">Aksi Finance</th>
              </tr>
            </thead>
            <tbody>
              ${costEntries.map(c => `
                <tr>
                  <td><strong>${esc(c.description || "-")}</strong><small style="display:block;color:var(--muted);">${esc(c.source_type || "MANUAL")}</small></td>
                  <td><span class="badge ghost">${esc(c.cost_element || "MATERIAL")}</span></td>
                  <td>${formatDate(c.transaction_date)}</td>
                  <td><strong>${formatMoney(c.total_cost || c.amount)}</strong></td>
                  <td>${statusBadge(c.status)}</td>
                  <td style="text-align:right;">
                    <div class="inline-actions" style="justify-content:flex-end;display:flex;gap:4px;">
                      ${c.status === "CAPTURED" || c.status === "DRAFT" ? `<button class="button small secondary" data-cost-act="validate" data-id="${attr(c.id)}">Validasi</button>` : ""}
                      ${c.status === "VALIDATED" ? `<button class="button small primary" style="background:#257743;" data-cost-act="post-wip" data-id="${attr(c.id)}">Post to WIP</button>` : ""}
                      ${c.status === "POSTED" ? `<span class="badge success">Posted to WIP</span>` : ""}
                    </div>
                  </td>
                </tr>
              `).join("") || `<tr><td colspan="6">${emptyState("Belum ada pengajuan biaya proyek.")}</td></tr>`}
            </tbody>
          </table>
        ` : activeInbox === "billing" ? `
          <table class="data-table small">
            <thead>
              <tr>
                <th>Pemicu / Trigger</th>
                <th>Deskripsi Termin</th>
                <th>Subtotal (Rp)</th>
                <th>Total + PPN</th>
                <th>Status</th>
                <th style="text-align:right;">Penerbitan Invoice</th>
              </tr>
            </thead>
            <tbody>
              ${proposals.map(p => `
                <tr>
                  <td><strong>${esc(p.trigger_type || "PROGRESS_APPROVED")}</strong></td>
                  <td>${esc(p.description || "-")}</td>
                  <td>${formatMoney(p.subtotal_amount || p.amount)}</td>
                  <td><strong style="color:var(--primary);">${formatMoney(p.total_amount || p.subtotal_amount)}</strong></td>
                  <td>${statusBadge(p.status)}</td>
                  <td style="text-align:right;">
                    <div class="inline-actions" style="justify-content:flex-end;display:flex;gap:4px;">
                      ${p.status === "SUBMITTED" || p.status === "DRAFT" ? `<button class="button small secondary" data-prop-act="approve" data-id="${attr(p.id)}">Approve</button>` : ""}
                      ${p.status === "APPROVED" ? `<button class="button small primary" style="background:#7746e8;" data-prop-act="invoice" data-id="${attr(p.id)}">⚡ Terbitkan Invoice</button>` : ""}
                      ${p.status === "INVOICED" ? `<span class="badge info">Invoiced</span>` : ""}
                    </div>
                  </td>
                </tr>
              `).join("") || `<tr><td colspan="6">${emptyState("Belum ada proposal termin invoice.")}</td></tr>`}
            </tbody>
          </table>
        ` : `
          <table class="data-table small">
            <thead>
              <tr>
                <th>No. Invoice</th>
                <th>Vendor / Rekanan</th>
                <th>Total Tagihan</th>
                <th>Jatuh Tempo</th>
                <th>Status</th>
                <th style="text-align:right;">Tindakan AP</th>
              </tr>
            </thead>
            <tbody>
              ${bills.map(b => `
                <tr>
                  <td><strong>${esc(b.invoice_number || b.id)}</strong></td>
                  <td>${esc(getPartyName(b.party))}</td>
                  <td><strong>${formatMoney(b.total_amount)}</strong></td>
                  <td>${formatDate(b.due_date)}</td>
                  <td>${statusBadge(b.status)}</td>
                  <td style="text-align:right;">
                    <div class="inline-actions" style="justify-content:flex-end;display:flex;gap:4px;">
                      ${b.status === "DRAFT" ? `<button class="button small secondary" data-billing-act="verify" data-id="${attr(b.id)}">Verify</button>` : ""}
                      ${b.status === "VERIFIED" ? `<button class="button small primary" data-billing-act="approve" data-id="${attr(b.id)}">Approve</button>` : ""}
                      ${b.status === "APPROVED" ? `<button class="button small primary" style="background:#28a745;" data-billing-act="post" data-id="${attr(b.id)}">Post to AP</button>` : ""}
                      ${b.status === "POSTED" ? `<span class="badge success">Posted</span>` : ""}
                    </div>
                  </td>
                </tr>
              `).join("") || `<tr><td colspan="6">${emptyState("Belum ada tagihan vendor.")}</td></tr>`}
            </tbody>
          </table>
        `}
      </div>
    </section>
  `;
}

function queueItem(r) {
  const isBill = "invoice_number" in r;
  const partyName = getPartyName(r.party);
  return `
    <div class="queue-item">
      <span class="queue-icon">${isBill ? "B" : "P"}</span>
      <div>
        <strong>${esc(r.invoice_number || r.reference_number || r.id)}</strong>
        <small>${esc(partyName)} · ${esc(r.status || r.payment_status || "")}</small>
      </div>
      <b>${formatMoney(r.outstanding_amount ?? r.amount)}</b>
    </div>
  `;
}

function getPartyName(id) {
  const p = (state.finance.data?.parties || []).find(x => String(x.id) === String(id));
  return p?.display_name || p?.legal_name || p?.party_code || id || "-";
}

function renderAccountsPayable(d) {
  const bills = d.billings || [];
  return `
    <div class="content-toolbar" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div>
        <h3 style="margin:0;">Accounts Payable (Vendor Bills)</h3>
        <span class="badge info">${bills.length} Tagihan Vendor</span>
      </div>
      <button id="btnCreateBilling" class="button primary">+ Buat Billing Baru</button>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>No. Invoice</th>
            <th>Rekanan / Vendor</th>
            <th>Jatuh Tempo</th>
            <th>Total Tagihan</th>
            <th>Outstanding</th>
            <th>Status</th>
            <th style="text-align:right;">Aksi AP</th>
          </tr>
        </thead>
        <tbody>
          ${bills
            .map(
              b => `
            <tr>
              <td><strong>${esc(b.invoice_number || b.id)}</strong></td>
              <td>${esc(getPartyName(b.party))}</td>
              <td>${formatDate(b.due_date)}</td>
              <td><strong>${formatMoney(b.total_amount)}</strong></td>
              <td><span style="color:var(--danger,#e53e3e);font-weight:700;">${formatMoney(b.outstanding_amount)}</span></td>
              <td>${statusBadge(b.status)}</td>
              <td style="text-align:right;">
                <div class="inline-actions" style="justify-content:flex-end;display:flex;gap:4px;">
                  ${b.status === "DRAFT" ? `<button class="button small secondary" data-billing-act="verify" data-id="${attr(b.id)}">Verify</button>` : ""}
                  ${b.status === "VERIFIED" ? `<button class="button small primary" data-billing-act="approve" data-id="${attr(b.id)}">Approve</button>` : ""}
                  ${b.status === "APPROVED" ? `<button class="button small primary" data-billing-act="post" data-id="${attr(b.id)}">Post to AP</button>` : ""}
                  ${["DRAFT", "VERIFIED"].includes(b.status) ? `<button class="button small danger" data-billing-act="reject" data-id="${attr(b.id)}">Reject</button>` : ""}
                  <button class="button small ghost" data-billing-act="detail" data-id="${attr(b.id)}">Detail</button>
                  <button class="button small danger" data-fin-del="bill" data-id="${attr(b.id)}" title="Hapus Tagihan">🗑️</button>
                </div>
              </td>
            </tr>
          `
            )
            .join("") || `<tr><td colspan="7">${emptyState("Belum ada data billing.")}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderFundingApproval(d) {
  const fundings = d.fundings || [];
  return `
    <section class="funding-hero" style="display:flex;justify-content:space-between;align-items:center;padding:22px;background:linear-gradient(135deg,#f8fbff,#eef4ff);border:1px solid #cbdcf7;border-radius:18px;margin-bottom:16px;">
      <div>
        <span class="eyebrow" style="color:var(--primary);">FINANCIAL CONTROL</span>
        <h2>Funding Request & Approval</h2>
        <p>Project Management mengajukan kebutuhan dana. Finance memverifikasi dan menyetujui limit.</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <span class="badge info">${fundings.length} Total Pengajuan</span>
        <button id="btnNewFunding" class="button primary small">+ Ajukan Funding Baru</button>
      </div>
    </section>

    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Tujuan / Purpose</th>
            <th>Pemohon</th>
            <th>Nilai Diajukan</th>
            <th>Approved Limit</th>
            <th>Status</th>
            <th style="text-align:right;">Tindakan Finance</th>
          </tr>
        </thead>
        <tbody>
          ${fundings
            .map(
              f => `
            <tr>
              <td><strong>${esc(f.purpose || f.funding_type || "Funding Request")}</strong></td>
              <td><code>${esc(String(f.requested_by || "-").slice(0, 8))}</code></td>
              <td>${formatMoney(f.requested_amount)}</td>
              <td><strong>${formatMoney(f.approved_limit)}</strong></td>
              <td>${statusBadge(f.status)}</td>
              <td style="text-align:right;">
                <div class="inline-actions" style="justify-content:flex-end;display:flex;gap:4px;">
                  ${f.status === "DRAFT" ? `<button class="button small primary" data-funding-act="submit" data-id="${attr(f.id)}">Submit</button>` : ""}
                  ${f.status === "SUBMITTED" ? `<button class="button small secondary" data-funding-act="verify" data-id="${attr(f.id)}">Verify</button><button class="button small danger" data-funding-act="reject" data-id="${attr(f.id)}">Reject</button>` : ""}
                  ${f.status === "VERIFIED" ? `<button class="button small primary" data-funding-act="approve" data-id="${attr(f.id)}">Approve</button><button class="button small danger" data-funding-act="reject" data-id="${attr(f.id)}">Reject</button>` : ""}
                  ${f.status === "APPROVED" ? `<span class="badge info">Ready for Project</span>` : ""}
                  ${f.status === "ACTIVE" ? `<span class="badge success">Project Aktif</span>` : ""}
                  <button class="button small danger" data-fin-del="funding" data-id="${attr(f.id)}" title="Hapus Funding">🗑️</button>
                </div>
              </td>
            </tr>
          `
            )
            .join("") || `<tr><td colspan="6">${emptyState("Belum ada funding request.")}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderProjectProfitability(d) {
  const projects = state.pm?.projects || d.projects || [];
  const costEntries = d.costEntries || [];
  const proposals = d.billingProposals || [];

  const projectList = projects.length > 0 ? projects : [
    {
      id: "prj-ars-01",
      project_code: "PRJ-ARS-001",
      project_name: "Website & ERP Custom Arsalynk",
      customer_name: "PT Arsalynk Digital Kreasi",
      status: "STARTED",
      contract_amount: 175000000,
      budget_amount: 110000000,
      target_margin_percent: 37.5,
    },
    {
      id: "prj-kaluna-01",
      project_code: "PRJ-KLN-202",
      project_name: "Deployment & Infrastructure Kaluna",
      customer_name: "Kaluna Technology",
      status: "ACTIVE",
      contract_amount: 95000000,
      budget_amount: 58000000,
      target_margin_percent: 35.0,
    },
    {
      id: "prj-artic-01",
      project_code: "PRJ-ART-103",
      project_name: "SEO Optimization & Maintenance Artic",
      customer_name: "Artic Studio Asia",
      status: "STARTED",
      contract_amount: 60000000,
      budget_amount: 38000000,
      target_margin_percent: 30.0,
    }
  ];

  let totalContract = 0;
  let totalRevenue = 0;
  let totalCost = 0;
  let totalCollected = 0;
  let totalReceivable = 0;

  const rows = projectList.map(p => {
    const pId = String(p.id);
    const pCosts = costEntries.filter(c => String(c.project_id || c.project) === pId);
    const pProps = proposals.filter(pr => String(pr.project_id || pr.project) === pId);

    const contractVal = Number(p.contract_amount || 0);
    
    const calculatedInvoiced = pProps.reduce((sum, pr) => sum + Number(pr.total_amount || pr.subtotal || 0), 0);
    const invoicedRev = calculatedInvoiced;

    const calculatedCost = pCosts.reduce((sum, c) => sum + Number(c.total_cost || c.amount || 0), 0);
    const actualCost = calculatedCost > 0 ? calculatedCost : Number(p.actual_cost || 0);

    const grossProfit = invoicedRev - actualCost;
    const realizedMargin = invoicedRev > 0 ? Number(((grossProfit / invoicedRev) * 100).toFixed(1)) : 0;
    const targetMargin = Number(p.target_margin_percent || 35.0);
    const marginVariance = Number((realizedMargin - targetMargin).toFixed(1));

    const cashCollected = Math.round(invoicedRev * 0.85);
    const outstandingAR = invoicedRev - cashCollected;

    totalContract += contractVal;
    totalRevenue += invoicedRev;
    totalCost += actualCost;
    totalCollected += cashCollected;
    totalReceivable += outstandingAR;

    let statusLabel = "On Target";
    let statusBg = "#fef3c7";
    let statusColor = "#92400e";

    if (realizedMargin >= targetMargin) {
      statusLabel = "🟢 Highly Profitable";
      statusBg = "#dcfce7";
      statusColor = "#166534";
    } else if (realizedMargin >= 20) {
      statusLabel = "🟡 Target On-Track";
      statusBg = "#e0f2fe";
      statusColor = "#0369a1";
    } else if (realizedMargin > 0) {
      statusLabel = "🟠 Margin At Risk";
      statusBg = "#ffedd5";
      statusColor = "#c2410c";
    } else {
      statusLabel = "🔴 Defisit / Rugi";
      statusBg = "#fee2e2";
      statusColor = "#991b1b";
    }

    return {
      ...p,
      contractVal,
      invoicedRev,
      actualCost,
      grossProfit,
      realizedMargin,
      targetMargin,
      marginVariance,
      cashCollected,
      outstandingAR,
      statusLabel,
      statusBg,
      statusColor,
      costEntriesCount: pCosts.length,
      proposalsCount: pProps.length,
    };
  });

  const totalGrossProfit = totalRevenue - totalCost;
  const overallMargin = totalRevenue > 0 ? Number(((totalGrossProfit / totalRevenue) * 100).toFixed(1)) : 0;

  return `
    <div class="content-toolbar" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="badge success" style="font-size:11px;font-weight:700;">PROFITABILITY & P&L OBSERVABILITY</span>
          <span class="badge info" style="font-size:11px;">Multi-Project Realization</span>
        </div>
        <h3 style="margin:4px 0 0;font-size:18px;">Laba Rugi & Realisasi Pendapatan Proyek (Project Revenue & Profitability)</h3>
        <p style="margin:2px 0 0;color:var(--muted);font-size:12px;">
          Analisis komprehensif nilai kontrak, pendapatan diakui (invoiced), HPP aktual, laba kotor, dan varians margin keuntungan proyek.
        </p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button id="btnNewBillingProposalFromPnl" class="button primary small" style="background:#257743;">+ Tagih Termin Billing</button>
      </div>
    </div>

    <!-- Profitability KPI Cards -->
    <section class="finance-kpis" style="margin-bottom:18px;display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;">
      <div style="background:#fff;padding:16px;border-radius:14px;border:1px solid #cbd5e1;box-shadow:0 1px 3px rgba(0,0,0,0.02);">
        <small style="color:var(--muted);display:block;font-size:11px;font-weight:600;">TOTAL NILAI KONTRAK</small>
        <strong style="font-size:20px;color:#0f172a;display:block;margin:4px 0;">${formatMoney(totalContract)}</strong>
        <small style="color:#0284c7;font-size:11px;">${rows.length} Proyek Terdaftar</small>
      </div>

      <div style="background:#fff;padding:16px;border-radius:14px;border:1px solid #cbd5e1;box-shadow:0 1px 3px rgba(0,0,0,0.02);">
        <small style="color:var(--muted);display:block;font-size:11px;font-weight:600;">PENDAPATAN DIAKUI (INVOICED)</small>
        <strong style="font-size:20px;color:#2563eb;display:block;margin:4px 0;">${formatMoney(totalRevenue)}</strong>
        <small style="color:var(--muted);font-size:11px;">${totalContract > 0 ? Math.round((totalRevenue / totalContract) * 100) : 0}% dari Total Kontrak</small>
      </div>

      <div style="background:#fff;padding:16px;border-radius:14px;border:1px solid #cbd5e1;box-shadow:0 1px 3px rgba(0,0,0,0.02);">
        <small style="color:var(--muted);display:block;font-size:11px;font-weight:600;">HPP & BIAYA AKTUAL (COGS)</small>
        <strong style="font-size:20px;color:#dc2626;display:block;margin:4px 0;">${formatMoney(totalCost)}</strong>
        <small style="color:var(--muted);font-size:11px;">Material, Labor & Overhead</small>
      </div>

      <div style="background:#f0fdf4;padding:16px;border-radius:14px;border:1px solid #bbf7d0;box-shadow:0 1px 3px rgba(0,0,0,0.02);">
        <small style="color:#166534;display:block;font-size:11px;font-weight:700;">LABA KOTOR (GROSS PROFIT)</small>
        <strong style="font-size:20px;color:#166534;display:block;margin:4px 0;">${formatMoney(totalGrossProfit)}</strong>
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="badge success" style="font-size:11px;padding:2px 8px;font-weight:800;">Margin: ${overallMargin}%</span>
          <small style="color:#166534;font-size:11px;">Target: 35%</small>
        </div>
      </div>

      <div style="background:#fff;padding:16px;border-radius:14px;border:1px solid #cbd5e1;box-shadow:0 1px 3px rgba(0,0,0,0.02);">
        <small style="color:var(--muted);display:block;font-size:11px;font-weight:600;">KAS MASUK VS PIUTANG</small>
        <strong style="font-size:15px;color:#0f172a;display:block;margin:4px 0;">Kas: ${formatMoney(totalCollected)}</strong>
        <small style="color:#d97706;font-size:11px;">Piutang (AR): ${formatMoney(totalReceivable)}</small>
      </div>
    </section>

    <!-- Detailed Multi-Project Profitability Matrix Table -->
    <section class="panel" style="background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:18px;">
      <header class="panel-head" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
        <div>
          <h4 style="margin:0;font-size:15px;color:#0f172a;">📊 Matriks Profitabilitas & Kinerja Keuangan per Proyek</h4>
          <p style="margin:2px 0 0;font-size:12px;color:var(--muted);">Evaluasi realisasi laba kotor dan margin keuntungan terhadap target setiap proyek.</p>
        </div>
      </header>

      <div class="table-wrap">
        <table class="data-table small">
          <thead>
            <tr>
              <th>Proyek & Klien</th>
              <th>Nilai Kontrak</th>
              <th>Revenue Diakui</th>
              <th>HPP / Biaya Riil</th>
              <th>Laba Kotor (Gross Profit)</th>
              <th style="text-align:center;">Realisasi Margin (%)</th>
              <th style="text-align:center;">Status Profitabilitas</th>
              <th style="text-align:right;">Tindakan</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr style="border-bottom:1px solid #f1f5f9;">
                <td>
                  <strong style="font-size:13px;color:#0f172a;">${esc(r.project_name)}</strong>
                  <small style="display:block;color:var(--muted);">
                    <code>${esc(r.project_code || "PRJ")}</code> · ${esc(r.customer_name || "Klien Enterprise")}
                  </small>
                </td>
                <td><strong>${formatMoney(r.contractVal)}</strong></td>
                <td><span style="color:#2563eb;font-weight:600;">${formatMoney(r.invoicedRev)}</span></td>
                <td><span style="color:#dc2626;font-weight:600;">${formatMoney(r.actualCost)}</span></td>
                <td>
                  <strong style="color:${r.grossProfit >= 0 ? '#166534' : '#dc2626'};font-size:13px;">
                    ${formatMoney(r.grossProfit)}
                  </strong>
                </td>
                <td style="text-align:center;">
                  <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
                    <strong style="font-size:13px;color:${r.realizedMargin >= r.targetMargin ? '#166534' : '#d97706'};">
                      ${r.realizedMargin}%
                    </strong>
                    <small style="color:var(--muted);font-size:10px;">
                      Target: ${r.targetMargin}% (${r.marginVariance >= 0 ? '+' : ''}${r.marginVariance}%)
                    </small>
                  </div>
                </td>
                <td style="text-align:center;">
                  <span class="badge" style="background:${r.statusBg};color:${r.statusColor};font-weight:700;font-size:11px;padding:3px 8px;">
                    ${r.statusLabel}
                  </span>
                </td>
                <td style="text-align:right;">
                  <button 
                    type="button" 
                    class="button small secondary btn-view-project-pnl" 
                    data-proj-id="${attr(r.id)}"
                    data-proj-name="${attr(r.project_name)}"
                    data-contract="${attr(r.contractVal)}"
                    data-revenue="${attr(r.invoicedRev)}"
                    data-cost="${attr(r.actualCost)}"
                    data-profit="${attr(r.grossProfit)}"
                    data-margin="${attr(r.realizedMargin)}"
                    data-target-margin="${attr(r.targetMargin)}"
                    style="padding:3px 8px;font-size:11px;"
                  >
                    🔍 Detail P&L
                  </button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderProjectCosting(d) {
  const costEntries = d.costEntries || [];
  return `
    <div class="content-toolbar" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div>
        <h3 style="margin:0;">Project Cost Entries & WIP Handoff</h3>
        <p style="margin:0;color:var(--muted);font-size:11px;">Biaya operasional lapangan (Material, Labor, Overhead) yang dikirim ke Finance.</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <span class="badge info">${costEntries.length} Cost Entries</span>
        <button id="btnNewCostEntry" class="button primary small">+ Catat Biaya Proyek</button>
      </div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Proyek / Deskripsi</th>
            <th>Elemen Biaya</th>
            <th>Sumber</th>
            <th>Total Biaya</th>
            <th>Status</th>
            <th style="text-align:right;">Aksi Costing</th>
          </tr>
        </thead>
        <tbody>
          ${costEntries
            .map(
              c => `
            <tr>
              <td><strong>${esc(c.project_name || c.project_code || c.project)}</strong><small style="display:block;color:var(--muted);">${esc(c.description)}</small></td>
              <td>${esc(c.cost_element)}</td>
              <td>${esc(c.source_type)}</td>
              <td><strong>${formatMoney(c.total_cost)}</strong></td>
              <td>${statusBadge(c.status)}</td>
              <td style="text-align:right;">
                <div class="inline-actions" style="justify-content:flex-end;display:flex;gap:4px;">
                  ${c.status === "CAPTURED" ? `<button class="button small secondary" data-cost-act="validate" data-id="${attr(c.id)}">Validate</button>` : ""}
                  ${c.status === "VALIDATED" ? `<button class="button small primary" data-cost-act="post" data-id="${attr(c.id)}">Post to WIP</button>` : ""}
                  ${c.status === "POSTED" ? `<span class="badge success">POSTED WIP</span>` : ""}
                  <button class="button small danger" data-fin-del="cost" data-id="${attr(c.id)}" title="Hapus Biaya">🗑️</button>
                </div>
              </td>
            </tr>
          `
            )
            .join("") || `<tr><td colspan="6">${emptyState("Belum ada cost entry proyek.")}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderProjectBilling(d) {
  const proposals = d.billingProposals || [];
  return `
    <div class="content-toolbar" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div>
        <h3 style="margin:0;">Project Billing Proposals</h3>
        <p style="margin:0;color:var(--muted);font-size:11px;">Proposal termin penagihan milestone yang menunggu persetujuan Finance untuk penerbitan Invoice.</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <span class="badge info">${proposals.length} Proposals</span>
        <button id="btnNewBillingProposal" class="button primary small">+ Buat Billing Proposal</button>
      </div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Proyek / Keterangan</th>
            <th>Trigger</th>
            <th>Subtotal</th>
            <th>Pajak & Total</th>
            <th>Status</th>
            <th style="text-align:right;">Tindakan</th>
          </tr>
        </thead>
        <tbody>
          ${proposals
            .map(
              p => `
            <tr>
              <td><strong>${esc(p.project_name || p.project_code || p.project)}</strong><small style="display:block;color:var(--muted);">${esc(p.description)}</small></td>
              <td>${esc(p.trigger_type)}</td>
              <td>${formatMoney(p.subtotal)}</td>
              <td><strong>${formatMoney(p.total_amount)}</strong> (${p.tax_rate || 11}%)</td>
              <td>${statusBadge(p.status)}</td>
              <td style="text-align:right;">
                <div class="inline-actions" style="justify-content:flex-end;display:flex;gap:4px;">
                  ${p.status === "SUBMITTED" ? `<button class="button small primary" data-prop-act="approve" data-id="${attr(p.id)}">Approve & Invoice</button>` : ""}
                  ${p.billing_document ? `<span class="badge success">Invoice Ready</span>` : ""}
                  <button class="button small danger" data-fin-del="proposal" data-id="${attr(p.id)}" title="Hapus Proposal">🗑️</button>
                </div>
              </td>
            </tr>
          `
            )
            .join("") || `<tr><td colspan="6">${emptyState("Belum ada billing proposal.")}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderInvoiceControl(d) {
  return `<section class="panel"><div class="panel-body">${renderAccountsPayable(d)}</div></section>`;
}

function renderTaxCompliance(d) {
  const taxes = d.taxes || [];
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Nama Pajak</th><th>Kode</th><th>Rate (%)</th><th>Tipe</th></tr></thead>
        <tbody>
          ${taxes
            .map(
              t => `
            <tr>
              <td><strong>${esc(t.tax_name || t.name)}</strong></td>
              <td><code>${esc(t.tax_code || t.code)}</code></td>
              <td><strong>${number(t.rate_percentage || t.rate)}%</strong></td>
              <td>${esc(t.tax_type || "VAT")}</td>
            </tr>
          `
            )
            .join("") || `<tr><td colspan="4">${emptyState("Belum ada konfigurasi pajak.")}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderGeneralAccounting(d) {
  const journals = d.journals || [];
  const coa = d.coa || [];
  return `
    <div class="two-grid">
      <section class="panel">
        <header class="panel-head"><div><h2>Chart of Accounts (CoA)</h2><p>${coa.length} Akun Buku Besar</p></div></header>
        <div class="panel-body" style="max-height:400px;overflow-y:auto;">
          ${coa
            .map(
              c => `
            <div style="display:flex;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--line);">
              <div><code>${esc(c.account_code || c.code)}</code> <strong>${esc(c.account_name || c.name)}</strong></div>
              <span class="badge info">${esc(c.account_type || c.type || "ASSET")}</span>
            </div>
          `
            )
            .join("") || emptyState("CoA kosong.")}
        </div>
      </section>

      <section class="panel">
        <header class="panel-head"><div><h2>Journal Entries</h2><p>${journals.length} Jurnal Terposting</p></div></header>
        <div class="panel-body" style="max-height:400px;overflow-y:auto;">
          ${journals
            .map(
              j => `
            <div style="padding:10px;border:1px solid var(--line);border-radius:8px;margin-bottom:8px;background:var(--soft);">
              <div style="display:flex;justify-content:space-between;">
                <strong>${esc(j.journal_number || j.id)}</strong>
                <span class="badge success">${esc(j.status || "POSTED")}</span>
              </div>
              <small style="color:var(--muted);">${esc(j.description || "-")} · ${formatDate(j.entry_date)}</small>
            </div>
          `
            )
            .join("") || emptyState("Belum ada jurnal transaksi.")}
        </div>
      </section>
    </div>
  `;
}

function renderProjectReceivable(d) {
  const parties = d.parties || [];
  const credit = state.crm?.data?.credit || [];
  const bills = d.billings || [];
  const customerInvoices = bills.filter(b => b.billing_type === "CUSTOMER_INVOICE" || !b.billing_type);

  const totalOutstanding = customerInvoices.reduce((sum, b) => sum + (Number(b.outstanding_amount) || 0), 0);
  const totalLimit = credit.reduce((sum, c) => sum + (Number(c.credit_limit) || 0), 0);
  const totalAvailable = Math.max(0, totalLimit - totalOutstanding);

  return `
    <div class="content-toolbar" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div>
        <h3 style="margin:0;">Accounts Receivable & Customer Credit Management</h3>
        <p style="margin:0;color:var(--muted);font-size:11px;">Pengaturan plafon kredit (Credit Limit), monitoring umur piutang, dan evaluasi risiko kredit rekanan.</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <span class="badge info">${parties.length} Customer Terdaftar</span>
      </div>
    </div>

    <div class="finance-kpis" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:16px;">
      <article class="metric"><span>Total Plafon Kredit Diberikan</span><strong style="color:var(--primary);">${formatMoney(totalLimit)}</strong><small>Akumulasi limit seluruh customer</small></article>
      <article class="metric"><span>Total Outstanding Piutang (AR)</span><strong style="color:var(--warning,#f59e0b);">${formatMoney(totalOutstanding)}</strong><small>Piutang invoice belum terbayar</small></article>
      <article class="metric"><span>Total Sisa Kredit Tersedia</span><strong style="color:var(--success);">${formatMoney(totalAvailable)}</strong><small>Plafon kredit yang masih aman</small></article>
    </div>

    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Customer / Rekanan</th>
            <th>Plafon Kredit (Limit)</th>
            <th>Outstanding Piutang</th>
            <th>Sisa Kredit Tersedia</th>
            <th>Overdue</th>
            <th>Status Kredit</th>
            <th style="text-align:right;">Aksi Pengaturan</th>
          </tr>
        </thead>
        <tbody>
          ${parties
            .map(p => {
              const custName = p.display_name || p.legal_name || "Customer";
              const snap = credit.find(c => String(c.customer_party) === String(p.id));
              const limit = snap ? snap.credit_limit : 0;
              const outstanding = snap ? snap.outstanding_receivable : 0;
              const overdue = snap ? snap.overdue_amount : 0;
              const available = snap ? snap.available_credit : limit;
              const status = snap ? snap.credit_status : (limit > 0 ? "AVAILABLE" : "NO_LIMIT");
              const isBlocked = status === "HOLD" || (limit > 0 && available < 0) || overdue > 0;

              return `
              <tr style="${isBlocked ? "background:#fff5f5;" : ""}">
                <td>
                  <strong>${esc(custName)}</strong>
                  <small style="display:block;color:var(--muted);">${esc(p.party_code || "-")} · ${esc(snap?.risk_category || "LOW RISK")}</small>
                </td>
                <td><strong style="color:var(--primary);">${formatMoney(limit)}</strong></td>
                <td><span style="color:${outstanding > 0 ? "var(--warning)" : "inherit"};font-weight:700;">${formatMoney(outstanding)}</span></td>
                <td><span style="color:${available >= 0 ? "var(--success)" : "var(--danger)"};font-weight:700;">${formatMoney(available)}</span></td>
                <td><span style="color:${overdue > 0 ? "var(--danger)" : "inherit"};">${formatMoney(overdue)}</span></td>
                <td>${statusBadge(status)}</td>
                <td style="text-align:right;">
                  <div class="inline-actions" style="justify-content:flex-end;display:flex;gap:4px;">
                    <button class="button small primary" data-fin-credit="edit" data-id="${attr(p.id)}" style="background:#7746e8;">✏️ Atur Limit</button>
                    <button class="button small secondary" data-fin-credit="recalc" data-id="${attr(p.id)}" title="Hitung Ulang Snapshot">🔄</button>
                  </div>
                </td>
              </tr>
            `;
            })
            .join("") || `<tr><td colspan="7">${emptyState("Belum ada data customer.")}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderAssetFinance(d) {
  return `<div class="panel-body">${emptyState("Modul Nilai Aset & Depresiasi siap terhubung dengan master asset.")}</div>`;
}

function renderApprovalQueue(d) {
  return `<section class="panel"><div class="panel-body">${renderAccountsPayable(d)}</div></section>`;
}

function renderPayments(d) {
  const payments = d.payments || [];
  return `
    <div class="content-toolbar" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div>
        <h3 style="margin:0;">Batch Payments & Pengeluaran Kas/Bank</h3>
        <span class="badge info">${payments.length} Pembayaran</span>
      </div>
      <button id="btnCreatePayment" class="button primary">+ Buat Batch Payment</button>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>No. Referensi</th>
            <th>Rekanan</th>
            <th>Jumlah Pembayaran</th>
            <th>Metode</th>
            <th>Status</th>
            <th style="text-align:right;">Aksi Payment</th>
          </tr>
        </thead>
        <tbody>
          ${payments
            .map(
              p => `
            <tr>
              <td><strong>${esc(p.reference_number || p.id)}</strong></td>
              <td>${esc(getPartyName(p.party))}</td>
              <td><strong>${formatMoney(p.amount || p.total_amount)}</strong></td>
              <td>${esc(p.payment_method || "BANK_TRANSFER")}</td>
              <td>${statusBadge(p.status)}</td>
              <td style="text-align:right;">
                <div class="inline-actions" style="justify-content:flex-end;display:flex;gap:4px;">
                  ${p.status === "DRAFT" ? `<button class="button small secondary" data-pay-act="submit" data-id="${attr(p.id)}">Submit</button>` : ""}
                  ${p.status === "SUBMITTED" ? `<button class="button small primary" data-pay-act="approve" data-id="${attr(p.id)}">Approve</button>` : ""}
                  ${p.status === "APPROVED" ? `<button class="button small primary" style="background:#28a745;" data-pay-act="execute" data-id="${attr(p.id)}">Execute</button>` : ""}
                  <button class="button small ghost" data-pay-act="detail" data-id="${attr(p.id)}">Detail</button>
                  <button class="button small danger" data-fin-del="payment" data-id="${attr(p.id)}" title="Hapus Pembayaran">🗑️</button>
                </div>
              </td>
            </tr>
          `
            )
            .join("") || `<tr><td colspan="6">${emptyState("Belum ada payment batch.")}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderReconciliation(d) {
  const statements = d.statements || [];
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Bank Statement</th>
            <th>Periode</th>
            <th>Saldo Awal</th>
            <th>Saldo Akhir</th>
            <th>Status</th>
            <th style="text-align:right;">Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${statements
            .map(
              s => `
            <tr>
              <td><strong>${esc(s.statement_number || s.id)}</strong></td>
              <td>${formatDate(s.start_date)} - ${formatDate(s.end_date)}</td>
              <td>${formatMoney(s.opening_balance)}</td>
              <td><strong>${formatMoney(s.closing_balance)}</strong></td>
              <td>${statusBadge(s.status)}</td>
              <td style="text-align:right;">
                <button class="button small primary" data-reconcile-act="auto" data-id="${attr(s.id)}">Auto Reconcile</button>
              </td>
            </tr>
          `
            )
            .join("") || `<tr><td colspan="6">${emptyState("Belum ada bank statement.")}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function bindFinanceEvents(workspace) {
  workspace.querySelectorAll("[data-finance-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.financeTab;
      router.navigate(`/finance/${tab}`);
    });
  });

  // Inbox Queue Selector Tabs on Dashboard Utama
  workspace.querySelectorAll("[data-inbox-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.finance.inboxTab = btn.dataset.inboxTab;
      renderFinancePage();
    });
  });

  // Generic Finance Delete Handler
  workspace.querySelectorAll("[data-fin-del]").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const type = btn.dataset.finDel;
      const id = btn.dataset.id;
      if (!confirm(`Hapus data ${type} ini?`)) return;
      try {
        if (type === "bill") await deleteBillingDocument(id);
        if (type === "payment") await deletePaymentBatch(id);
        if (type === "cost") await deleteProjectCostEntry(id);
        if (type === "proposal") await deleteBillingProposal(id);
        if (type === "funding") await deleteFundingRequest(id);
        toast("Data Dihapus", `Data ${type} berhasil dihapus dari sistem.`, "info");
        await loadFinanceData();
        renderFinancePage();
      } catch (err) {
        toast("Gagal Menghapus", err.message, "error");
      }
    });
  });

  // Credit Management Actions
  workspace.querySelectorAll("[data-fin-credit]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const act = btn.dataset.finCredit;
      const partyId = btn.dataset.id;
      if (act === "edit") {
        openFinanceCreditLimitModal(partyId);
      } else if (act === "recalc") {
        try {
          await calculateCreditSnapshot(partyId);
          toast("Snapshot Diperbarui", "Snapshot status kredit berhasil dihitung ulang.", "success");
          await loadFinanceData();
          renderFinancePage({ params: { tab: "receivable" } });
        } catch (err) {
          toast("Gagal Menghitung", err.message, "error");
        }
      }
    });
  });

  // Billing Actions
  workspace.querySelectorAll("[data-billing-act]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const act = btn.dataset.billingAct;
      const id = btn.dataset.id;
      try {
        if (act === "verify") await verifyBilling(id);
        if (act === "approve") await approveBilling(id);
        if (act === "post") await postBilling(id);
        if (act === "reject") await rejectBilling(id);
        if (act === "detail") {
          const bill = (state.finance.data.billings || []).find(b => String(b.id) === String(id));
          Modal.open("Detail Billing", `Invoice ${bill?.invoice_number || id}`, `<pre class="json-view">${esc(JSON.stringify(bill, null, 2))}</pre>`, `<button class="button secondary" onclick="document.getElementById('modalClose').click()">Tutup</button>`);
          return;
        }
        toast("Aksi Berhasil", `Status billing ${id} diperbarui.`, "success");
        await loadFinanceData();
        renderFinancePage();
      } catch (err) {
        toast("Aksi Gagal", err.message, "error");
      }
    });
  });

  // Funding Actions
  workspace.querySelectorAll("[data-funding-act]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const act = btn.dataset.fundingAct;
      const id = btn.dataset.id;
      try {
        await decideFundingRequest(id, act);
        toast("Funding Berhasil", `Funding request ${act} sukses.`, "success");
        await loadFinanceData();
        renderFinancePage();
      } catch (err) {
        toast("Gagal Memproses Funding", err.message, "error");
      }
    });
  });

  // Costing Actions
  workspace.querySelectorAll("[data-cost-act]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const act = btn.dataset.costAct;
      const id = btn.dataset.id;
      try {
        if (act === "validate") await validateCostEntry(id);
        if (act === "post") await postCostEntryToWIP(id);
        toast("Cost Entry Berhasil", `Status diperbarui.`, "success");
        await loadFinanceData();
        renderFinancePage();
      } catch (err) {
        toast("Gagal Memproses Cost", err.message, "error");
      }
    });
  });

  // Proposal Actions
  workspace.querySelectorAll("[data-prop-act]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const act = btn.dataset.propAct;
      const id = btn.dataset.id;
      try {
        if (act === "approve") await createInvoiceFromProposal(id);
        toast("Invoice Dibuat", `Billing proposal disetujui & invoice diterbitkan.`, "success");
        await loadFinanceData();
        renderFinancePage();
      } catch (err) {
        toast("Gagal Memproses Proposal", err.message, "error");
      }
    });
  });

  // Payment Actions
  workspace.querySelectorAll("[data-pay-act]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const act = btn.dataset.payAct;
      const id = btn.dataset.id;
      try {
        if (act === "submit") await submitPayment(id);
        if (act === "approve") await approvePayment(id);
        if (act === "execute") await executePayment(id, `TRF-${Date.now().toString().slice(-6)}`);
        if (act === "detail") {
          const pay = (state.finance.data.payments || []).find(p => String(p.id) === String(id));
          Modal.open("Detail Payment", `Payment ${pay?.reference_number || id}`, `<pre class="json-view">${esc(JSON.stringify(pay, null, 2))}</pre>`, `<button class="button secondary" onclick="document.getElementById('modalClose').click()">Tutup</button>`);
          return;
        }
        toast("Payment Berhasil", `Status payment diperbarui.`, "success");
        await loadFinanceData();
        renderFinancePage();
      } catch (err) {
        toast("Gagal Memproses Payment", err.message, "error");
      }
    });
  });

  // Project Profitability & P&L Drill-down
  workspace.querySelectorAll(".btn-view-project-pnl").forEach(btn => {
    btn.addEventListener("click", () => {
      const pId = btn.dataset.projId;
      const pName = btn.dataset.projName;
      const contract = Number(btn.dataset.contract || 0);
      const revenue = Number(btn.dataset.revenue || 0);
      const cost = Number(btn.dataset.cost || 0);
      const profit = Number(btn.dataset.profit || 0);
      const margin = Number(btn.dataset.margin || 0);
      const targetMargin = Number(btn.dataset.targetMargin || 35);

      const d = state.finance.data || {};
      const costEntries = (d.costEntries || []).filter(c => String(c.project_id || c.project) === String(pId));
      const proposals = (d.billingProposals || []).filter(pr => String(pr.project_id || pr.project) === String(pId));

      Modal.open(
        `📊 Analisis Laba Rugi Proyek: ${esc(pName)}`,
        `Ringkasan Kinerja Pendapatan, HPP, & Margin Keuntungan`,
        `
          <div class="stack" style="display:grid;gap:14px;">
            <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;background:#f8fafc;padding:12px;border-radius:10px;border:1px solid #e2e8f0;text-align:center;">
              <div>
                <small style="color:var(--muted);display:block;font-size:11px;">Nilai Kontrak</small>
                <strong style="font-size:16px;color:#0f172a;">${formatMoney(contract)}</strong>
              </div>
              <div>
                <small style="color:var(--muted);display:block;font-size:11px;">Pendapatan Diakui</small>
                <strong style="font-size:16px;color:#2563eb;">${formatMoney(revenue)}</strong>
              </div>
              <div>
                <small style="color:var(--muted);display:block;font-size:11px;">HPP / Biaya Riil</small>
                <strong style="font-size:16px;color:#dc2626;">${formatMoney(cost)}</strong>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div style="background:#f0fdf4;padding:12px;border-radius:10px;border:1px solid #bbf7d0;">
                <span style="font-size:12px;color:#166534;font-weight:700;">Laba Kotor (Gross Profit):</span>
                <strong style="display:block;font-size:18px;color:#166534;margin-top:2px;">${formatMoney(profit)}</strong>
                <small style="color:#166534;font-size:11px;">Realisasi Margin: <b>${margin}%</b> (Target: ${targetMargin}%)</small>
              </div>

              <div style="background:#eff6ff;padding:12px;border-radius:10px;border:1px solid #bfdbfe;">
                <span style="font-size:12px;color:#1e40af;font-weight:700;">Arus Kas & Piutang:</span>
                <strong style="display:block;font-size:15px;color:#1e40af;margin-top:2px;">Kas Terkumpul: ${formatMoney(Math.round(revenue * 0.85))}</strong>
                <small style="color:#1e40af;font-size:11px;">Piutang Belum Terbayar: <b>${formatMoney(revenue - Math.round(revenue * 0.85))}</b></small>
              </div>
            </div>

            <div>
              <h4 style="margin:0 0 6px;font-size:13px;color:#1e293b;">Rincian Beban Biaya Pokok (COGS Entries):</h4>
              <div style="max-height:140px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:8px;">
                <table class="data-table small" style="width:100%;">
                  <thead>
                    <tr>
                      <th>Deskripsi</th>
                      <th>Elemen</th>
                      <th style="text-align:right;">Nominal</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${costEntries.map(c => `
                      <tr>
                        <td>${esc(c.description || "-")}</td>
                        <td><span class="badge ghost">${esc(c.cost_element || "MATERIAL")}</span></td>
                        <td style="text-align:right;"><strong>${formatMoney(c.total_cost || c.amount || 0)}</strong></td>
                      </tr>
                    `).join("") || `
                      <tr>
                        <td colspan="3" style="text-align:center;color:var(--muted);padding:10px;">
                          Belum ada rincian cost entry manual. Menggunakan alokasi baseline HPP proyek.
                        </td>
                      </tr>
                    `}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 style="margin:0 0 6px;font-size:13px;color:#1e293b;">Rincian Termin Penagihan (Billing Proposals):</h4>
              <div style="max-height:140px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:8px;">
                <table class="data-table small" style="width:100%;">
                  <thead>
                    <tr>
                      <th>Termin / Milestone</th>
                      <th>Status</th>
                      <th style="text-align:right;">Total Tagihan</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${proposals.map(pr => `
                      <tr>
                        <td>${esc(pr.description || "Termin Proyek")}</td>
                        <td>${statusBadge(pr.status || "APPROVED")}</td>
                        <td style="text-align:right;"><strong>${formatMoney(pr.total_amount || pr.subtotal || 0)}</strong></td>
                      </tr>
                    `).join("") || `
                      <tr>
                        <td colspan="3" style="text-align:center;color:var(--muted);padding:10px;">
                          Termin standar nilai kontrak telah diakui dalam laporan keuangan.
                        </td>
                      </tr>
                    `}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        `,
        `<button class="button secondary" onclick="document.getElementById('modalClose').click()">Tutup</button>`
      );
    });
  });

  document.getElementById("btnNewBillingProposalFromPnl")?.addEventListener("click", () => {
    openNewBillingProposalModal();
  });

  const d = state.finance.data || {};
  const parties = d.parties || [];
  const projects = d.projects || [];

  // Quick Actions and Modal Openers
  const openNewBillingModal = () => {
    Modal.open(
      "Buat Tagihan Supplier Baru (Billing Document)",
      "Pencatatan Kewajiban / Invoice Masuk",
      `
        <form id="formNewBillingModal" class="dynamic-form stack" style="display:grid;gap:12px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <label>
              <span class="form-label">No. Invoice Vendor *</span>
              <input type="text" id="billNumber" placeholder="INV-VEND-001" required>
            </label>
            <label>
              <span class="form-label">Pilih Vendor *</span>
              <select id="billParty" required>
                <option value="">-- Pilih Vendor --</option>
                ${parties.map(p => `<option value="${attr(p.id)}">${esc(p.display_name || p.legal_name)}</option>`).join("")}
              </select>
            </label>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <label>
              <span class="form-label">Total Tagihan (Rp) *</span>
              <input type="number" id="billAmount" placeholder="75000000" min="1" required>
            </label>
            <label>
              <span class="form-label">Jatuh Tempo (Due Date)</span>
              <input type="date" id="billDueDate" value="${new Date(Date.now() + 30*86400000).toISOString().slice(0, 10)}">
            </label>
          </div>
          <label>
            <span class="form-label">Keterangan / Catatan Tagihan</span>
            <textarea id="billNotes" rows="2" placeholder="Catatan tagihan vendor pengadaan barang/jasa..."></textarea>
          </label>
        </form>
      `,
      `
        <button class="button secondary" onclick="document.getElementById('modalClose').click()">Batal</button>
        <button type="button" id="btnSubmitBillingModal" class="button primary">Simpan Tagihan</button>
      `
    );

    document.getElementById("btnSubmitBillingModal")?.addEventListener("click", async () => {
      const invoice_number = document.getElementById("billNumber")?.value.trim();
      const party = document.getElementById("billParty")?.value || null;
      const total_amount = parseFloat(document.getElementById("billAmount")?.value) || 0;
      const due_date = document.getElementById("billDueDate")?.value || null;
      const notes = document.getElementById("billNotes")?.value.trim();

      if (!invoice_number || !party || !total_amount) {
        toast("Input Belum Lengkap", "No. Invoice, Vendor, dan Total Tagihan wajib diisi.", "error");
        return;
      }

      try {
        const btn = document.getElementById("btnSubmitBillingModal");
        if (btn) { btn.disabled = true; btn.textContent = "Menyimpan..."; }
        await createBillingDocument({
          invoice_number,
          party,
          total_amount,
          due_date,
          notes,
        });
        Modal.close();
        toast("Tagihan Tersimpan", `Tagihan "${invoice_number}" berhasil disimpan sebagai DRAFT.`, "success");
        await loadFinanceData();
        renderFinancePage({ params: { tab: "payable" } });
      } catch (err) {
        toast("Gagal Menyimpan Tagihan", err.message, "error");
        const btn = document.getElementById("btnSubmitBillingModal");
        if (btn) { btn.disabled = false; btn.textContent = "Simpan Tagihan"; }
      }
    });
  };

  const openFundingModal = () => {
    Modal.open(
      "Ajukan Funding Proyek Baru",
      "Pengajuan Pagu Dana Eksekusi Proyek",
      `
        <form id="formNewFundingModal" class="dynamic-form stack" style="display:grid;gap:12px;">
          <label>
            <span class="form-label">Tautkan ke Proyek *</span>
            <select id="fundProject" required>
              <option value="">-- Pilih Proyek --</option>
              ${projects.map(p => `<option value="${attr(p.id)}">${esc(p.project_code || p.code || "")} - ${esc(p.project_name || p.name || p.id)}</option>`).join("")}
            </select>
          </label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <label>
              <span class="form-label">Nilai Dana Diajukan (Rp) *</span>
              <input type="number" id="fundAmount" placeholder="350000000" min="1" required>
            </label>
            <label>
              <span class="form-label">Tipe Funding</span>
              <select id="fundType">
                <option value="PROJECT_EXECUTION">Eksekusi Proyek</option>
                <option value="MATERIAL_PURCHASE">Pembelian Material</option>
                <option value="EMERGENCY">Emergency / Kas Darurat</option>
              </select>
            </label>
          </div>
          <label>
            <span class="form-label">Tujuan / Purpose *</span>
            <input type="text" id="fundPurpose" placeholder="Contoh: Pagu Anggaran Awal Proyek Line 2" required>
          </label>
        </form>
      `,
      `
        <button class="button secondary" onclick="document.getElementById('modalClose').click()">Batal</button>
        <button type="button" id="btnSubmitFundingModal" class="button primary">Submit Pengajuan</button>
      `
    );

    document.getElementById("btnSubmitFundingModal")?.addEventListener("click", async () => {
      const project = document.getElementById("fundProject")?.value || null;
      const requested_amount = parseFloat(document.getElementById("fundAmount")?.value) || 0;
      const purpose = document.getElementById("fundPurpose")?.value.trim();
      const funding_type = document.getElementById("fundType")?.value || "PROJECT_EXECUTION";

      if (!project || !requested_amount || !purpose) {
        toast("Input Belum Lengkap", "Proyek, Nilai Dana, dan Tujuan wajib diisi.", "error");
        return;
      }

      try {
        const btn = document.getElementById("btnSubmitFundingModal");
        if (btn) { btn.disabled = true; btn.textContent = "Mengajukan..."; }
        await createFundingRequest({
          project,
          purpose,
          requested_amount,
          funding_type,
          approved_limit: requested_amount,
          status: "SUBMITTED",
        });
        Modal.close();
        toast("Funding Diajukan", "Pengajuan dana berhasil disubmit ke Finance.", "success");
        await loadFinanceData();
        renderFinancePage({ params: { tab: "funding" } });
      } catch (err) {
        toast("Gagal Mengajukan Funding", err.message, "error");
        const btn = document.getElementById("btnSubmitFundingModal");
        if (btn) { btn.disabled = false; btn.textContent = "Submit Pengajuan"; }
      }
    });
  };

  const openCostModal = () => {
    Modal.open(
      "Catat Biaya Proyek (Cost Entry)",
      "Pencatatan Biaya Aktual & Handoff WIP",
      `
        <form id="formNewCostModal" class="dynamic-form stack" style="display:grid;gap:12px;">
          <label>
            <span class="form-label">Pilih Proyek *</span>
            <select id="costEntryProject" required>
              <option value="">-- Pilih Proyek --</option>
              ${projects.map(p => `<option value="${attr(p.id)}">${esc(p.project_code || p.code || "")} - ${esc(p.project_name || p.name || p.id)}</option>`).join("")}
            </select>
          </label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <label>
              <span class="form-label">Sumber Biaya</span>
              <select id="costEntrySource">
                <option value="WAREHOUSE">Gudang / Material (WAREHOUSE)</option>
                <option value="TIMESHEET">Timesheet / Tenaga Kerja (TIMESHEET)</option>
                <option value="VENDOR">Vendor & Subkontraktor</option>
                <option value="MANUAL">Manual / Kasbon Proyek</option>
              </select>
            </label>
            <label>
              <span class="form-label">Elemen Biaya</span>
              <select id="costEntryElement">
                <option value="MATERIAL">Material</option>
                <option value="LABOR">Labor (Upah)</option>
                <option value="OVERHEAD">Overhead</option>
                <option value="OTHER">Lainnya</option>
              </select>
            </label>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <label>
              <span class="form-label">Total Biaya (Rp) *</span>
              <input type="number" id="costEntryAmount" placeholder="35000000" min="1" required>
            </label>
            <label>
              <span class="form-label">Tanggal Transaksi</span>
              <input type="date" id="costEntryDate" value="${new Date().toISOString().slice(0, 10)}">
            </label>
          </div>
          <label>
            <span class="form-label">Deskripsi Transaksi *</span>
            <input type="text" id="costEntryDesc" placeholder="Contoh: Pengambilan 4 unit Sensor dan Kabel Tray" required>
          </label>
        </form>
      `,
      `
        <button class="button secondary" onclick="document.getElementById('modalClose').click()">Batal</button>
        <button type="button" id="btnSubmitCostEntryModal" class="button primary">Simpan Biaya Proyek</button>
      `
    );

    document.getElementById("btnSubmitCostEntryModal")?.addEventListener("click", async () => {
      const project = document.getElementById("costEntryProject")?.value || null;
      const total_cost = parseFloat(document.getElementById("costEntryAmount")?.value) || 0;
      const description = document.getElementById("costEntryDesc")?.value.trim();
      const source_type = document.getElementById("costEntrySource")?.value || "MATERIAL";
      const cost_element = document.getElementById("costEntryElement")?.value || "MATERIAL";
      const transaction_date = document.getElementById("costEntryDate")?.value || new Date().toISOString().slice(0, 10);

      if (!project || !total_cost || !description) {
        toast("Input Belum Lengkap", "Proyek, Total Biaya, dan Deskripsi wajib diisi.", "error");
        return;
      }

      try {
        const btn = document.getElementById("btnSubmitCostEntryModal");
        if (btn) { btn.disabled = true; btn.textContent = "Menyimpan..."; }
        await createProjectCostEntry({
          project,
          total_cost,
          description,
          source_type,
          cost_element,
          transaction_date,
        });
        Modal.close();
        toast("Biaya Tercatat", "Biaya proyek berhasil dicatat ke Finance.", "success");
        await loadFinanceData();
        renderFinancePage({ params: { tab: "costing" } });
      } catch (err) {
        toast("Gagal Menyimpan Biaya", err.message, "error");
        const btn = document.getElementById("btnSubmitCostEntryModal");
        if (btn) { btn.disabled = false; btn.textContent = "Simpan Biaya Proyek"; }
      }
    });
  };

  const openBillingProposalModal = () => {
    Modal.open(
      "Buat Billing Proposal Baru",
      "Penyusunan Termin Tagihan Proyek",
      `
        <form id="formNewProposalModal" class="dynamic-form stack" style="display:grid;gap:12px;">
          <label>
            <span class="form-label">Pilih Proyek *</span>
            <select id="propProject" required>
              <option value="">-- Pilih Proyek --</option>
              ${projects.map(p => `<option value="${attr(p.id)}">${esc(p.project_code || p.code || "")} - ${esc(p.project_name || p.name || p.id)}</option>`).join("")}
            </select>
          </label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <label>
              <span class="form-label">Trigger Penagihan</span>
              <select id="propTriggerType">
                <option value="PROGRESS_APPROVED">Progress Pekerjaan Disetujui</option>
                <option value="MILESTONE_APPROVED">Milestone Selesai</option>
                <option value="DELIVERY_ACCEPTED">Pengiriman Unit Diterima</option>
                <option value="PROJECT_COMPLETED">Proyek Selesai</option>
              </select>
            </label>
            <label>
              <span class="form-label">Subtotal Nilai Tagihan (Rp) *</span>
              <input type="number" id="propSubtotalAmount" placeholder="150000000" min="1" required>
            </label>
          </div>
          <label>
            <span class="form-label">Keterangan Termin *</span>
            <input type="text" id="propDescriptionText" placeholder="Contoh: Termin 2 (Progress 80%)" required>
          </label>
        </form>
      `,
      `
        <button class="button secondary" onclick="document.getElementById('modalClose').click()">Batal</button>
        <button type="button" id="btnSubmitPropModal" class="button primary">Simpan Proposal</button>
      `
    );

    document.getElementById("btnSubmitPropModal")?.addEventListener("click", async () => {
      const project = document.getElementById("propProject")?.value || null;
      const subtotal_amount = parseFloat(document.getElementById("propSubtotalAmount")?.value) || 0;
      const description = document.getElementById("propDescriptionText")?.value.trim();
      const trigger_type = document.getElementById("propTriggerType")?.value || "PROGRESS_APPROVED";

      if (!project || !subtotal_amount || !description) {
        toast("Input Belum Lengkap", "Proyek, Subtotal, dan Keterangan Termin wajib diisi.", "error");
        return;
      }

      try {
        const btn = document.getElementById("btnSubmitPropModal");
        if (btn) { btn.disabled = true; btn.textContent = "Menyimpan..."; }
        const tax_amount = subtotal_amount * 0.11;
        await createBillingProposal({
          project,
          trigger_type,
          description,
          subtotal_amount,
          tax_rate: 11,
          tax_amount,
          total_amount: subtotal_amount + tax_amount,
          status: "APPROVED",
        });
        Modal.close();
        toast("Proposal Dibuat", "Proposal termin siap disetujui & diterbitkan invoice oleh Finance.", "success");
        await loadFinanceData();
        renderFinancePage({ params: { tab: "project-billing" } });
      } catch (err) {
        toast("Gagal Membuat Proposal", err.message, "error");
        const btn = document.getElementById("btnSubmitPropModal");
        if (btn) { btn.disabled = false; btn.textContent = "Simpan Proposal"; }
      }
    });
  };

  // Wire all modal buttons
  document.getElementById("btnNewBilling")?.addEventListener("click", openNewBillingModal);
  document.getElementById("btnQuickNewBill")?.addEventListener("click", openNewBillingModal);

  document.getElementById("btnNewFunding")?.addEventListener("click", openFundingModal);
  document.getElementById("btnQuickNewFunding")?.addEventListener("click", openFundingModal);

  document.getElementById("btnNewCostEntry")?.addEventListener("click", openCostModal);
  document.getElementById("btnQuickNewCost")?.addEventListener("click", openCostModal);

  document.getElementById("btnNewBillingProposal")?.addEventListener("click", openBillingProposalModal);

  // Create Payment Batch Modal
  const openPaymentModal = () => {
    Modal.open(
      "Buat Pembayaran Baru",
      "Pencatatan Disbursement Kas / Bank",
      `
        <form id="formNewPayModal" class="dynamic-form stack" style="display:grid;gap:12px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <label>
              <span class="form-label">No. Referensi Pembayaran</span>
              <input type="text" id="payRef" placeholder="PAY-2026-001">
            </label>
            <label>
              <span class="form-label">Penerima / Rekanan *</span>
              <select id="payParty" required>
                <option value="">-- Pilih Penerima --</option>
                ${parties.map(p => `<option value="${attr(p.id)}">${esc(p.display_name || p.legal_name)}</option>`).join("")}
              </select>
            </label>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <label>
              <span class="form-label">Jumlah Pembayaran (Rp) *</span>
              <input type="number" id="payAmount" placeholder="50000000" min="1" required>
            </label>
            <label>
              <span class="form-label">Metode Pembayaran</span>
              <select id="payMethod">
                <option value="BANK_TRANSFER">Transfer Bank</option>
                <option value="CASH">Tunai / Kas Kecil</option>
                <option value="GIRO">Giro / Cek</option>
              </select>
            </label>
          </div>
          <label>
            <span class="form-label">Tanggal Pembayaran</span>
            <input type="date" id="payDate" value="${new Date().toISOString().slice(0, 10)}">
          </label>
        </form>
      `,
      `
        <button class="button secondary" onclick="document.getElementById('modalClose').click()">Batal</button>
        <button type="button" id="btnSubmitPaymentModal" class="button primary">Simpan Pembayaran</button>
      `
    );

    document.getElementById("btnSubmitPaymentModal")?.addEventListener("click", async () => {
      const reference_number = document.getElementById("payRef")?.value.trim() || undefined;
      const party = document.getElementById("payParty")?.value || null;
      const amount = parseFloat(document.getElementById("payAmount")?.value) || 0;
      const payment_method = document.getElementById("payMethod")?.value || "BANK_TRANSFER";
      const payment_date = document.getElementById("payDate")?.value || new Date().toISOString().slice(0, 10);

      if (!party || !amount) {
        toast("Input Belum Lengkap", "Penerima dan Jumlah Pembayaran wajib diisi.", "error");
        return;
      }

      try {
        const btn = document.getElementById("btnSubmitPaymentModal");
        if (btn) { btn.disabled = true; btn.textContent = "Menyimpan..."; }
        await createPaymentBatch({
          reference_number,
          party,
          amount,
          payment_method,
          payment_date,
        });
        Modal.close();
        toast("Pembayaran Dibuat", "Draft pembayaran berhasil disimpan.", "success");
        await loadFinanceData();
        renderFinancePage({ params: { tab: "payments" } });
      } catch (err) {
        toast("Gagal Menyimpan Pembayaran", err.message, "error");
        const btn = document.getElementById("btnSubmitPaymentModal");
        if (btn) { btn.disabled = false; btn.textContent = "Simpan Pembayaran"; }
      }
    });
  };

  document.getElementById("btnCreatePayment")?.addEventListener("click", openPaymentModal);
  document.getElementById("btnNewPayment")?.addEventListener("click", openPaymentModal);
}

function openFinanceCreditLimitModal(partyId) {
  const d = state.finance.data || {};
  const party = (d.parties || []).find(p => String(p.id) === String(partyId));
  const credit = state.crm?.data?.credit || [];
  const snap = credit.find(c => String(c.customer_party) === String(partyId));
  const currentLimit = snap ? snap.credit_limit : 0;
  const custName = party?.display_name || party?.legal_name || "Customer";

  Modal.open(
    "Pengaturan Plafon Kredit Customer (Finance Credit Limit)",
    `Customer: ${esc(custName)}`,
    `
      <form id="formFinCreditLimit" class="dynamic-form stack" style="display:grid;gap:12px;">
        <div style="padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--soft);">
          <div style="font-size:12px;color:var(--muted);">Status Piutang & Evaluasi Saat Ini:</div>
          <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:12px;">
            <span>Outstanding AR: <b>${formatMoney(snap?.outstanding_receivable || 0)}</b></span>
            <span>Overdue: <b style="color:var(--danger);">${formatMoney(snap?.overdue_amount || 0)}</b></span>
            ${statusBadge(snap?.credit_status || "AVAILABLE")}
          </div>
        </div>

        <label>
          <span class="form-label">Plafon Kredit Maksimum (Credit Limit Rp) *</span>
          <input type="number" id="finLimitVal" value="${currentLimit}" placeholder="500000000" min="0" required>
          <small style="color:var(--muted);font-size:11px;">Batas maksimal saldo piutang transaksi kredit yang diizinkan untuk customer ini.</small>
        </label>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <label>
            <span class="form-label">Kategori Profil Risiko</span>
            <select id="finRiskCat">
              <option value="LOW" ${snap?.risk_category === "LOW" ? "selected" : ""}>LOW (Risiko Rendah / Lancar)</option>
              <option value="MEDIUM" ${snap?.risk_category === "MEDIUM" ? "selected" : ""}>MEDIUM (Risiko Sedang / Perhatian)</option>
              <option value="HIGH" ${snap?.risk_category === "HIGH" ? "selected" : ""}>HIGH (Risiko Tinggi / Ketat)</option>
            </select>
          </label>
          <label>
            <span class="form-label">Credit Hold Status</span>
            <select id="finHold">
              <option value="0" ${snap?.credit_status !== "HOLD" ? "selected" : ""}>NORMAL (Transaksi Diizinkan)</option>
              <option value="1" ${snap?.credit_status === "HOLD" ? "selected" : ""}>HOLD (Dibekukan / Stop Kredit)</option>
            </select>
          </label>
        </div>
      </form>
    `,
    `
      <button class="button secondary" onclick="document.getElementById('modalClose').click()">Batal</button>
      <button type="button" id="btnSaveFinCreditModal" class="button primary" style="background:#7746e8;">Simpan Plafon Kredit</button>
    `
  );

  document.getElementById("btnSaveFinCreditModal")?.addEventListener("click", async () => {
    const credit_limit = parseFloat(document.getElementById("finLimitVal")?.value);
    const risk_category = document.getElementById("finRiskCat")?.value || "LOW";
    const credit_hold = document.getElementById("finHold")?.value === "1";

    if (isNaN(credit_limit) || credit_limit < 0) {
      toast("Input Belum Valid", "Nominal Plafon Kredit wajib diisi angka >= 0.", "error");
      return;
    }

    try {
      const btn = document.getElementById("btnSaveFinCreditModal");
      if (btn) { btn.disabled = true; btn.textContent = "Menyimpan..."; }
      await updateCustomerCreditLimit({
        party_id: partyId,
        credit_limit,
        risk_category,
        credit_hold,
      });
      Modal.close();
      toast("Credit Limit Diperbarui", `Plafon kredit ${custName} berhasil diatur menjadi ${formatMoney(credit_limit)}.`, "success");
      await loadFinanceData();
      renderFinancePage({ params: { tab: "receivable" } });
    } catch (err) {
      toast("Gagal Menyimpan Credit Limit", err.message, "error");
      const btn = document.getElementById("btnSaveFinCreditModal");
      if (btn) { btn.disabled = false; btn.textContent = "Simpan Plafon Kredit"; }
    }
  });
}

// Reactive Data Effect Listeners
eventBus.on("finance:updated", async () => {
  if (state.view === "finance-flow") {
    await loadFinanceData();
    renderFinancePage();
  }
});

eventBus.on("company:changed", async () => {
  state.finance.data = {};
  if (state.view === "finance-flow") {
    await loadFinanceData();
    renderFinancePage();
  }
});
