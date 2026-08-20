/**
 * Dashboard Page Controller
 */

import { state } from "../core/state.js";
import { router } from "../core/router.js";
import { setPageHeader } from "../components/topbar.js";
import { renderMetricCard, renderStatusRow } from "../components/kpi-card.js";
import { esc, attr } from "../utils/dom.js";

export function renderDashboardPage() {
  setPageHeader("Overview", "Dashboard");
  const workspace = document.getElementById("workspace");
  if (!workspace) return;

  const metricsHTML = `
    <section class="metrics-grid">
      ${renderMetricCard("Modul terdeteksi", state.modules.length, "Grouping tag OpenAPI")}
      ${renderMetricCard("Resource REST", state.resources.length, "Endpoint CRUD /api/v1/")}
      ${renderMetricCard("Operasi API", state.operations.length, "Path dan method")}
      ${renderMetricCard("Request API", state.logs.length, "Log sesi aktif")}
    </section>
  `;

  const moduleCardsHTML = state.modules
    .map(m => `
      <button class="module-card" data-module="${attr(m.name)}">
        <div class="module-card-top">
          <span class="symbol">${esc(m.name[0])}</span>
          <span class="badge info">${m.resources.length} resource</span>
        </div>
        <strong>${esc(m.name)}</strong>
        <p>${m.operations} operasi terdeteksi.</p>
      </button>
    `)
    .join("");

  const statusHTML = `
    <div class="two-grid" style="margin-top:16px;">
      <section class="panel">
        <header class="panel-head">
          <div>
            <h2>Modul API ERP</h2>
            <p>Pilih modul untuk melihat dan menguji resource data.</p>
          </div>
        </header>
        <div class="panel-body module-grid">
          ${moduleCardsHTML}
        </div>
      </section>

      <section class="panel">
        <header class="panel-head">
          <div>
            <h2>Status runtime</h2>
            <p>Informasi koneksi dan status schema.</p>
          </div>
        </header>
        <div class="panel-body status-list">
          ${renderStatusRow("Auth", state.access ? "Bearer token" : "Unauthenticated", state.access ? "success" : "warning")}
          ${renderStatusRow("Source", state.schemaSource, state.schemaSource === "live" ? "success" : "info")}
          ${renderStatusRow("Base URL", state.base, "info")}
          ${renderStatusRow("Company scope", state.company || "X-Company-ID kosong", state.company ? "success" : "warning")}
          ${renderStatusRow("Offline mode", state.offline ? "Aktif" : "Nonaktif", state.offline ? "warning" : "success")}
        </div>
      </section>
    </div>
  `;

  workspace.innerHTML = `${metricsHTML}${statusHTML}`;

  workspace.querySelectorAll("[data-module]").forEach(card => {
    card.addEventListener("click", () => {
      state.module = card.dataset.module;
      state.resource = null;
      router.navigate("/resources");
    });
  });
}
