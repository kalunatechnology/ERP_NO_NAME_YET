/**
 * Unified Project Management Workspace Page Controller
 * Integrates:
 * 1. Project Lifecycle & Stage Gates (Step 1-5)
 * 2. 5-Level Hierarchical Task Management (Project -> Main Task -> Assignment -> Weekly -> Daily)
 * 3. Personal Assignee Workspace
 * 4. Task Transfer Workflow
 * 5. Milestones & Gates
 * 6. Financial Integration (Cost Entries, Project Fundings, Billing Proposals)
 * 7. Real-Time Activity & Audit Logs
 */

import { state } from "../core/state.js";
import { router } from "../core/router.js";
import { setPageHeader } from "../components/topbar.js";
import { esc, attr } from "../utils/dom.js";
import { formatMoney, number, formatDate } from "../utils/formatters.js";
import { statusBadge } from "../components/badge.js";
import { emptyState, loadingState } from "../components/state-views.js";
import { Modal } from "../components/modal.js";
import { modal } from "../components/modal.js";
import { toast } from "../components/toast.js";
import { eventBus } from "../core/event-bus.js";
import { requestJSON } from "../core/http.js";
import {
  projectService,
  loadPMBackend,
  loadPMOperationalData,
  loadPMAccountingData,
  advancePMFlow,
  savePMCostEntry,
  savePMBillingProposal,
  recalculateProjectHealth,
  createProject,
  createFundingRequest,
  deleteProject,
  deleteFundingRequest,
} from "../services/project.service.js";
import { deleteProjectCostEntry, deleteBillingProposal } from "../services/finance.service.js";

