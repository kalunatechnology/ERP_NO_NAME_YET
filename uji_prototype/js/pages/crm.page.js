/**
 * CRM and Sales Workspace Page Controller
 */

import { state } from "../core/state.js";
import { router } from "../core/router.js";
import { setPageHeader } from "../components/topbar.js";
import { CRM_TABS } from "../config/navigation.js";
import { esc, attr } from "../utils/dom.js";
import { formatMoney, number } from "../utils/formatters.js";
import { statusBadge } from "../components/badge.js";
import { emptyState, loadingState } from "../components/state-views.js";
import { Modal } from "../components/modal.js";
import { toast } from "../components/toast.js";
import { eventBus } from "../core/event-bus.js";
import {
  loadCRMData,
  processDealWon,
  executiveOverrideCredit,
  checkTicketWarrantyStatus,
  qualifyInquiry,
  calculateCostEstimate,
  createQuotationFromEstimate,
  submitQuotationApproval,
  approveQuotation,
  sendQuotation,
  acceptQuotation,
  rejectQuotation,
  convertQuotationToOrder,
  createCustomerInquiry,
  createInquiryRequirement,
  createOpportunity,
  createCostEstimate,
  createCostEstimateLine,
  createSupportTicket,
  deleteCustomerInquiry,
  deleteOpportunity,
  deleteCostEstimate,
  deleteSupportTicket,
  deleteInquiryRequirement,
  updateCustomerCreditLimit,
  calculateCreditSnapshot,
} from "../services/crm.service.js";

export async function renderCRMPage({ params = {} } = {}) {
  setPageHeader("Customer Lifecycle", "CRM & Sales");
  const workspace = document.getElementById("workspace");
  if (!workspace) return;

  if (params.tab) {
    state.crm.tab = params.tab;
  }

  const c = state.crm;
  const d = c.data || {};
  const dash = c.dashboard || {};
  const currentTab = c.tab || "dashboard";

  const heroHTML = `
    <section class="crm-hero" style="display:flex;justify-content:space-between;gap:18px;padding:22px;border:1px solid #d8c9ff;border-radius:18px;background:linear-gradient(135deg,#fbf9ff,#f1ebff);margin-bottom:16px;">
      <div>
        <span class="eyebrow" style="color:#7746e8;">INQUIRY → OPPORTUNITY → QUOTATION → ORDER & SERVICE</span>
        <h2 style="margin:5px 0;font-size:26px;">CRM Commercial & Service Workspace</h2>
        <p style="margin:0;color:var(--muted);">Kelola kebutuhan customer, deal won & credit status, handoff ke Project Management, hingga penanganan tiket support dan klaim garansi.</p>
      </div>
      <button id="crmRefreshBtn" class="button primary" style="background:#7746e8;">${c.loading ? "Memuat…" : "Muat Data CRM"}</button>
    </section>
  `;

  const tabsHTML = `
    <nav class="crm-tabs" style="display:flex;gap:7px;margin:14px 0;padding:6px;border:1px solid var(--line);border-radius:13px;background:#fff;overflow-x:auto;">
      ${CRM_TABS.map(
        x => `
        <button data-crm-tab="${esc(x[0])}" class="${currentTab === x[0] ? "active" : ""}" style="border:0;border-radius:9px;padding:10px 14px;background:${currentTab === x[0] ? "#7746e8" : "transparent"};color:${currentTab === x[0] ? "#fff" : "var(--muted)"};font-weight:800;white-space:nowrap;">
          ${esc(x[1])}
        </button>
      `
      ).join("")}
    </nav>
  `;

  if (!c.loaded && !c.loading) {
    loadCRMData()
      .then(() => renderCRMPage({ params }))
      .catch(e => console.warn("Auto CRM load error:", e));
  }

  let contentHTML = "";
  if (c.loading) {
    contentHTML = loadingState("Sedang memuat data CRM...");
  } else {
    switch (currentTab) {
      case "deals":
        contentHTML = renderCRMDeals(d);
        break;
      case "tickets":
        contentHTML = renderCRMTickets(d);
        break;
      case "incoming":
        contentHTML = renderCRMIncoming(d);
        break;
      case "accounts":
        contentHTML = renderCRMAccounts(d);
        break;
      case "estimate":
        contentHTML = renderCRMEstimate(d);
        break;
      case "contracts":
        contentHTML = renderCRMContracts(d);
        break;
      case "engagement":
        contentHTML = renderCRMEngagement(d);
        break;
      case "dashboard":
      default:
        contentHTML = renderCRMDashboard(dash, d);
        break;
    }
  }

  workspace.innerHTML = `${heroHTML}${tabsHTML}${contentHTML}`;
  bindCRMEvents(workspace);
}

