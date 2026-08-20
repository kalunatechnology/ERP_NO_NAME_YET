/**
 * Settings Page Controller
 */

import { state, setBaseUrl, setCompany, setTokens, clearLogs } from "../core/state.js";
import { setPageHeader } from "../components/topbar.js";
import { esc, attr } from "../utils/dom.js";
import { loadOpenAPISchema } from "../services/schema.service.js";
import { toast } from "../components/toast.js";

export function renderSettingsPage() {
  setPageHeader("Prototype Configuration", "Settings");
  const workspace = document.getElementById("workspace");
  if (!workspace) return;

  workspace.innerHTML = `
    <section class="two-grid">
      <article class="card">
        <h3>API Connection</h3>
        <form id="settingsForm" class="stack" style="display:grid;gap:10px;margin-top:10px;">
          <label class="field"><span>API Base URL</span><input name="base" type="url" value="${attr(state.base)}" required></label>
          <label class="field"><span>X-Company-ID</span><input name="company" value="${attr(state.company)}"></label>
          <button class="button primary">Simpan dan Reload</button>
        </form>
      </article>

      <article class="card">
        <h3>Schema Source</h3>
        <div class="profile" style="display:grid;gap:6px;margin:12px 0;">
          <div style="display:flex;justify-content:space-between;"><span>Source:</span><strong>${esc(state.schemaSource)}</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>OpenAPI:</span><strong>${esc(state.schema?.openapi || "-")}</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>Title:</span><strong>${esc(state.schema?.info?.title || "-")}</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>Version:</span><strong>${esc(state.schema?.info?.version || "-")}</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>Total Operasi:</span><strong>${state.operations.length}</strong></div>
        </div>
        <button id="btnReloadLiveSchema" class="button secondary" style="margin-top:12px;">Reload Live Schema</button>
      </article>

      <article class="card">
        <h3>Local Session</h3>
        <p>Penyimpanan JWT localStorage hanya untuk prototype lokal.</p>
        <div class="profile" style="display:grid;gap:6px;margin:12px 0;">
          <div style="display:flex;justify-content:space-between;"><span>Access Token:</span><strong>${state.access ? "Tersimpan" : "Kosong"}</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>Refresh Token:</span><strong>${state.refresh ? "Tersimpan" : "Kosong"}</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>Request Logs:</span><strong>${state.logs.length}</strong></div>
        </div>
        <button id="btnClearSession" class="button danger" style="margin-top:12px;">Clear Session & Logout</button>
      </article>

      <article class="card">
        <h3>CORS Checklist</h3>
        <pre class="json-view">CORS_ALLOWED_ORIGINS = [
  "http://127.0.0.1:5500",
  "http://localhost:5500",
]

CORS_ALLOW_HEADERS = [
  *default_headers,
  "x-company-id",
]</pre>
      </article>
    </section>
  `;

  document.getElementById("settingsForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    const base = e.target.elements.base.value.trim();
    const comp = e.target.elements.company.value.trim();

    setBaseUrl(base);
    setCompany(comp);

    try {
      await loadOpenAPISchema(true);
      toast("Pengaturan Disimpan", "API Base & Company ID diperbarui.", "success");
      renderSettingsPage();
    } catch (err) {
      toast("Gagal Load Schema", err.message, "error");
    }
  });

  document.getElementById("btnReloadLiveSchema")?.addEventListener("click", async () => {
    try {
      await loadOpenAPISchema(true);
      toast("Schema Diperbarui", "Live OpenAPI schema sukses dimuat.", "success");
      renderSettingsPage();
    } catch (err) {
      toast("Gagal Reload Schema", err.message, "error");
    }
  });

  document.getElementById("btnClearSession")?.addEventListener("click", () => {
    setTokens("", "");
    clearLogs();
    state.user = null;
    toast("Sesi Dihapus", "Seluruh token dibersihkan.", "info");
    window.location.reload();
  });
}