export const projectPage = {
  activeProjectId: null,
  activeTab: "TREE", // 'TREE', 'WORKSPACE', 'TRANSFERS', 'MILESTONES', 'FINANCIAL', 'AUDIT'
  currentProject: null,
  projectsList: [],
  transfers: [],
  logs: [],

  async render() {
    return `
      <div class="project-page-container space-y-6" style="padding:4px 0 24px;display:grid;gap:18px;">
        <!-- Top Selector & Action Toolbar -->
        <div id="project-selector-toolbar"></div>

        <!-- Project Hero Banner & Financial KPIs -->
        <div id="project-hero-container"></div>

        <!-- Lifecycle Stage Flow -->
        <div id="project-lifecycle-container"></div>

        <!-- Navigation Tabs -->
        <div style="border-bottom:1px solid #e2e8f0;display:flex;gap:8px;overflow-x:auto;padding-bottom:2px;">
          <button class="tab-btn" data-tab="TREE" style="padding:10px 14px;border:none;background:none;border-bottom:2px solid #4338ca;color:#4338ca;font-weight:700;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap;">
            🌳 Hierarki Task (Full Plan)
          </button>
          <button class="tab-btn" data-tab="WORKSPACE" style="padding:10px 14px;border:none;background:none;border-bottom:2px solid transparent;color:#64748b;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap;">
            👤 Workspace Personal Saya
          </button>
          <button class="tab-btn" data-tab="TRANSFERS" style="padding:10px 14px;border:none;background:none;border-bottom:2px solid transparent;color:#64748b;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;position:relative;white-space:nowrap;">
            🔄 Transfer Requests
            <span id="badge-transfer-count" class="badge danger hidden" style="font-size:10px;padding:1px 6px;margin-left:4px;">0</span>
          </button>
          <button class="tab-btn" data-tab="MILESTONES" style="padding:10px 14px;border:none;background:none;border-bottom:2px solid transparent;color:#64748b;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap;">
            🚩 Milestones & Gates
          </button>
          <button class="tab-btn" data-tab="FINANCIAL" style="padding:10px 14px;border:none;background:none;border-bottom:2px solid transparent;color:#64748b;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap;">
            💰 Biaya, Dana & Billing
          </button>
          <button class="tab-btn" data-tab="AUDIT" style="padding:10px 14px;border:none;background:none;border-bottom:2px solid transparent;color:#64748b;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap;">
            📜 Activity Logs
          </button>
        </div>

        <!-- Tab Content Area -->
        <div id="tab-content" style="min-height:360px;"></div>
      </div>
    `;
  },

  async afterRender() {
    this.bindTabEvents();
    await this.loadInitialData();
  },

  bindTabEvents() {
    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const tab = e.currentTarget.getAttribute("data-tab");
        this.switchTab(tab);
      });
    });
  },

  switchTab(tabKey) {
    this.activeTab = tabKey;
    document.querySelectorAll(".tab-btn").forEach(btn => {
      const active = btn.getAttribute("data-tab") === tabKey;
      btn.style.borderBottomColor = active ? "#4338ca" : "transparent";
      btn.style.color = active ? "#4338ca" : "#64748b";
      btn.style.fontWeight = active ? "700" : "600";
    });
    this.renderTabContent();
  },

  async loadInitialData() {
    try {
      if (!state.pm.loaded && !state.pm.loading) {
        loadPMBackend(true)
          .then(() => loadPMOperationalData(true))
          .then(() => loadPMAccountingData(true))
          .catch(e => console.warn("PM background load:", e));
      }

      const res = await projectService.getProjects();
      this.projectsList = res.results || res.data || (Array.isArray(res) ? res : []);

      if (this.projectsList.length > 0) {
        if (!this.activeProjectId || !this.projectsList.some(p => p.id === this.activeProjectId)) {
          this.activeProjectId = state.pm.selectedId || this.projectsList[0].id;
        }
        await this.loadProjectDetail();
      } else {
        this.renderEmptyState();
      }
    } catch (err) {
      toast.error("Gagal memuat daftar proyek: " + (err.message || "Error"));
    }
  },

  async loadProjectDetail() {
    if (!this.activeProjectId) return;
    try {
      state.pm.selectedId = this.activeProjectId;
      const res = await projectService.getProjectDetail(this.activeProjectId);
      this.currentProject = res.data || res;
      
      this.renderToolbar();
      this.renderHeroBanner();
      this.renderLifecycleFlow();
      await this.renderTabContent();
    } catch (err) {
      toast.error("Gagal memuat detail proyek: " + (err.message || "Error"));
    }
  },

  renderEmptyState() {
    const isPM = this.isCurrentUserPM();
    const toolbar = document.getElementById("project-selector-toolbar");
    if (toolbar) {
      toolbar.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;background:#fff;padding:12px 16px;border:1px solid #e2e8f0;border-radius:12px;">
          <strong>Proyek</strong>
          ${isPM ? `<button id="btn-top-new-proj" class="button primary small" style="background:#4338ca;">+ Buat Proyek Baru</button>` : ""}
        </div>
      `;
      document.getElementById("btn-top-new-proj")?.addEventListener("click", () => this.openCreateProjectModal());
    }

    const tabContent = document.getElementById("tab-content");
    if (tabContent) {
      tabContent.innerHTML = `
        <div style="text-align:center;padding:64px 20px;background:#fff;border-radius:14px;border:1px dashed #cbd5e1;color:#64748b;">
          <div style="font-size:36px;margin-bottom:8px;">🏗️</div>
          <strong style="color:#1e293b;font-size:15px;">Belum Ada Proyek</strong>
          <p style="margin:4px 0 16px;font-size:12px;color:#94a3b8;">${isPM ? "Buat proyek baru untuk memulai eksekusi hierarki, lifecycle, dan anggaran." : "Menunggu Project Manager mendaftarkan proyek baru."}</p>
          ${isPM ? `<button id="btn-empty-create-proj" class="button primary" style="background:#4338ca;">+ Buat Proyek Baru</button>` : ""}
        </div>
      `;
      document.getElementById("btn-empty-create-proj")?.addEventListener("click", () => this.openCreateProjectModal());
    }
  },

  renderToolbar() {
    const container = document.getElementById("project-selector-toolbar");
    if (!container || !this.currentProject) return;

    const isPM = this.isCurrentUserPM();
    container.innerHTML = `
      <div style="background:#fff;padding:14px 20px;border-radius:14px;border:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;box-shadow:0 1px 3px rgba(0,0,0,0.02);">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:#334155;">
            <span>Pilih Proyek:</span>
            <select id="pmProjectSelect" style="border:1px solid #cbd5e1;border-radius:8px;padding:6px 12px;font-size:13px;background:#fff;color:#0f172a;min-width:240px;outline:none;">
              ${this.projectsList.map(p => `
                <option value="${p.id}" ${p.id === this.activeProjectId ? "selected" : ""}>
                  [${p.project_code || p.code || "PRJ"}] ${p.project_name || p.name}
                </option>
              `).join("")}
            </select>
          </label>
          ${isPM ? `
            <button id="btn-top-new-proj" class="button primary small" style="background:#4338ca;border-color:#4338ca;padding:6px 12px;font-size:12px;">
              + Proyek Baru
            </button>
          ` : ""}
        </div>

        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          ${isPM ? `
            <button id="btnRecalcHealth" class="button secondary small" style="font-size:11px;padding:5px 10px;" data-id="${this.activeProjectId}">
              ⚡ Hitung Health
            </button>
          ` : ""}
          <button id="btnReloadPM" class="button ghost small" style="font-size:11px;padding:5px 10px;">
            🔄 Segarkan
          </button>
          ${isPM ? `
            <button id="btnDeleteProject" class="button danger small" style="font-size:11px;padding:5px 10px;" title="Hapus Proyek Ini">
              🗑️ Hapus Proyek
            </button>
          ` : ""}
        </div>
      </div>
    `;

    document.getElementById("pmProjectSelect")?.addEventListener("change", (e) => {
      this.activeProjectId = e.target.value;
      router.navigate(`/projects/${e.target.value}`);
      this.loadProjectDetail();
    });

    document.getElementById("btn-top-new-proj")?.addEventListener("click", () => this.openCreateProjectModal());
    
    document.getElementById("btnReloadPM")?.addEventListener("click", async () => {
      await loadPMBackend(true);
      await loadPMOperationalData(true);
      await this.loadProjectDetail();
      toast.success("Data proyek berhasil disinkronkan.");
    });

    document.getElementById("btnRecalcHealth")?.addEventListener("click", async () => {
      try {
        const res = await recalculateProjectHealth(this.activeProjectId);
        toast.success(`Skor health proyek: ${res?.health_score || "OK"}`);
        await this.loadProjectDetail();
      } catch (err) {
        toast.error("Gagal hitung health: " + (err.message || "Error"));
      }
    });

    document.getElementById("btnDeleteProject")?.addEventListener("click", async () => {
      if (!this.currentProject) return;
      if (!confirm(`Hapus proyek "${this.currentProject.project_name || this.currentProject.name}" beserta seluruh task dan datanya?`)) return;
      try {
        await deleteProject(this.activeProjectId);
        toast.info("Proyek berhasil dihapus.");
        this.activeProjectId = null;
        await this.loadInitialData();
      } catch (err) {
        toast.error("Gagal menghapus proyek: " + (err.message || "Error"));
      }
    });
  },

  renderHeroBanner() {
    const container = document.getElementById("project-hero-container");
    if (!container || !this.currentProject) return;

    const isPM = this.isCurrentUserPM();
    const p = this.currentProject;
    const progress = Math.round(Number(p.progress || p.progress_percent || 0));
    const budget = Number(p.budget || p.budget_amount || 0);
    const actualCost = Number(p.actual_cost || 0);
    const variance = budget - actualCost;

    container.innerHTML = `
      <section class="flow-hero" style="background:linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);color:#fff;padding:22px 24px;border-radius:18px;box-shadow:0 4px 14px rgba(0,0,0,0.06);display:grid;gap:18px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
          <div style="max-width:640px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
              <span style="background:rgba(99,102,241,0.25);color:#c7d2fe;border:1px solid rgba(129,140,248,0.4);font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;font-family:monospace;">
                ${p.project_code || p.code || "PROJ"}
              </span>
              <span style="background:rgba(16,185,129,0.2);color:#6ee7b7;font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;">
                ${p.status || "ACTIVE"}
              </span>
              ${isPM ? `
                <span class="badge" style="background:#4338ca;color:#fff;font-size:10px;padding:2px 8px;">👑 Role: Project Manager</span>
              ` : `
                <span class="badge" style="background:rgba(255,255,255,0.15);color:#e2e8f0;font-size:10px;padding:2px 8px;">👷 Role: Assignee / Member</span>
              `}
            </div>
            <h2 style="font-size:20px;font-weight:800;margin:0 0 6px;color:#fff;">${p.project_name || p.name}</h2>
            <p style="font-size:12px;color:#cbd5e1;margin:0 0 10px;line-height:1.4;">${p.description || "Tidak ada deskripsi proyek."}</p>
            <div style="font-size:11px;color:#94a3b8;display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
              <span>👤 Project Manager: <b>${p.project_manager_name || p.pm_name || "Project Manager"}</b></span>
              <span>📅 Timeline: <b>${p.planned_start_date || p.start_date || "-"}</b> s/d <b>${p.planned_end_date || p.end_date || "-"}</b></span>
            </div>
          </div>

          <div style="min-width:200px;text-align:right;">
            <span style="font-size:11px;color:#94a3b8;display:block;">Agregat Progres Proyek</span>
            <div style="font-size:32px;font-weight:900;color:#818cf8;line-height:1.1;margin:4px 0 6px;">
              ${progress}%
            </div>
            <div style="width:100%;background:rgba(255,255,255,0.15);height:8px;border-radius:4px;overflow:hidden;">
              <div style="width:${progress}%;height:100%;background:#10b981;border-radius:4px;transition:width 0.4s ease;"></div>
            </div>
            ${isPM ? `
              <button id="btn-hero-add-main" class="button small primary" style="margin-top:12px;background:#6366f1;border-color:#6366f1;font-size:11px;padding:5px 10px;">
                + Tambah Main Task (PM)
              </button>
            ` : ""}
          </div>
        </div>

        <!-- 4 Financial & Operational KPIs -->
        <div class="finance-kpis" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;border-top:1px solid rgba(255,255,255,0.1);padding-top:14px;">
          <article class="metric" style="background:rgba(255,255,255,0.06);padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);">
            <span style="font-size:11px;color:#94a3b8;">Progress Fisik Rollup</span>
            <strong style="display:block;font-size:16px;color:#fff;margin-top:2px;">${progress}%</strong>
            <small style="color:#64748b;font-size:10px;">Agregat Main Tasks</small>
          </article>
          <article class="metric" style="background:rgba(255,255,255,0.06);padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);">
            <span style="font-size:11px;color:#94a3b8;">Total Budget Anggaran</span>
            <strong style="display:block;font-size:16px;color:#fff;margin-top:2px;">${formatMoney(budget)}</strong>
            <small style="color:#64748b;font-size:10px;">Anggaran disetujui</small>
          </article>
          <article class="metric" style="background:rgba(255,255,255,0.06);padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);">
            <span style="font-size:11px;color:#94a3b8;">Actual Cost (Biaya Riil)</span>
            <strong style="display:block;font-size:16px;color:#f87171;margin-top:2px;">${formatMoney(actualCost)}</strong>
            <small style="color:#64748b;font-size:10px;">Biaya aktual terpakai</small>
          </article>
          <article class="metric" style="background:rgba(255,255,255,0.06);padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);">
            <span style="font-size:11px;color:#94a3b8;">Sisa Budget (Variance)</span>
            <strong style="display:block;font-size:16px;color:${variance >= 0 ? '#4ade80' : '#f87171'};margin-top:2px;">${formatMoney(variance)}</strong>
            <small style="color:#64748b;font-size:10px;">${variance >= 0 ? "Under Budget" : "Over Budget"}</small>
          </article>
        </div>
      </section>
    `;

    document.getElementById("btn-hero-add-main")?.addEventListener("click", () => this.openCreateMainTaskModal());
  },

  renderLifecycleFlow() {
    const container = document.getElementById("project-lifecycle-container");
    if (!container || !this.currentProject) return;

    const isPM = this.isCurrentUserPM();
    const p = this.currentProject;
    const status = p.status || "DRAFT";

    const stages = [
      ["1", "DRAFT / INTAKE", "Terima PO/Deal", status === "DRAFT"],
      ["2", "VERIFIED", "Kelayakan Order", status === "VERIFIED"],
      ["3", "RESERVED", "Alokasi Material", ["RESOURCE_RESERVED", "MATERIAL_RESERVING", "RESERVED"].includes(status)],
      ["4", "ACTIVE / STARTED", "Eksekusi & QA", ["STARTED", "ACTIVE", "IN_PROGRESS"].includes(status)],
      ["5", "CLOSED", "Serah Terima Proyek", status === "CLOSED"],
    ];

    container.innerHTML = `
      <div class="erp-accounting-diagram" style="padding:16px 20px;border:1px solid #e2e8f0;border-radius:14px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.02);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
          <div>
            <strong style="font-size:13px;color:#0f172a;">Project Lifecycle Stage Flow</strong>
            <p style="margin:2px 0 0;font-size:11px;color:#64748b;">Alur transisi status proyek dari intake hingga serah terima.</p>
          </div>
          ${isPM ? `
            <button class="button primary small" style="background:#257743;border-color:#257743;font-size:11px;padding:4px 10px;" data-pm-flow="advance" data-id="${this.activeProjectId}">
              ⚡ Majukan Stage Lifecycle
            </button>
          ` : ""}
        </div>
        <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;">
          ${stages.map(([step, title, sub, isCurrent]) => `
            <div style="min-width:160px;padding:10px 12px;border:2px solid ${isCurrent ? "#257743" : "#e2e8f0"};border-radius:10px;background:${isCurrent ? "#f4fbf6" : "#f8fafc"};flex:1;">
              <span style="font-size:10px;font-weight:800;color:${isCurrent ? "#257743" : "#94a3b8"};">STEP ${step}</span>
              <strong style="display:block;font-size:12px;margin-top:2px;color:${isCurrent ? "#1e293b" : "#64748b"};">${title}</strong>
              <small style="color:#94a3b8;font-size:10px;">${sub}</small>
            </div>
          `).join("")}
        </div>
      </div>
    `;

    container.querySelector("[data-pm-flow='advance']")?.addEventListener("click", async () => {
      try {
        const cmd = await advancePMFlow(this.currentProject, "advance");
        toast.success(`Lifecycle diperbarui. Perintah ${cmd} berhasil dijalankan.`);
        await this.loadProjectDetail();
      } catch (err) {
        toast.error("Lifecycle gagal: " + (err.message || "Error"));
      }
    });
  },

  async renderTabContent() {
    const container = document.getElementById("tab-content");
    if (!container || !this.currentProject) return;

    if (this.activeTab === "TREE") {
      this.renderHierarchyTree(container);
    } else if (this.activeTab === "WORKSPACE") {
      this.renderPersonalWorkspace(container);
    } else if (this.activeTab === "TRANSFERS") {
      await this.renderTransferPanel(container);
    } else if (this.activeTab === "MILESTONES") {
      this.renderMilestonesPanel(container);
    } else if (this.activeTab === "FINANCIAL") {
      this.renderFinancialPanel(container);
    } else if (this.activeTab === "AUDIT") {
      await this.renderAuditLogs(container);
    }
  },

  // ==========================================
  // TAB 1: FULL HIERARCHICAL TASK TREE (WBS)
  // ==========================================
  renderHierarchyTree(container) {
    const mainTasks = this.currentProject.main_tasks || [];
    const isPM = this.isCurrentUserPM();
    const currentUser = this.getCurrentUser();

    if (mainTasks.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:56px 20px;background:#fff;border-radius:14px;border:1px solid #e2e8f0;color:#64748b;">
          <div style="font-size:36px;margin-bottom:8px;">📋</div>
          <strong style="color:#1e293b;font-size:14px;">Belum ada Main Task pada proyek ini</strong>
          <p style="margin:4px 0 14px;font-size:12px;color:#94a3b8;">${isPM ? "Sebagai Project Manager, buat paket kerja utama pertama untuk didelegasikan ke tim." : "Menunggu Project Manager membuat paket kerja utama."}</p>
          ${isPM ? `<button id="btn-empty-add-main" class="button primary small" style="background:#4338ca;">+ Buat Main Task Pertama</button>` : ""}
        </div>
      `;
      document.getElementById("btn-empty-add-main")?.addEventListener("click", () => this.openCreateMainTaskModal());
      return;
    }

    let html = `
      <div style="display:grid;gap:18px;">
        <div style="background:#f8fafc;padding:12px 16px;border-radius:10px;border:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div style="font-size:12px;color:#475569;">
            <strong>📌 Struktur Wewenang Bertingkat:</strong> 
            <span style="color:#4338ca;font-weight:700;">PM: Main Task & Assignee</span> &rarr; 
            <span style="color:#2563eb;font-weight:700;">Assignee: Target Mingguan</span> &rarr; 
            <span style="color:#059669;font-weight:700;">PIC: Daily Task Harian</span>
          </div>
          <span class="badge info" style="font-size:11px;">${mainTasks.length} Main Tasks</span>
        </div>
    `;

    mainTasks.forEach(main => {
      const isAssigned = this.isAssignedToMain(main);
      const canAddWeekly = isAssigned;
      const progress = Math.round(Number(main.progress || 0));

      html += `
        <div style="background:#fff;border-radius:14px;border:1px solid #cbd5e1;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.03);">
          <!-- Level 1: Main Task Header Row -->
          <div style="background:#f1f5f9;padding:16px 20px;border-bottom:1px solid #cbd5e1;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
            <div>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
                <span style="background:#4338ca;color:#fff;font-weight:800;font-size:10px;padding:3px 8px;border-radius:6px;letter-spacing:0.5px;">LEVEL 1: MAIN TASK</span>
                <span class="badge ${this.getStatusBadgeClass(main.status)}" style="font-size:10px;">${main.status}</span>
                <span style="font-size:11px;color:#475569;">🚩 Prioritas: <b>${main.priority}</b></span>
                <span style="font-size:11px;color:#475569;">⚖️ Bobot: <b>${main.weight}</b></span>
                ${main.is_progress_overridden ? `<span class="badge warning" style="font-size:10px;">⚡ Manual Override</span>` : ""}
              </div>
              <h3 style="margin:0 0 2px;font-size:15px;color:#0f172a;font-weight:800;">${main.name}</h3>
              <p style="margin:0 0 6px;font-size:12px;color:#64748b;">${main.description || "Tidak ada catatan deskripsi teknis."}</p>
              <div style="font-size:11px;color:#64748b;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
                <span>📅 Timeline: <b>${main.start_date || "-"}</b> s/d <b>${main.due_date || "-"}</b></span>
                <span>👥 Assignee PIC: <b>${(main.assignments || []).map(a => a.assignee_name || a.assignee_username || a.assignee).join(", ") || "Belum ditugaskan"}</b></span>
              </div>
            </div>

            <div style="display:flex;align-items:center;gap:14px;">
              <div style="text-align:right;">
                <span style="font-size:10px;color:#64748b;display:block;">Rollup Progres</span>
                <div style="font-size:20px;font-weight:900;color:#1e293b;">${progress}%</div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                ${isPM ? `
                  <button class="btn-assign-member button small secondary" style="font-size:11px;padding:5px 10px;" data-main-id="${main.id}" title="Hanya PM: Delegasikan paket kerja ke anggota tim">
                    + Assignee
                  </button>
                  <button class="btn-delete-main button small ghost" style="color:#e11d48;border-color:#fecdd3;background:#fff1f2;padding:5px 8px;font-size:11px;" data-main-id="${main.id}" data-name="${main.name}" title="Hapus Main Task">
                    🗑️ Hapus
                  </button>
                ` : ""}
                ${canAddWeekly ? `
                  <button class="btn-add-weekly button small primary" style="background:#4338ca;border-color:#4338ca;font-size:11px;padding:5px 10px;" data-main-id="${main.id}" title="Pecah menjadi target mingguan">
                    + Target Mingguan
                  </button>
                ` : `
                  <span style="font-size:10px;color:#64748b;background:#fff;border:1px solid #cbd5e1;padding:4px 8px;border-radius:6px;">🔒 Wewenang Assignee</span>
                `}
              </div>
            </div>
          </div>

          <!-- Level 2 & 3: Weekly Task & Daily Task Container -->
          <div style="padding:16px 20px;background:#f8fafc;display:grid;gap:14px;">
            ${(main.weekly_tasks || []).length === 0 ? `
              <div style="padding:16px;text-align:center;background:#fff;border-radius:10px;border:1px dashed #cbd5e1;color:#64748b;">
                <span style="font-size:20px;display:block;margin-bottom:4px;">🗓️</span>
                <strong style="color:#334155;font-size:12px;">Belum ada target mingguan (Weekly Task)</strong>
                <p style="margin:2px 0 0;font-size:11px;color:#94a3b8;">${canAddWeekly ? "Klik '+ Target Mingguan' di atas untuk memecah Main Task ini." : "Hanya Assignee yang ditugaskan yang dapat memecah Main Task ini."}</p>
              </div>
            ` : (main.weekly_tasks || []).map(weekly => {
              const wkProgress = Math.round(Number(weekly.progress || 0));
              const canAddDaily = this.isWeeklyPIC(weekly, main);
              const canDeleteWeekly = isPM || canAddDaily;

              return `
                <div style="background:#fff;border-radius:12px;border:1.5px solid #cbd5e1;box-shadow:0 1px 3px rgba(0,0,0,0.02);overflow:hidden;">
                  <!-- Level 2: Weekly Task Header -->
                  <div style="background:#eff6ff;padding:12px 16px;border-bottom:1px solid #bfdbfe;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                      <span style="background:#2563eb;color:#fff;font-weight:800;font-size:10px;padding:2px 7px;border-radius:5px;">LEVEL 2: MINGGU #${weekly.week_number}</span>
                      <strong style="font-size:13px;color:#1e3a8a;">${weekly.target_description || "Target Mingguan"}</strong>
                      <span style="font-size:11px;color:#475569;">📅 <b>${weekly.start_date || "-"}</b> s/d <b>${weekly.end_date || "-"}</b></span>
                      <span style="font-size:11px;color:#475569;">(PIC: <b>${weekly.assignee_name || weekly.assignee_username || "Assignee"}</b>)</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                      <span class="badge ${this.getStatusBadgeClass(weekly.status)}" style="font-size:10px;">${weekly.status} (${wkProgress}%)</span>
                      ${canAddDaily ? `
                        <button class="btn-add-daily button small secondary" style="background:#10b981;border-color:#10b981;color:#fff;font-size:11px;padding:3px 9px;font-weight:700;" data-weekly-id="${weekly.id}" title="Pecah target mingguan ini menjadi tugas harian">
                          + Daily Task Harian
                        </button>
                      ` : `
                        <span style="font-size:10px;color:#64748b;font-style:italic;">🔒 PIC: ${weekly.assignee_name || "Assignee"}</span>
                      `}
                      ${canDeleteWeekly ? `
                        <button class="btn-delete-weekly button small ghost" style="color:#e11d48;border-color:#fecdd3;background:#fff;font-size:11px;padding:3px 7px;" data-weekly-id="${weekly.id}" data-title="Minggu #${weekly.week_number}: ${weekly.target_description || 'Target Mingguan'}" title="Hapus Weekly Task">
                          🗑️
                        </button>
                      ` : ""}
                    </div>
                  </div>

                  <!-- Level 3: Structured Daily Tasks Table Breakdown -->
                  <div style="padding:14px 18px;background:#fff;display:grid;gap:10px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                      <div style="font-size:12px;font-weight:800;color:#0f172a;display:flex;align-items:center;gap:6px;">
                        <span>📋</span> DAFTAR AKTIVITAS HARIAN (DAILY LOG) &bull; <span class="badge info" style="font-size:10px;">${(weekly.daily_tasks || []).length} Sesi Aktivitas</span>
                      </div>
                      ${(this.isWeeklyPIC(weekly, main) || isPM) ? `
                        <button class="btn-add-daily button small secondary" style="background:#10b981;border-color:#10b981;color:#fff;font-size:11px;padding:3px 10px;" data-weekly-id="${weekly.id}">
                          + Tambah Aktivitas Harian
                        </button>
                      ` : ""}
                    </div>

                    ${(weekly.daily_tasks || []).length === 0 ? `
                      <div style="text-align:center;padding:24px 16px;background:#f8fafc;border-radius:8px;border:1px dashed #cbd5e1;color:#64748b;font-size:11px;">
                        Belum ada rincian aktivitas harian pada target mingguan ini. Klik <b>+ Tambah Aktivitas Harian</b> untuk mencatat sesi kerja.
                      </div>
                    ` : `
                      <div style="overflow-x:auto;border:1px solid #e2e8f0;border-radius:8px;background:#fff;">
                        <table style="width:100%;border-collapse:collapse;font-size:11.5px;text-align:left;">
                          <thead>
                            <tr style="background:#f8fafc;color:#475569;border-bottom:1.5px solid #cbd5e1;">
                              <th style="padding:9px 12px;font-weight:700;min-width:130px;">Tanggal</th>
                              <th style="padding:9px 12px;font-weight:700;min-width:95px;">Waktu</th>
                              <th style="padding:9px 12px;font-weight:700;min-width:220px;">Input (Aktivitas yang Dikerjakan)</th>
                              <th style="padding:9px 12px;font-weight:700;min-width:200px;">Output (Hasil yang Didapat)</th>
                              <th style="padding:9px 12px;font-weight:700;min-width:110px;">Status</th>
                              <th style="padding:9px 12px;font-weight:700;min-width:150px;">Catatan</th>
                              <th style="padding:9px 12px;font-weight:700;min-width:120px;text-align:right;">Aksi</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${(weekly.daily_tasks || []).map((daily, idx) => {
                              const isOwner = this.isDailyOwner(daily) || this.isWeeklyPIC(weekly, main);
                              const canDeleteDaily = isOwner || isPM;
                              const isBlocked = daily.status === 'BLOCKED' || daily.is_blocked;
                              const isDone = daily.status === 'COMPLETED';

                              return `
                                <tr style="border-bottom:1px solid #f1f5f9;background:${isBlocked ? '#fff1f2' : idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                                  <td style="padding:9px 12px;color:#1e293b;font-weight:600;white-space:nowrap;vertical-align:top;">
                                    ${this.formatIndonesianDate(daily.planned_date)}
                                  </td>
                                  <td style="padding:9px 12px;color:#334155;font-weight:600;white-space:nowrap;vertical-align:top;">
                                    ${daily.time_slot ? `<span class="badge ghost" style="font-size:10px;font-weight:700;">${daily.time_slot}</span>` : `<span style="color:#94a3b8;font-style:italic;">-</span>`}
                                  </td>
                                  <td style="padding:9px 12px;vertical-align:top;">
                                    <strong style="color:${isDone ? '#64748b' : '#0f172a'};text-decoration:${isDone ? 'line-through' : 'none'};display:block;font-size:12px;line-height:1.4;">${daily.title}</strong>
                                    ${daily.description ? `<span style="color:#64748b;font-size:10.5px;display:block;margin-top:2px;">${daily.description}</span>` : ""}
                                    <small style="color:#94a3b8;font-size:10px;display:block;margin-top:3px;">PIC: <b>${daily.owner_name || daily.owner_username || "Member"}</b></small>
                                  </td>
                                  <td style="padding:9px 12px;vertical-align:top;color:#0f172a;">
                                    ${daily.output_result ? `<span style="color:#047857;font-weight:500;display:block;line-height:1.4;">${daily.output_result}</span>` : `<span style="color:#94a3b8;font-style:italic;">-</span>`}
                                  </td>
                                  <td style="padding:9px 12px;vertical-align:top;white-space:nowrap;">
                                    <span class="badge ${this.getStatusBadgeClass(daily.status)}" style="font-size:10.5px;padding:2px 7px;font-weight:700;">
                                      ${this.getStatusLabel(daily.status)}
                                    </span>
                                    <div style="font-size:10px;color:#64748b;font-weight:700;margin-top:3px;">
                                      Progres: ${Math.round(Number(daily.progress || 0))}%
                                    </div>
                                  </td>
                                  <td style="padding:9px 12px;vertical-align:top;font-size:11px;">
                                    ${isBlocked ? `<div style="color:#e11d48;font-weight:700;margin-bottom:3px;">⚠️ ${daily.block_reason || "Terkendala"}</div>` : ""}
                                    ${daily.notes ? `<div style="color:#475569;line-height:1.4;">${daily.notes}</div>` : (!isBlocked ? `<span style="color:#94a3b8;font-style:italic;">-</span>` : "")}
                                  </td>
                                  <td style="padding:9px 12px;text-align:right;white-space:nowrap;vertical-align:top;">
                                    <div style="display:inline-flex;gap:4px;align-items:center;">
                                      ${isOwner ? `
                                        <button class="btn-edit-daily button small ghost" style="padding:2px 6px;font-size:11px;color:#4338ca;font-weight:700;" title="Update Aktivitas & Progres" data-daily-id="${daily.id}" data-task='${JSON.stringify(daily).replace(/'/g, "&apos;")}'>
                                          ✏️ Update
                                        </button>
                                        <button class="btn-transfer-task button small ghost" style="padding:2px 6px;font-size:11px;color:#d97706;" title="Ajukan Alih Tugas" data-daily-id="${daily.id}" data-title="${daily.title}">
                                          🔄
                                        </button>
                                      ` : `<span style="font-size:10px;color:#94a3b8;padding:2px 4px;">👁️ View</span>`}
                                      ${canDeleteDaily ? `
                                        <button class="btn-delete-daily button small ghost" style="color:#e11d48;border-color:#fecdd3;background:#fff;padding:2px 6px;font-size:11px;" data-daily-id="${daily.id}" data-title="${daily.title}" title="Hapus Aktivitas Harian">
                                          🗑️
                                        </button>
                                      ` : ""}
                                    </div>
                                  </td>
                                </tr>
                              `;
                            }).join("")}
                          </tbody>
                        </table>
                      </div>
                    `}
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;
    this.bindHierarchyEvents();
  },

  bindHierarchyEvents() {
    document.querySelectorAll(".btn-assign-member").forEach(btn => {
      btn.addEventListener("click", (e) => this.openAssignMemberModal(e.currentTarget.dataset.mainId));
    });
    document.querySelectorAll(".btn-delete-main").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.dataset.mainId;
        const name = e.currentTarget.dataset.name || "Main Task";
        this.confirmDeleteMainTask(id, name);
      });
    });
    document.querySelectorAll(".btn-add-weekly").forEach(btn => {
      btn.addEventListener("click", (e) => this.openCreateWeeklyTaskModal(e.currentTarget.dataset.mainId));
    });
    document.querySelectorAll(".btn-delete-weekly").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.dataset.weeklyId;
        const title = e.currentTarget.dataset.title || "Weekly Task";
        this.confirmDeleteWeeklyTask(id, title);
      });
    });
    document.querySelectorAll(".btn-add-daily").forEach(btn => {
      btn.addEventListener("click", (e) => this.openCreateDailyTaskModal(e.currentTarget.dataset.weeklyId));
    });
    document.querySelectorAll(".btn-edit-daily").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const taskData = JSON.parse(e.currentTarget.dataset.task.replace(/&apos;/g, "'"));
        this.openEditDailyTaskModal(taskData);
      });
    });
    document.querySelectorAll(".btn-transfer-task").forEach(btn => {
      btn.addEventListener("click", (e) => {
        this.openTransferRequestModal(e.currentTarget.dataset.dailyId, e.currentTarget.dataset.title);
      });
    });
    document.querySelectorAll(".btn-delete-daily").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.dataset.dailyId;
        const title = e.currentTarget.dataset.title || "Daily Task";
        this.confirmDeleteDailyTask(id, title);
      });
    });
  },

  // ==========================================
  // TAB 2: PERSONAL ASSIGNEE WORKSPACE
  // ==========================================
  renderPersonalWorkspace(container) {
    const currentUser = this.getCurrentUser();
    const isPM = this.isCurrentUserPM();
    const mainTasks = this.currentProject.main_tasks || [];

    let myMainTasks = [];
    let myWeeklyTasks = [];
    let myDailyTasks = [];

    mainTasks.forEach(main => {
      const isMainAssigned = this.isAssignedToMain(main);
      if (isMainAssigned) {
        myMainTasks.push(main);
      }

      (main.weekly_tasks || []).forEach(weekly => {
        const isWkAssigned = this.isWeeklyPIC(weekly, main);
        if (isWkAssigned) {
          myWeeklyTasks.push({ ...weekly, mainRef: main });
        }

        (weekly.daily_tasks || []).forEach(daily => {
          const isDailyOwner = this.isDailyOwner(daily) || isWkAssigned;
          if (isDailyOwner) {
            myDailyTasks.push({ ...daily, weeklyRef: weekly, mainRef: main });
          }
        });
      });
    });

    // If logged in as PM and PM is not directly assigned as a field worker
    if (isPM && myMainTasks.length === 0 && myDailyTasks.length === 0) {
      container.innerHTML = `
        <div style="background:#fff;padding:32px 24px;border-radius:14px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.02);text-align:center;">
          <div style="font-size:36px;margin-bottom:8px;">👑</div>
          <h3 style="margin:0 0 6px;font-size:16px;color:#0f172a;font-weight:800;">Mode Project Manager (PM)</h3>
          <p style="margin:0 auto 16px;max-width:540px;font-size:12px;color:#64748b;line-height:1.5;">
            Sebagai Project Manager, wewenang Anda adalah membuat <b>Main Task</b>, menugaskan anggota tim (<b>+ Assignee</b>), serta menyetujui pengalihan tugas di tab <b>Transfer Requests</b>.<br>
            Pemecahan <b>Target Mingguan</b> dan <b>Tugas Harian (Daily Task)</b> merupakan tanggung jawab mandiri dari masing-masing <b>Assignee / Tim Lapangan</b>.
          </p>
          <div style="display:flex;justify-content:center;gap:10px;">
            <button class="button primary small" style="background:#4338ca;" onclick="window.projectPage.switchTab('TREE')">
              🌳 Lihat Pohon Hierarki & Delegasi
            </button>
            <button class="button secondary small" onclick="window.projectPage.switchTab('TRANSFERS')">
              🔄 Tinjau Transfer Requests
            </button>
          </div>
        </div>
      `;
      return;
    }

    const completedDaily = myDailyTasks.filter(d => d.status === "COMPLETED").length;
    const blockedDaily = myDailyTasks.filter(d => d.status === "BLOCKED" || d.is_blocked).length;
    const inProgressDaily = myDailyTasks.filter(d => d.status === "IN_PROGRESS").length;

    container.innerHTML = `
      <div style="display:grid;gap:20px;">
        <!-- Ringkasan Statistik Assignee -->
        <div style="background:#fff;padding:16px 20px;border-radius:14px;border:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;box-shadow:0 1px 3px rgba(0,0,0,0.02);">
          <div>
            <span style="font-size:11px;font-weight:700;color:#4338ca;text-transform:uppercase;letter-spacing:0.5px;">Workspace Personal Assignee</span>
            <h3 style="margin:2px 0 0;font-size:16px;color:#0f172a;font-weight:800;">
              👤 ${currentUser.full_name || currentUser.username || "Project Assignee"}
            </h3>
            <p style="margin:2px 0 0;font-size:12px;color:#64748b;">Kelola paket kerja utama, target mingguan, dan eksekusi tugas harian Anda.</p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <span class="badge info" style="font-size:11px;padding:4px 10px;">📦 ${myMainTasks.length} Main Tasks</span>
            <span class="badge" style="background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;font-size:11px;padding:4px 10px;">✅ ${completedDaily} Selesai</span>
            <span class="badge warning" style="font-size:11px;padding:4px 10px;">⚡ ${inProgressDaily} In Progress</span>
            ${blockedDaily > 0 ? `<span class="badge danger" style="font-size:11px;padding:4px 10px;">⚠️ ${blockedDaily} Terkendala</span>` : ""}
          </div>
        </div>

        <!-- SEKSI 1: MAIN TASKS & TARGET MINGGUAN SAYA -->
        <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.02);display:grid;gap:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #f1f5f9;padding-bottom:10px;">
            <div>
              <h4 style="margin:0;font-size:14px;color:#0f172a;font-weight:800;display:flex;align-items:center;gap:6px;">
                <span>🎯</span> Paket Kerja Utama & Target Mingguan Saya
              </h4>
              <p style="margin:2px 0 0;font-size:11px;color:#64748b;">Pecah paket kerja utama menjadi target mingguan, lalu buat rincian tugas harian.</p>
            </div>
            <span class="badge info" style="font-size:10px;">${myMainTasks.length} Paket Kerja</span>
          </div>

          ${myMainTasks.length > 0 ? `
            <div style="display:grid;gap:14px;">
              ${myMainTasks.map(main => {
                const weeklyList = main.weekly_tasks || [];
                return `
                  <div style="border-radius:12px;background:#f8fafc;border:1.5px solid #e2e8f0;overflow:hidden;">
                    <!-- Main Task Header -->
                    <div style="padding:14px 16px;background:#f1f5f9;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;border-bottom:1px solid #e2e8f0;">
                      <div>
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
                          <span class="badge ${this.getStatusBadgeClass(main.status)}" style="font-size:10px;">${main.status}</span>
                          <strong style="color:#0f172a;font-size:14px;">${main.name}</strong>
                          <span style="font-size:11px;color:#64748b;">(Bobot: <b>${main.weight}</b> &bull; Prioritas: <b>${main.priority}</b>)</span>
                        </div>
                        <p style="margin:0;font-size:11px;color:#64748b;">📅 Timeline: <b>${main.start_date || "-"}</b> s/d <b>${main.due_date || "-"}</b></p>
                      </div>
                      <div style="display:flex;align-items:center;gap:10px;">
                        <div style="text-align:right;">
                          <span style="font-size:14px;font-weight:900;color:#1e293b;">${Math.round(Number(main.progress || 0))}%</span>
                        </div>
                        <button class="btn-add-weekly button small primary" style="background:#4338ca;border-color:#4338ca;font-size:11px;padding:4px 10px;" data-main-id="${main.id}">
                          + Buat Target Mingguan
                        </button>
                      </div>
                    </div>

                    <!-- Nested Weekly Targets under this Main Task -->
                    <div style="padding:12px 16px;display:grid;gap:10px;">
                      ${weeklyList.length === 0 ? `
                        <p style="font-size:11px;color:#94a3b8;font-style:italic;margin:0;">Belum ada target mingguan. Klik tombol '+ Buat Target Mingguan' di atas untuk memecah Main Task ini.</p>
                      ` : weeklyList.map(wk => `
                        <div style="padding:10px 14px;background:#fff;border-radius:8px;border:1px solid #bfdbfe;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                          <div>
                            <span style="background:#2563eb;color:#fff;font-size:10px;font-weight:800;padding:2px 6px;border-radius:4px;">Minggu #${wk.week_number}</span>
                            <strong style="color:#1e3a8a;font-size:12px;margin-left:6px;">${wk.target_description}</strong>
                            <small style="display:block;color:#64748b;font-size:10px;margin-top:2px;">📅 ${wk.start_date || "-"} s/d ${wk.end_date || "-"} &bull; Progres: <b>${Math.round(Number(wk.progress || 0))}%</b></small>
                          </div>
                          <div style="display:flex;align-items:center;gap:6px;">
                            <button class="btn-add-daily button small secondary" style="background:#10b981;border-color:#10b981;color:#fff;font-size:11px;padding:3px 9px;" data-weekly-id="${wk.id}">
                              + Daily Task Harian
                            </button>
                            <button class="btn-delete-weekly button small ghost" style="color:#e11d48;border-color:#fecdd3;background:#fff;font-size:11px;padding:3px 7px;" data-weekly-id="${wk.id}" data-title="Minggu #${wk.week_number}: ${wk.target_description}" title="Hapus Weekly Task">
                              🗑️
                            </button>
                          </div>
                        </div>
                      `).join("")}
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          ` : `
            <p style="font-size:12px;color:#94a3b8;font-style:italic;margin:0;">Belum ada Main Task yang didelegasikan ke Anda oleh Project Manager.</p>
          `}
        </div>

        <!-- SEKSI 2: DAFTAR STRUKTUR AKTIVITAS HARIAN SAYA -->
        <div style="background:#fff;padding:20px;border-radius:14px;border:1px solid #e2e8f0;display:grid;gap:16px;box-shadow:0 1px 3px rgba(0,0,0,0.02);">
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #f1f5f9;padding-bottom:12px;flex-wrap:wrap;gap:10px;">
            <div>
              <h4 style="margin:0;font-size:14px;color:#0f172a;font-weight:800;display:flex;align-items:center;gap:6px;">
                <span>📋</span> Struktur Proyek Harian (Daily Activity & Execution Log) Saya
              </h4>
              <p style="margin:2px 0 0;font-size:11px;color:#64748b;">Pencatatan aktivitas harian berbasis Tanggal, Waktu (Rentang Jam), Input Tugas, Output Capaian, Status, dan Catatan.</p>
            </div>
            <span class="badge info" style="font-size:11px;">Total: ${myDailyTasks.length} Sesi Aktivitas</span>
          </div>

          ${myDailyTasks.length > 0 ? `
            <div style="overflow-x:auto;border:1px solid #e2e8f0;border-radius:10px;background:#fff;">
              <table style="width:100%;border-collapse:collapse;font-size:11.5px;text-align:left;">
                <thead>
                  <tr style="background:#f8fafc;color:#475569;border-bottom:1.5px solid #cbd5e1;">
                    <th style="padding:10px 12px;font-weight:700;min-width:130px;">Tanggal</th>
                    <th style="padding:10px 12px;font-weight:700;min-width:95px;">Waktu</th>
                    <th style="padding:10px 12px;font-weight:700;min-width:240px;">Input (Aktivitas yang Dikerjakan)</th>
                    <th style="padding:10px 12px;font-weight:700;min-width:220px;">Output (Hasil yang Didapat)</th>
                    <th style="padding:10px 12px;font-weight:700;min-width:110px;">Status</th>
                    <th style="padding:10px 12px;font-weight:700;min-width:150px;">Catatan</th>
                    <th style="padding:10px 12px;font-weight:700;min-width:130px;text-align:right;">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  ${myDailyTasks.map((task, idx) => {
                    const dlProgress = Math.round(Number(task.progress || 0));
                    const isBlocked = task.status === 'BLOCKED' || task.is_blocked;
                    const isDone = task.status === 'COMPLETED';

                    return `
                      <tr style="border-bottom:1px solid #f1f5f9;background:${isBlocked ? '#fff1f2' : idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                        <td style="padding:10px 12px;color:#1e293b;font-weight:600;white-space:nowrap;vertical-align:top;">
                          ${this.formatIndonesianDate(task.planned_date)}
                        </td>
                        <td style="padding:10px 12px;color:#334155;font-weight:600;white-space:nowrap;vertical-align:top;">
                          ${task.time_slot ? `<span class="badge ghost" style="font-size:10px;font-weight:700;">${task.time_slot}</span>` : `<span style="color:#94a3b8;font-style:italic;">-</span>`}
                        </td>
                        <td style="padding:10px 12px;vertical-align:top;">
                          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
                            <span class="badge info" style="font-size:9.5px;padding:1px 5px;">Minggu #${task.weeklyRef?.week_number || 1}</span>
                          </div>
                          <strong style="color:${isDone ? '#64748b' : '#0f172a'};text-decoration:${isDone ? 'line-through' : 'none'};display:block;font-size:12px;line-height:1.4;">${task.title}</strong>
                          ${task.description ? `<span style="color:#64748b;font-size:10.5px;display:block;margin-top:2px;">${task.description}</span>` : ""}
                        </td>
                        <td style="padding:10px 12px;vertical-align:top;color:#0f172a;">
                          ${task.output_result ? `<span style="color:#047857;font-weight:500;display:block;line-height:1.4;">${task.output_result}</span>` : `<span style="color:#94a3b8;font-style:italic;">-</span>`}
                        </td>
                        <td style="padding:10px 12px;vertical-align:top;white-space:nowrap;">
                          <span class="badge ${this.getStatusBadgeClass(task.status)}" style="font-size:10.5px;padding:2px 7px;font-weight:700;">
                            ${this.getStatusLabel(task.status)}
                          </span>
                          <div style="display:flex;align-items:center;gap:4px;margin-top:4px;">
                            <span style="font-size:10px;font-weight:800;color:#334155;">${dlProgress}%</span>
                            <div style="width:36px;background:#e2e8f0;height:4px;border-radius:2px;overflow:hidden;">
                              <div style="width:${dlProgress}%;height:100%;background:${dlProgress === 100 ? '#16a34a' : '#4338ca'};"></div>
                            </div>
                          </div>
                        </td>
                        <td style="padding:10px 12px;vertical-align:top;font-size:11px;">
                          ${isBlocked ? `<div style="color:#e11d48;font-weight:700;margin-bottom:2px;">⚠️ ${task.block_reason || "Terkendala"}</div>` : ""}
                          ${task.notes ? `<div style="color:#475569;line-height:1.4;">${task.notes}</div>` : (!isBlocked ? `<span style="color:#94a3b8;font-style:italic;">-</span>` : "")}
                        </td>
                        <td style="padding:10px 12px;text-align:right;white-space:nowrap;vertical-align:top;">
                          <div style="display:inline-flex;gap:4px;align-items:center;">
                            <button class="btn-edit-daily button small primary" style="background:#4338ca;border-color:#4338ca;font-size:11px;padding:3px 8px;" data-daily-id="${task.id}" data-task='${JSON.stringify(task).replace(/'/g, "&apos;")}' title="Update progress / lapor blocked">
                              ✏️ Update
                            </button>
                            <button class="btn-transfer-task button small ghost" style="color:#d97706;font-size:11px;padding:3px 6px;" data-daily-id="${task.id}" data-title="${task.title}" title="Ajukan alih tugas ke rekan lain">
                              🔄
                            </button>
                            <button class="btn-delete-daily button small ghost" style="color:#e11d48;border-color:#fecdd3;background:#fff;padding:3px 6px;font-size:11px;" data-daily-id="${task.id}" data-title="${task.title}" title="Hapus Daily Task">
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join("")}
                </tbody>
              </table>
            </div>
          ` : `
            <div style="text-align:center;padding:36px 20px;background:#f8fafc;border-radius:10px;border:1px dashed #cbd5e1;color:#64748b;">
              <div style="font-size:28px;margin-bottom:6px;">📝</div>
              <strong style="color:#1e293b;font-size:13px;">Belum ada Daily Task harian</strong>
              <p style="margin:4px 0 0;font-size:11px;color:#94a3b8;">Klik tombol <b>+ Daily Task Harian</b> pada target mingguan di atas untuk membuat rincian tugas harian Anda.</p>
            </div>
          `}
        </div>
      </div>
    `;

    this.bindHierarchyEvents();
  },

  // ==========================================
  // CONFIRMATION & DELETION MODALS
  // ==========================================
  confirmDeleteMainTask(mainTaskId, name) {
    modal.open({
      title: "Hapus Main Task (Level 1)",
      eyebrow: "Konfirmasi Penghapusan",
      content: `
        <div style="font-size:13px;color:#334155;display:grid;gap:12px;">
          <p style="margin:0;">Apakah Anda yakin ingin menghapus Main Task <b>"${name}"</b>?</p>
          <div style="background:#fff1f2;color:#e11d48;border:1px solid #fecdd3;padding:10px 12px;border-radius:8px;font-size:11px;">
            ⚠️ <b>Peringatan:</b> Seluruh Target Mingguan (Weekly Tasks) dan Tugas Harian (Daily Tasks) di bawah Main Task ini akan ikut terhapus permanen. Progres proyek akan otomatis dihitung ulang.
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;">
            <button id="btn-cancel-delete" class="button secondary small">Batal</button>
            <button id="btn-confirm-delete-main" class="button danger small" style="background:#e11d48;border-color:#e11d48;color:#fff;">Ya, Hapus Main Task</button>
          </div>
        </div>
      `
    });
    document.getElementById("btn-cancel-delete")?.addEventListener("click", () => modal.close());
    document.getElementById("btn-confirm-delete-main")?.addEventListener("click", async () => {
      try {
        await projectService.deleteMainTask(mainTaskId);
        toast.success("Main Task berhasil dihapus.");
        modal.close();
        await this.loadProjectDetail();
      } catch (err) {
        toast.error(err.message || "Gagal menghapus Main Task");
      }
    });
  },

  confirmDeleteWeeklyTask(weeklyTaskId, title) {
    modal.open({
      title: "Hapus Weekly Task (Level 2)",
      eyebrow: "Konfirmasi Penghapusan",
      content: `
        <div style="font-size:13px;color:#334155;display:grid;gap:12px;">
          <p style="margin:0;">Apakah Anda yakin ingin menghapus target mingguan <b>"${title}"</b>?</p>
          <div style="background:#fff1f2;color:#e11d48;border:1px solid #fecdd3;padding:10px 12px;border-radius:8px;font-size:11px;">
            ⚠️ <b>Peringatan:</b> Seluruh Daily Tasks di bawah target mingguan ini akan ikut terhapus. Progres Main Task dan Proyek akan dihitung ulang secara otomatis.
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;">
            <button id="btn-cancel-delete" class="button secondary small">Batal</button>
            <button id="btn-confirm-delete-weekly" class="button danger small" style="background:#e11d48;border-color:#e11d48;color:#fff;">Ya, Hapus Weekly Task</button>
          </div>
        </div>
      `
    });
    document.getElementById("btn-cancel-delete")?.addEventListener("click", () => modal.close());
    document.getElementById("btn-confirm-delete-weekly")?.addEventListener("click", async () => {
      try {
        await projectService.deleteWeeklyTask(weeklyTaskId);
        toast.success("Weekly Task berhasil dihapus.");
        modal.close();
        await this.loadProjectDetail();
      } catch (err) {
        toast.error(err.message || "Gagal menghapus Weekly Task");
      }
    });
  },

  confirmDeleteDailyTask(dailyTaskId, title) {
    modal.open({
      title: "Hapus Daily Task (Level 3)",
      eyebrow: "Konfirmasi Penghapusan",
      content: `
        <div style="font-size:13px;color:#334155;display:grid;gap:12px;">
          <p style="margin:0;">Apakah Anda yakin ingin menghapus tugas harian <b>"${title}"</b>?</p>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;">
            <button id="btn-cancel-delete" class="button secondary small">Batal</button>
            <button id="btn-confirm-delete-daily" class="button danger small" style="background:#e11d48;border-color:#e11d48;color:#fff;">Ya, Hapus Daily Task</button>
          </div>
        </div>
      `
    });
    document.getElementById("btn-cancel-delete")?.addEventListener("click", () => modal.close());
    document.getElementById("btn-confirm-delete-daily")?.addEventListener("click", async () => {
      try {
        await projectService.deleteDailyTask(dailyTaskId);
        toast.success("Daily Task berhasil dihapus.");
        modal.close();
        await this.loadProjectDetail();
      } catch (err) {
        toast.error(err.message || "Gagal menghapus Daily Task");
      }
    });
  },

  // ==========================================
  // TAB 3: TRANSFER REQUESTS PANEL
  // ==========================================
  async renderTransferPanel(container) {
    try {
      const res = await projectService.getTransferRequests({ project: this.activeProjectId });
      this.transfers = res.results || res.data || (Array.isArray(res) ? res : []);
      const isPM = this.isCurrentUserPM();
      const currentUser = this.getCurrentUser();

      const pendingBadge = document.getElementById("badge-transfer-count");
      const pendingCount = this.transfers.filter(t => t.status === "PENDING").length;
      if (pendingBadge) {
        pendingBadge.innerText = pendingCount;
        pendingBadge.classList.toggle("hidden", pendingCount === 0);
      }

      if (this.transfers.length === 0) {
        container.innerHTML = `
          <div style="text-align:center;padding:56px 20px;background:#fff;border-radius:14px;border:1px solid #e2e8f0;color:#64748b;">
            <div style="font-size:36px;margin-bottom:8px;">🔄</div>
            <strong style="color:#1e293b;font-size:14px;">Tidak ada permintaan transfer task</strong>
            <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;">Pengajuan alih tanggung jawab antar anggota tim akan tampil di sini.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.02);">
          <div style="padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
            <div>
              <h3 style="margin:0;font-size:15px;color:#0f172a;font-weight:700;">Daftar Pengajuan Alih Tanggung Jawab (Transfer Task)</h3>
              <p style="margin:2px 0 0;font-size:12px;color:#64748b;">Persetujuan PM memindahkan kepemilikan task secara aman dan otomatis mencatat ke audit log.</p>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="badge info" style="font-size:11px;">Total: ${this.transfers.length}</span>
              ${pendingCount > 0 ? `<span class="badge warning" style="font-size:11px;">⚡ ${pendingCount} Menunggu Review</span>` : ""}
            </div>
          </div>
          <div class="table-wrap" style="overflow-x:auto;">
            <table class="data-table small" style="width:100%;">
              <thead>
                <tr>
                  <th style="min-width:180px;">Tugas (Daily Task)</th>
                  <th style="min-width:140px;">Dari (Pemohon)</th>
                  <th style="min-width:140px;">Kepada (Target)</th>
                  <th style="min-width:200px;">Alasan Pengalihan</th>
                  <th style="width:110px;text-align:center;">Status</th>
                  <th style="width:160px;text-align:right;">Aksi Review</th>
                </tr>
              </thead>
              <tbody>
                ${this.transfers.map(t => {
                  const fromName = t.requested_by_name || t.from_user_name || t.requested_by_username || t.requested_by || "User";
                  const toName = t.target_user_name || t.to_user_name || t.target_user_username || t.target_user || "User";
                  const taskTitle = t.daily_task_title || t.daily_task || "Task";
                  const isRequester = this.isUserMatch(t.from_user) || this.isUserMatch(t.requested_by);

                  return `
                    <tr>
                      <td>
                        <strong style="color:#0f172a;font-size:12px;">${taskTitle}</strong>
                        <small style="display:block;color:#64748b;font-size:10px;">ID: ${String(t.id).slice(0, 8)}...</small>
                      </td>
                      <td><span style="color:#e11d48;font-weight:600;">👤 ${fromName}</span></td>
                      <td><span style="color:#16a34a;font-weight:600;">👉 ${toName}</span></td>
                      <td style="font-size:12px;color:#475569;line-height:1.4;">${t.reason || "-"}</td>
                      <td style="text-align:center;">
                        <span class="badge ${t.status === 'APPROVED' ? 'success' : t.status === 'REJECTED' ? 'danger' : t.status === 'CANCELLED' ? 'ghost' : 'warning'}" style="font-size:10px;padding:3px 8px;font-weight:700;">
                          ${t.status === 'APPROVED' ? '✅ Disetujui' : t.status === 'REJECTED' ? '❌ Ditolak' : t.status === 'CANCELLED' ? '🚫 Dibatalkan' : '⏳ PENDING'}
                        </span>
                      </td>
                      <td style="text-align:right;">
                        ${t.status === 'PENDING' ? `
                          <div style="display:inline-flex;gap:4px;justify-content:flex-end;">
                            ${isPM ? `
                              <button class="btn-approve-transfer button small primary" style="background:#16a34a;border-color:#16a34a;padding:3px 8px;font-size:11px;" data-id="${t.id}" title="Setujui dan pindahkan kepemilikan task">
                                ✓ Setujui
                              </button>
                              <button class="btn-reject-transfer button small danger" style="padding:3px 8px;font-size:11px;" data-id="${t.id}" title="Tolak pengajuan transfer">
                                ✕ Tolak
                              </button>
                            ` : ""}
                            ${isRequester ? `
                              <button class="btn-cancel-transfer button small secondary" style="font-size:11px;padding:3px 8px;" data-id="${t.id}" title="Batalkan pengajuan saya">
                                Batalkan
                              </button>
                            ` : (!isPM ? `<span style="font-size:11px;color:#94a3b8;font-style:italic;">Menunggu PM</span>` : "")}
                          </div>
                        ` : `<span style="font-size:11px;color:#94a3b8;">${t.reviewed_at ? 'Diproses' : 'Selesai'}</span>`}
                      </td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `;

      this.bindTransferEvents();
    } catch (err) {
      toast.error("Gagal mengambil daftar transfer task: " + (err.message || "Error"));
    }
  },

  bindTransferEvents() {
    document.querySelectorAll(".btn-approve-transfer").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const id = e.currentTarget.dataset.id;
        try {
          await projectService.approveTransfer(id, "Disetujui oleh Project Manager via Dashboard");
          toast.success("Transfer task disetujui. Kepemilikan tugas telah resmi berpindah.");
          await this.loadProjectDetail();
          if (this.activeTab === "TRANSFERS") {
            const container = document.getElementById("tab-content");
            if (container) await this.renderTransferPanel(container);
          }
        } catch (err) {
          toast.error(err.message || "Gagal menyetujui transfer task");
        }
      });
    });

    document.querySelectorAll(".btn-reject-transfer").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const id = e.currentTarget.dataset.id;
        try {
          await projectService.rejectTransfer(id, "Ditolak oleh Project Manager");
          toast.info("Transfer task ditolak.");
          await this.loadProjectDetail();
          if (this.activeTab === "TRANSFERS") {
            const container = document.getElementById("tab-content");
            if (container) await this.renderTransferPanel(container);
          }
        } catch (err) {
          toast.error(err.message || "Gagal menolak transfer task");
        }
      });
    });

    document.querySelectorAll(".btn-cancel-transfer").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const id = e.currentTarget.dataset.id;
        try {
          await projectService.cancelTransfer(id);
          toast.info("Pengajuan alih tugas berhasil dibatalkan.");
          await this.loadProjectDetail();
          if (this.activeTab === "TRANSFERS") {
            const container = document.getElementById("tab-content");
            if (container) await this.renderTransferPanel(container);
          }
        } catch (err) {
          toast.error(err.message || "Gagal membatalkan pengajuan transfer");
        }
      });
    });
  },

  // ==========================================
  // TAB 4: STAGE GATES & MILESTONES
  // ==========================================
  renderMilestonesPanel(container) {
    const p = this.currentProject || {};
    const milestones = p.milestones || [];

    container.innerHTML = `
      <div style="background:#fff;padding:20px;border-radius:14px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.02);display:grid;gap:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #f1f5f9;padding-bottom:12px;">
          <div>
            <h3 style="margin:0;font-size:15px;color:#0f172a;font-weight:700;">Stage Gates & Milestones</h3>
            <p style="margin:2px 0 0;font-size:12px;color:#64748b;">Tonggak capaian krusial dan checkpoint penerimaan hasil proyek.</p>
          </div>
          <span class="badge info" style="font-size:11px;">${milestones.length} Milestones</span>
        </div>

        <div style="display:grid;gap:10px;">
          ${milestones.length > 0 ? milestones.map(m => `
            <div style="padding:12px 16px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
              <div>
                <strong style="color:#0f172a;font-size:13px;">${esc(m.milestone_name || m.name || "Milestone")}</strong>
                <small style="display:block;color:#64748b;font-size:11px;margin-top:2px;">
                  📅 Target: <b>${formatDate(m.target_date || m.due_date)}</b> &bull; Bobot: <b>${m.weight_percent || 0}%</b>
                </small>
              </div>
              <div>
                ${statusBadge(m.status || "PENDING")}
              </div>
            </div>
          `).join("") : emptyState("Belum ada milestone pada proyek ini.")}
        </div>
      </div>
    `;
  },

  // ==========================================
  // TAB 5: FINANCIAL INTEGRATION & COST HANDOFF
  // ==========================================
  renderFinancialPanel(container) {
    const p = this.currentProject || {};
    const isPM = this.isCurrentUserPM();
    const costList = p.cost_entries || [];
    const fundList = p.fundings || [];
    const propList = p.billing_proposals || [];

    container.innerHTML = `
      <div class="pm-accounting-workspace" style="display:grid;gap:18px;">
        <!-- Header Actions -->
        <div style="background:linear-gradient(145deg,#fff,#f4fbf6);padding:20px;border-radius:14px;border:1px solid #b9d8c3;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;">
          <div>
            <span class="eyebrow" style="color:#257743;font-size:11px;font-weight:800;letter-spacing:0.5px;">FINANCIAL INTEGRATION & COST HANDOFF</span>
            <h3 style="margin:2px 0 0;font-size:16px;color:#0f172a;font-weight:800;">Pengajuan Biaya, Dana Proyek & Termin Billing</h3>
            <p style="margin:2px 0 0;font-size:12px;color:#64748b;">Monitoring biaya riil lapangan (Cost Entry), dana proyek (Funding), dan termin invoice ke Finance.</p>
          </div>
          ${isPM ? `
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button id="btnSendCostEntry" class="button secondary small" style="font-size:12px;padding:6px 12px;">
                + Kirim Biaya ke Finance
              </button>
              <button id="btnNewFundingPM" class="button secondary small" style="background:#edf7ed;border-color:#b9d8c3;color:#257743;font-size:12px;padding:6px 12px;">
                + Ajukan Dana (Funding)
              </button>
              <button id="btnCreateProposal" class="button primary small" style="background:#257743;border-color:#257743;font-size:12px;padding:6px 12px;">
                + Buat Billing Proposal
              </button>
            </div>
          ` : ""}
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(360px, 1fr));gap:16px;">
          <!-- Daftar Biaya Aktual Lapangan -->
          <section style="background:#fff;border:1px solid #d0e7d7;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,0.02);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
              <h4 style="margin:0;color:#257743;font-size:13px;font-weight:700;">📥 Biaya Aktual Lapangan (Cost Entries)</h4>
              <span class="badge info" style="font-size:10px;">${costList.length} Entri</span>
            </div>
            <div class="table-wrap" style="max-height:240px;overflow-y:auto;">
              <table class="data-table small" style="width:100%;">
                <thead>
                  <tr>
                    <th>Deskripsi / Bukti</th>
                    <th>Elemen</th>
                    <th>Jumlah (Rp)</th>
                    <th>Status</th>
                    ${isPM ? `<th style="text-align:right;">Aksi</th>` : ""}
                  </tr>
                </thead>
                <tbody>
                  ${costList.map(c => `
                    <tr>
                      <td>
                        <strong>${esc(c.description || "-")}</strong>
                        <small style="display:block;color:#64748b;font-size:10px;">${esc(c.source_type || "MANUAL")} &bull; ${formatDate(c.transaction_date)}</small>
                      </td>
                      <td><span class="badge ghost" style="font-size:10px;">${esc(c.cost_element || "MATERIAL")}</span></td>
                      <td><strong>${formatMoney(c.total_cost || c.amount)}</strong></td>
                      <td>${statusBadge(c.status || "POSTED")}</td>
                      ${isPM ? `<td style="text-align:right;"><button class="button danger small" data-pm-del-cost="${attr(c.id)}" style="padding:2px 6px;font-size:10px;">🗑️</button></td>` : ""}
                    </tr>
                  `).join("") || `<tr><td colspan="5">${emptyState("Belum ada biaya riil yang dikirim ke Finance.")}</td></tr>`}
                </tbody>
              </table>
            </div>
          </section>

          <!-- Daftar Pengajuan Dana Proyek -->
          <section style="background:#fff;border:1px solid #d0e7d7;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,0.02);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
              <h4 style="margin:0;color:#257743;font-size:13px;font-weight:700;">💰 Pengajuan Dana Proyek (Funding Requests)</h4>
              <span class="badge info" style="font-size:10px;">${fundList.length} Pengajuan</span>
            </div>
            <div class="table-wrap" style="max-height:240px;overflow-y:auto;">
              <table class="data-table small" style="width:100%;">
                <thead>
                  <tr>
                    <th>Tujuan Kebutuhan</th>
                    <th>Diajukan</th>
                    <th>Disetujui</th>
                    <th>Status</th>
                    ${isPM ? `<th style="text-align:right;">Aksi</th>` : ""}
                  </tr>
                </thead>
                <tbody>
                  ${fundList.map(f => `
                    <tr>
                      <td><strong>${esc(f.purpose || f.funding_type || "Funding")}</strong></td>
                      <td>${formatMoney(f.requested_amount)}</td>
                      <td><strong>${formatMoney(f.approved_limit)}</strong></td>
                      <td>${statusBadge(f.status || "SUBMITTED")}</td>
                      ${isPM ? `<td style="text-align:right;"><button class="button danger small" data-pm-del-fund="${attr(f.id)}" style="padding:2px 6px;font-size:10px;">🗑️</button></td>` : ""}
                    </tr>
                  `).join("") || `<tr><td colspan="5">${emptyState("Belum ada pengajuan dana proyek.")}</td></tr>`}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <!-- Daftar Proposal Termin Penagihan -->
        <section style="background:#fff;border:1px solid #d0e7d7;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,0.02);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <h4 style="margin:0;color:#257743;font-size:13px;font-weight:700;">📑 Proposal Termin Penagihan (Billing Proposals)</h4>
            <span class="badge info" style="font-size:10px;">${propList.length} Proposal</span>
          </div>
          <div class="table-wrap" style="max-height:240px;overflow-y:auto;">
            <table class="data-table small" style="width:100%;">
              <thead>
                <tr>
                  <th>Pemicu / Trigger</th>
                  <th>Deskripsi Termin</th>
                  <th>Subtotal (Rp)</th>
                  <th>Total Tagihan (PPN)</th>
                  <th>Status</th>
                  ${isPM ? `<th style="text-align:right;">Aksi</th>` : ""}
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
                    ${isPM ? `<td style="text-align:right;"><button class="button danger small" data-pm-del-prop="${attr(p.id)}" style="padding:2px 6px;font-size:10px;">🗑️</button></td>` : ""}
                  </tr>
                `).join("") || `<tr><td colspan="6">${emptyState("Belum ada proposal termin invoice.")}</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    `;

    this.bindFinancialEvents(container);
  },

  bindFinancialEvents(container) {
    document.getElementById("btnSendCostEntry")?.addEventListener("click", () => {
      modal.open({
        title: "Kirim Biaya ke Finance",
        eyebrow: `Proyek: ${esc(this.currentProject.project_code || "PRJ")}`,
        content: `
          <form id="formCostHandoff" class="dynamic-form stack" style="display:grid;gap:12px;font-size:12px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <div>
                <label class="form-label">Sumber Biaya</label>
                <select name="source_type" id="costSource" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
                  <option value="WAREHOUSE">Gudang & Material (WAREHOUSE)</option>
                  <option value="TIMESHEET">Timesheet & Teknisi (TIMESHEET)</option>
                  <option value="VENDOR">Vendor & Subkontraktor (VENDOR)</option>
                  <option value="MANUAL">Manual / Kas Proyek</option>
                </select>
              </div>
              <div>
                <label class="form-label">Elemen Biaya</label>
                <select name="cost_element" id="costElement" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
                  <option value="MATERIAL">Material & Sparepart</option>
                  <option value="LABOR">Upah / Tenaga Kerja</option>
                  <option value="OVERHEAD">Overhead & Logistik</option>
                  <option value="OTHER">Lain-lain</option>
                </select>
              </div>
            </div>
            <div>
              <label class="form-label">Deskripsi Bukti & Transaksi *</label>
              <input type="text" id="costDescription" placeholder="Contoh: Pengambilan 2 unit Motor Servo dan Sensor Optical" required style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <div>
                <label class="form-label">Tanggal Transaksi</label>
                <input type="date" id="costDate" value="${new Date().toISOString().slice(0, 10)}" required style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
              </div>
              <div>
                <label class="form-label">Total Biaya Aktual (Rp) *</label>
                <input type="number" id="costAmount" placeholder="25000000" min="1" required style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
              </div>
            </div>
            <button type="submit" class="button primary" style="background:#257743;border-color:#257743;margin-top:6px;">Kirim ke Cost Inbox Finance</button>
          </form>
        `
      });

      document.getElementById("formCostHandoff")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const description = document.getElementById("costDescription")?.value.trim();
        const source_type = document.getElementById("costSource")?.value || "WAREHOUSE";
        const cost_element = document.getElementById("costElement")?.value || "MATERIAL";
        const transaction_date = document.getElementById("costDate")?.value || new Date().toISOString().slice(0, 10);
        const total_cost = parseFloat(document.getElementById("costAmount")?.value) || 0;

        try {
          await savePMCostEntry({
            project: this.activeProjectId,
            description,
            source_type,
            cost_element,
            transaction_date,
            total_cost,
            quantity: 1,
            unit_cost: total_cost,
            status: "POSTED",
          });
          modal.close();
          toast.success("Biaya riil berhasil dikirim ke Cost Inbox Finance.");
          await this.loadProjectDetail();
        } catch (err) {
          toast.error("Gagal mengirim biaya: " + (err.message || "Error"));
        }
      });
    });

    document.getElementById("btnCreateProposal")?.addEventListener("click", () => {
      modal.open({
        title: "Buat Billing Proposal",
        eyebrow: `Proyek: ${esc(this.currentProject.project_code || "PRJ")}`,
        content: `
          <form id="formProposalHandoff" class="dynamic-form stack" style="display:grid;gap:12px;font-size:12px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <div>
                <label class="form-label">Trigger Billing</label>
                <select name="trigger_type" id="propTrigger" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
                  <option value="PROGRESS_APPROVED">Progress Pekerjaan Disetujui</option>
                  <option value="MILESTONE_APPROVED">Milestone Selesai</option>
                  <option value="DELIVERY_ACCEPTED">Pengiriman Diterima Klien</option>
                  <option value="PROJECT_COMPLETED">Proyek Selesai 100%</option>
                </select>
              </div>
              <div>
                <label class="form-label">Subtotal Tagihan (Rp) *</label>
                <input type="number" id="propSubtotal" placeholder="100000000" min="1" required style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
              </div>
            </div>
            <div>
              <label class="form-label">Keterangan Termin Tagihan *</label>
              <input type="text" id="propDesc" placeholder="Contoh: Penagihan Termin 1 (Progress 65%)" required style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
            </div>
            <button type="submit" class="button primary" style="background:#257743;border-color:#257743;margin-top:6px;">Simpan Billing Proposal</button>
          </form>
        `
      });

      document.getElementById("formProposalHandoff")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const subtotal = parseFloat(document.getElementById("propSubtotal")?.value) || 0;
        const description = document.getElementById("propDesc")?.value.trim();
        const trigger_type = document.getElementById("propTrigger")?.value || "PROGRESS_APPROVED";

        try {
          const tax_amount = subtotal * 0.11;
          await savePMBillingProposal({
            project: this.activeProjectId,
            trigger_type,
            description,
            subtotal,
            tax_rate: 11,
            tax_amount: tax_amount,
            total_amount: subtotal + tax_amount,
            status: "APPROVED",
          });
          modal.close();
          toast.success("Billing proposal berhasil dibuat untuk diproses Finance.");
          await this.loadProjectDetail();
        } catch (err) {
          toast.error("Gagal membuat proposal: " + (err.message || "Error"));
        }
      });
    });

    document.getElementById("btnNewFundingPM")?.addEventListener("click", () => {
      modal.open({
        title: "Ajukan Dana Proyek (Funding Request)",
        eyebrow: `Proyek: ${esc(this.currentProject.project_code || "PRJ")}`,
        content: `
          <form id="formNewFundingModal" class="dynamic-form stack" style="display:grid;gap:12px;font-size:12px;">
            <div>
              <label class="form-label">Tujuan Kebutuhan Dana *</label>
              <input type="text" id="fundPurpose" placeholder="Contoh: Pengadaan Material Kabel & Sparepart Khusus" required style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <div>
                <label class="form-label">Tipe Funding</label>
                <select id="fundType" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
                  <option value="PROJECT_CAPEX">Capex Proyek (CAPEX)</option>
                  <option value="PROJECT_OPEX">Operasional Lapangan (OPEX)</option>
                  <option value="EMERGENCY">Emergency / Darurat</option>
                </select>
              </div>
              <div>
                <label class="form-label">Nilai Dana (Rp) *</label>
                <input type="number" id="fundAmount" placeholder="75000000" min="1000" required style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
              </div>
            </div>
            <div>
              <label class="form-label">Justifikasi & Keterangan</label>
              <textarea id="fundNotes" rows="2" placeholder="Alasan teknis pengajuan dana..." style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;"></textarea>
            </div>
            <button type="submit" class="button primary" style="background:#257743;border-color:#257743;margin-top:6px;">Kirim Pengajuan Dana</button>
          </form>
        `
      });

      document.getElementById("formNewFundingModal")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const purpose = document.getElementById("fundPurpose")?.value.trim();
        const funding_type = document.getElementById("fundType")?.value || "PROJECT_CAPEX";
        const requested_amount = parseFloat(document.getElementById("fundAmount")?.value) || 0;
        const notes = document.getElementById("fundNotes")?.value.trim();

        try {
          await createFundingRequest({
            project: this.activeProjectId,
            purpose,
            funding_type,
            requested_amount,
            approved_limit: requested_amount,
            notes,
          });
          modal.close();
          toast.success("Pengajuan dana berhasil dikirim ke Finance.");
          await this.loadProjectDetail();
        } catch (err) {
          toast.error("Gagal mengajukan dana: " + (err.message || "Error"));
        }
      });
    });

    container.querySelectorAll("[data-pm-del-cost]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.pmDelCost;
        if (!confirm("Hapus catatan biaya proyek ini?")) return;
        try {
          await deleteProjectCostEntry(id);
          toast.info("Catatan biaya dihapus.");
          await this.loadProjectDetail();
        } catch (err) {
          toast.error(err.message || "Gagal menghapus biaya");
        }
      });
    });

    container.querySelectorAll("[data-pm-del-fund]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.pmDelFund;
        if (!confirm("Hapus pengajuan dana ini?")) return;
        try {
          await deleteFundingRequest(id);
          toast.info("Data funding request dihapus.");
          await this.loadProjectDetail();
        } catch (err) {
          toast.error(err.message || "Gagal menghapus dana");
        }
      });
    });

    container.querySelectorAll("[data-pm-del-prop]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.pmDelProp;
        if (!confirm("Hapus proposal termin billing ini?")) return;
        try {
          await deleteBillingProposal(id);
          toast.info("Proposal billing dihapus.");
          await this.loadProjectDetail();
        } catch (err) {
          toast.error(err.message || "Gagal menghapus proposal");
        }
      });
    });
  },

  // ==========================================
  // TAB 6: ACTIVITY & AUDIT LOGS
  // ==========================================
  async renderAuditLogs(container) {
    try {
      const res = await projectService.getProjectActivityLogs(this.activeProjectId);
      this.logs = res.results || res.data || (Array.isArray(res) ? res : []);

      if (this.logs.length === 0) {
        container.innerHTML = `
          <div style="text-align:center;padding:56px 20px;background:#fff;border-radius:14px;border:1px solid #e2e8f0;color:#64748b;">
            <div style="font-size:36px;margin-bottom:8px;">📜</div>
            <strong style="color:#1e293b;font-size:14px;">Belum ada aktivitas tercatat</strong>
            <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;">Setiap perubahan progres, penugasan, dan approval akan otomatis terekam di sini.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.02);">
          <div style="padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <h3 style="margin:0;font-size:15px;color:#0f172a;font-weight:700;">Audit Trail & Activity Log</h3>
              <p style="margin:2px 0 0;font-size:12px;color:#64748b;">Riwayat transparansi seluruh modifikasi tugas dan persetujuan transfer.</p>
            </div>
            <span class="badge info" style="font-size:11px;">${this.logs.length} Log Entries</span>
          </div>
          <div class="table-wrap" style="overflow-x:auto;">
            <table class="data-table small" style="width:100%;">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Aktor</th>
                  <th>Level</th>
                  <th>Tugas / Target</th>
                  <th>Aksi</th>
                  <th>Keterangan / Alasan</th>
                </tr>
              </thead>
              <tbody>
                ${this.logs.map(l => `
                  <tr>
                    <td style="font-family:monospace;font-size:11px;color:#64748b;">${new Date(l.created_at || l.timestamp).toLocaleString("id-ID")}</td>
                    <td><strong>👤 ${l.actor_name || l.actor_username || "System"}</strong></td>
                    <td><span class="badge ghost" style="font-size:10px;">${l.task_level || "TASK"}</span></td>
                    <td><strong>${l.task_title || "-"}</strong></td>
                    <td>
                      <span class="badge ${l.action.includes('APPROVED') || l.action.includes('CREATED') ? 'success' : l.action.includes('BLOCKED') || l.action.includes('REJECTED') ? 'danger' : 'info'}" style="font-size:10px;">
                        ${l.action}
                      </span>
                    </td>
                    <td style="font-size:12px;color:#64748b;">${l.reason || l.field_name || "-"}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      toast.error("Gagal mengambil log aktivitas: " + (err.message || "Error"));
    }
  },

  // ==========================================
  // MODAL DIALOGS (HIERARCHY CREATION & EDIT)
  // ==========================================
  openCreateProjectModal() {
    modal.open({
      title: "Pendaftaran Proyek Baru",
      eyebrow: "Project Initiation",
      content: `
        <form id="form-create-project-full" class="dynamic-form stack" style="display:grid;gap:12px;font-size:12px;">
          <div>
            <label class="form-label">Nama Proyek *</label>
            <input type="text" name="name" required placeholder="Contoh: Implementasi Conveyor Line 2" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label class="form-label">Kode Proyek</label>
              <input type="text" name="code" placeholder="PRJ-2026-002" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
            </div>
            <div>
              <label class="form-label">Budget Anggaran (Rp) *</label>
              <input type="number" name="budget_amount" min="0" required placeholder="500000000" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label class="form-label">Planned Start Date *</label>
              <input type="date" name="start_date" required value="${new Date().toISOString().slice(0, 10)}" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
            </div>
            <div>
              <label class="form-label">Planned End Date *</label>
              <input type="date" name="end_date" required value="${new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10)}" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
            </div>
          </div>
          <div>
            <label class="form-label">Deskripsi Proyek</label>
            <textarea name="description" rows="2" placeholder="Cakupan pekerjaan proyek..." style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;"></textarea>
          </div>
          <button type="submit" class="button primary" style="background:#4338ca;border-color:#4338ca;margin-top:6px;">Daftarkan Proyek Baru</button>
        </form>
      `
    });

    document.getElementById("form-create-project-full")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const payload = Object.fromEntries(formData.entries());
      try {
        const res = await createProject({
          project_name: payload.name,
          project_code: payload.code || undefined,
          budget_amount: parseFloat(payload.budget_amount) || 0,
          planned_start_date: payload.start_date,
          planned_end_date: payload.end_date,
          description: payload.description,
        });
        toast.success(`Proyek "${payload.name}" berhasil dibuat.`);
        modal.close();
        await loadPMBackend(true);
        this.activeProjectId = res?.id || this.activeProjectId;
        await this.loadInitialData();
      } catch (err) {
        toast.error(err.message || "Gagal membuat proyek");
      }
    });
  },

  openCreateMainTaskModal() {
    modal.open({
      title: "Tambah Paket Kerja Utama (Main Task)",
      eyebrow: "Level 1 WBS (PM Only)",
      content: `
        <form id="form-create-main" class="dynamic-form stack" style="display:grid;gap:12px;font-size:12px;">
          <div>
            <label class="form-label">Nama Main Task *</label>
            <input type="text" name="name" required placeholder="Contoh: Arsitektur Database & Backend Service" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label class="form-label">Start Date *</label>
              <input type="date" name="start_date" required value="${new Date().toISOString().slice(0, 10)}" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
            </div>
            <div>
              <label class="form-label">Due Date *</label>
              <input type="date" name="due_date" required value="${new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)}" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label class="form-label">Prioritas</label>
              <select name="priority" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
                <option value="HIGH">HIGH</option>
                <option value="URGENT">URGENT</option>
              </select>
            </div>
            <div>
              <label class="form-label">Bobot Task (Weight)</label>
              <input type="number" step="0.1" name="weight" value="1.0" min="0.1" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
            </div>
          </div>
          <div>
            <label class="form-label">Deskripsi Teknis</label>
            <textarea name="description" rows="2" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;"></textarea>
          </div>
          <button type="submit" class="button primary" style="background:#4338ca;border-color:#4338ca;margin-top:6px;">Simpan Main Task</button>
        </form>
      `
    });

    document.getElementById("form-create-main")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const payload = Object.fromEntries(formData.entries());
      try {
        await projectService.createMainTask(this.activeProjectId, payload);
        toast.success("Main Task berhasil ditambahkan.");
        modal.close();
        await this.loadProjectDetail();
      } catch (err) {
        toast.error(err.message || "Gagal membuat Main Task");
      }
    });
  },

  async openAssignMemberModal(mainTaskId) {
    let members = this.currentProject.members_detail || this.currentProject.members || [];
    
    if (members.length === 0) {
      if (this.currentProject.available_users && this.currentProject.available_users.length > 0) {
        members = this.currentProject.available_users;
      } else {
        try {
          const res = await requestJSON("/api/v1/accounts/users/?page_size=100", { method: "GET" });
          const users = res.results || res.data || (Array.isArray(res) ? res : []);
          members = users.map(u => ({
            id: u.id,
            user_id: u.id,
            username: u.username,
            full_name: u.full_name || u.username,
            role_in_project: "MEMBER"
          }));
        } catch (e) {
          console.warn("Fallback fetch users:", e);
        }
      }
    }

    const currentUser = this.getCurrentUser();
    if (currentUser.id && !members.some(m => (m.user_id || m.id) === currentUser.id)) {
      members.unshift({
        id: currentUser.id,
        user_id: currentUser.id,
        username: currentUser.username,
        full_name: currentUser.full_name || currentUser.username,
        role_in_project: "PROJECT_MANAGER (Saya)"
      });
    }

    const mainTask = (this.currentProject.main_tasks || []).find(m => m.id === mainTaskId);
    const assignedUserIds = (mainTask?.assignments || []).map(a => a.assignee || a.assignee_id);

    modal.open({
      title: "Tugaskan Anggota ke Main Task",
      eyebrow: "PM Delegation",
      content: `
        <form id="form-assign-main" class="dynamic-form stack" style="display:grid;gap:14px;font-size:12px;">
          <div>
            <label class="form-label" style="font-weight:700;margin-bottom:6px;display:block;">Pilih Anggota Tim (Centang satu atau lebih) *</label>
            <div style="max-height:220px;overflow-y:auto;border:1px solid #cbd5e1;border-radius:8px;padding:8px;display:grid;gap:6px;background:#f8fafc;">
              ${members.length > 0 ? members.map(m => {
                const uid = m.user_id || m.id;
                const isChecked = assignedUserIds.includes(uid);
                return `
                  <label style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#fff;border-radius:6px;border:1px solid #e2e8f0;cursor:pointer;">
                    <input type="checkbox" name="assignees" value="${uid}" ${isChecked ? "checked" : ""} style="width:16px;height:16px;accent-color:#4338ca;cursor:pointer;">
                    <div style="flex:1;">
                      <strong style="color:#0f172a;font-size:13px;">${m.full_name || m.username || "User"}</strong>
                      <span class="badge info" style="font-size:10px;margin-left:6px;padding:1px 6px;">${m.role_in_project || "MEMBER"}</span>
                    </div>
                  </label>
                `;
              }).join("") : `
                <div style="padding:14px;text-align:center;color:#64748b;">
                  Memuat daftar pengguna...
                </div>
              `}
            </div>
            <small style="color:#64748b;font-size:11px;margin-top:6px;display:block;">💡 Anggota yang dicentang akan memiliki akses untuk memecah target mingguan & harian.</small>
          </div>
          <button type="submit" class="button primary" style="background:#4338ca;border-color:#4338ca;padding:9px;border-radius:8px;">Simpan Penugasan Anggota</button>
        </form>
      `
    });

    document.getElementById("form-assign-main")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const checkboxes = document.querySelectorAll("input[name='assignees']:checked");
      const selectedUserIds = Array.from(checkboxes).map(cb => cb.value);

      if (selectedUserIds.length === 0) {
        toast.error("Pilih minimal satu anggota tim untuk ditugaskan.");
        return;
      }

      try {
        await projectService.assignMainTask(mainTaskId, selectedUserIds);
        toast.success("Anggota tim berhasil ditugaskan ke Main Task.");
        modal.close();
        await this.loadProjectDetail();
      } catch (err) {
        toast.error(err.message || "Gagal assign member");
      }
    });
  },

  async openCreateWeeklyTaskModal(mainTaskId) {
    const currentUser = this.getCurrentUser();
    let members = this.currentProject.members_detail || this.currentProject.members || [];
    if (members.length === 0) {
      try {
        const res = await requestJSON("/api/v1/accounts/users/?page_size=100", { method: "GET" });
        members = (res.results || res.data || (Array.isArray(res) ? res : [])).map(u => ({
          id: u.id,
          user_id: u.id,
          username: u.username,
          full_name: u.full_name || u.username,
          role_in_project: "MEMBER"
        }));
      } catch (e) {
        console.warn("Fallback fetch users:", e);
      }
    }

    modal.open({
      title: "Turunkan ke Target Mingguan (Weekly Task)",
      eyebrow: "Level 2 Breakdown",
      content: `
        <form id="form-create-weekly" class="dynamic-form stack" style="display:grid;gap:12px;font-size:12px;">
          <div>
            <label class="form-label">Minggu Ke (Week Number) *</label>
            <input type="number" name="week_number" min="1" required value="1" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
          </div>
          <div>
            <label class="form-label">Assignee / PIC Mingguan *</label>
            <select name="assignee" required style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
              <option value="${currentUser.id || ''}">Saya Sendiri (${currentUser.full_name || currentUser.username || "User"})</option>
              ${members.filter(m => (m.user_id || m.id) !== currentUser.id).map(m => `
                <option value="${m.user_id || m.id}">${m.full_name || m.username || "Member"} (${m.role_in_project || "MEMBER"})</option>
              `).join("")}
            </select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label class="form-label">Start Date *</label>
              <input type="date" name="start_date" required value="${new Date().toISOString().slice(0, 10)}" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
            </div>
            <div>
              <label class="form-label">End Date *</label>
              <input type="date" name="end_date" required value="${new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10)}" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
            </div>
          </div>
          <div>
            <label class="form-label">Target Pekerjaan Mingguan *</label>
            <textarea name="target_description" required rows="2" placeholder="Contoh: Menyelesaikan skema tabel dan API endpoints" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;"></textarea>
          </div>
          <button type="submit" class="button primary" style="background:#4338ca;border-color:#4338ca;margin-top:6px;">Simpan Target Mingguan</button>
        </form>
      `
    });

    document.getElementById("form-create-weekly")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const payload = {
        ...Object.fromEntries(formData.entries()),
        assignee: formData.get("assignee") || currentUser.id,
      };
      try {
        await projectService.createWeeklyTask(mainTaskId, payload);
        toast.success("Weekly Task berhasil ditambahkan.");
        modal.close();
        await this.loadProjectDetail();
      } catch (err) {
        toast.error(err.message || "Gagal membuat Weekly Task");
      }
    });
  },

  openCreateDailyTaskModal(weeklyTaskId) {
    modal.open({
      title: "Tambah Aktivitas / Tugas Harian (Daily Task)",
      eyebrow: "Struktur Proyek Harian (Level 3)",
      content: `
        <form id="form-create-daily" class="dynamic-form stack" style="display:grid;gap:12px;font-size:12px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label class="form-label" style="font-weight:700;">Tanggal Pelaksanaan *</label>
              <input type="date" name="planned_date" required value="${new Date().toISOString().slice(0, 10)}" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
            </div>
            <div>
              <label class="form-label" style="font-weight:700;">Waktu (Rentang Jam) *</label>
              <input type="text" name="time_slot" placeholder="Contoh: 09.00 - 09.15 atau 13.00 - 15.00" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
            </div>
          </div>

          <div>
            <label class="form-label" style="font-weight:700;">Input (Aktivitas yang Dikerjakan) *</label>
            <textarea name="title" required rows="2" placeholder="Tuliskan aktivitas atau tugas yang dikerjakan pada sesi ini..." style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;"></textarea>
          </div>

          <div>
            <label class="form-label" style="font-weight:700;">Output (Hasil yang Didapat / Deliverable)</label>
            <textarea name="output_result" rows="2" placeholder="Hasil konkret atau luaran yang didapatkan dari aktivitas ini..." style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;"></textarea>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label class="form-label" style="font-weight:700;">Status Awal</label>
              <select name="status" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
                <option value="NOT_STARTED">Not done yet (Belum Dimulai)</option>
                <option value="IN_PROGRESS" selected>On Progress (Sedang Dikerjakan)</option>
                <option value="COMPLETED">Selesai (Completed 100%)</option>
                <option value="BLOCKED">Terkendala (Blocked)</option>
                <option value="REVIEW">In Review</option>
              </select>
            </div>
            <div>
              <label class="form-label" style="font-weight:700;">Catatan / Keterangan</label>
              <input type="text" name="notes" placeholder="Catatan opsional..." style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
            </div>
          </div>

          <button type="submit" class="button primary" style="background:#10b981;border-color:#10b981;margin-top:6px;font-weight:700;">Simpan Aktivitas Harian</button>
        </form>
      `
    });

    document.getElementById("form-create-daily")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const payload = Object.fromEntries(formData.entries());
      const currentUser = this.getCurrentUser();
      if (currentUser.id) {
        payload.owner = currentUser.id;
      }
      if (payload.status === "COMPLETED") {
        payload.progress = 100;
      } else if (payload.status === "NOT_STARTED") {
        payload.progress = 0;
      }
      try {
        await projectService.createDailyTask(weeklyTaskId, payload);
        toast.success("Aktivitas harian berhasil dicatat.");
        modal.close();
        await this.loadProjectDetail();
      } catch (err) {
        toast.error(err.message || "Gagal membuat Daily Task");
      }
    });
  },

  openEditDailyTaskModal(task) {
    modal.open({
      title: `Update Aktivitas: ${task.title}`,
      eyebrow: "Daily Task Execution Update",
      content: `
        <form id="form-edit-daily" class="dynamic-form stack" style="display:grid;gap:12px;font-size:12px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label class="form-label" style="font-weight:700;">Tanggal Pelaksanaan</label>
              <input type="date" name="planned_date" value="${task.planned_date || ''}" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
            </div>
            <div>
              <label class="form-label" style="font-weight:700;">Waktu (Rentang Jam)</label>
              <input type="text" name="time_slot" value="${task.time_slot || ''}" placeholder="Contoh: 09.00 - 09.15" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
            </div>
          </div>

          <div>
            <label class="form-label" style="font-weight:700;">Input (Aktivitas yang Dikerjakan) *</label>
            <textarea name="title" required rows="2" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">${task.title || ''}</textarea>
          </div>

          <div>
            <label class="form-label" style="font-weight:700;">Output (Hasil yang Didapat / Deliverable)</label>
            <textarea name="output_result" rows="2" placeholder="Hasil konkret atau luaran yang didapatkan..." style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">${task.output_result || ''}</textarea>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label class="form-label" style="font-weight:700;">Status Pekerjaan</label>
              <select id="edit-daily-status" name="status" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
                <option value="NOT_STARTED" ${task.status === "NOT_STARTED" ? "selected" : ""}>Not done yet (Belum Dimulai)</option>
                <option value="IN_PROGRESS" ${task.status === "IN_PROGRESS" ? "selected" : ""}>On Progress (Sedang Berjalan)</option>
                <option value="COMPLETED" ${task.status === "COMPLETED" ? "selected" : ""}>Selesai (Completed 100%)</option>
                <option value="BLOCKED" ${task.status === "BLOCKED" ? "selected" : ""}>Terkendala (Blocked)</option>
                <option value="REVIEW" ${task.status === "REVIEW" ? "selected" : ""}>In Review</option>
              </select>
            </div>
            <div>
              <label class="form-label" style="font-weight:700;">Progres Capaian (%)</label>
              <input type="number" min="0" max="100" id="edit-daily-progress" name="progress" value="${task.progress}" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
            </div>
          </div>

          <div>
            <label class="form-label" style="font-weight:700;">Catatan Tambahan</label>
            <textarea name="notes" rows="1" placeholder="Catatan atau keterangan progress..." style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">${task.notes || ''}</textarea>
          </div>

          <div id="block-reason-box" style="display:${task.status === 'BLOCKED' ? 'block' : 'none'};">
            <label class="form-label" style="color:#e11d48;font-weight:700;">Alasan Kendala (Block Reason) *</label>
            <textarea name="block_reason" rows="2" style="width:100%;padding:8px;border:1px solid #fda4af;border-radius:6px;">${task.block_reason || ""}</textarea>
          </div>

          <button type="submit" class="button primary" style="background:#4338ca;border-color:#4338ca;margin-top:6px;font-weight:700;">Simpan Perubahan Aktivitas</button>
        </form>
      `
    });

    const statusSelect = document.getElementById("edit-daily-status");
    const progressInput = document.getElementById("edit-daily-progress");
    const blockBox = document.getElementById("block-reason-box");

    statusSelect?.addEventListener("change", (e) => {
      if (blockBox) {
        blockBox.style.display = e.target.value === "BLOCKED" ? "block" : "none";
      }
      if (e.target.value === "COMPLETED" && progressInput) {
        progressInput.value = 100;
      } else if (e.target.value === "NOT_STARTED" && progressInput) {
        progressInput.value = 0;
      }
    });

    document.getElementById("form-edit-daily")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const progress = formData.get("progress");
      const status = formData.get("status");
      const blockReason = formData.get("block_reason");
      const extra = {
        title: formData.get("title"),
        time_slot: formData.get("time_slot"),
        output_result: formData.get("output_result"),
        notes: formData.get("notes"),
        planned_date: formData.get("planned_date"),
      };

      try {
        await projectService.updateDailyTaskProgress(task.id, progress, status, blockReason, extra);
        toast.success("Aktivitas harian berhasil diperbarui.");
        modal.close();
        await this.loadProjectDetail();
      } catch (err) {
        toast.error(err.message || "Gagal update progres");
      }
    });
  },

  async openTransferRequestModal(dailyTaskId, taskTitle) {
    let members = this.currentProject.members_detail || this.currentProject.members || [];
    const currentUser = this.getCurrentUser();

    if (members.length === 0) {
      try {
        const res = await requestJSON("/api/v1/accounts/users/?page_size=100", { method: "GET" });
        members = (res.results || res.data || (Array.isArray(res) ? res : [])).map(u => ({
          id: u.id,
          user_id: u.id,
          username: u.username,
          full_name: u.full_name || u.username,
          role_in_project: "MEMBER"
        }));
      } catch (e) {
        console.warn("Fallback fetch users:", e);
      }
    }

    modal.open({
      title: "Ajukan Alih Tugas (Transfer Task)",
      eyebrow: "Task Transfer Workflow",
      content: `
        <form id="form-request-transfer" class="dynamic-form stack" style="display:grid;gap:12px;font-size:12px;">
          <div style="background:#fffbeb;color:#92400e;padding:10px;border-radius:8px;border:1px solid #fde68a;">
            Pekerjaan: <b>${taskTitle}</b><br>
            <small style="font-size:11px;">Permintaan alih tanggung jawab membutuhkan persetujuan PM sebelum kepemilikan task berpindah.</small>
          </div>
          <div>
            <label class="form-label">Transfer Kepada Rekan Proyek *</label>
            <select name="to_user" required style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
              <option value="">-- Pilih Anggota Proyek --</option>
              ${members.filter(m => (m.user_id || m.id) !== currentUser.id).map(m => `
                <option value="${m.user_id || m.id}">${m.full_name || m.username || "Member"} (${m.role_in_project || "MEMBER"})</option>
              `).join("")}
            </select>
          </div>
          <div>
            <label class="form-label">Alasan Pengalihan *</label>
            <textarea name="reason" required rows="3" placeholder="Jelaskan alasan alih tanggung jawab (misal beban kerja atau dependensi)..." style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;"></textarea>
          </div>
          <button type="submit" class="button primary" style="background:#d97706;border-color:#d97706;margin-top:6px;">Ajukan Permintaan Transfer</button>
        </form>
      `
    });

    document.getElementById("form-request-transfer")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const toUser = formData.get("to_user");
      const reason = formData.get("reason");
      try {
        await projectService.requestTaskTransfer(dailyTaskId, toUser, reason);
        toast.success("Permintaan transfer berhasil diajukan ke PM.");
        modal.close();
        await this.loadProjectDetail();
        this.switchTab("TRANSFERS");
      } catch (err) {
        toast.error(err.message || "Gagal mengajukan transfer");
      }
    });
  },

  // ==========================================
  // HELPERS & ROLE-BASED ACCESS CONTROLS
  // ==========================================
  formatIndonesianDate(dateStr) {
    if (!dateStr) return "-";
    try {
      const parts = String(dateStr).slice(0, 10).split("-");
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        if (!isNaN(d.getTime())) {
          const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
          const dayName = days[d.getDay()];
          const day = String(d.getDate()).padStart(2, "0");
          const month = String(d.getMonth() + 1).padStart(2, "0");
          const year = d.getFullYear();
          return `${dayName}, ${day}/${month}/${year}`;
        }
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  },

  getStatusLabel(status) {
    switch (String(status || "").toUpperCase()) {
      case "COMPLETED": return "Selesai";
      case "IN_PROGRESS": return "On Progress";
      case "NOT_STARTED": return "Not done yet";
      case "BLOCKED": return "Terkendala";
      case "REVIEW": return "In Review";
      default: return status || "Not done yet";
    }
  },

  getCurrentUser() {
    const raw = state.user || {};
    const u = raw.user || raw;
    const rawRoles = raw.roles || u.roles || [];
    const roles = Array.isArray(rawRoles)
      ? rawRoles.map(r => (typeof r === "string" ? r : (r.role_code || r.role_name || ""))).filter(Boolean)
      : [];
    const topbarName = document.getElementById("userName")?.textContent?.trim() || "";

    return {
      id: u.id || u.user_id || raw.id || "",
      username: u.username || raw.username || "",
      name: u.full_name || u.name || topbarName || "",
      full_name: u.full_name || u.name || topbarName || "",
      email: u.email || raw.email || "",
      is_superuser: Boolean(u.is_superuser || raw.is_superuser),
      roles: roles,
      role: roles[0] || u.role || u.role_in_project || ""
    };
  },

  isUserMatch(val) {
    if (!val) return false;
    const currentUser = this.getCurrentUser();

    // Handle nested object
    if (typeof val === "object") {
      return (
        this.isUserMatch(val.id) ||
        this.isUserMatch(val.user_id) ||
        this.isUserMatch(val.assignee) ||
        this.isUserMatch(val.assignee_id) ||
        this.isUserMatch(val.assignee_name) ||
        this.isUserMatch(val.assignee_username) ||
        this.isUserMatch(val.username) ||
        this.isUserMatch(val.email) ||
        this.isUserMatch(val.full_name) ||
        this.isUserMatch(val.name) ||
        this.isUserMatch(val.owner) ||
        this.isUserMatch(val.owner_name) ||
        this.isUserMatch(val.owner_username) ||
        this.isUserMatch(val.user)
      );
    }

    const s = String(val).toLowerCase().trim();
    if (!s) return false;

    const uId = String(currentUser.id || "").toLowerCase().trim();
    const uName = String(currentUser.username || "").toLowerCase().trim();
    const uFull = String(currentUser.full_name || currentUser.name || "").toLowerCase().trim();
    const uEmail = String(currentUser.email || "").toLowerCase().trim();

    if (uId && (s === uId || s.includes(uId))) return true;
    if (uName && (s === uName || s.includes(uName) || uName.includes(s))) return true;
    if (uFull && (s === uFull || s.includes(uFull) || uFull.includes(s))) return true;
    if (uEmail && (s === uEmail || s.includes(uEmail) || uEmail.includes(s))) return true;

    return false;
  },

  isCurrentUserPM() {
    const currentUser = this.getCurrentUser();
    if (currentUser.is_superuser) return true;

    // Any user with Project Manager or Executive / Admin / Director / Operations Manager role has PM privileges across projects
    const pmRoles = [
      "PROJECT_MANAGER",
      "PROJECT_MANAGEMENT",
      "MANAGER",
      "OPERATIONS_MANAGER",
      "OPERATION_MANAGER",
      "DIRECTOR",
      "EXECUTIVE",
      "ADMIN",
      "SUPERADMIN",
      "SUPER_ADMIN"
    ];

    const userRolesUpper = (currentUser.roles || []).map(r => String(r).toUpperCase());
    const singleRoleUpper = String(currentUser.role || "").toUpperCase();

    if (userRolesUpper.some(r => pmRoles.includes(r)) || pmRoles.includes(singleRoleUpper)) {
      return true;
    }

    // Direct Project Manager assignment check
    if (this.currentProject) {
      const pmId = this.currentProject.project_manager || this.currentProject.pm || this.currentProject.project_manager_id;
      if (pmId && this.isUserMatch(pmId)) return true;
      if (this.isUserMatch(this.currentProject.project_manager_name) || this.isUserMatch(this.currentProject.pm_name)) return true;
    }

    return false;
  },

  isAssignedToMain(mainTask) {
    if (!mainTask) return false;
    const assignments = mainTask.assignments || [];
    if (assignments.length > 0) {
      if (assignments.some(a => this.isUserMatch(a))) return true;
    }
    if (this.isUserMatch(mainTask.created_by)) return true;
    return false;
  },

  isWeeklyPIC(weeklyTask, parentMainTask = null) {
    if (!weeklyTask) return false;
    if (this.isUserMatch(weeklyTask.assignee) || this.isUserMatch(weeklyTask.assignee_id) || this.isUserMatch(weeklyTask.assignee_username) || this.isUserMatch(weeklyTask.assignee_name) || this.isUserMatch(weeklyTask.user)) {
      return true;
    }
    if (parentMainTask && this.isAssignedToMain(parentMainTask)) {
      return true;
    }
    return false;
  },

  isDailyOwner(dailyTask) {
    if (!dailyTask) return false;
    return (
      this.isUserMatch(dailyTask.owner) ||
      this.isUserMatch(dailyTask.owner_id) ||
      this.isUserMatch(dailyTask.owner_username) ||
      this.isUserMatch(dailyTask.owner_name) ||
      this.isUserMatch(dailyTask.user)
    );
  },




  getStatusBadgeClass(status) {
    switch (status) {
      case "COMPLETED": return "success";
      case "IN_PROGRESS": return "info";
      case "BLOCKED": return "danger";
      case "REVIEW": return "warning";
      case "CANCELLED": return "ghost";
      default: return "ghost";
    }
  }
};

export async function renderProjectPage(req = {}) {
  setPageHeader("Project Management", "Unified Operational & Execution Workspace");
  const workspace = document.getElementById("workspace");
  if (!workspace) return;

  if (req && req.params && req.params.id) {
    projectPage.activeProjectId = req.params.id;
  }

  workspace.innerHTML = await projectPage.render();
  await projectPage.afterRender();
}

// Reactive data synchronization
eventBus.on("pm:updated", async () => {
  if (state.view === "project-flow" || state.view === "projects") {
    await projectPage.loadProjectDetail();
  }
});

eventBus.on("company:changed", async () => {
  state.pm.loaded = false;
  if (state.view === "project-flow" || state.view === "projects") {
    await projectPage.loadInitialData();
  }
});