function renderCRMDashboard(x, d) {
  return `
    <section class="crm-kpis" style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:16px;">
      <article class="crm-panel" style="padding:16px;border:1px solid var(--line);border-radius:14px;background:#fff;">
        <small style="color:var(--muted);">Bobot Project</small>
        <strong style="display:block;margin-top:9px;font-size:20px;">${formatMoney(x.weighted_project_value)}</strong>
      </article>
      <article class="crm-panel" style="padding:16px;border:1px solid var(--line);border-radius:14px;background:#fff;">
        <small style="color:var(--muted);">Win Rate</small>
        <strong style="display:block;margin-top:9px;font-size:20px;">${number(x.win_rate_percent || 0)}%</strong>
      </article>
      <article class="crm-panel" style="padding:16px;border:1px solid var(--line);border-radius:14px;background:#fff;">
        <small style="color:var(--muted);">Sales Cycle</small>
        <strong style="display:block;margin-top:9px;font-size:20px;">${number(x.average_sales_cycle_days || 0)} hari</strong>
      </article>
      <article class="crm-panel" style="padding:16px;border:1px solid var(--line);border-radius:14px;background:#fff;">
        <small style="color:var(--muted);">Margin Offering</small>
        <strong style="display:block;margin-top:9px;font-size:20px;">${number(x.offering_margin_percent || 0)}%</strong>
      </article>
      <article class="crm-panel" style="padding:16px;border:1px solid var(--line);border-radius:14px;background:#fff;">
        <small style="color:var(--muted);">Tiket Servis Aktif</small>
        <strong style="display:block;margin-top:9px;font-size:20px;">${(d.cases || []).filter(k => k.status !== "RESOLVED" && k.status !== "CLOSED").length}</strong>
      </article>
    </section>

    <div class="crm-grid" style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:12px;">
      <section class="crm-panel" style="padding:16px;border:1px solid var(--line);border-radius:14px;background:#fff;">
        <h3>Pipeline Aktif</h3>
        ${(d.opportunities || [])
          .map(
            o => `
          <div class="crm-row" style="display:flex;justify-content:space-between;padding:10px;border:1px solid var(--line);border-radius:8px;margin-top:8px;background:var(--soft);">
            <div><strong>${esc(o.opportunity_name || `Opportunity ${String(o.id).slice(0, 8)}`)}</strong><br><small style="color:var(--muted);">${esc(o.pipeline_stage || o.status)} · ${formatMoney(o.expected_amount)}</small></div>
            <span class="badge info">${number(o.probability_percent || 0)}%</span>
          </div>
        `
          )
          .join("") || emptyState("Belum ada opportunity.")}
      </section>

      <section class="crm-panel" style="padding:16px;border:1px solid var(--line);border-radius:14px;background:#fff;">
        <h3>Kontrol Komersial & Service</h3>
        <div style="display:grid;gap:8px;margin-top:10px;">
          <div style="display:flex;justify-content:space-between;padding:10px;border:1px solid var(--line);border-radius:8px;">
            <span>Approval quotation</span>
            <strong>${x.quotation_pending_approval_count || 0} menunggu</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:10px;border:1px solid var(--line);border-radius:8px;">
            <span>Tiket Support & Klaim</span>
            <strong>${(d.cases || []).length} kasus</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:10px;border:1px solid var(--line);border-radius:8px;">
            <span>Quotation Resmi</span>
            <strong>${(d.quotations || []).length} dokumen</strong>
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderCRMDeals(d) {
  const opps = d.opportunities || [];
  const credit = d.credit || [];

  return `
    <div class="crm-grid" style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:12px;">
      <section class="crm-panel" style="padding:16px;border:1px solid var(--line);border-radius:14px;background:#fff;">
        <div class="content-toolbar" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div><h3 style="margin:0;">Deal Pipeline & Closed Won</h3></div>
          <div style="display:flex;gap:8px;align-items:center;">
            <span class="badge info">${opps.length} Opportunity</span>
            <button id="btnNewOpportunity" class="button primary small" style="background:#7746e8;">+ Buat Opportunity</button>
          </div>
        </div>
        <div style="display:grid;gap:10px;">
          ${opps
            .map(o => {
              const cust = (d.parties || []).find(p => String(p.id) === String(o.customer_party));
              const custName = cust?.display_name || cust?.legal_name || "Customer";
              const isWon = o.status === "WON" || o.pipeline_stage === "WON";
              return `
              <div class="crm-row" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:#fff;gap:14px;">
                <div>
                  <strong style="font-size:13px;display:block;">${esc(o.opportunity_name || `Opportunity ${String(o.id).slice(0, 8)}`)}</strong>
                  <small style="color:var(--muted);display:block;margin-top:4px;">${esc(custName)} · <b>${formatMoney(o.expected_amount)}</b> · Status: ${statusBadge(o.status)}</small>
                </div>
                <div class="inline-actions" style="display:flex;gap:6px;align-items:center;">
                  <button class="button primary small" data-crm-act="process-deal-won" data-id="${attr(o.id)}">⚡ Process Deal Won & Check Credit</button>
                  ${isWon ? `<button class="button ghost small" data-crm-act="executive-override" data-id="${attr(o.id)}" title="Override kredit">👑 Override</button>` : ""}
                  <button class="button danger small" data-crm-act="delete-opportunity" data-id="${attr(o.id)}" title="Hapus Opportunity">🗑️</button>
                </div>
              </div>
            `;
            })
            .join("") || emptyState("Belum ada opportunity.")}
        </div>
      </section>

      <section class="crm-panel" style="padding:16px;border:1px solid var(--line);border-radius:14px;background:#fff;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <h3 style="margin:0;">Credit Management & Profiling</h3>
          <span class="badge info">${(d.parties || []).length} Customer</span>
        </div>
        <p style="color:var(--muted);font-size:11px;margin:0 0 12px;">Kontrol plafon kredit (Credit Limit), outstanding AR, dan kelayakan approval transaksi klien.</p>
        <div style="display:grid;gap:10px;max-height:480px;overflow-y:auto;">
          ${(d.parties || [])
            .map(p => {
              const custName = p.display_name || p.legal_name || "Customer";
              const snap = (credit || []).find(c => String(c.customer_party) === String(p.id));
              const limit = snap ? snap.credit_limit : 0;
              const outstanding = snap ? snap.outstanding_receivable : 0;
              const overdue = snap ? snap.overdue_amount : 0;
              const available = snap ? snap.available_credit : limit;
              const status = snap ? snap.credit_status : (limit > 0 ? "AVAILABLE" : "NO_LIMIT");
              const isBlocked = status === "HOLD" || (limit > 0 && available < 0) || overdue > 0;

              return `
              <div style="padding:12px;border:1px solid ${isBlocked ? "#f5c6cb" : "var(--line)"};border-radius:10px;background:${isBlocked ? "#fff5f5" : "var(--soft)"};">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <strong style="font-size:12px;">${esc(custName)}</strong>
                  ${statusBadge(status)}
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:8px 0 10px;font-size:11px;">
                  <div>Plafon Limit: <b style="color:var(--primary);">${formatMoney(limit)}</b></div>
                  <div>Outstanding AR: <b style="color:${outstanding > 0 ? "var(--warning)" : "inherit"};">${formatMoney(outstanding)}</b></div>
                  <div>Sisa Kredit: <b style="color:${available >= 0 ? "var(--success)" : "var(--danger)"};">${formatMoney(available)}</b></div>
                  <div>Overdue: <b style="color:${overdue > 0 ? "var(--danger)" : "inherit"};">${formatMoney(overdue)}</b></div>
                </div>
                <div style="display:flex;gap:6px;justify-content:flex-end;">
                  <button class="button primary small" data-crm-act="edit-credit-limit" data-id="${attr(p.id)}" style="background:#7746e8;font-size:11px;padding:4px 10px;">💳 Atur Limit Kredit</button>
                  <button class="button ghost small" data-crm-act="recalc-credit" data-id="${attr(p.id)}" style="font-size:11px;padding:4px 8px;" title="Hitung Ulang Snapshot">🔄</button>
                </div>
              </div>
            `;
            })
            .join("") || emptyState("Belum ada customer terdaftar.")}
        </div>
      </section>
    </div>
  `;
}

function renderCRMTickets(d) {
  const cases = d.cases || [];
  return `
    <div class="crm-grid" style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:12px;">
      <section class="crm-panel" style="padding:16px;border:1px solid var(--line);border-radius:14px;background:#fff;">
        <div class="content-toolbar" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h3 style="margin:0;">Tiket Support & Klaim Garansi</h3>
          <div style="display:flex;gap:8px;align-items:center;">
            <span class="badge info">${cases.length} Tiket</span>
            <button id="btnNewTicket" class="button primary small" style="background:#7746e8;">+ Buat Tiket Baru</button>
          </div>
        </div>
        <div style="display:grid;gap:10px;">
          ${cases
            .map(c => {
              const cust = (d.parties || []).find(p => String(p.id) === String(c.customer_party));
              const prod = (d.products || []).find(p => String(p.id) === String(c.product));
              const resolved = c.status === "RESOLVED" || c.status === "CLOSED";
              return `
              <div class="crm-row" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:#fff;gap:14px;">
                <div>
                  <strong style="font-size:13px;display:block;">${esc(c.subject || `Tiket ${String(c.id).slice(0, 8)}`)}</strong>
                  <small style="color:var(--muted);display:block;margin-top:4px;">${esc(cust?.display_name || "Customer")} · ${esc(prod?.product_name || "Produk")} · Prioritas: <b>${esc(c.priority || "NORMAL")}</b> · Status: ${statusBadge(c.status)}</small>
                </div>
                <div class="inline-actions" style="display:flex;gap:6px;align-items:center;">
                  ${!resolved ? `<button class="button secondary small" data-crm-act="check-ticket" data-id="${attr(c.id)}">🔍 Check Status & Warranty</button>` : `<span class="badge success">RESOLVED</span>`}
                  <button class="button danger small" data-crm-act="delete-ticket" data-id="${attr(c.id)}" title="Hapus Tiket">🗑️</button>
                </div>
              </div>
            `;
            })
            .join("") || emptyState("Belum ada tiket support.")}
        </div>
      </section>

      <section class="crm-panel" style="padding:16px;border:1px solid var(--line);border-radius:14px;background:#fff;">
        <h3>Riwayat Solusi & Garansi</h3>
        <div style="display:grid;gap:8px;margin-top:10px;">
          ${(d.resolutions || [])
            .map(
              r => `
            <div style="padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--soft);">
              <div style="display:flex;justify-content:space-between;">
                <strong>${esc(r.resolution_type || "Solusi")}</strong>
                <span class="badge success">${esc(r.resolution_type)}</span>
              </div>
              <small style="color:var(--muted);display:block;margin-top:4px;">${esc(r.resolution_notes || "-")}</small>
            </div>
          `
            )
            .join("") || emptyState("Belum ada resolusi tercatat.")}
        </div>
      </section>
    </div>
  `;
}

function renderCRMIncoming(d) {
  const inquiries = d.inquiries || [];
  const allReqs = d.requirements || [];
  return `
    <section class="crm-panel" style="padding:16px;border:1px solid var(--line);border-radius:14px;background:#fff;">
      <div class="content-toolbar" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="margin:0;">Incoming Customer Inquiries</h3>
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="badge info">${inquiries.length} Inquiry</span>
          <button id="btnNewInquiry" class="button primary small" style="background:#7746e8;">+ Buat Inquiry Baru</button>
        </div>
      </div>
      <div style="display:grid;gap:10px;">
        ${inquiries
          .map(x => {
            const isQualified = String(x.status).toUpperCase() === "QUALIFIED";
            const reqs = allReqs.filter(r => String(r.inquiry) === String(x.id));
            return `
            <div class="crm-row" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:#fff;gap:14px;">
              <div>
                <strong style="font-size:13px;display:block;">${esc(x.subject || `Inquiry ${String(x.id).slice(0, 8)}`)}</strong>
                <small style="color:var(--muted);display:block;margin-top:4px;">
                  Customer: <b>${esc(x.customer_name || "-")}</b> (${esc(x.customer_email || "-")}) · 
                  <span class="badge info" style="font-size:10px;">${reqs.length} Item Spesifikasi</span> · 
                  Status: ${statusBadge(x.status)}
                </small>
              </div>
              <div class="inline-actions" style="display:flex;gap:6px;align-items:center;">
                <button class="button ghost small" data-crm-act="add-requirement" data-id="${attr(x.id)}" title="Tambah spesifikasi">+ Spesifikasi</button>
                ${!isQualified ? `<button class="button primary small" data-crm-act="qualify" data-id="${attr(x.id)}">⚡ Qualify ke Opportunity</button>` : `<span class="badge success">QUALIFIED</span>`}
                <button class="button danger small" data-crm-act="delete-inquiry" data-id="${attr(x.id)}" title="Hapus Inquiry">🗑️</button>
              </div>
            </div>
          `;
          })
          .join("") || emptyState("Belum ada incoming inquiry.")}
      </div>
    </section>
  `;
}

function renderCRMEstimate(d) {
  const estimates = d.estimates || [];
  const quotations = d.quotations || [];
  return `
    <div class="crm-grid" style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:12px;">
      <section class="crm-panel" style="padding:16px;border:1px solid var(--line);border-radius:14px;background:#fff;">
        <div class="content-toolbar" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h3 style="margin:0;">Cost Estimating (HPP & Margin)</h3>
          <div style="display:flex;gap:8px;align-items:center;">
            <span class="badge info">${estimates.length} Estimate</span>
            <button id="btnNewEstimate" class="button primary small" style="background:#7746e8;">+ Buat Estimasi HPP</button>
          </div>
        </div>
        <div style="display:grid;gap:10px;">
          ${estimates
            .map(e => `
            <div class="crm-row" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:#fff;gap:14px;">
              <div>
                <strong style="font-size:13px;display:block;">Cost Estimate ${String(e.estimate_number || e.id).slice(0, 12)}</strong>
                <small style="color:var(--muted);display:block;margin-top:4px;">
                  Total HPP: <b>${formatMoney(e.total_cost)}</b> · Markup: <b>${number(e.markup_percent || 0)}%</b> · Penawaran: <b style="color:var(--primary);">${formatMoney(e.offered_amount || e.offered_price || e.quoted_price || 0)}</b> · Status: ${statusBadge(e.status)}
                </small>
              </div>
              <div class="inline-actions" style="display:flex;gap:6px;align-items:center;">
                <button class="button ghost small" data-crm-act="add-cost-line" data-id="${attr(e.id)}" title="Tambah Rincian Komponen Biaya">+ Cost Line</button>
                <button class="button secondary small" data-crm-act="calculate" data-id="${attr(e.id)}">⚡ Hitung HPP</button>
                <button class="button primary small" style="background:#28a745;" data-crm-act="quote" data-id="${attr(e.id)}">📄 Buat Quotation</button>
                <button class="button danger small" data-crm-act="delete-estimate" data-id="${attr(e.id)}" title="Hapus Estimasi">🗑️</button>
              </div>
            </div>
          `)
            .join("") || emptyState("Belum ada kalkulasi biaya.")}
        </div>
      </section>

      <section class="crm-panel" style="padding:16px;border:1px solid var(--line);border-radius:14px;background:#fff;">
        <div class="content-toolbar" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h3 style="margin:0;">Sales Quotations</h3>
          <span class="badge info">${quotations.length} Dokumen</span>
        </div>
        <div style="display:grid;gap:10px;">
          ${quotations
            .map(q => `
            <div class="crm-row" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:#fff;gap:14px;">
              <div>
                <strong style="font-size:13px;display:block;">${esc(q.quotation_number || `Quote ${String(q.id).slice(0, 8)}`)}</strong>
                <small style="color:var(--muted);display:block;margin-top:4px;">Total: <b>${formatMoney(q.total_amount)}</b> · Status: ${statusBadge(q.status)}</small>
              </div>
              <div class="inline-actions" style="display:flex;gap:6px;align-items:center;">
                ${renderQuotationActions(q)}
              </div>
            </div>
          `)
            .join("") || emptyState("Belum ada quotation.")}
        </div>
      </section>
    </div>
  `;
}

function renderQuotationActions(q) {
  const s = String(q.status || "").toUpperCase();
  if (s === "DRAFT") return `<button class="button primary small" data-crm-act="submit-quote" data-id="${attr(q.id)}">Minta Approval</button>`;
  if (s === "PENDING_APPROVAL") return `<button class="button primary small" data-crm-act="approve-quote" data-id="${attr(q.id)}">Setujui (Approve)</button>`;
  if (s === "APPROVED") return `<button class="button primary small" data-crm-act="send-quote" data-id="${attr(q.id)}">Kirim</button>`;
  if (s === "SENT") return `<button class="button primary small" data-crm-act="accept-quote" data-id="${attr(q.id)}">Accept</button>`;
  if (s === "ACCEPTED") return `<button class="button primary small" style="background:#28a745;" data-crm-act="convert-order" data-id="${attr(q.id)}">📦 Convert to Order</button>`;
  return `<span class="badge success">${esc(s)}</span>`;
}

function renderCRMAccounts(d) {
  const parties = d.parties || [];
  return `
    <section class="crm-panel" style="padding:16px;border:1px solid var(--line);border-radius:14px;background:#fff;">
      <h3 style="margin-top:0;">Master Rekanan (Customers & Partners)</h3>
      <div style="display:grid;gap:10px;">
        ${parties
          .map(p => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border:1px solid var(--line);border-radius:8px;">
            <div>
              <strong>${esc(p.display_name || p.legal_name || p.id)}</strong>
              <small style="display:block;color:var(--muted);">Code: <code>${esc(p.party_code || "-")}</code> · Type: <b>${esc(p.party_type || "CUSTOMER")}</b> · Email: ${esc(p.email || "-")}</small>
            </div>
            ${statusBadge(p.status || "ACTIVE")}
          </div>
        `)
          .join("") || emptyState("Belum ada rekanan.")}
      </div>
    </section>
  `;
}

function renderCRMContracts(d) {
  const orders = d.orders || [];
  return `
    <section class="crm-panel" style="padding:16px;border:1px solid var(--line);border-radius:14px;background:#fff;">
      <h3 style="margin-top:0;">Sales Orders</h3>
      <div style="display:grid;gap:10px;">
        ${orders
          .map(o => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border:1px solid var(--line);border-radius:8px;">
            <div>
              <strong>${esc(o.order_number || `Order ${String(o.id).slice(0, 8)}`)}</strong>
              <small style="display:block;color:var(--muted);">Nilai: <b>${formatMoney(o.total_amount)}</b></small>
            </div>
            ${statusBadge(o.status || "CONFIRMED")}
          </div>
        `)
          .join("") || emptyState("Belum ada sales order.")}
      </div>
    </section>
  `;
}

function renderCRMEngagement(d) {
  const feeds = d.feedback || [];
  return `
    <section class="crm-panel" style="padding:16px;border:1px solid var(--line);border-radius:14px;background:#fff;">
      <h3 style="margin-top:0;">Customer Feedback & Review</h3>
      <div style="display:grid;gap:10px;">
        ${feeds
          .map(f => `
          <div style="padding:10px;border:1px solid var(--line);border-radius:8px;">
            <strong>Rating: ⭐ ${f.rating_score || 5}/5</strong>
            <p style="margin:4px 0;color:var(--muted);">${esc(f.comments || "-")}</p>
          </div>
        `)
          .join("") || emptyState("Belum ada feedback.")}
      </div>
    </section>
  `;
}

function bindCRMEvents(workspace) {
  const refreshBtn = document.getElementById("crmRefreshBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      try {
        refreshBtn.disabled = true;
        refreshBtn.textContent = "Memuat data...";
        await loadCRMData();
        renderCRMPage();
        toast("CRM Siap", "Data live CRM berhasil dimuat.", "success");
      } catch (err) {
        toast("Gagal Memuat CRM", err.message, "error");
        renderCRMPage();
      }
    });
  }

  workspace.querySelectorAll("[data-crm-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.crmTab;
      router.navigate(`/crm/${tab}`);
    });
  });

  workspace.querySelectorAll("[data-crm-act]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const act = btn.dataset.crmAct;
      const id = btn.dataset.id;
      try {
        btn.disabled = true;
        if (act === "qualify") await qualifyInquiry(id);
        if (act === "calculate") await calculateCostEstimate(id);
        if (act === "quote") await createQuotationFromEstimate(id);
        if (act === "submit-quote") await submitQuotationApproval(id);
        if (act === "approve-quote") await approveQuotation(id);
        if (act === "send-quote") await sendQuotation(id);
        if (act === "accept-quote") await acceptQuotation(id);
        if (act === "convert-order") await convertQuotationToOrder(id);

        if (act === "process-deal-won") {
          const res = await processDealWon(id);
          const isSafe = res.credit_evaluation?.is_safe;
          Modal.open(
            "Deal Won & Credit Assessment",
            `Evaluasi ${res.opportunity_name || ""}`,
            `
              <div class="prototype-banner ${isSafe ? "project-banner" : "warning"}" style="padding:12px;border-radius:8px;margin-bottom:12px;background:#eef4ff;">
                <strong>Keputusan: ${esc(res.decision)}</strong>
                <p style="margin:4px 0;">${esc(res.handoff?.note || "")}</p>
              </div>
              <div class="dynamic-form">
                <label class="field"><span>Credit Limit</span><input readonly value="${formatMoney(res.credit_evaluation?.credit_limit)}"></label>
                <label class="field"><span>Outstanding Piutang</span><input readonly value="${formatMoney(res.credit_evaluation?.outstanding_receivable)}"></label>
                <label class="field"><span>Overdue Piutang</span><input readonly value="${formatMoney(res.credit_evaluation?.overdue_amount)}"></label>
                <label class="field"><span>Credit Status</span><input readonly value="${esc(res.credit_evaluation?.credit_status)}"></label>
              </div>
            `,
            `<button class="button secondary" onclick="document.getElementById('modalClose').click()">Tutup</button>${!isSafe ? `<button class="button primary" id="btnOverrideModal" data-id="${id}">👑 Executive Override</button>` : ""}`
          );
          document.getElementById("btnOverrideModal")?.addEventListener("click", async () => {
            await executiveOverrideCredit(id);
            Modal.close();
            toast("Override Sukses", "Pengecualian limit kredit disetujui.", "success");
            await loadCRMData();
            renderCRMPage();
          });
          await loadCRMData();
          renderCRMPage();
          return;
        }

        if (act === "check-ticket") {
          const res = await checkTicketWarrantyStatus(id);
          const w = res.warranty_check || {};
          Modal.open(
            "Status Tiket & Garansi",
            `Tiket: ${esc(res.current_status || "OPEN")}`,
            `
              <div class="prototype-banner ${w.is_warranty_active ? "project-banner" : "warning"}" style="padding:12px;border-radius:8px;margin-bottom:12px;background:#eef4ff;">
                <strong>Status Garansi: ${esc(w.status_label || "AKTIF")}</strong>
                <p style="margin:4px 0;">Batas Garansi: <b>${esc(w.guarantee_end_date || "-")}</b>. Rekomendasi: ${esc(w.recommended_action || "Deliver Solution")}</p>
              </div>
            `,
            `<button class="button secondary" onclick="document.getElementById('modalClose').click()">Tutup</button>`
          );
          return;
        }

        if (act === "edit-credit-limit") {
          openCreditLimitModal(id, d);
          return;
        }

        if (act === "recalc-credit") {
          await calculateCreditSnapshot(id);
          toast("Snapshot Diperbarui", "Evaluasi plafon kredit customer berhasil dihitung ulang.", "success");
          await loadCRMData();
          renderCRMPage({ params: { tab: "deals" } });
          return;
        }

        if (act === "add-requirement") {
          openAddRequirementModal(id, d);
          return;
        }

        if (act === "add-cost-line") {
          openAddCostLineModal(id, d);
          return;
        }

        if (act === "delete-inquiry") {
          if (!confirm("Hapus customer inquiry ini?")) return;
          await deleteCustomerInquiry(id);
          toast("Inquiry Dihapus", "Data inquiry berhasil dihapus.", "info");
          await loadCRMData();
          renderCRMPage();
          return;
        }

        if (act === "delete-opportunity") {
          if (!confirm("Hapus opportunity ini?")) return;
          await deleteOpportunity(id);
          toast("Opportunity Dihapus", "Data opportunity berhasil dihapus.", "info");
          await loadCRMData();
          renderCRMPage();
          return;
        }

        if (act === "delete-estimate") {
          if (!confirm("Hapus estimasi HPP ini?")) return;
          await deleteCostEstimate(id);
          toast("Estimasi Dihapus", "Data kalkulasi HPP berhasil dihapus.", "info");
          await loadCRMData();
          renderCRMPage();
          return;
        }

        if (act === "delete-ticket") {
          if (!confirm("Hapus tiket support ini?")) return;
          await deleteSupportTicket(id);
          toast("Tiket Dihapus", "Data tiket berhasil dihapus.", "info");
          await loadCRMData();
          renderCRMPage();
          return;
        }

        toast("CRM Berhasil", `Aksi ${act} sukses dijalankan.`, "success");
        await loadCRMData();
        renderCRMPage();
      } catch (err) {
        toast("Aksi CRM Gagal", err.message, "error");
      } finally {
        btn.disabled = false;
      }
    });
  });

  const d = state.crm.data || {};
  document.getElementById("btnNewInquiry")?.addEventListener("click", () => openNewInquiryModal(d));
  document.getElementById("btnNewOpportunity")?.addEventListener("click", () => openNewOpportunityModal(d));
  document.getElementById("btnNewEstimate")?.addEventListener("click", () => openNewEstimateModal(d));
  document.getElementById("btnNewTicket")?.addEventListener("click", () => openNewTicketModal(d));
}

function openAddRequirementModal(inquiryId, d) {
  const products = d.products || [];
  const inq = (d.inquiries || []).find(i => String(i.id) === String(inquiryId));
  Modal.open(
    "Tambah Spesifikasi Kebutuhan",
    `Inquiry: ${esc(inq?.subject || `ID ${String(inquiryId).slice(0, 8)}`)}`,
    `
      <form id="formAddReq" class="dynamic-form stack" style="display:grid;gap:12px;">
        <label>
          <span class="form-label">Pilih Produk / Layanan Terdaftar</span>
          <select id="reqProduct">
            <option value="">-- Custom / Non-Katalog --</option>
            ${products.map(p => `<option value="${attr(p.id)}">${esc(p.product_name)} (${esc(p.product_code || "-")})</option>`).join("")}
          </select>
        </label>
        <label>
          <span class="form-label">Deskripsi Spesifikasi *</span>
          <input type="text" id="reqDescription" placeholder="Contoh: Modul Controller PLC Siemens S7-1200" required>
        </label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <label>
            <span class="form-label">Jumlah / Qty *</span>
            <input type="number" id="reqQuantity" value="1" min="1" required>
          </label>
          <label>
            <span class="form-label">Target Harga Satuan (Rp)</span>
            <input type="number" id="reqPrice" placeholder="0" min="0">
          </label>
        </div>
      </form>
    `,
    `
      <button class="button secondary" onclick="document.getElementById('modalClose').click()">Batal</button>
      <button type="button" id="btnSubmitReqModal" class="button primary" style="background:#7746e8;">Simpan Spesifikasi</button>
    `
  );

  document.getElementById("reqProduct")?.addEventListener("change", e => {
    const sel = products.find(p => String(p.id) === String(e.target.value));
    if (sel) {
      const descInput = document.getElementById("reqDescription");
      if (descInput && !descInput.value) descInput.value = sel.product_name || "";
    }
  });

  document.getElementById("btnSubmitReqModal")?.addEventListener("click", async () => {
    const product = document.getElementById("reqProduct")?.value || null;
    const description = document.getElementById("reqDescription")?.value.trim();
    const quantity = parseFloat(document.getElementById("reqQuantity")?.value) || 1;
    const target_unit_price = parseFloat(document.getElementById("reqPrice")?.value) || 0;

    if (!description) {
      toast("Input Belum Lengkap", "Deskripsi spesifikasi wajib diisi.", "error");
      return;
    }

    try {
      const btn = document.getElementById("btnSubmitReqModal");
      if (btn) { btn.disabled = true; btn.textContent = "Menyimpan..."; }
      await createInquiryRequirement({
        inquiry: inquiryId,
        product,
        description,
        quantity,
        target_unit_price,
      });
      Modal.close();
      toast("Spesifikasi Ditambahkan", "Item kebutuhan berhasil dilampirkan pada inquiry.", "success");
      await loadCRMData();
      renderCRMPage({ params: { tab: "incoming" } });
    } catch (err) {
      toast("Gagal Menyimpan Spesifikasi", err.message, "error");
      const btn = document.getElementById("btnSubmitReqModal");
      if (btn) { btn.disabled = false; btn.textContent = "Simpan Spesifikasi"; }
    }
  });
}

function openAddCostLineModal(estimateId, d) {
  const est = (d.estimates || []).find(e => String(e.id) === String(estimateId));
  Modal.open(
    "Tambah Rincian Komponen Biaya (Cost Line)",
    `Cost Estimate: ${esc(est?.estimate_number || `ID ${String(estimateId).slice(0, 8)}`)}`,
    `
      <form id="formAddCostLine" class="dynamic-form stack" style="display:grid;gap:12px;">
        <label>
          <span class="form-label">Elemen / Kategori Biaya *</span>
          <select id="clElement">
            <option value="MATERIAL">MATERIAL (Bahan Baku & Komponen Mesin)</option>
            <option value="LABOR">LABOR (Jasa Teknisi / Engineering Man-Hours)</option>
            <option value="SUBCON">SUBCONTRACTOR (Pihak Ketiga / Fabrikasi)</option>
            <option value="EQUIPMENT">EQUIPMENT (Sewa Alat / Mesin Khusus)</option>
            <option value="OVERHEAD">OVERHEAD (Biaya Operasional & QC)</option>
          </select>
        </label>
        <label>
          <span class="form-label">Deskripsi Komponen *</span>
          <input type="text" id="clDesc" placeholder="Contoh: Sensor Optik Industri Keyence" required>
        </label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <label>
            <span class="form-label">Kuantitas / Qty *</span>
            <input type="number" id="clQty" value="1" min="1" required>
          </label>
          <label>
            <span class="form-label">Harga Satuan / Unit Cost (Rp) *</span>
            <input type="number" id="clUnitCost" placeholder="15000000" min="0" required>
          </label>
        </div>
      </form>
    `,
    `
      <button class="button secondary" onclick="document.getElementById('modalClose').click()">Batal</button>
      <button type="button" id="btnSubmitCostLineModal" class="button primary" style="background:#7746e8;">Simpan Cost Line</button>
    `
  );

  document.getElementById("btnSubmitCostLineModal")?.addEventListener("click", async () => {
    const cost_element = document.getElementById("clElement")?.value || "MATERIAL";
    const description = document.getElementById("clDesc")?.value.trim();
    const quantity = parseFloat(document.getElementById("clQty")?.value) || 1;
    const unit_cost = parseFloat(document.getElementById("clUnitCost")?.value) || 0;

    if (!description || !unit_cost) {
      toast("Input Belum Lengkap", "Deskripsi dan Harga Satuan wajib diisi.", "error");
      return;
    }

    try {
      const btn = document.getElementById("btnSubmitCostLineModal");
      if (btn) { btn.disabled = true; btn.textContent = "Menyimpan..."; }
      await createCostEstimateLine({
        estimate: estimateId,
        cost_element,
        description,
        quantity,
        unit_cost,
      });
      Modal.close();
      toast("Cost Line Ditambahkan", "Komponen biaya berhasil disimpan dan siap dikalkulasi.", "success");
      await loadCRMData();
      renderCRMPage({ params: { tab: "estimate" } });
    } catch (err) {
      toast("Gagal Menyimpan Cost Line", err.message, "error");
      const btn = document.getElementById("btnSubmitCostLineModal");
      if (btn) { btn.disabled = false; btn.textContent = "Simpan Cost Line"; }
    }
  });
}

function openCreditLimitModal(partyId, d) {
  const party = (d.parties || []).find(p => String(p.id) === String(partyId));
  const snap = (d.credit || []).find(c => String(c.customer_party) === String(partyId));
  const currentLimit = snap ? snap.credit_limit : 0;
  const custName = party?.display_name || party?.legal_name || "Customer";

  Modal.open(
    "Pengaturan Plafon Kredit Customer (Credit Limit)",
    `Customer: ${esc(custName)}`,
    `
      <form id="formCreditLimit" class="dynamic-form stack" style="display:grid;gap:12px;">
        <div style="padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--soft);">
          <div style="font-size:12px;color:var(--muted);">Status Evaluasi Piutang Saat Ini:</div>
          <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:12px;">
            <span>Outstanding AR: <b>${formatMoney(snap?.outstanding_receivable || 0)}</b></span>
            <span>Overdue: <b style="color:var(--danger);">${formatMoney(snap?.overdue_amount || 0)}</b></span>
            ${statusBadge(snap?.credit_status || "AVAILABLE")}
          </div>
        </div>

        <label>
          <span class="form-label">Plafon Kredit Maksimum (Credit Limit Rp) *</span>
          <input type="number" id="clLimitVal" value="${currentLimit}" placeholder="500000000" min="0" required>
          <small style="color:var(--muted);font-size:11px;">Batas maksimal saldo piutang transaksi kredit yang diizinkan untuk customer ini.</small>
        </label>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <label>
            <span class="form-label">Kategori Profil Risiko</span>
            <select id="clRiskCat">
              <option value="LOW" ${snap?.risk_category === "LOW" ? "selected" : ""}>LOW (Risiko Rendah / Lancar)</option>
              <option value="MEDIUM" ${snap?.risk_category === "MEDIUM" ? "selected" : ""}>MEDIUM (Risiko Sedang / Perhatian)</option>
              <option value="HIGH" ${snap?.risk_category === "HIGH" ? "selected" : ""}>HIGH (Risiko Tinggi / Ketat)</option>
            </select>
          </label>
          <label>
            <span class="form-label">Credit Hold Status</span>
            <select id="clHold">
              <option value="0" ${snap?.credit_status !== "HOLD" ? "selected" : ""}>NORMAL (Transaksi Diizinkan)</option>
              <option value="1" ${snap?.credit_status === "HOLD" ? "selected" : ""}>HOLD (Dibekukan / Stop Kredit)</option>
            </select>
          </label>
        </div>
      </form>
    `,
    `
      <button class="button secondary" onclick="document.getElementById('modalClose').click()">Batal</button>
      <button type="button" id="btnSaveCreditLimitModal" class="button primary" style="background:#7746e8;">Simpan Plafon Kredit</button>
    `
  );

  document.getElementById("btnSaveCreditLimitModal")?.addEventListener("click", async () => {
    const credit_limit = parseFloat(document.getElementById("clLimitVal")?.value);
    const risk_category = document.getElementById("clRiskCat")?.value || "LOW";
    const credit_hold = document.getElementById("clHold")?.value === "1";

    if (isNaN(credit_limit) || credit_limit < 0) {
      toast("Input Belum Valid", "Nominal Plafon Kredit wajib diisi angka >= 0.", "error");
      return;
    }

    try {
      const btn = document.getElementById("btnSaveCreditLimitModal");
      if (btn) { btn.disabled = true; btn.textContent = "Menyimpan..."; }
      await updateCustomerCreditLimit({
        party_id: partyId,
        credit_limit,
        risk_category,
        credit_hold,
      });
      Modal.close();
      toast("Credit Limit Diperbarui", `Plafon kredit ${custName} berhasil diatur menjadi ${formatMoney(credit_limit)}.`, "success");
      await loadCRMData();
      renderCRMPage({ params: { tab: "deals" } });
    } catch (err) {
      toast("Gagal Menyimpan Credit Limit", err.message, "error");
      const btn = document.getElementById("btnSaveCreditLimitModal");
      if (btn) { btn.disabled = false; btn.textContent = "Simpan Plafon Kredit"; }
    }
  });
}

function openNewInquiryModal(d) {
  const parties = d.parties || [];
  Modal.open(
    "Inquiry Baru",
    "Pencatatan Permintaan Customer (Incoming Inquiry)",
    `
      <form id="formNewInquiry" class="dynamic-form stack" style="display:grid;gap:12px;">
        <label>
          <span class="form-label">Subject / Judul Kebutuhan *</span>
          <input type="text" id="inqSubject" placeholder="Contoh: Pengadaan Mesin Packaging Otomatis" required>
        </label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <label>
            <span class="form-label">Pilih Rekanan Terdaftar</span>
            <select id="inqParty">
              <option value="">-- Non-Member / Calon Customer --</option>
              ${parties.map(p => `<option value="${attr(p.id)}">${esc(p.display_name || p.legal_name)}</option>`).join("")}
            </select>
          </label>
          <label>
            <span class="form-label">Nama Perusahaan / Kontak *</span>
            <input type="text" id="inqCustomerName" placeholder="PT ABC Indonesia" required>
          </label>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <label>
            <span class="form-label">Email Customer</span>
            <input type="email" id="inqCustomerEmail" placeholder="procurement@client.com">
          </label>
          <label>
            <span class="form-label">Target Pengiriman (Expected Delivery)</span>
            <input type="date" id="inqDeliveryDate">
          </label>
        </div>
        <label>
          <span class="form-label">Deskripsi Spesifikasi & Kebutuhan</span>
          <textarea id="inqDescription" rows="3" placeholder="Rincian teknis, kapasitas, dan spesifikasi unit yang diminta..."></textarea>
        </label>
      </form>
    `,
    `
      <button class="button secondary" onclick="document.getElementById('modalClose').click()">Batal</button>
      <button type="button" id="btnSubmitInquiryModal" class="button primary" style="background:#7746e8;">Simpan Inquiry Baru</button>
    `
  );

  document.getElementById("inqParty")?.addEventListener("change", e => {
    const sel = parties.find(p => String(p.id) === String(e.target.value));
    if (sel) {
      const nameInput = document.getElementById("inqCustomerName");
      const emailInput = document.getElementById("inqCustomerEmail");
      if (nameInput) nameInput.value = sel.display_name || sel.legal_name || "";
      if (emailInput && sel.email) emailInput.value = sel.email;
    }
  });

  document.getElementById("btnSubmitInquiryModal")?.addEventListener("click", async () => {
    const subject = document.getElementById("inqSubject")?.value.trim();
    const customer_name = document.getElementById("inqCustomerName")?.value.trim();
    const customer_email = document.getElementById("inqCustomerEmail")?.value.trim();
    const customer_party = document.getElementById("inqParty")?.value || null;
    const expected_delivery_date = document.getElementById("inqDeliveryDate")?.value || null;
    const description = document.getElementById("inqDescription")?.value.trim();

    if (!subject || !customer_name) {
      toast("Input Belum Lengkap", "Subject dan Nama Customer wajib diisi.", "error");
      return;
    }

    try {
      const btn = document.getElementById("btnSubmitInquiryModal");
      if (btn) { btn.disabled = true; btn.textContent = "Menyimpan..."; }
      await createCustomerInquiry({
        subject,
        customer_name,
        customer_email,
        customer_party,
        expected_delivery_date,
        description,
      });
      Modal.close();
      toast("Inquiry Berhasil Dibuat", `Permintaan "${subject}" berhasil disimpan ke sistem.`, "success");
      await loadCRMData();
      renderCRMPage({ params: { tab: "incoming" } });
    } catch (err) {
      toast("Gagal Menyimpan Inquiry", err.message, "error");
      const btn = document.getElementById("btnSubmitInquiryModal");
      if (btn) { btn.disabled = false; btn.textContent = "Simpan Inquiry Baru"; }
    }
  });
}

function openNewOpportunityModal(d) {
  const parties = d.parties || [];
  Modal.open(
    "Opportunity Baru",
    "Pencatatan Pipeline Deal Baru",
    `
      <form id="formNewOpp" class="dynamic-form stack" style="display:grid;gap:12px;">
        <label>
          <span class="form-label">Nama Proyek / Opportunity *</span>
          <input type="text" id="oppName" placeholder="Contoh: Otomasi Line 2 PT Maju Jaya" required>
        </label>
        <label>
          <span class="form-label">Rekanan Customer *</span>
          <select id="oppParty">
            <option value="">-- Pilih Customer --</option>
            ${parties.map(p => `<option value="${attr(p.id)}">${esc(p.display_name || p.legal_name)}</option>`).join("")}
          </select>
        </label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <label>
            <span class="form-label">Estimasi Nilai Deal (Rp) *</span>
            <input type="number" id="oppAmount" placeholder="500000000" min="0" required>
          </label>
          <label>
            <span class="form-label">Target Margin (Rp)</span>
            <input type="number" id="oppMargin" placeholder="150000000" min="0">
          </label>
        </div>
      </form>
    `,
    `
      <button class="button secondary" onclick="document.getElementById('modalClose').click()">Batal</button>
      <button type="button" id="btnSubmitOppModal" class="button primary" style="background:#7746e8;">Simpan Opportunity</button>
    `
  );

  document.getElementById("btnSubmitOppModal")?.addEventListener("click", async () => {
    const opportunity_name = document.getElementById("oppName")?.value.trim();
    const customer_party = document.getElementById("oppParty")?.value || null;
    const expected_amount = parseFloat(document.getElementById("oppAmount")?.value) || 0;
    const expected_margin = parseFloat(document.getElementById("oppMargin")?.value) || 0;

    if (!opportunity_name || !customer_party || !expected_amount) {
      toast("Input Belum Lengkap", "Nama Opportunity, Customer, dan Nilai Deal wajib diisi.", "error");
      return;
    }

    try {
      const btn = document.getElementById("btnSubmitOppModal");
      if (btn) { btn.disabled = true; btn.textContent = "Menyimpan..."; }
      await createOpportunity({
        opportunity_name,
        customer_party,
        expected_amount,
        expected_margin,
      });
      Modal.close();
      toast("Opportunity Berhasil", `Pipeline "${opportunity_name}" berhasil didaftarkan.`, "success");
      await loadCRMData();
      renderCRMPage({ params: { tab: "deals" } });
    } catch (err) {
      toast("Gagal Menyimpan Opportunity", err.message, "error");
      const btn = document.getElementById("btnSubmitOppModal");
      if (btn) { btn.disabled = false; btn.textContent = "Simpan Opportunity"; }
    }
  });
}

function openNewEstimateModal(d) {
  const opps = d.opportunities || [];
  Modal.open(
    "Kalkulasi Estimasi HPP",
    "Penyusunan Cost Estimate & Target Penawaran",
    `
      <form id="formNewEst" class="dynamic-form stack" style="display:grid;gap:12px;">
        <label>
          <span class="form-label">Tautkan ke Opportunity *</span>
          <select id="estOpp">
            <option value="">-- Pilih Opportunity --</option>
            ${opps.map(o => `<option value="${attr(o.id)}">${esc(o.opportunity_name || `Opportunity ${String(o.id).slice(0, 8)}`)}</option>`).join("")}
          </select>
        </label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <label>
            <span class="form-label">Biaya Langsung Material & Vendor (Rp) *</span>
            <input type="number" id="estDirect" placeholder="250000000" min="0" required>
          </label>
          <label>
            <span class="form-label">Biaya Tenaga Kerja & Overhead (Rp) *</span>
            <input type="number" id="estOverhead" placeholder="50000000" min="0" required>
          </label>
        </div>
        <label>
          <span class="form-label">Markup Margin (%)</span>
          <input type="number" id="estMarkup" placeholder="30" value="30" min="0">
        </label>
      </form>
    `,
    `
      <button class="button secondary" onclick="document.getElementById('modalClose').click()">Batal</button>
      <button type="button" id="btnSubmitEstModal" class="button primary" style="background:#7746e8;">Kalkulasi & Simpan HPP</button>
    `
  );

  document.getElementById("btnSubmitEstModal")?.addEventListener("click", async () => {
    const opportunity = document.getElementById("estOpp")?.value || null;
    const direct_cost = parseFloat(document.getElementById("estDirect")?.value) || 0;
    const overhead_cost = parseFloat(document.getElementById("estOverhead")?.value) || 0;
    const markup_percent = parseFloat(document.getElementById("estMarkup")?.value) || 30;
    const total_cost = direct_cost + overhead_cost;
    const offered_amount = total_cost * (1 + markup_percent / 100);

    if (!opportunity || !total_cost) {
      toast("Input Belum Lengkap", "Opportunity dan rincian biaya wajib diisi.", "error");
      return;
    }

    try {
      const btn = document.getElementById("btnSubmitEstModal");
      if (btn) { btn.disabled = true; btn.textContent = "Menghitung..."; }
      await createCostEstimate({
        opportunity,
        direct_cost,
        overhead_cost,
        total_cost,
        markup_percent,
        offered_amount,
      });
      Modal.close();
      toast("Estimasi HPP Tersimpan", `Total HPP ${formatMoney(total_cost)} siap dibuatkan Quotation.`, "success");
      await loadCRMData();
      renderCRMPage({ params: { tab: "estimate" } });
    } catch (err) {
      toast("Gagal Menyimpan Estimasi", err.message, "error");
      const btn = document.getElementById("btnSubmitEstModal");
      if (btn) { btn.disabled = false; btn.textContent = "Kalkulasi & Simpan HPP"; }
    }
  });
}

function openNewTicketModal(d) {
  const parties = d.parties || [];
  Modal.open(
    "Tiket Support & Komplain Baru",
    "Pencatatan Kendala / Klaim Garansi Service",
    `
      <form id="formNewTicket" class="dynamic-form stack" style="display:grid;gap:12px;">
        <label>
          <span class="form-label">Judul Keluhan / Tiket *</span>
          <input type="text" id="tktSubject" placeholder="Contoh: Sensor tidak merespon saat kecepatan tinggi" required>
        </label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <label>
            <span class="form-label">Rekanan Customer *</span>
            <select id="tktParty">
              <option value="">-- Pilih Customer --</option>
              ${parties.map(p => `<option value="${attr(p.id)}">${esc(p.display_name || p.legal_name)}</option>`).join("")}
            </select>
          </label>
          <label>
            <span class="form-label">Prioritas Penanganan</span>
            <select id="tktPriority">
              <option value="NORMAL">Normal</option>
              <option value="HIGH">Tinggi (High SLA)</option>
              <option value="CRITICAL">Kritis (Plant Down)</option>
            </select>
          </label>
        </div>
        <label>
          <span class="form-label">Rincian Masalah & Log Kejadian</span>
          <textarea id="tktDescription" rows="3" placeholder="Jelaskan detail kendala teknis atau klaim garansi yang diajukan..."></textarea>
        </label>
      </form>
    `,
    `
      <button class="button secondary" onclick="document.getElementById('modalClose').click()">Batal</button>
      <button type="button" id="btnSubmitTicketModal" class="button primary" style="background:#7746e8;">Buat Tiket Support</button>
    `
  );

  document.getElementById("btnSubmitTicketModal")?.addEventListener("click", async () => {
    const subject = document.getElementById("tktSubject")?.value.trim();
    const customer_party = document.getElementById("tktParty")?.value || null;
    const priority = document.getElementById("tktPriority")?.value || "NORMAL";
    const description = document.getElementById("tktDescription")?.value.trim();

    if (!subject || !customer_party) {
      toast("Input Belum Lengkap", "Judul Keluhan dan Rekanan Customer wajib diisi.", "error");
      return;
    }

    try {
      const btn = document.getElementById("btnSubmitTicketModal");
      if (btn) { btn.disabled = true; btn.textContent = "Mendaftarkan..."; }
      await createSupportTicket({
        subject,
        customer_party,
        priority,
        description,
      });
      Modal.close();
      toast("Tiket Berhasil Dibuat", `Tiket "${subject}" telah masuk antrean customer support.`, "success");
      await loadCRMData();
      renderCRMPage({ params: { tab: "tickets" } });
    } catch (err) {
      toast("Gagal Mendaftarkan Tiket", err.message, "error");
      const btn = document.getElementById("btnSubmitTicketModal");
      if (btn) { btn.disabled = false; btn.textContent = "Buat Tiket Support"; }
    }
  });
}

// Reactive Data Effect Listeners
eventBus.on("crm:updated", async () => {
  if (state.view === "crm-flow") {
    await loadCRMData();
    renderCRMPage();
  }
});

eventBus.on("company:changed", async () => {
  state.crm.loaded = false;
  if (state.view === "crm-flow") {
    await loadCRMData();
    renderCRMPage();
  }
});
