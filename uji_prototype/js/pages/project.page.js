/**
 * Project Management Workspace Page Controller
 */

import { state } from "../core/state.js";
import { router } from "../core/router.js";
import { setPageHeader } from "../components/topbar.js";
import { esc, attr } from "../utils/dom.js";
import { formatMoney, number, formatDate } from "../utils/formatters.js";
import { statusBadge } from "../components/badge.js";
import { emptyState, loadingState } from "../components/state-views.js";
import { Modal } from "../components/modal.js";
import { toast } from "../components/toast.js";
import { eventBus } from "../core/event-bus.js";
import {
  loadPMBackend,
  loadPMOperationalData,
  loadPMAccountingData,
  advancePMFlow,
  savePMCostEntry,
  savePMBillingProposal,
  recalculateProjectHealth,
  getWeeklyMonitoring,
  createProject,
  createProjectTask,
  createFundingRequest,
  deleteProject,
  deleteProjectTask,
  deleteFundingRequest,
} from "../services/project.service.js";
import { deleteProjectCostEntry, deleteBillingProposal } from "../services/finance.service.js";

export async function renderProjectPage({ params = {} } = {}) {
  setPageHeader("Project Management", "Operational & Execution Workspace");
  const workspace = document.getElementById("workspace");
  if (!workspace) return;

  if (params.id) {
    state.pm.selectedId = params.id;
  }

  if (!state.pm.loaded && !state.pm.loading) {
    loadPMBackend(true)
      .then(() => loadPMOperationalData(true))
      .then(() => loadPMAccountingData(true))
      .then(() => renderProjectPage({ params }))
      .catch(err => console.warn("PM auto-load error:", err));
  }

  if (state.pm.loading && !state.pm.loaded) {
    workspace.innerHTML = loadingState("Memuat data proyek & operational...");
    return;
  }

  const projects = state.pm.projects || [];
  const selectedProj = projects.find(p => String(p.id) === String(state.pm.selectedId)) || projects[0];

  const selectorBarHTML = `
    <div class="content-toolbar" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;background:#fff;padding:12px 16px;border:1px solid var(--line);border-radius:12px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <label style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:12px;">
          <span>Pilih Proyek:</span>
          <select id="pmProjectSelect" style="padding:6px 10px;border-radius:8px;border:1px solid var(--line);font-size:12px;">
            ${projects.map(p => `<option value="${attr(p.id)}" ${selectedProj?.id === p.id ? "selected" : ""}>${esc(p.project_code)} - ${esc(p.project_name)}</option>`).join("")}
          </select>
        </label>
        <button id="btnNewProject" class="button primary small" style="background:#257743;">+ Buat Proyek Baru</button>
      </div>
      <div style="display:flex;gap:6px;">
        <button id="btnRecalcHealth" class="button secondary small" data-id="${attr(selectedProj?.id)}">⚡ Hitung Health Proyek</button>
        <button id="btnReloadPM" class="button ghost small">🔄 Segarkan</button>
        <button id="btnDeleteProject" class="button danger small" style="background:#dc3545;color:#fff;" title="Hapus Proyek Ini">🗑️ Hapus Proyek</button>
      </div>
    </div>
  `;

  if (!selectedProj) {
    workspace.innerHTML = `${selectorBarHTML}${emptyState("Belum ada proyek yang tersedia. Klik '+ Buat Proyek Baru' di atas untuk membuat proyek.")}`;
    bindPMEvents(workspace, null);
    return;
  }

  const heroHTML = `
    <section class="flow-hero" style="border-color:#b9d8c3;background:linear-gradient(145deg,#fff,#f4fbf6);padding:20px;border-radius:18px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <span class="eyebrow" style="color:#257743;">PROJECT: ${esc(selectedProj.project_code)}</span>
          <h2 style="margin:4px 0;">${esc(selectedProj.project_name)}</h2>
          <p style="margin:0;color:var(--muted);">${esc(selectedProj.description || "Tidak ada deskripsi.")}</p>
        </div>
        <div>
          ${statusBadge(selectedProj.status)}
        </div>
      </div>

      <div class="finance-kpis" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:16px;">
        <article class="metric"><span>Progress Fisik</span><strong>${number(selectedProj.progress)}%</strong><small>Berdasarkan task & milestone</small></article>
        <article class="metric"><span>Total Budget</span><strong>${formatMoney(selectedProj.budget)}</strong><small>Anggaran disetujui</small></article>
        <article class="metric"><span>Actual Cost</span><strong>${formatMoney(selectedProj.actual_cost)}</strong><small>Biaya aktual terpakai</small></article>
        <article class="metric"><span>Sisa Budget</span><strong style="color:${selectedProj.budget - selectedProj.actual_cost >= 0 ? "var(--success)" : "var(--danger)"};">${formatMoney(selectedProj.budget - selectedProj.actual_cost)}</strong><small>Variance anggaran</small></article>
      </div>
    </section>
  `;

  const lifecycleHTML = `
    <div class="erp-accounting-diagram" style="padding:16px;border:1px solid #cfd8e6;border-radius:14px;background:#fff;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <strong>Project Lifecycle Flow</strong>
        <button class="button primary small" style="background:#257743;" data-pm-flow="advance" data-id="${attr(selectedProj.id)}">⚡ Majukan Stage Lifecycle</button>
      </div>
      <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:6px;">
        ${[
          ["1", "DRAFT / INTAKE", "Terima PO/Deal", selectedProj.status === "DRAFT"],
          ["2", "VERIFIED", "Kelayakan Order", selectedProj.status === "VERIFIED"],
          ["3", "RESERVED", "Alokasi Material/Gudang", ["RESOURCE_RESERVED", "MATERIAL_RESERVING", "RESERVED"].includes(selectedProj.status)],
          ["4", "ACTIVE / STARTED", "Eksekusi & QA", ["STARTED", "ACTIVE", "IN_PROGRESS"].includes(selectedProj.status)],
          ["5", "CLOSED", "Serah Terima Proyek", selectedProj.status === "CLOSED"],
        ]
          .map(
            ([step, title, sub, isCurrent]) => `
          <div style="min-width:160px;padding:10px;border:2px solid ${isCurrent ? "#257743" : "var(--line)"};border-radius:10px;background:${isCurrent ? "#f4fbf6" : "#fff"};">
            <span style="font-size:10px;font-weight:800;color:${isCurrent ? "#257743" : "var(--muted)"};">STEP ${step}</span>
            <strong style="display:block;font-size:12px;margin-top:2px;">${title}</strong>
            <small style="color:var(--muted);">${sub}</small>
          </div>
        `
          )
          .join("")}
      </div>
    </div>
  `;

  const tabsHTML = `
    <div class="two-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;">
      <section class="panel" style="padding:16px;border:1px solid var(--line);border-radius:14px;background:#fff;">
        <header class="panel-head" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h3 style="margin:0;">Task & WBS List (${(selectedProj.tasks || []).length})</h3>
          <button id="btnNewTask" class="button primary small" style="background:#257743;">+ Tambah Task</button>
        </header>
        <div style="display:grid;gap:8px;max-height:300px;overflow-y:auto;">
          ${(selectedProj.tasks || [])
            .map(
              t => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--soft);">
              <div>
                <strong>${esc(t.task_name || t.name || t.title)}</strong>
                <small style="display:block;color:var(--muted);">${esc(t.description || "-")} · Status: <b>${esc(t.status || "TODO")}</b></small>
              </div>
              <div style="display:flex;gap:6px;align-items:center;">
                ${statusBadge(t.status)}
                <button class="button danger small" data-pm-act="delete-task" data-id="${attr(t.id)}" title="Hapus Task" style="padding:2px 6px;font-size:10px;">🗑️</button>
              </div>
            </div>
          `
            )
            .join("") || emptyState("Belum ada task. Klik '+ Tambah Task' untuk menambahkan.")}
        </div>
      </section>

      <section class="panel" style="padding:16px;border:1px solid var(--line);border-radius:14px;background:#fff;">
        <header class="panel-head" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h3 style="margin:0;">Stage Gates & Milestones (${(selectedProj.milestones || []).length})</h3>
        </header>
        <div style="display:grid;gap:8px;max-height:300px;overflow-y:auto;">
          ${(selectedProj.milestones || [])
            .map(
              m => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--soft);">
              <div>
                <strong>${esc(m.milestone_name || m.name)}</strong>
                <small style="display:block;color:var(--muted);">Target: ${esc(m.target_date || "-")}</small>
              </div>
              ${statusBadge(m.status)}
            </div>
          `
            )
            .join("") || emptyState("Belum ada milestone.")}
        </div>
      </section>
    </div>
  `;

  const costList = selectedProj?.cost_entries || [];
  const fundList = selectedProj?.fundings || [];
  const propList = selectedProj?.billing_proposals || [];

  const handoffHTML = `
    <div class="pm-accounting-workspace" style="margin:16px 0;padding:22px;border:1px solid #b9d8c3;border-radius:18px;background:linear-gradient(145deg,#fff,#f4fbf6);">
      <header style="display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:20px;flex-wrap:wrap;">
        <div>
          <span class="eyebrow" style="color:#257743;">FINANCIAL INTEGRATION & COST HANDOFF</span>
          <h2 style="margin:5px 0;">Daftar Pengajuan Biaya, Dana Proyek & Termin Billing</h2>
          <p style="margin:0;color:var(--muted);font-size:12px;">Monitoring riil biaya aktual lapangan (Cost Entry), pengajuan dana (Funding), dan pengajuan termin invoice (Billing Proposal) ke Finance.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button id="btnSendCostEntry" class="button secondary small">+ Kirim Biaya ke Finance</button>
          <button id="btnNewFundingPM" class="button secondary small" style="background:#edf7ed;border-color:#b9d8c3;color:#257743;">+ Ajukan Dana (Funding)</button>
          <button id="btnCreateProposal" class="button primary small" style="background:#257743;">+ Buat Billing Proposal</button>
        </div>
      </header>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
        <!-- Daftar Biaya Aktual Lapangan -->
        <section style="background:#fff;border:1px solid #d0e7d7;border-radius:12px;padding:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <h4 style="margin:0;color:#257743;">📥 Biaya Aktual Lapangan (Cost Entries)</h4>
            <span class="badge info">${costList.length} Entri</span>
          </div>
          <div class="table-wrap" style="max-height:220px;overflow-y:auto;">
            <table class="data-table small">
              <thead>
                <tr>
                  <th>Deskripsi / Bukti</th>
                  <th>Elemen</th>
                  <th>Jumlah (Rp)</th>
                  <th>Status</th>
                  <th style="text-align:right;">Aksi</th>
                </tr>
              </thead>
              <tbody>
                ${costList.map(c => `
                  <tr>
                    <td><strong>${esc(c.description || "-")}</strong><small style="display:block;color:var(--muted);">${esc(c.source_type || "MANUAL")} · ${formatDate(c.transaction_date)}</small></td>
                    <td><span class="badge ghost">${esc(c.cost_element || "MATERIAL")}</span></td>
                    <td><strong>${formatMoney(c.total_cost || c.amount)}</strong></td>
                    <td>${statusBadge(c.status || "POSTED")}</td>
                    <td style="text-align:right;"><button class="button danger small" data-pm-del-cost="${attr(c.id)}" style="padding:2px 6px;">🗑️</button></td>
                  </tr>
                `).join("") || `<tr><td colspan="5">${emptyState("Belum ada biaya riil yang dikirim ke Finance.")}</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>

        <!-- Daftar Pengajuan Dana Proyek -->
        <section style="background:#fff;border:1px solid #d0e7d7;border-radius:12px;padding:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <h4 style="margin:0;color:#257743;">💰 Pengajuan Dana Proyek (Funding Requests)</h4>
            <span class="badge info">${fundList.length} Pengajuan</span>
          </div>
          <div class="table-wrap" style="max-height:220px;overflow-y:auto;">
            <table class="data-table small">
              <thead>
                <tr>
                  <th>Tujuan Kebutuhan</th>
                  <th>Diajukan</th>
                  <th>Disetujui</th>
                  <th>Status</th>
                  <th style="text-align:right;">Aksi</th>
                </tr>
              </thead>
              <tbody>
                ${fundList.map(f => `
                  <tr>
                    <td><strong>${esc(f.purpose || f.funding_type || "Funding")}</strong></td>
                    <td>${formatMoney(f.requested_amount)}</td>
                    <td><strong>${formatMoney(f.approved_limit)}</strong></td>
                    <td>${statusBadge(f.status || "SUBMITTED")}</td>
                    <td style="text-align:right;"><button class="button danger small" data-pm-del-fund="${attr(f.id)}" style="padding:2px 6px;">🗑️</button></td>
                  </tr>
                `).join("") || `<tr><td colspan="5">${emptyState("Belum ada pengajuan dana proyek.")}</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <!-- Daftar Proposal Termin Penagihan -->
      <section style="background:#fff;border:1px solid #d0e7d7;border-radius:12px;padding:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h4 style="margin:0;color:#257743;">📑 Proposal Termin Penagihan (Billing Proposals)</h4>
          <span class="badge info">${propList.length} Proposal</span>
        </div>
        <div class="table-wrap" style="max-height:220px;overflow-y:auto;">
          <table class="data-table small">
            <thead>
              <tr>
                <th>Pemicu / Trigger</th>
                <th>Deskripsi Termin</th>
                <th>Subtotal (Rp)</th>
                <th>Total Termasuk PPN</th>
                <th>Status</th>
                <th style="text-align:right;">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${propList.map(p => `
                <tr>
                  <td><strong>${esc(p.trigger_type || "PROGRESS_APPROVED")}</strong></td>
                  <td>${esc(p.description || "-")}</td>
                  <td>${formatMoney(p.subtotal_amount || p.amount)}</td>
                  <td><strong style="color:var(--primary);">${formatMoney(p.total_amount || p.subtotal_amount)}</strong></td>
                  <td>${statusBadge(p.status || "SUBMITTED")}</td>
                  <td style="text-align:right;"><button class="button danger small" data-pm-del-prop="${attr(p.id)}" style="padding:2px 6px;">🗑️</button></td>
                </tr>
              `).join("") || `<tr><td colspan="6">${emptyState("Belum ada proposal termin invoice.")}</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;

  workspace.innerHTML = `${selectorBarHTML}${heroHTML}${lifecycleHTML}${tabsHTML}${handoffHTML}`;
  bindPMEvents(workspace, selectedProj);
}

function bindPMEvents(workspace, selectedProj) {
  document.getElementById("pmProjectSelect")?.addEventListener("change", e => {
    state.pm.selectedId = e.target.value;
    router.navigate(`/projects/${e.target.value}`);
  });

  document.getElementById("btnReloadPM")?.addEventListener("click", async () => {
    await loadPMBackend(true);
    await loadPMOperationalData(true);
    renderProjectPage();
    toast("PM Diperbarui", "Data proyek berhasil disinkronkan.", "success");
  });

  document.getElementById("btnNewProject")?.addEventListener("click", () => {
    Modal.open(
      "Buat Proyek Baru",
      "Pendaftaran Proyek Eksekusi",
      `
        <form id="formNewProjectModal" class="dynamic-form stack" style="display:grid;gap:12px;">
          <label>
            <span class="form-label">Nama Proyek *</span>
            <input type="text" id="prjName" placeholder="Contoh: Implementasi Conveyor Line 2" required>
          </label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <label>
              <span class="form-label">Kode Proyek</span>
              <input type="text" id="prjCode" placeholder="PRJ-2026-002">
            </label>
            <label>
              <span class="form-label">Budget Anggaran (Rp) *</span>
              <input type="number" id="prjBudget" placeholder="500000000" min="0" required>
            </label>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <label>
              <span class="form-label">Target Mulai</span>
              <input type="date" id="prjStart" value="${new Date().toISOString().slice(0, 10)}">
            </label>
            <label>
              <span class="form-label">Target Selesai</span>
              <input type="date" id="prjEnd">
            </label>
          </div>
          <label>
            <span class="form-label">Deskripsi Proyek</span>
            <textarea id="prjDesc" rows="3" placeholder="Deskripsi cakupan pekerjaan proyek..."></textarea>
          </label>
        </form>
      `,
      `
        <button class="button secondary" onclick="document.getElementById('modalClose').click()">Batal</button>
        <button type="button" id="btnSubmitProjectModal" class="button primary" style="background:#257743;">Simpan Proyek</button>
      `
    );

    document.getElementById("btnSubmitProjectModal")?.addEventListener("click", async () => {
      const project_name = document.getElementById("prjName")?.value.trim();
      const project_code = document.getElementById("prjCode")?.value.trim() || undefined;
      const budget_amount = parseFloat(document.getElementById("prjBudget")?.value) || 0;
      const planned_start_date = document.getElementById("prjStart")?.value || null;
      const planned_end_date = document.getElementById("prjEnd")?.value || null;
      const description = document.getElementById("prjDesc")?.value.trim();

      if (!project_name || !budget_amount) {
        toast("Input Belum Lengkap", "Nama Proyek dan Budget Anggaran wajib diisi.", "error");
        return;
      }

      try {
        const btn = document.getElementById("btnSubmitProjectModal");
        if (btn) { btn.disabled = true; btn.textContent = "Menyimpan..."; }
        const res = await createProject({
          project_name,
          project_code,
          budget_amount,
          planned_start_date,
          planned_end_date,
          description,
        });
        Modal.close();
        toast("Proyek Berhasil Dibuat", `Proyek "${project_name}" berhasil didaftarkan.`, "success");
        await loadPMBackend(true);
        state.pm.selectedId = res?.id || state.pm.selectedId;
        renderProjectPage();
      } catch (err) {
        toast("Gagal Menyimpan Proyek", err.message, "error");
        const btn = document.getElementById("btnSubmitProjectModal");
        if (btn) { btn.disabled = false; btn.textContent = "Simpan Proyek"; }
      }
    });
  });

  if (!selectedProj) return;

  document.getElementById("btnNewTask")?.addEventListener("click", () => {
    Modal.open(
      "Tambah Task Proyek",
      `Proyek: ${esc(selectedProj.project_code)}`,
      `
        <form id="formNewTaskModal" class="dynamic-form stack" style="display:grid;gap:12px;">
          <label>
            <span class="form-label">Judul Task *</span>
            <input type="text" id="taskTitle" placeholder="Contoh: Pemasangan Motor & Wiring Panel" required>
          </label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <label>
              <span class="form-label">Tanggal Mulai</span>
              <input type="date" id="taskStart" value="${new Date().toISOString().slice(0, 10)}">
            </label>
            <label>
              <span class="form-label">Target Selesai</span>
              <input type="date" id="taskEnd">
            </label>
          </div>
          <label>
            <span class="form-label">Deskripsi Pekerjaan</span>
            <textarea id="taskDesc" rows="2" placeholder="Detail teknis pekerjaan task..."></textarea>
          </label>
        </form>
      `,
      `
        <button class="button secondary" onclick="document.getElementById('modalClose').click()">Batal</button>
        <button type="button" id="btnSubmitTaskModal" class="button primary" style="background:#257743;">Simpan Task</button>
      `
    );

    document.getElementById("btnSubmitTaskModal")?.addEventListener("click", async () => {
      const title = document.getElementById("taskTitle")?.value.trim();
      const planned_start = document.getElementById("taskStart")?.value || null;
      const planned_end = document.getElementById("taskEnd")?.value || null;
      const description = document.getElementById("taskDesc")?.value.trim();

      if (!title) {
        toast("Input Belum Lengkap", "Judul Task wajib diisi.", "error");
        return;
      }

      try {
        const btn = document.getElementById("btnSubmitTaskModal");
        if (btn) { btn.disabled = true; btn.textContent = "Menyimpan..."; }
        await createProjectTask({
          project: selectedProj.id,
          title,
          planned_start,
          planned_end,
          description,
        });
        Modal.close();
        toast("Task Berhasil Dibuat", `Task "${title}" berhasil ditambahkan.`, "success");
        await loadPMBackend(true);
        renderProjectPage();
      } catch (err) {
        toast("Gagal Menyimpan Task", err.message, "error");
        const btn = document.getElementById("btnSubmitTaskModal");
        if (btn) { btn.disabled = false; btn.textContent = "Simpan Task"; }
      }
    });
  });

  document.getElementById("btnRecalcHealth")?.addEventListener("click", async () => {
    try {
      const res = await recalculateProjectHealth(selectedProj.id);
      toast("Health Dihitung", `Skor health: ${res?.health_score || "OK"}`, "success");
      await loadPMBackend(true);
      renderProjectPage();
    } catch (err) {
      toast("Gagal Menghitung Health", err.message, "error");
    }
  });

  document.getElementById("btnDeleteProject")?.addEventListener("click", async () => {
    if (!selectedProj) return;
    if (!confirm(`Hapus proyek "${selectedProj.project_name}" beserta seluruh task-nya?`)) return;
    try {
      await deleteProject(selectedProj.id);
      toast("Proyek Dihapus", "Proyek berhasil dihapus dari sistem.", "info");
      state.pm.selectedId = "";
      await loadPMBackend(true);
      renderProjectPage();
    } catch (err) {
      toast("Gagal Menghapus Proyek", err.message, "error");
    }
  });

  workspace.querySelectorAll("[data-pm-act='delete-task']").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const taskId = btn.dataset.id;
      if (!confirm("Hapus task ini?")) return;
      try {
        await deleteProjectTask(taskId);
        toast("Task Dihapus", "Task berhasil dihapus dari WBS.", "info");
        await loadPMBackend(true);
        renderProjectPage();
      } catch (err) {
        toast("Gagal Menghapus Task", err.message, "error");
      }
    });
  });

  workspace.querySelectorAll("[data-pm-flow]").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        btn.disabled = true;
        const cmd = await advancePMFlow(selectedProj, "advance");
        toast("Lifecycle Diperbarui", `Perintah ${cmd} berhasil dijalankan.`, "success");
        renderProjectPage();
      } catch (err) {
        toast("Lifecycle Gagal", err.message, "error");
      } finally {
        btn.disabled = false;
      }
    });
  });

  document.getElementById("btnSendCostEntry")?.addEventListener("click", () => {
    Modal.open(
      "Kirim Biaya ke Finance",
      `Proyek: ${esc(selectedProj.project_code)}`,
      `
        <form id="formCostHandoff" class="dynamic-form stack" style="display:grid;gap:12px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <label>
              <span class="form-label">Sumber Biaya</span>
              <select name="source_type" id="costSource">
                <option value="WAREHOUSE">Gudang & Material (WAREHOUSE)</option>
                <option value="TIMESHEET">Timesheet & Teknisi (TIMESHEET)</option>
                <option value="VENDOR">Vendor & Subkontraktor (VENDOR)</option>
                <option value="MANUAL">Manual / Kas Proyek</option>
              </select>
            </label>
            <label>
              <span class="form-label">Elemen Biaya</span>
              <select name="cost_element" id="costElement">
                <option value="MATERIAL">Material & Sparepart</option>
                <option value="LABOR">Upah / Tenaga Kerja</option>
                <option value="OVERHEAD">Overhead & Logistik</option>
                <option value="OTHER">Lain-lain</option>
              </select>
            </label>
          </div>
          <label>
            <span class="form-label">Deskripsi Bukti & Transaksi *</span>
            <input type="text" id="costDescription" placeholder="Contoh: Pengambilan 2 unit Motor Servo dan Sensor Optical" required>
          </label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <label>
              <span class="form-label">Tanggal Transaksi</span>
              <input type="date" id="costDate" value="${new Date().toISOString().slice(0, 10)}" required>
            </label>
            <label>
              <span class="form-label">Total Biaya Aktual (Rp) *</span>
              <input type="number" id="costAmount" placeholder="25000000" min="1" required>
            </label>
          </div>
        </form>
      `,
      `
        <button class="button secondary" onclick="document.getElementById('modalClose').click()">Batal</button>
        <button type="button" id="btnSubmitCostModal" class="button primary" style="background:#257743;">Kirim ke Cost Inbox</button>
      `
    );

    document.getElementById("btnSubmitCostModal")?.addEventListener("click", async () => {
      const description = document.getElementById("costDescription")?.value.trim();
      const source_type = document.getElementById("costSource")?.value || "WAREHOUSE";
      const cost_element = document.getElementById("costElement")?.value || "MATERIAL";
      const transaction_date = document.getElementById("costDate")?.value || new Date().toISOString().slice(0, 10);
      const total_cost = parseFloat(document.getElementById("costAmount")?.value) || 0;

      if (!description || !total_cost) {
        toast("Input Belum Lengkap", "Deskripsi dan Total Biaya wajib diisi.", "error");
        return;
      }

      try {
        const btn = document.getElementById("btnSubmitCostModal");
        if (btn) { btn.disabled = true; btn.textContent = "Mengirim..."; }
        await savePMCostEntry({
          project: selectedProj.id,
          description,
          source_type,
          cost_element,
          transaction_date,
          total_cost,
          quantity: 1,
          unit_cost: total_cost,
          status: "POSTED",
        });
        Modal.close();
        toast("Biaya Terkirim", "Biaya masuk ke Cost Inbox Finance sebagai POSTED.", "success");
        await loadPMBackend(true);
        renderProjectPage();
      } catch (err) {
        toast("Gagal Mengirim Biaya", err.message, "error");
        const btn = document.getElementById("btnSubmitCostModal");
        if (btn) { btn.disabled = false; btn.textContent = "Kirim ke Cost Inbox"; }
      }
    });
  });

  document.getElementById("btnCreateProposal")?.addEventListener("click", () => {
    Modal.open(
      "Buat Billing Proposal",
      `Proyek: ${esc(selectedProj.project_code)}`,
      `
        <form id="formProposalHandoff" class="dynamic-form stack" style="display:grid;gap:12px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <label>
              <span class="form-label">Trigger Billing</span>
              <select name="trigger_type" id="propTrigger">
                <option value="PROGRESS_APPROVED">Progress Pekerjaan Disetujui</option>
                <option value="MILESTONE_APPROVED">Milestone Selesai</option>
                <option value="DELIVERY_ACCEPTED">Pengiriman Diterima Klien</option>
                <option value="PROJECT_COMPLETED">Proyek Selesai 100%</option>
              </select>
            </label>
            <label>
              <span class="form-label">Subtotal Nilai Tagihan (Rp) *</span>
              <input type="number" id="propSubtotal" placeholder="100000000" min="1" required>
            </label>
          </div>
          <label>
            <span class="form-label">Keterangan Termin Tagihan *</span>
            <input type="text" id="propDesc" placeholder="Contoh: Penagihan Termin 1 (Progress Selesai 65%)" required>
          </label>
        </form>
      `,
      `
        <button class="button secondary" onclick="document.getElementById('modalClose').click()">Batal</button>
        <button type="button" id="btnSubmitPropModal" class="button primary" style="background:#257743;">Simpan Proposal</button>
      `
    );

    document.getElementById("btnSubmitPropModal")?.addEventListener("click", async () => {
      const subtotal = parseFloat(document.getElementById("propSubtotal")?.value) || 0;
      const description = document.getElementById("propDesc")?.value.trim();
      const trigger_type = document.getElementById("propTrigger")?.value || "PROGRESS_APPROVED";

      if (!subtotal || !description) {
        toast("Input Belum Lengkap", "Subtotal dan Keterangan Termin wajib diisi.", "error");
        return;
      }

      try {
        const btn = document.getElementById("btnSubmitPropModal");
        if (btn) { btn.disabled = true; btn.textContent = "Menyimpan..."; }
        const tax_amount = subtotal * 0.11;
        await savePMBillingProposal({
          project: selectedProj.id,
          trigger_type,
          description,
          subtotal,
          tax_rate: 11,
          tax_amount: tax_amount,
          total_amount: subtotal + tax_amount,
          status: "APPROVED",
        });
        Modal.close();
        toast("Proposal Dibuat", "Proposal termin siap disetujui & diterbitkan invoice oleh Finance.", "success");
        await loadPMBackend(true);
        renderProjectPage();
      } catch (err) {
        toast("Gagal Membuat Proposal", err.message, "error");
        const btn = document.getElementById("btnSubmitPropModal");
        if (btn) { btn.disabled = false; btn.textContent = "Simpan Proposal"; }
      }
    });
  });

  document.getElementById("btnNewFundingPM")?.addEventListener("click", () => {
    Modal.open(
      "Ajukan Dana Proyek (Funding Request)",
      `Proyek: ${esc(selectedProj.project_code)}`,
      `
        <form id="formNewFundingModal" class="dynamic-form stack" style="display:grid;gap:12px;">
          <label>
            <span class="form-label">Tujuan Kebutuhan Dana *</span>
            <input type="text" id="fundPurpose" placeholder="Contoh: Pengadaan Material Kabel & Sparepart Khusus" required>
          </label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <label>
              <span class="form-label">Tipe Funding</span>
              <select id="fundType">
                <option value="PROJECT_CAPEX">Capex Proyek (CAPEX)</option>
                <option value="PROJECT_OPEX">Operasional Lapangan (OPEX)</option>
                <option value="EMERGENCY">Emergency / Darurat</option>
              </select>
            </label>
            <label>
              <span class="form-label">Nilai Dana Diajukan (Rp) *</span>
              <input type="number" id="fundAmount" placeholder="75000000" min="1000" required>
            </label>
          </div>
          <label>
            <span class="form-label">Justifikasi & Keterangan</span>
            <textarea id="fundNotes" rows="2" placeholder="Alasan teknis pengajuan dana..."></textarea>
          </label>
        </form>
      `,
      `
        <button class="button secondary" onclick="document.getElementById('modalClose').click()">Batal</button>
        <button type="button" id="btnSubmitFundingModal" class="button primary" style="background:#257743;">Kirim Pengajuan Dana</button>
      `
    );

    document.getElementById("btnSubmitFundingModal")?.addEventListener("click", async () => {
      const purpose = document.getElementById("fundPurpose")?.value.trim();
      const funding_type = document.getElementById("fundType")?.value || "PROJECT_CAPEX";
      const requested_amount = parseFloat(document.getElementById("fundAmount")?.value) || 0;
      const notes = document.getElementById("fundNotes")?.value.trim();

      if (!purpose || !requested_amount) {
        toast("Input Belum Lengkap", "Tujuan dan Nilai Dana wajib diisi.", "error");
        return;
      }

      try {
        const btn = document.getElementById("btnSubmitFundingModal");
        if (btn) { btn.disabled = true; btn.textContent = "Mengirim..."; }
        await createFundingRequest({
          project: selectedProj.id,
          purpose,
          funding_type,
          requested_amount,
          approved_limit: requested_amount,
          notes,
        });
        Modal.close();
        toast("Funding Diajukan", "Pengajuan dana berhasil dikirim ke Finance untuk diverifikasi/disetujui.", "success");
        await loadPMBackend(true);
        renderProjectPage();
      } catch (err) {
        toast("Gagal Mengajukan Dana", err.message, "error");
        const btn = document.getElementById("btnSubmitFundingModal");
        if (btn) { btn.disabled = false; btn.textContent = "Kirim Pengajuan Dana"; }
      }
    });
  });

  // Delete Handlers for Cost Entries, Fundings, and Proposals
  workspace.querySelectorAll("[data-pm-del-cost]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.pmDelCost;
      if (!confirm("Hapus catatan biaya proyek ini?")) return;
      try {
        await deleteProjectCostEntry(id);
        toast("Biaya Dihapus", "Catatan biaya berhasil dihapus.", "info");
        await loadPMBackend(true);
        renderProjectPage();
      } catch (err) {
        toast("Gagal Menghapus", err.message, "error");
      }
    });
  });

  workspace.querySelectorAll("[data-pm-del-fund]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.pmDelFund;
      if (!confirm("Hapus pengajuan dana ini?")) return;
      try {
        await deleteFundingRequest(id);
        toast("Pengajuan Dihapus", "Data funding request berhasil dihapus.", "info");
        await loadPMBackend(true);
        renderProjectPage();
      } catch (err) {
        toast("Gagal Menghapus", err.message, "error");
      }
    });
  });

  workspace.querySelectorAll("[data-pm-del-prop]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.pmDelProp;
      if (!confirm("Hapus proposal termin billing ini?")) return;
      try {
        await deleteBillingProposal(id);
        toast("Proposal Dihapus", "Proposal billing berhasil dihapus.", "info");
        await loadPMBackend(true);
        renderProjectPage();
      } catch (err) {
        toast("Gagal Menghapus", err.message, "error");
      }
    });
  });
}

// Reactive Data Effect Listeners
eventBus.on("pm:updated", async () => {
  if (state.view === "project-flow") {
    await loadPMBackend(true);
    renderProjectPage();
  }
});

eventBus.on("company:changed", async () => {
  state.pm.loaded = false;
  if (state.view === "project-flow") {
    await loadPMBackend(true);
    renderProjectPage();
  }
});
