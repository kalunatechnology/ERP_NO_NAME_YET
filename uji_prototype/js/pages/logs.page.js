/**
 * Request Logs Page Controller
 */

import { state, clearLogs } from "../core/state.js";
import { setPageHeader } from "../components/topbar.js";
import { esc, downloadJSON } from "../utils/dom.js";
import { emptyState } from "../components/state-views.js";
import { Modal } from "../components/modal.js";
import { toast } from "../components/toast.js";

export function renderLogsPage() {
  setPageHeader("Observability", "Request Log");
  const workspace = document.getElementById("workspace");
  if (!workspace) return;

  workspace.innerHTML = `
    <div class="content-toolbar" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <span class="badge info">${state.logs.length} Request API Tercatat</span>
      <div class="toolbar" style="display:flex;gap:8px;">
        <button id="btnExportLogs" class="button secondary small">Export JSON</button>
        <button id="btnClearLogs" class="button danger small">Clear Logs</button>
      </div>
    </div>

    <section class="panel">
      <header class="panel-head">
        <div>
          <h2>Riwayat Request API</h2>
          <p>Password dan token secara otomatis disamarkan.</p>
        </div>
      </header>
      <div class="panel-body">
        ${renderLogList(state.logs)}
      </div>
    </section>
  `;

  document.getElementById("btnClearLogs")?.addEventListener("click", () => {
    clearLogs();
    renderLogsPage();
    toast("Logs Dibersihkan", "Riwayat request dikosongkan.", "info");
  });

  document.getElementById("btnExportLogs")?.addEventListener("click", () => {
    downloadJSON(state.logs, `erp-request-logs-${Date.now()}.json`);
    toast("Logs Diexport", "File JSON berhasil diunduh.", "success");
  });

  workspace.querySelectorAll("[data-log-idx]").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.logIdx);
      const log = state.logs[idx];
      if (!log) return;

      Modal.open(
        "Request Log Detail",
        `${log.method} ${log.path} → ${log.status}`,
        `<pre class="json-view">${esc(JSON.stringify(log, null, 2))}</pre>`,
        `<button class="button secondary" onclick="document.getElementById('modalClose').click()">Tutup</button>`
      );
    });
  });
}

function renderLogList(logs) {
  if (!logs || !logs.length) {
    return emptyState("Belum ada request API yang dicatat.");
  }

  return `
    <div class="log-list">
      ${logs
        .map(
          (l, i) => `
        <button class="log-item" data-log-idx="${i}">
          <span class="method ${String(l.method).toLowerCase()}">${esc(l.method)}</span>
          <div>
            <code>${esc(l.path)}</code>
            <small>${esc(l.timestamp)} · ${l.duration} ms</small>
          </div>
          <strong style="color:${l.ok ? "var(--success)" : "var(--danger)"};">${l.status}</strong>
        </button>
      `
        )
        .join("")}
    </div>
  `;
}
