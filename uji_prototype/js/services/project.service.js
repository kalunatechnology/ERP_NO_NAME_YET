/**
 * Project Management Service
 */

import { state } from "../core/state.js";
import { requestJSON } from "../core/http.js";
import { normalizeList } from "../utils/formatters.js";
import { eventBus } from "../core/event-bus.js";

export const PM_SOURCES = {
  orders: "/api/v1/sales/orders/?page_size=100",
  documents: "/api/v1/core/business-documents/?page_size=300",
  parties: "/api/v1/master-data/parties/?page_size=300",
  changes: "/api/v1/projects/change-requests/?page_size=100",
  changeMaterials: "/api/v1/projects/change-request-materials/?page_size=200",
  issues: "/api/v1/projects/issues/?page_size=100",
  issueActions: "/api/v1/projects/issue-actions/?page_size=200",
  dispatches: "/api/v1/projects/dispatches/?page_size=200",
  requisitions: "/api/v1/procurement/purchase-requisitions/?page_size=200",
  productionOrders: "/api/v1/manufacturing/production-orders/?page_size=200",
  workOrders: "/api/v1/manufacturing/work-orders/?page_size=200",
  members: "/api/v1/projects/members/?page_size=200",
  users: "/api/v1/accounts/users/?page_size=200",
  products: "/api/v1/master-data/products/?page_size=200",
  warehouses: "/api/v1/master-data/warehouses/?page_size=100",
  machines: "/api/v1/master-data/machines/?page_size=200",
};

export async function loadPMBackend(force = false) {
  if (state.pm.loaded && !force) return;
  state.pm.loading = true;
  eventBus.emit("pm:loading", true);

  try {
    const [projectsRes, stagesRes, tasksRes, milestonesRes, resourcesRes, timesheetsRes, equipmentRes, costsRes, briefsRes, costEntriesRes, proposalsRes, fundingsRes, changesRes] =
      await Promise.all([
        requestJSON("/api/v1/projects/projects/?page_size=100").catch(() => []),
        requestJSON("/api/v1/projects/readiness-checks/?page_size=200").catch(() => []),
        requestJSON("/api/v1/projects/tasks/?page_size=200").catch(() => []),
        requestJSON("/api/v1/projects/milestones/?page_size=200").catch(() => []),
        requestJSON("/api/v1/projects/material-requirements/?page_size=200").catch(() => []),
        requestJSON("/api/v1/projects/timesheets/?page_size=200").catch(() => []),
        requestJSON("/api/v1/projects/equipment-usages/?page_size=200").catch(() => []),
        requestJSON("/api/v1/projects/progress-snapshots/?page_size=100").catch(() => []),
        requestJSON("/api/v1/projects/technical-briefs/?page_size=100").catch(() => []),
        requestJSON("/api/v1/finance/project-cost-entries/?page_size=200").catch(() => []),
        requestJSON("/api/v1/finance/billing-proposals/?page_size=200").catch(() => []),
        requestJSON("/api/v1/finance/project-fundings/?page_size=100").catch(() => []),
        requestJSON("/api/v1/projects/change-requests/?page_size=100").catch(() => []),
      ]);

    const projects = normalizeList(projectsRes).rows;
    const stages = normalizeList(stagesRes).rows;
    const tasks = normalizeList(tasksRes).rows;
    const milestones = normalizeList(milestonesRes).rows;
    const resources = normalizeList(resourcesRes).rows;
    const timesheets = normalizeList(timesheetsRes).rows;
    const equipment = normalizeList(equipmentRes).rows;
    const costs = normalizeList(costsRes).rows;
    const briefs = normalizeList(briefsRes).rows;
    const costEntries = normalizeList(costEntriesRes).rows;
    const proposals = normalizeList(proposalsRes).rows;
    const fundings = normalizeList(fundingsRes).rows;
    const changes = normalizeList(changesRes).rows;

    state.pm.projects = projects.map(p => {
      const pTasks = tasks.filter(t => String(t.project) === String(p.id));
      const pStages = stages.filter(s => String(s.project) === String(p.id));
      const pMilestones = milestones.filter(m => String(m.project) === String(p.id));
      const pResources = resources.filter(r => String(r.project) === String(p.id));
      const pTimesheets = timesheets.filter(t => String(t.project) === String(p.id));
      const pEquipment = equipment.filter(e => String(e.project) === String(p.id));
      const pCost = costs.filter(c => String(c.project) === String(p.id));
      const pBrief = briefs.find(b => String(b.project) === String(p.id)) || null;
      const pCostEntries = costEntries.filter(c => String(c.project) === String(p.id));
      const pProposals = proposals.filter(pr => String(pr.project) === String(p.id));
      const pFundings = fundings.filter(f => String(f.project) === String(p.id));
      const pChanges = changes.filter(ch => String(ch.project) === String(p.id));

      const calcBudget = Number(p.budget_amount || p.total_budget || 0);
      const actualCost = Number(p.actual_cost || 0);

      return {
        ...p,
        project_name: p.name || p.project_name || `Proyek ${p.id}`,
        project_code: p.code || p.project_code || `PRJ-${String(p.id).slice(0, 4)}`,
        status: p.lifecycle_status || p.status || "DRAFT",
        progress: p.progress_percentage ?? p.progress ?? (pTasks.length ? Math.round((pTasks.filter(t => t.status === "DONE").length / pTasks.length) * 100) : 0),
        budget: calcBudget,
        actual_cost: actualCost,
        stages: pStages,
        tasks: pTasks,
        milestones: pMilestones,
        resources: pResources,
        timesheets: pTimesheets,
        equipment: pEquipment,
        technical_brief: pBrief,
        cost_entries: pCostEntries,
        billing_proposals: pProposals,
        fundings: pFundings,
        change_requests: pChanges,
        progress_snapshots: pCost,
      };
    });

    if (state.pm.projects.length && !state.pm.selectedId) {
      state.pm.selectedId = state.pm.projects[0].id;
    }

    state.pm.loaded = true;
    state.pm.live = true;
    state.pm.loading = false;
    eventBus.emit("pm:loaded", state.pm.projects);
  } catch (error) {
    state.pm.loading = false;
    eventBus.emit("pm:loading", false);
    throw error;
  }
}

export async function loadPMOperationalData(force = false) {
  if (state.pm.operationalLoaded && !force) return;
  try {
    const rows = await Promise.all(
      Object.entries(PM_SOURCES).map(async ([k, path]) => {
        try {
          return [k, normalizeList(await requestJSON(path, { method: "GET" })).rows];
        } catch {
          return [k, []];
        }
      })
    );
    Object.assign(state.pm, Object.fromEntries(rows));
    state.pm.operationalLoaded = true;
    eventBus.emit("pm:operationalLoaded", state.pm);
  } catch (err) {
    console.warn("Could not load PM operational data:", err);
  }
}

export async function loadPMAccountingData(force = false) {
  if (state.pm.accountingLoaded && !force) return;
  try {
    const [fundingsRes, costRes, proposalsRes] = await Promise.all([
      requestJSON("/api/v1/finance/project-fundings/?page_size=200").catch(() => []),
      requestJSON("/api/v1/finance/project-cost-entries/?page_size=200").catch(() => []),
      requestJSON("/api/v1/finance/billing-proposals/?page_size=200").catch(() => []),
    ]);
    state.pm.fundings = normalizeList(fundingsRes).rows;
    state.pm.costEntries = normalizeList(costRes).rows;
    state.pm.billingProposals = normalizeList(proposalsRes).rows;
    state.pm.accountingLoaded = true;
    eventBus.emit("pm:accountingLoaded", state.pm);
  } catch (err) {
    console.warn("Could not load PM accounting data:", err);
  }
}

export async function advancePMFlow(project, action) {
  const res = await requestJSON(`/api/v1/commands/projects/projects/${project.id}/flow-status/`, { method: "GET" });
  const flow = res?.data || res;
  const checks = flow.checks || {};
  const s = String(flow.flow_status || project.lifecycle_status || project.status || "").toUpperCase();
  let command;

  if (action === "stock-ready") {
    throw new Error("Stok tidak dapat disimulasikan pada mode backend. Buat penerimaan/reservasi material yang nyata.");
  }

  if (["VERIFIED"].includes(s) || (checks.verified && !checks.material_reserved)) {
    if (flow.can_reserve || checks.stock_availability) command = "reserve-materials";
  } else if (["RESOURCE_RESERVED", "MATERIAL_RESERVED", "RESERVED"].includes(s) || (checks.material_reserved && !checks.project_started)) {
    if (flow.can_start || checks.material_reserved) command = "start";
  } else if (!checks.verified || ["DRAFT", "PLANNED", "VERIFICATION_FAILED"].includes(s)) {
    if (flow.can_verify || checks.incoming_order) command = "verify";
  } else if (["STARTED", "IN_PROGRESS", "ACTIVE"].includes(s)) {
    if (Number(project.progress) >= 100) command = "close";
    else throw new Error("Progress proyek belum 100%. Selesaikan seluruh task dan milestone terlebih dahulu.");
  }

  if (!command) {
    throw new Error(
      flow.missing_prerequisites?.length
        ? `Prasyarat belum lengkap: ${flow.missing_prerequisites.join(", ")}`
        : "Tidak ada transisi backend yang tersedia untuk status proyek ini."
    );
  }

  await requestJSON(`/api/v1/commands/projects/projects/${project.id}/${command}/`, {
    method: "POST",
    body: command === "close" ? { note: "Closing dari Project Management" } : {},
  });

  state.pm.loaded = false;
  state.pm.operationalLoaded = false;
  await loadPMBackend(true);
  await loadPMOperationalData(true);
  return command;
}

export async function submitPMBillingProposal(id) {
  return requestJSON(`/api/v1/finance/billing-proposals/${id}/submit/`, { method: "POST", body: {} });
}

export async function submitPMFundingRequest(id) {
  return requestJSON(`/api/v1/finance/project-fundings/${id}/submit/`, { method: "POST", body: {} });
}

export async function savePMCostEntry(payload) {
  const res = await requestJSON("/api/v1/finance/project-cost-entries/", { method: "POST", body: payload });
  eventBus.emit("pm:updated", res);
  eventBus.emit("finance:updated", res);
  return res;
}

export async function savePMBillingProposal(payload) {
  const res = await requestJSON("/api/v1/finance/billing-proposals/", { method: "POST", body: payload });
  eventBus.emit("pm:updated", res);
  eventBus.emit("finance:updated", res);
  return res;
}

export async function recalculateProjectHealth(projectId) {
  const res = await requestJSON(`/api/v1/commands/projects/projects/${projectId}/recalculate-health/`, { method: "POST", body: {} });
  eventBus.emit("pm:updated", res);
  return res;
}

export async function getWeeklyMonitoring(projectId) {
  return requestJSON(`/api/v1/commands/projects/projects/${projectId}/weekly-monitoring/`, { method: "GET" });
}

export async function createProject(data) {
  const res = await requestJSON("/api/v1/projects/projects/", {
    method: "POST",
    body: {
      project_name: data.project_name,
      project_code: data.project_code || `PRJ-${Date.now().toString().slice(-4)}`,
      customer_party: data.customer_party || null,
      budget_amount: data.budget_amount || 0,
      contract_amount: data.contract_amount || 0,
      planned_start_date: data.planned_start_date || null,
      planned_end_date: data.planned_end_date || null,
      description: data.description || "",
      status: "ACTIVE",
      lifecycle_status: "STARTED",
    },
  });
  eventBus.emit("pm:updated", res);
  return res;
}

export async function createProjectTask(data) {
  const res = await requestJSON("/api/v1/projects/tasks/", {
    method: "POST",
    body: {
      project: data.project,
      title: data.title,
      description: data.description || "",
      planned_start: data.planned_start || null,
      planned_end: data.planned_end || null,
      status: "TODO",
    },
  });
  eventBus.emit("pm:updated", res);
  return res;
}

export async function createFundingRequest(data) {
  const res = await requestJSON("/api/v1/finance/project-fundings/", {
    method: "POST",
    body: {
      project: data.project,
      purpose: data.purpose,
      requested_amount: data.requested_amount,
      approved_limit: data.approved_limit || data.requested_amount,
      funding_type: data.funding_type || "PROJECT_EXECUTION",
      status: data.status || "SUBMITTED",
    },
  });
  eventBus.emit("pm:updated", res);
  eventBus.emit("finance:updated", res);
  return res;
}

export async function deleteProject(id) {
  const res = await requestJSON(`/api/v1/projects/projects/${id}/`, { method: "DELETE" });
  if (state.pm?.projects) {
    state.pm.projects = state.pm.projects.filter(p => String(p.id) !== String(id));
  }
  eventBus.emit("pm:updated", res);
  return res;
}

export async function deleteProjectTask(id) {
  const res = await requestJSON(`/api/v1/projects/tasks/${id}/`, { method: "DELETE" });
  const activeProj = (state.pm?.projects || []).find(p => String(p.id) === String(state.pm.selectedId));
  if (activeProj && activeProj.tasks) {
    activeProj.tasks = activeProj.tasks.filter(t => String(t.id) !== String(id));
  }
  eventBus.emit("pm:updated", res);
  return res;
}

export async function deleteFundingRequest(id) {
  const res = await requestJSON(`/api/v1/finance/project-fundings/${id}/`, { method: "DELETE" });
  if (state.pm?.fundings) {
    state.pm.fundings = state.pm.fundings.filter(f => String(f.id) !== String(id));
  }
  eventBus.emit("pm:updated", res);
  eventBus.emit("finance:updated", res);
  return res;
}

export async function createMaterialRequirement(data) {
  const res = await requestJSON("/api/v1/projects/material-requirements/", {
    method: "POST",
    body: {
      project: data.project,
      product: data.product || null,
      warehouse: data.warehouse || null,
      required_quantity: data.required_quantity || 1,
      reserved_quantity: 0,
      issued_quantity: 0,
      status: data.status || "PLANNED",
    },
  });
  eventBus.emit("pm:updated", res);
  return res;
}

export async function deleteMaterialRequirement(id) {
  const res = await requestJSON(`/api/v1/projects/material-requirements/${id}/`, { method: "DELETE" });
  if (state.pm?.materialRequirements) {
    state.pm.materialRequirements = state.pm.materialRequirements.filter(m => String(m.id) !== String(id));
  }
  eventBus.emit("pm:updated", res);
  return res;
}

export async function createMasterProduct(data) {
  const res = await requestJSON("/api/v1/master-data/products/", {
    method: "POST",
    body: {
      product_code: data.product_code || `MAT-${Date.now().toString().slice(-6)}`,
      product_name: data.product_name,
      product_type: data.product_type || "MATERIAL",
      stock_item: true,
      purchase_item: true,
      sales_item: false,
      status: "ACTIVE",
    },
  });
  return res;
}

export async function createProgressSnapshot(data) {
  const res = await requestJSON("/api/v1/projects/progress-snapshots/", {
    method: "POST",
    body: {
      project: data.project,
      actual_progress_percent: data.actual_progress_percent,
      planned_progress_percent: data.planned_progress_percent || data.actual_progress_percent,
      snapshot_at: data.snapshot_at || new Date().toISOString(),
      progress_status: data.progress_status || (Number(data.actual_progress_percent) >= Number(data.planned_progress_percent || 0) ? "ON_TRACK" : "BEHIND"),
    },
  });
  eventBus.emit("pm:updated", res);
  return res;
}

export async function createChangeRequest(data) {
  const res = await requestJSON("/api/v1/projects/change-requests/", {
    method: "POST",
    body: {
      project: data.project,
      title: data.title || "Penyesuaian Proyek",
      change_type: data.change_type || "SCOPE",
      scope_change: data.scope_change || data.description || "",
      cost_impact: data.cost_impact || 0,
      schedule_impact_days: data.schedule_impact_days || 0,
      reason: data.reason || "",
      status: "DRAFT",
    },
  });
  eventBus.emit("pm:updated", res);
  return res;
}

export async function analyzeChangeRequest(id, payload = {}) {
  const res = await requestJSON(`/api/v1/projects/change-requests/${id}/analyze/`, {
    method: "POST",
    body: payload,
  });
  eventBus.emit("pm:updated", res);
  return res;
}

export async function submitClientChangeRequest(id) {
  const res = await requestJSON(`/api/v1/projects/change-requests/${id}/submit-client/`, {
    method: "POST",
    body: {},
  });
  eventBus.emit("pm:updated", res);
  return res;
}

export async function decideChangeRequest(id, decision = "APPROVED", note = "") {
  const res = await requestJSON(`/api/v1/projects/change-requests/${id}/client-decision/`, {
    method: "POST",
    body: { decision, note },
  });
  eventBus.emit("pm:updated", res);
  return res;
}

export async function updateProjectFinancialTargetsService(projectId, { contract_amount, budget_amount, target_margin_percent, note = "" }) {
  const p = (state.pm.projects || []).find(proj => String(proj.id) === String(projectId));
  if (p) {
    if (contract_amount !== undefined) p.contract_amount = Number(contract_amount);
    if (budget_amount !== undefined) {
      p.budget_amount = Number(budget_amount);
      p.budget = Number(budget_amount);
    }
    if (target_margin_percent !== undefined) p.target_margin_percent = Number(target_margin_percent);
  }

  // Sync to backend command API
  try {
    await requestJSON(`/api/v1/commands/projects/${projectId}/financial-targets/`, {
      method: "POST",
      body: {
        contract_amount: Number(contract_amount),
        budget_amount: Number(budget_amount),
        target_margin_percent: Number(target_margin_percent),
        note: note || "Pembaruan target finansial proyek",
      },
    });
  } catch (e) {
    console.warn("Backend financial-targets command notice:", e);
  }

  eventBus.emit("pm:updated", p);
  return p;
}

// ==========================================
// ARSALYNK REAL DAILY TIMESLOT LOGS (10 - 20 AGUSTUS 2026)
// ==========================================

export const ARSALYNK_REAL_LOGS = [
  // SENIN 10/8/2026 (WEEK 1)
  { id: "log-101", date: "Senin 10/8/2026", day_name: "Senin", week_number: 1, time: "09.00 - 09.15", input: "Briefing pagi bersama tim dan mengecek Today Task (task yang harus selesai hari ini)", output: "Daftar Today Task tim sudah dikonfirmasi", status: "Selesai", notes: "" },
  { id: "log-102", date: "Senin 10/8/2026", day_name: "Senin", week_number: 1, time: "09.15 - 11.00", input: "Fokus pada revisi dari deployment kaluna", output: "Hasil revisi sudah sesuai tidak ada masalah", status: "Selesai", notes: "" },
  { id: "log-103", date: "Senin 10/8/2026", day_name: "Senin", week_number: 1, time: "11.00 - 11.45", input: "Penyesuaian design lanyard dari design Mas Jun", output: "Design lanyard sudah dibuat dan disesuaikan", status: "Selesai", notes: "" },
  { id: "log-104", date: "Senin 10/8/2026", day_name: "Senin", week_number: 1, time: "12.00 - 13.00", input: "Istirahat makan siang", output: "Istirahat", status: "Selesai", notes: "" },
  { id: "log-105", date: "Senin 10/8/2026", day_name: "Senin", week_number: 1, time: "13.00 - 15.00", input: "Penyesuaian ulang semua gambar data dan pengecekan akhir Arsalynk dan Kaluna untuk email dan sosial media", output: "Seluruh gambar disesuaikan & cocok dengan brief", status: "Selesai", notes: "" },
  { id: "log-106", date: "Senin 10/8/2026", day_name: "Senin", week_number: 1, time: "15.00 - 15.45", input: "Penyesuaian SEO untuk Kaluna dan Arsalynk", output: "SEO sudah disesuaikan di website sebelum proses development", status: "Selesai", notes: "" },
  { id: "log-107", date: "Senin 10/8/2026", day_name: "Senin", week_number: 1, time: "15.00 - 16.30", input: "Cek akhir mengenai deployment", output: "Proses development selesai dan Google Search Console sudah disetting", status: "Selesai", notes: "" },
  { id: "log-108", date: "Senin 10/8/2026", day_name: "Senin", week_number: 1, time: "16.30 - 16.45", input: "Update status seluruh task (selesai/tertunda) ke tim", output: "Semua status task terlaporkan", status: "Selesai", notes: "" },
  { id: "log-109", date: "Senin 10/8/2026", day_name: "Senin", week_number: 1, time: "16.45 - 17.00", input: "Menyusun Daily Report tim dan menetapkan rencana kerja (To Do) besok (briefing akhir)", output: "Daily Report tim dan rencana besok selesai dibuat", status: "Selesai", notes: "" },

  // SELASA 11/8/2026 (WEEK 1)
  { id: "log-201", date: "Selasa 11/8/2026", day_name: "Selasa", week_number: 1, time: "09.00 - 09.15", input: "Briefing pagi bersama tim dan mengecek Today Task", output: "Daftar Today Task tim sudah dikonfirmasi", status: "Selesai", notes: "" },
  { id: "log-202", date: "Selasa 11/8/2026", day_name: "Selasa", week_number: 1, time: "09.15 - 11.00", input: "Penyesuaian Kode Awal dan analisis arsitektur ERP", output: "Kode sudah dicek dengan rencana dummy finance & project management untuk uji coba nyata", status: "Selesai", notes: "" },
  { id: "log-203", date: "Selasa 11/8/2026", day_name: "Selasa", week_number: 1, time: "11.00 - 12.00", input: "Proses uji coba data dummy ERP dengan kasus nyata", output: "Data endpoint siap digunakan untuk pengujian kasus nyata", status: "Selesai", notes: "" },
  { id: "log-204", date: "Selasa 11/8/2026", day_name: "Selasa", week_number: 1, time: "12.00 - 13.00", input: "Istirahat makan siang", output: "Istirahat", status: "Selesai", notes: "" },
  { id: "log-205", date: "Selasa 11/8/2026", day_name: "Selasa", week_number: 1, time: "13.00 - 15.00", input: "Mempelajari UI dari Mas Oman dan Mas Jun agar sinkron dengan backend", output: "Diskusi alur modul finance accounting dan uji coba prototype", status: "Selesai", notes: "" },
  { id: "log-206", date: "Selasa 11/8/2026", day_name: "Selasa", week_number: 1, time: "15.00 - 15.45", input: "Proses uji awal modul Finance, Operational, dan lainnya", output: "Uji coba berhasil, persiapan penyesuaian routing", status: "Selesai", notes: "" },
  { id: "log-207", date: "Selasa 11/8/2026", day_name: "Selasa", week_number: 1, time: "15.00 - 16.30", input: "Pembuatan frontend sederhana untuk modul tertentu", output: "Frontend prototype siap dalam alur uji coba", status: "Selesai", notes: "" },
  { id: "log-208", date: "Selasa 11/8/2026", day_name: "Selasa", week_number: 1, time: "16.30 - 16.45", input: "Update status seluruh task ke tim", output: "Status task terupdate", status: "Selesai", notes: "" },
  { id: "log-209", date: "Selasa 11/8/2026", day_name: "Selasa", week_number: 1, time: "16.45 - 17.00", input: "Menyusun Daily Report tim dan To Do besok", output: "Daily Report dan rencana besok selesai", status: "Selesai", notes: "" },

  // RABU 12/8/2026 (WEEK 1)
  { id: "log-301", date: "Rabu 12/8/2026", day_name: "Rabu", week_number: 1, time: "09.00 - 09.15", input: "Briefing pagi bersama tim dan cek Today Task", output: "Today Task terkonfirmasi", status: "Selesai", notes: "" },
  { id: "log-302", date: "Rabu 12/8/2026", day_name: "Rabu", week_number: 1, time: "09.15 - 11.00", input: "Validasi alur data modul Finance dan eksekusi modul Project Management", output: "Modul Finance secara alur siap dieksekusi", status: "Selesai", notes: "" },
  { id: "log-303", date: "Rabu 12/8/2026", day_name: "Rabu", week_number: 1, time: "11.00 - 12.00", input: "Pengecekan SEO Kaluna, Arsalynk, dan uji coba SEO Artic", output: "Kaluna dan Arsalynk terverifikasi update", status: "On Progress", notes: "" },
  { id: "log-304", date: "Rabu 12/8/2026", day_name: "Rabu", week_number: 1, time: "12.00 - 13.00", input: "Istirahat makan siang", output: "Istirahat", status: "Selesai", notes: "" },
  { id: "log-305", date: "Rabu 12/8/2026", day_name: "Rabu", week_number: 1, time: "13.00 - 15.00", input: "Pengujian struktur data dan flow modul Project Management", output: "Struktur flow berjalan dengan baik", status: "Selesai", notes: "" },
  { id: "log-306", date: "Rabu 12/8/2026", day_name: "Rabu", week_number: 1, time: "15.00 - 15.45", input: "Pembuatan frontend sederhana modul Project Management", output: "Frontend testing data berhasil dibuat", status: "Selesai", notes: "" },
  { id: "log-307", date: "Rabu 12/8/2026", day_name: "Rabu", week_number: 1, time: "15.00 - 16.30", input: "Pembuatan frontend sederhana untuk pengujian Project Management", output: "Data validasi sesuai", status: "Selesai", notes: "" },
  { id: "log-308", date: "Rabu 12/8/2026", day_name: "Rabu", week_number: 1, time: "16.30 - 16.45", input: "Update status seluruh task ke tim", output: "Semua status terlaporkan", status: "Selesai", notes: "" },
  { id: "log-309", date: "Rabu 12/8/2026", day_name: "Rabu", week_number: 1, time: "16.45 - 17.00", input: "Menyusun Daily Report tim dan rencana kerja besok", output: "Daily Report siap", status: "Selesai", notes: "" },

  // KAMIS 13/8/2026 (WEEK 1)
  { id: "log-401", date: "Kamis 13/8/2026", day_name: "Kamis", week_number: 1, time: "09.00 - 09.15", input: "Briefing pagi bersama tim dan cek Today Task", output: "Today Task terkonfirmasi", status: "Selesai", notes: "" },
  { id: "log-402", date: "Kamis 13/8/2026", day_name: "Kamis", week_number: 1, time: "09.15 - 11.00", input: "Pembuatan eksperimen tingkatan user dan perbaikan flow pada Project Management", output: "Tingkatan user & role permission berhasil dibuat", status: "Selesai", notes: "" },
  { id: "log-403", date: "Kamis 13/8/2026", day_name: "Kamis", week_number: 1, time: "11.00 - 12.00", input: "Pengujian dan evaluasi kembali SEO Arsalynt, Kaluna, dan Artic", output: "Request indexing Google Search Console terkirim", status: "On Progress", notes: "" },
  { id: "log-404", date: "Kamis 13/8/2026", day_name: "Kamis", week_number: 1, time: "12.00 - 13.00", input: "Istirahat makan siang", output: "Istirahat", status: "Selesai", notes: "" },
  { id: "log-405", date: "Kamis 13/8/2026", day_name: "Kamis", week_number: 1, time: "13.00 - 15.00", input: "Simulasi dan pengujian tingkatan user pada modul Project Management", output: "Simulasi role Finance & Project Manager sukses", status: "Selesai", notes: "" },
  { id: "log-406", date: "Kamis 13/8/2026", day_name: "Kamis", week_number: 1, time: "15.00 - 15.45", input: "Pembaruan fitur tambahan pada modul Finance", output: "Fitur persetujuan dana proyek (Funding Approval) ditambahkan", status: "Selesai", notes: "" },
  { id: "log-407", date: "Kamis 13/8/2026", day_name: "Kamis", week_number: 1, time: "15.00 - 16.30", input: "Pengujian dan validasi fitur tambahan pada modul Finance", output: "Fitur persetujuan funding tervalidasi", status: "Selesai", notes: "" },
  { id: "log-408", date: "Kamis 13/8/2026", day_name: "Kamis", week_number: 1, time: "16.30 - 16.45", input: "Update status seluruh task ke tim", output: "Status task terupdate", status: "Selesai", notes: "" },
  { id: "log-409", date: "Kamis 13/8/2026", day_name: "Kamis", week_number: 1, time: "16.45 - 17.00", input: "Menyusun Daily Report tim dan rencana kerja besok", output: "Daily Report siap", status: "Selesai", notes: "" },

  // JUMAT 14/8/2026 (WEEK 1)
  { id: "log-501", date: "Jumat 14/8/2026", day_name: "Jumat", week_number: 1, time: "09.00 - 09.15", input: "Briefing pagi bersama tim dan cek Today Task", output: "Today Task terkonfirmasi", status: "Selesai", notes: "" },
  { id: "log-502", date: "Jumat 14/8/2026", day_name: "Jumat", week_number: 1, time: "09.15 - 11.00", input: "Pembuatan dan perbaikan flow tambahan dari Mas Jun", output: "Flow tambahan Project Management dan Finance diimplementasikan", status: "Selesai", notes: "" },
  { id: "log-503", date: "Jumat 14/8/2026", day_name: "Jumat", week_number: 1, time: "11.00 - 12.00", input: "Pengujian dan evaluasi SEO Arsalynt, Kaluna, dan Artic", output: "Source code Artic disesuaikan", status: "On Progress", notes: "" },
  { id: "log-504", date: "Jumat 14/8/2026", day_name: "Jumat", week_number: 1, time: "12.00 - 13.00", input: "Istirahat makan siang", output: "Istirahat", status: "Selesai", notes: "" },
  { id: "log-505", date: "Jumat 14/8/2026", day_name: "Jumat", week_number: 1, time: "13.00 - 15.00", input: "Simulasi dan pengujian tingkatan user pada flow tambahan", output: "Akses antar level aman dan tervalidasi", status: "Selesai", notes: "" },
  { id: "log-506", date: "Jumat 14/8/2026", day_name: "Jumat", week_number: 1, time: "15.00 - 15.45", input: "Penambahan dan uji coba modul CMS awal", output: "Modul CMS ditambahkan ke prototype", status: "Selesai", notes: "" },
  { id: "log-507", date: "Jumat 14/8/2026", day_name: "Jumat", week_number: 1, time: "15.00 - 16.30", input: "Pengujian dan validasi modul CMS awal", output: "Komponen CMS berhasil dieksekusi", status: "Selesai", notes: "" },
  { id: "log-508", date: "Jumat 14/8/2026", day_name: "Jumat", week_number: 1, time: "16.30 - 16.45", input: "Update status seluruh task ke tim", output: "Report status selesai", status: "Selesai", notes: "" },
  { id: "log-509", date: "Jumat 14/8/2026", day_name: "Jumat", week_number: 1, time: "16.45 - 17.00", input: "Menyusun Daily Report tim dan rencana kerja besok", output: "Daily Report dalam penyusunan akhir", status: "Not done yet", notes: "" },

  // SELASA 18/8/2026 (WEEK 2)
  { id: "log-601", date: "Selasa 18/8/2026", day_name: "Selasa", week_number: 2, time: "09.00 - 09.15", input: "Briefing pagi bersama tim dan mengecek Today Task", output: "Today Task terkonfirmasi", status: "Selesai", notes: "" },
  { id: "log-602", date: "Selasa 18/8/2026", day_name: "Selasa", week_number: 2, time: "09.15 - 11.00", input: "Pengembangan modul CRM dengan fokus koneksi ke Finance dan PM", output: "Modul CRM dibuat dan alur awal diterapkan", status: "Selesai", notes: "" },
  { id: "log-603", date: "Selasa 18/8/2026", day_name: "Selasa", week_number: 2, time: "11.00 - 12.00", input: "Pengujian dan evaluasi kembali SEO Arsalynt, Kaluna, dan Artic", output: "Favicon dan metadata SEO disesuaikan", status: "On Progress", notes: "" },
  { id: "log-604", date: "Selasa 18/8/2026", day_name: "Selasa", week_number: 2, time: "12.00 - 13.00", input: "Istirahat makan siang", output: "Istirahat", status: "Selesai", notes: "" },
  { id: "log-605", date: "Selasa 18/8/2026", day_name: "Selasa", week_number: 2, time: "13.00 - 15.00", input: "Pembuatan data tingkat user untuk proyek CRM", output: "8 user dasar dan role permissions siap", status: "Selesai", notes: "" },
  { id: "log-606", date: "Selasa 18/8/2026", day_name: "Selasa", week_number: 2, time: "15.00 - 15.45", input: "Simulasi dan pengujian tingkatan user pada flow CRM", output: "Simulasi role Eksekutif & PM berjalan lancar", status: "Selesai", notes: "" },
  { id: "log-607", date: "Selasa 18/8/2026", day_name: "Selasa", week_number: 2, time: "15.00 - 16.30", input: "Validasi alur end-to-end modul CRM dan validasi datanya", output: "Alur CRM divalidasi", status: "On Progress", notes: "" },
  { id: "log-608", date: "Selasa 18/8/2026", day_name: "Selasa", week_number: 2, time: "16.30 - 16.45", input: "Update status seluruh task ke tim", output: "Status task terupdate", status: "Selesai", notes: "" },
  { id: "log-609", date: "Selasa 18/8/2026", day_name: "Selasa", week_number: 2, time: "16.45 - 17.00", input: "Menyusun Daily Report tim dan rencana kerja besok", output: "Daily Report selesai", status: "Selesai", notes: "" },

  // RABU 19/8/2026 (WEEK 2)
  { id: "log-701", date: "Rabu 19/8/2026", day_name: "Rabu", week_number: 2, time: "09.00 - 09.15", input: "Briefing pagi bersama tim dan mengecek Today Task", output: "Today Task terkonfirmasi", status: "Selesai", notes: "" },
  { id: "log-702", date: "Rabu 19/8/2026", day_name: "Rabu", week_number: 2, time: "09.15 - 11.00", input: "Pengecekan akhir alur data 3 modul ERP & pembuatan proyek terpisah khusus Arsalynk", output: "Flow base ERP siap digunakan dengan kustomisasi per tenant", status: "Selesai", notes: "" },
  { id: "log-703", date: "Rabu 19/8/2026", day_name: "Rabu", week_number: 2, time: "11.00 - 12.00", input: "Pengujian dan evaluasi kembali SEO Arsalynt, Kaluna, dan Artic", output: "Revisi bahan artikel dari Mas Jun diproses", status: "On Progress", notes: "" },
  { id: "log-704", date: "Rabu 19/8/2026", day_name: "Rabu", week_number: 2, time: "12.00 - 13.00", input: "Istirahat makan siang", output: "Istirahat", status: "Not done yet", notes: "" },
  { id: "log-705", date: "Rabu 19/8/2026", day_name: "Rabu", week_number: 2, time: "13.00 - 15.00", input: "Diskusi dan penyesuaian untuk ERP Arsalynk", output: "Insight implementasi ERP terpetakan", status: "Selesai", notes: "" },
  { id: "log-706", date: "Rabu 19/8/2026", day_name: "Rabu", week_number: 2, time: "15.00 - 15.45", input: "Update awal di bagian Project Management", output: "Pengaturan manajemen repositori proyek", status: "On Progress", notes: "Repositori proyek memuat seluruh file, source code, dan dokumentasi revisi terpusat" },
  { id: "log-707", date: "Rabu 19/8/2026", day_name: "Rabu", week_number: 2, time: "15.00 - 16.30", input: "Validasi alur end-to-end modul Project Management", output: "Penyesuaian data dummy khusus Arsalynk", status: "On Progress", notes: "Fokus ke validasi data Arsalynk terlebih dahulu" },
  { id: "log-708", date: "Rabu 19/8/2026", day_name: "Rabu", week_number: 2, time: "16.30 - 16.45", input: "Update status seluruh task ke tim", output: "Status task terupdate", status: "Not done yet", notes: "" },
  { id: "log-709", date: "Rabu 19/8/2026", day_name: "Rabu", week_number: 2, time: "16.45 - 17.00", input: "Menyusun Daily Report tim dan rencana kerja besok", output: "Daily Report dalam penyusunan", status: "Not done yet", notes: "" },

  // KAMIS 20/8/2026 (WEEK 2)
  { id: "log-801", date: "Kamis 20/8/2026", day_name: "Kamis", week_number: 2, time: "09.00 - 09.15", input: "Briefing pagi bersama tim dan mengecek Today Task", output: "Daftar Today Task tim sudah dikonfirmasi", status: "Selesai", notes: "" },
  { id: "log-802", date: "Kamis 20/8/2026", day_name: "Kamis", week_number: 2, time: "09.15 - 11.00", input: "Finalisasi requirement dan flow Project Management", output: "Requirement & cascading progress flow disepakati", status: "Selesai", notes: "" },
  { id: "log-803", date: "Kamis 20/8/2026", day_name: "Kamis", week_number: 2, time: "11.00 - 12.00", input: "Pengujian dan evaluasi kembali SEO Arsalynt, Kaluna, Artic", output: "Revisi SEO & aset artikel diterapkan", status: "On Progress", notes: "" },
  { id: "log-804", date: "Kamis 20/8/2026", day_name: "Kamis", week_number: 2, time: "12.00 - 13.00", input: "Istirahat makan siang", output: "Istirahat", status: "Not done yet", notes: "" },
  { id: "log-805", date: "Kamis 20/8/2026", day_name: "Kamis", week_number: 2, time: "13.00 - 15.00", input: "Pastikan Today Task ➔ Weekly Task ➔ Daily Task ➔ Progress saling terhubung", output: "Hierarki progres terhubung dan tervalidasi secara real-time", status: "On Progress", notes: "" },
  { id: "log-806", date: "Kamis 20/8/2026", day_name: "Kamis", week_number: 2, time: "15.00 - 15.45", input: "Testing Project Management dengan data riil dan implementasi frontend ERP", output: "Frontend testing berhasil dengan UI KPI Health & S-Curve", status: "Selesai", notes: "" },
  { id: "log-807", date: "Kamis 20/8/2026", day_name: "Kamis", week_number: 2, time: "15.00 - 16.30", input: "Validasi alur end-to-end modul Project Management dan integrasikan FE dengan data riil", output: "Data riil Arsalynk terhubung ke prototype", status: "On Progress", notes: "" },
  { id: "log-808", date: "Kamis 20/8/2026", day_name: "Kamis", week_number: 2, time: "16.30 - 16.45", input: "Update status seluruh task ke tim", output: "Status task terupdate", status: "Not done yet", notes: "" },
  { id: "log-809", date: "Kamis 20/8/2026", day_name: "Kamis", week_number: 2, time: "16.45 - 17.00", input: "Menyusun Daily Report tim dan menetapkan rencana kerja besok", output: "Daily Report tersusun", status: "Not done yet", notes: "" },
];

const STORAGE_KEY_WEEKLY_PREFIX = "arsalynt_pm_weekly_plans_";
const STORAGE_KEY_LOGS_PREFIX = "arsalynt_pm_daily_timesheets_";

export function getProjectDailyTimesheets(projectId) {
  if (!projectId) return ARSALYNK_REAL_LOGS;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_LOGS_PREFIX}${projectId}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Error reading daily timesheets:", e);
  }
  // Default to Arsalynk real logs
  saveProjectDailyTimesheets(projectId, ARSALYNK_REAL_LOGS);
  return ARSALYNK_REAL_LOGS;
}

export function saveProjectDailyTimesheets(projectId, logs) {
  if (!projectId) return;
  try {
    localStorage.setItem(`${STORAGE_KEY_LOGS_PREFIX}${projectId}`, JSON.stringify(logs));
  } catch (e) {
    console.warn("Error saving daily timesheets:", e);
  }
}

export function updateProjectDailyTimesheetStatus(projectId, logId, newStatus) {
  const logs = getProjectDailyTimesheets(projectId);
  const target = logs.find(l => String(l.id) === String(logId));
  if (target) {
    target.status = newStatus;
    saveProjectDailyTimesheets(projectId, logs);
    eventBus.emit("pm:updated", logs);
  }
  return logs;
}

export function generateArsalynkWeeklyStructure() {
  return [
    {
      id: "week-ars-1",
      week_number: 1,
      start_date: "2026-08-10",
      end_date: "2026-08-16",
      objective: "Persiapan Lingkungan, Analisis Arsitektur ERP & Penyesuaian Modul Finance/Project Management",
      weight_percent: 50,
      status: "IN_PROGRESS",
      calculated_progress: 88,
      progress: 88,
      tasks: [
        {
          id: "wtask-ars-101",
          task_name: "Deployment Kaluna, Aset Lanyard & SEO Arsalynk",
          assignee: "Mas Jun & Tim",
          priority: "HIGH",
          status: "COMPLETED",
          start_date: "2026-08-10",
          due_date: "2026-08-12",
          weight_percent: 30,
          progress: 100,
          daily_tasks: [
            { id: "d-101", day_name: "Senin 10/8", title: "Revisi deployment Kaluna & Lanyard Design", is_completed: true, progress_percent: 100 },
            { id: "d-102", day_name: "Senin 10/8", title: "Pengecekan akhir SEO Arsalynk & Google Search Console", is_completed: true, progress_percent: 100 }
          ]
        },
        {
          id: "wtask-ars-102",
          task_name: "Analisis Arsitektur ERP, Data Dummy & Alur Modul Finance",
          assignee: "Developer & PM",
          priority: "URGENT",
          status: "COMPLETED",
          start_date: "2026-08-11",
          due_date: "2026-08-13",
          weight_percent: 35,
          progress: 100,
          daily_tasks: [
            { id: "d-103", day_name: "Selasa 11/8", title: "Uji coba endpoint data dummy Finance & Project Management", is_completed: true, progress_percent: 100 },
            { id: "d-104", day_name: "Rabu 12/8", title: "Validasi alur data modul Finance & pembuatan FE prototype", is_completed: true, progress_percent: 100 }
          ]
        },
        {
          id: "wtask-ars-103",
          task_name: "Tingkatan User, Role Permission & Eksperimen CMS",
          assignee: "Developer & Mas Oman",
          priority: "HIGH",
          status: "IN_PROGRESS",
          start_date: "2026-08-13",
          due_date: "2026-08-15",
          weight_percent: 35,
          progress: 75,
          daily_tasks: [
            { id: "d-105", day_name: "Kamis 13/8", title: "Simulasi role Finance vs Project Manager", is_completed: true, progress_percent: 100 },
            { id: "d-106", day_name: "Jumat 14/8", title: "Integrasi modul CMS & Daily Report tim", is_completed: false, progress_percent: 50 }
          ]
        }
      ]
    },
    {
      id: "week-ars-2",
      week_number: 2,
      start_date: "2026-08-17",
      end_date: "2026-08-23",
      objective: "Pengembangan Modul CRM, Integrasi Khusus Tenant Arsalynk & Validasi Cascading Progress",
      weight_percent: 50,
      status: "IN_PROGRESS",
      calculated_progress: 65,
      progress: 65,
      tasks: [
        {
          id: "wtask-ars-201",
          task_name: "Pengembangan Modul CRM & Koneksi Data Finance/PM",
          assignee: "CRM Team & Developer",
          priority: "HIGH",
          status: "COMPLETED",
          start_date: "2026-08-18",
          due_date: "2026-08-19",
          weight_percent: 40,
          progress: 100,
          daily_tasks: [
            { id: "d-201", day_name: "Selasa 18/8", title: "Pembuatan 8 user dasar & simulasi role CRM", is_completed: true, progress_percent: 100 },
            { id: "d-202", day_name: "Selasa 18/8", title: "Validasi alur end-to-end CRM", is_completed: true, progress_percent: 100 }
          ]
        },
        {
          id: "wtask-ars-202",
          task_name: "Pengecekan 3 Modul ERP & Kustomisasi Khusus Arsalynk",
          assignee: "Lead Developer",
          priority: "URGENT",
          status: "IN_PROGRESS",
          start_date: "2026-08-19",
          due_date: "2026-08-21",
          weight_percent: 30,
          progress: 60,
          daily_tasks: [
            { id: "d-203", day_name: "Rabu 19/8", title: "Pengaturan repositori proyek & validasi dummy data Arsalynk", is_completed: true, progress_percent: 100 },
            { id: "d-204", day_name: "Kamis 20/8", title: "Implementasi alur Today Task ➔ Weekly Task ➔ Daily Task", is_completed: false, progress_percent: 60 }
          ]
        },
        {
          id: "wtask-ars-203",
          task_name: "Integrasi Frontend Prototype dengan Real Data & S-Curve Dashboard",
          assignee: "Frontend Team & PM",
          priority: "HIGH",
          status: "IN_PROGRESS",
          start_date: "2026-08-20",
          due_date: "2026-08-22",
          weight_percent: 30,
          progress: 50,
          daily_tasks: [
            { id: "d-205", day_name: "Kamis 20/8", title: "Testing Project Management dengan real data & S-Curve UI", is_completed: true, progress_percent: 100 },
            { id: "d-206", day_name: "Kamis 20/8", title: "Integrasi final FE dengan data backend", is_completed: false, progress_percent: 50 }
          ]
        }
      ]
    }
  ];
}

export function getProjectWeeklyPlans(projectId) {
  if (!projectId) return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_WEEKLY_PREFIX}${projectId}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Error reading weekly plans:", e);
  }
  // Initialize with real Arsalynk weekly structure
  const initial = generateArsalynkWeeklyStructure();
  saveProjectWeeklyPlans(projectId, initial);
  return initial;
}

export function saveProjectWeeklyPlans(projectId, plans) {
  if (!projectId) return;
  try {
    localStorage.setItem(`${STORAGE_KEY_WEEKLY_PREFIX}${projectId}`, JSON.stringify(plans));
  } catch (e) {
    console.warn("Error saving weekly plans:", e);
  }
}

export function calculateProjectHierarchicalProgress(plans) {
  if (!plans || plans.length === 0) {
    return {
      overall_progress: 0,
      total_weeks: 0,
      completed_weeks: 0,
      total_weekly_tasks: 0,
      completed_weekly_tasks: 0,
      total_daily_tasks: 0,
      completed_daily_tasks: 0,
      weeks: [],
    };
  }

  let totalDaily = 0;
  let completedDaily = 0;
  let totalWeeklyTasks = 0;
  let completedWeeklyTasks = 0;

  const processedWeeks = plans.map(week => {
    const tasks = week.tasks || [];
    totalWeeklyTasks += tasks.length;

    let weekTaskSum = 0;
    let weekWeightSum = 0;

    const processedTasks = tasks.map(task => {
      const daily = task.daily_tasks || [];
      totalDaily += daily.length;

      let taskProg = 0;
      if (daily.length > 0) {
        const completedD = daily.filter(d => d.is_completed || Number(d.progress_percent || 0) === 100).length;
        completedDaily += completedD;
        const dailySum = daily.reduce((sum, d) => sum + (d.is_completed ? 100 : Number(d.progress_percent || 0)), 0);
        taskProg = Math.round(dailySum / daily.length);
      } else {
        taskProg = task.status === "COMPLETED" ? 100 : Number(task.progress || 0);
      }

      if (taskProg === 100) completedWeeklyTasks++;

      const taskWeight = Number(task.weight_percent || 1);
      weekWeightSum += taskWeight;
      weekTaskSum += taskProg * taskWeight;

      let currentStatus = task.status || (taskProg === 100 ? "COMPLETED" : taskProg > 0 ? "IN_PROGRESS" : "NOT_STARTED");
      if (taskProg === 100) currentStatus = "COMPLETED";

      return {
        ...task,
        progress: taskProg,
        status: currentStatus,
      };
    });

    const calculatedWeekProg = weekWeightSum > 0 ? Math.round(weekTaskSum / weekWeightSum) : (tasks.length === 0 ? 0 : 0);
    const finalWeekProg = week.manual_override_progress !== undefined && week.manual_override_progress !== null
      ? Number(week.manual_override_progress)
      : calculatedWeekProg;

    const weekStatus = finalWeekProg === 100 ? "COMPLETED" : finalWeekProg > 0 ? "IN_PROGRESS" : "NOT_STARTED";

    return {
      ...week,
      tasks: processedTasks,
      calculated_progress: calculatedWeekProg,
      progress: finalWeekProg,
      status: weekStatus,
    };
  });

  const completedWeeks = processedWeeks.filter(w => w.progress === 100).length;
  let overallSum = 0;
  let overallWeightSum = 0;

  processedWeeks.forEach(w => {
    const weight = Number(w.weight_percent || 1);
    overallWeightSum += weight;
    overallSum += (w.progress || 0) * weight;
  });

  const overallProgress = overallWeightSum > 0 ? Math.round(overallSum / overallWeightSum) : 0;

  return {
    overall_progress: overallProgress,
    total_weeks: processedWeeks.length,
    completed_weeks: completedWeeks,
    total_weekly_tasks: totalWeeklyTasks,
    completed_weekly_tasks: completedWeeklyTasks,
    total_daily_tasks: totalDaily,
    completed_daily_tasks: completedDaily,
    weeks: processedWeeks,
  };
}

export function createProjectWeekService(projectId, data) {
  const plans = getProjectWeeklyPlans(projectId);
  const nextNum = plans.length + 1;
  const newWeek = {
    id: `week-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    week_number: data.week_number || nextNum,
    start_date: data.start_date || new Date().toISOString().slice(0, 10),
    end_date: data.end_date || new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10),
    objective: data.objective || `Objective Minggu ${nextNum}`,
    weight_percent: Number(data.weight_percent || 25),
    status: "NOT_STARTED",
    calculated_progress: 0,
    progress: 0,
    review_notes: "",
    tasks: [],
  };

  plans.push(newWeek);
  saveProjectWeeklyPlans(projectId, plans);
  syncProjectProgress(projectId);
  return newWeek;
}

export function createWeeklyTaskService(projectId, weekId, taskData) {
  const plans = getProjectWeeklyPlans(projectId);
  const week = plans.find(w => String(w.id) === String(weekId));
  if (!week) throw new Error("Week tidak ditemukan.");

  const newTask = {
    id: `wtask-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    task_name: taskData.task_name || "Task Baru",
    description: taskData.description || "",
    assignee: taskData.assignee || "Project Team",
    priority: taskData.priority || "MEDIUM",
    status: "NOT_STARTED",
    start_date: taskData.start_date || week.start_date,
    due_date: taskData.due_date || week.end_date,
    original_due_date: taskData.due_date || week.end_date,
    weight_percent: Number(taskData.weight_percent || 1),
    progress: 0,
    carried_from_week: taskData.carried_from_week || null,
    daily_tasks: taskData.daily_tasks || [],
  };

  week.tasks = week.tasks || [];
  week.tasks.push(newTask);
  saveProjectWeeklyPlans(projectId, plans);
  syncProjectProgress(projectId);
  return newTask;
}

export function addDailyTaskService(projectId, weekId, taskId, dailyData) {
  const plans = getProjectWeeklyPlans(projectId);
  const week = plans.find(w => String(w.id) === String(weekId));
  if (!week) throw new Error("Week tidak ditemukan.");
  const task = (week.tasks || []).find(t => String(t.id) === String(taskId));
  if (!task) throw new Error("Weekly task tidak ditemukan.");

  const newDaily = {
    id: `dtask-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    day_name: dailyData.day_name || "Senin",
    task_date: dailyData.task_date || new Date().toISOString().slice(0, 10),
    title: dailyData.title || "Daily Task",
    is_completed: Boolean(dailyData.is_completed),
    progress_percent: dailyData.is_completed ? 100 : Number(dailyData.progress_percent || 0),
    notes: dailyData.notes || "",
  };

  task.daily_tasks = task.daily_tasks || [];
  task.daily_tasks.push(newDaily);
  saveProjectWeeklyPlans(projectId, plans);
  syncProjectProgress(projectId);
  return newDaily;
}

export function updateDailyTaskService(projectId, weekId, taskId, dailyId, updates) {
  const plans = getProjectWeeklyPlans(projectId);
  const week = plans.find(w => String(w.id) === String(weekId));
  if (!week) throw new Error("Week tidak ditemukan.");
  const task = (week.tasks || []).find(t => String(t.id) === String(taskId));
  if (!task) throw new Error("Weekly task tidak ditemukan.");
  const daily = (task.daily_tasks || []).find(d => String(d.id) === String(dailyId));
  if (!daily) throw new Error("Daily task tidak ditemukan.");

  Object.assign(daily, updates);
  if (updates.is_completed !== undefined) {
    daily.progress_percent = updates.is_completed ? 100 : (updates.progress_percent ?? 0);
  }

  saveProjectWeeklyPlans(projectId, plans);
  syncProjectProgress(projectId);
  return daily;
}

export function carryOverTaskService(projectId, fromWeekId, toWeekId, taskId) {
  const plans = getProjectWeeklyPlans(projectId);
  const fromWeek = plans.find(w => String(w.id) === String(fromWeekId));
  const toWeek = plans.find(w => String(w.id) === String(toWeekId));
  if (!fromWeek || !toWeek) throw new Error("Week asal atau tujuan tidak ditemukan.");

  const task = (fromWeek.tasks || []).find(t => String(t.id) === String(taskId));
  if (!task) throw new Error("Task tidak ditemukan.");

  const carriedTask = {
    ...task,
    id: `wtask-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    task_name: `${task.task_name} (Lanjutan W${fromWeek.week_number})`,
    carried_from_week: fromWeek.id,
    start_date: toWeek.start_date,
    due_date: toWeek.end_date,
    // preserve current progress!
    progress: task.progress || 0,
    daily_tasks: (task.daily_tasks || []).map(d => ({
      ...d,
      id: `dtask-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    })),
  };

  toWeek.tasks = toWeek.tasks || [];
  toWeek.tasks.push(carriedTask);
  saveProjectWeeklyPlans(projectId, plans);
  syncProjectProgress(projectId);
  return carriedTask;
}

export function deleteWeeklyTaskService(projectId, weekId, taskId) {
  const plans = getProjectWeeklyPlans(projectId);
  const week = plans.find(w => String(w.id) === String(weekId));
  if (!week) return;
  week.tasks = (week.tasks || []).filter(t => String(t.id) !== String(taskId));
  saveProjectWeeklyPlans(projectId, plans);
  syncProjectProgress(projectId);
}

export function deleteDailyTaskService(projectId, weekId, taskId, dailyId) {
  const plans = getProjectWeeklyPlans(projectId);
  const week = plans.find(w => String(w.id) === String(weekId));
  if (!week) return;
  const task = (week.tasks || []).find(t => String(t.id) === String(taskId));
  if (!task) return;
  task.daily_tasks = (task.daily_tasks || []).filter(d => String(d.id) !== String(dailyId));
  saveProjectWeeklyPlans(projectId, plans);
  syncProjectProgress(projectId);
}

export function updateWeeklyTaskProgressService(projectId, weekId, taskId, newProgress, reason = "") {
  const plans = getProjectWeeklyPlans(projectId);
  const week = plans.find(w => String(w.id) === String(weekId));
  if (!week) throw new Error("Week tidak ditemukan.");
  const task = (week.tasks || []).find(t => String(t.id) === String(taskId));
  if (!task) throw new Error("Weekly task tidak ditemukan.");

  const prevProgress = Number(task.progress || 0);
  const nextProgress = Math.max(0, Math.min(100, Number(newProgress)));

  if (nextProgress < prevProgress && !reason.trim()) {
    throw new Error(`Penurunan progres dari ${prevProgress}% ke ${nextProgress}% memerlukan alasan/justifikasi teknis.`);
  }

  task.progress = nextProgress;
  task.status = nextProgress === 100 ? "COMPLETED" : nextProgress > 0 ? "IN_PROGRESS" : "NOT_STARTED";

  task.progress_history = task.progress_history || [];
  task.progress_history.push({
    timestamp: new Date().toISOString(),
    previous_progress: prevProgress,
    new_progress: nextProgress,
    reason: reason || (nextProgress === 100 ? "Task selesai dikerjakan" : "Update progres berkala"),
    updated_by: state.user?.username || "Project Manager",
  });

  saveProjectWeeklyPlans(projectId, plans);
  syncProjectProgress(projectId);

  // Sync snapshot to backend if connected
  try {
    createProgressSnapshot(projectId, {
      planned_progress_percent: nextProgress,
      actual_progress_percent: nextProgress,
      progress_status: nextProgress >= 70 ? "ON_TRACK" : nextProgress >= 40 ? "AHEAD" : "BEHIND",
    }).catch(e => console.warn("Backend snapshot sync warning:", e));
  } catch (e) {
    console.warn("Backend snapshot sync failed:", e);
  }

  return task;
}

export function overrideWeekProgressService(projectId, weekId, manualProgress, reason = "") {
  const plans = getProjectWeeklyPlans(projectId);
  const week = plans.find(w => String(w.id) === String(weekId));
  if (!week) throw new Error("Week tidak ditemukan.");

  week.manual_override_progress = Number(manualProgress);
  week.override_reason = reason;
  week.progress_history = week.progress_history || [];
  week.progress_history.push({
    timestamp: new Date().toISOString(),
    type: "MANUAL_OVERRIDE",
    manual_progress: Number(manualProgress),
    reason: reason || "Manual override oleh Project Manager",
    user: state.user?.username || "Project Manager",
  });

  saveProjectWeeklyPlans(projectId, plans);
  syncProjectProgress(projectId);
  return week;
}

export function rescheduleWeeklyTaskService(projectId, weekId, taskId, newDueDate, reason = "") {
  const plans = getProjectWeeklyPlans(projectId);
  const week = plans.find(w => String(w.id) === String(weekId));
  if (!week) throw new Error("Week tidak ditemukan.");
  const task = (week.tasks || []).find(t => String(t.id) === String(taskId));
  if (!task) throw new Error("Weekly task tidak ditemukan.");

  task.original_due_date = task.original_due_date || task.due_date;
  task.due_date = newDueDate;
  task.reschedule_reason = reason;
  task.status_history = task.status_history || [];
  task.status_history.push({
    timestamp: new Date().toISOString(),
    action: "RESCHEDULE",
    from_date: task.original_due_date,
    to_date: newDueDate,
    reason,
  });

  saveProjectWeeklyPlans(projectId, plans);
  syncProjectProgress(projectId);
  return task;
}

export function markWeeklyTaskBlockedService(projectId, weekId, taskId, blockedReason) {
  const plans = getProjectWeeklyPlans(projectId);
  const week = plans.find(w => String(w.id) === String(weekId));
  if (!week) throw new Error("Week tidak ditemukan.");
  const task = (week.tasks || []).find(t => String(t.id) === String(taskId));
  if (!task) throw new Error("Weekly task tidak ditemukan.");

  task.status = "BLOCKED";
  task.blocked_reason = blockedReason;
  task.status_history = task.status_history || [];
  task.status_history.push({
    timestamp: new Date().toISOString(),
    action: "MARKED_BLOCKED",
    reason: blockedReason,
  });

  saveProjectWeeklyPlans(projectId, plans);
  syncProjectProgress(projectId);
  return task;
}

export function splitWeeklyTaskService(projectId, weekId, taskId, splitTitle, splitWeight = 50) {
  const plans = getProjectWeeklyPlans(projectId);
  const week = plans.find(w => String(w.id) === String(weekId));
  if (!week) throw new Error("Week tidak ditemukan.");
  const task = (week.tasks || []).find(t => String(t.id) === String(taskId));
  if (!task) throw new Error("Weekly task tidak ditemukan.");

  const origWeight = Number(task.weight_percent || 1);
  task.weight_percent = Math.round(origWeight * ((100 - splitWeight) / 100));

  const splitTask = {
    ...task,
    id: `wtask-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    task_name: splitTitle || `${task.task_name} (Bagian 2)`,
    weight_percent: Math.round(origWeight * (splitWeight / 100)),
    progress: 0,
    status: "NOT_STARTED",
    daily_tasks: [],
  };

  week.tasks.push(splitTask);
  saveProjectWeeklyPlans(projectId, plans);
  syncProjectProgress(projectId);
  return splitTask;
}

function syncProjectProgress(projectId) {
  const plans = getProjectWeeklyPlans(projectId);
  const result = calculateProjectHierarchicalProgress(plans);
  const activeProj = (state.pm?.projects || []).find(p => String(p.id) === String(projectId));
  if (activeProj) {
    activeProj.progress = result.overall_progress;
    activeProj.weekly_plans = result.weeks;
  }
  eventBus.emit("pm:updated", result);
  return result;
}

// ==========================================
// HIERARCHICAL PROJECT & TASK API SERVICES
// (Project -> Main Task -> Weekly Task -> Daily Task)
// ==========================================

export async function getProjectHierarchyAPI(projectId) {
  return requestJSON(`/api/v1/projects/projects/${projectId}/hierarchy/`, { method: "GET" });
}

export async function createMainTaskAPI(projectId, payload) {
  return requestJSON("/api/v1/projects/main-tasks/", {
    method: "POST",
    body: JSON.stringify({ ...payload, project: projectId }),
  });
}

export async function assignMainTaskMembersAPI(mainTaskId, userIds) {
  return requestJSON(`/api/v1/projects/main-tasks/${mainTaskId}/assign_members/`, {
    method: "POST",
    body: JSON.stringify({ user_ids: userIds }),
  });
}

export async function overrideMainTaskProgressAPI(mainTaskId, progress, reason) {
  return requestJSON(`/api/v1/projects/main-tasks/${mainTaskId}/override_progress/`, {
    method: "POST",
    body: JSON.stringify({ progress, reason }),
  });
}

export async function createWeeklyTaskAPI(mainTaskId, payload) {
  return requestJSON("/api/v1/projects/weekly-tasks/", {
    method: "POST",
    body: JSON.stringify({ ...payload, main_task: mainTaskId }),
  });
}

export async function overrideWeeklyTaskProgressAPI(weeklyTaskId, progress, reason) {
  return requestJSON(`/api/v1/projects/weekly-tasks/${weeklyTaskId}/override_progress/`, {
    method: "POST",
    body: JSON.stringify({ progress, reason }),
  });
}

export async function deleteMainTaskAPI(mainTaskId) {
  return requestJSON(`/api/v1/projects/main-tasks/${mainTaskId}/`, { method: "DELETE" });
}

export async function deleteWeeklyTaskAPI(weeklyTaskId) {
  return requestJSON(`/api/v1/projects/weekly-tasks/${weeklyTaskId}/`, { method: "DELETE" });
}

export async function deleteDailyTaskAPI(dailyTaskId) {
  return requestJSON(`/api/v1/projects/daily-tasks/${dailyTaskId}/`, { method: "DELETE" });
}

export async function createDailyTaskAPI(weeklyTaskId, payload) {
  return requestJSON("/api/v1/projects/daily-tasks/", {
    method: "POST",
    body: JSON.stringify({ ...payload, weekly_task: weeklyTaskId }),
  });
}

export async function updateDailyTaskProgressAPI(dailyTaskId, { progress, status, is_blocked, block_reason }) {
  return requestJSON(`/api/v1/projects/daily-tasks/${dailyTaskId}/update_progress/`, {
    method: "PATCH",
    body: JSON.stringify({ progress, status, is_blocked, block_reason }),
  });
}

export async function reportDailyTaskBlockedAPI(dailyTaskId, reason) {
  return requestJSON(`/api/v1/projects/daily-tasks/${dailyTaskId}/report_blocked/`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function requestTaskTransferAPI(dailyTaskId, targetUserId, reason) {
  return requestJSON(`/api/v1/projects/daily-tasks/${dailyTaskId}/request_transfer/`, {
    method: "POST",
    body: JSON.stringify({ target_user_id: targetUserId, reason }),
  });
}

export async function directReassignDailyTaskAPI(dailyTaskId, targetUserId, reason) {
  return requestJSON(`/api/v1/projects/daily-tasks/${dailyTaskId}/direct_reassign/`, {
    method: "POST",
    body: JSON.stringify({ target_user_id: targetUserId, reason }),
  });
}

export async function getTaskTransferRequestsAPI(projectId) {
  return requestJSON(`/api/v1/projects/task-transfers/?project=${projectId}`, { method: "GET" });
}

export async function approveTaskTransferAPI(transferId, reviewNote = "") {
  return requestJSON(`/api/v1/projects/task-transfers/${transferId}/approve/`, {
    method: "POST",
    body: JSON.stringify({ review_note: reviewNote }),
  });
}

export async function rejectTaskTransferAPI(transferId, reviewNote = "") {
  return requestJSON(`/api/v1/projects/task-transfers/${transferId}/reject/`, {
    method: "POST",
    body: JSON.stringify({ review_note: reviewNote }),
  });
}

export async function cancelTaskTransferAPI(transferId) {
  return requestJSON(`/api/v1/projects/task-transfers/${transferId}/cancel/`, {
    method: "POST",
  });
}

export async function getProjectTaskActivityLogsAPI(projectId) {
  return requestJSON(`/api/v1/projects/task-activity-logs/?project=${projectId}`, { method: "GET" });
}

export const projectService = {
  // --- Project Core ---
  async getProjects(params = {}) {
    let url = "/api/v1/projects/projects/";
    if (params && Object.keys(params).length > 0) {
      url += `?${new URLSearchParams(params)}`;
    }
    return await requestJSON(url, { method: "GET" });
  },

  async getProjectDetail(projectId) {
    return await requestJSON(`/api/v1/projects/projects/${projectId}/hierarchy/`, { method: "GET" });
  },

  async getProjectHierarchy(projectId) {
    return await requestJSON(`/api/v1/projects/projects/${projectId}/hierarchy/`, { method: "GET" });
  },

  async createProject(payload) {
    return await requestJSON("/api/v1/projects/projects/", {
      method: "POST",
      body: JSON.stringify({
        project_name: payload.name || payload.project_name,
        project_code: payload.code || payload.project_code,
        description: payload.description || "",
        planned_start_date: payload.start_date || payload.planned_start_date,
        planned_end_date: payload.end_date || payload.planned_end_date,
      }),
    });
  },

  // --- Main Task (PM Only) ---
  async createMainTask(projectId, payload) {
    return await requestJSON("/api/v1/projects/main-tasks/", {
      method: "POST",
      body: JSON.stringify({
        project: projectId,
        name: payload.name,
        description: payload.description || "",
        start_date: payload.start_date,
        due_date: payload.due_date,
        priority: payload.priority || "MEDIUM",
        weight: payload.weight || 1.0,
      }),
    });
  },

  async assignMainTask(mainTaskId, assigneeId) {
    return await requestJSON(`/api/v1/projects/main-tasks/${mainTaskId}/assign_members/`, {
      method: "POST",
      body: JSON.stringify({ user_ids: Array.isArray(assigneeId) ? assigneeId : [assigneeId] }),
    });
  },

  async deleteMainTask(mainTaskId) {
    return await requestJSON(`/api/v1/projects/main-tasks/${mainTaskId}/`, { method: "DELETE" });
  },

  // --- Weekly Task (Assignee / PM) ---
  async createWeeklyTask(mainTaskId, payload) {
    return await requestJSON("/api/v1/projects/weekly-tasks/", {
      method: "POST",
      body: JSON.stringify({
        main_task: mainTaskId,
        week_number: payload.week_number || 1,
        start_date: payload.start_date,
        end_date: payload.end_date,
        target_description: payload.target_description || payload.objective || "",
        assignee: payload.assignee,
      }),
    });
  },

  async deleteWeeklyTask(weeklyTaskId) {
    return await requestJSON(`/api/v1/projects/weekly-tasks/${weeklyTaskId}/`, { method: "DELETE" });
  },

  // --- Daily Task (Ownership Driven) ---
  async createDailyTask(weeklyTaskId, payload) {
    return await requestJSON("/api/v1/projects/daily-tasks/", {
      method: "POST",
      body: JSON.stringify({
        weekly_task: weeklyTaskId,
        title: payload.title,
        description: payload.description || "",
        planned_date: payload.planned_date,
        progress: payload.progress || 0,
        status: payload.status || "NOT_STARTED",
      }),
    });
  },

  async updateDailyTask(dailyTaskId, payload) {
    return await requestJSON(`/api/v1/projects/daily-tasks/${dailyTaskId}/update_progress/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async updateDailyTaskProgress(dailyTaskId, progress, status, blockReason = "", extra = {}) {
    let payload = {};
    if (typeof progress === "object" && progress !== null) {
      payload = { ...progress };
    } else {
      payload = {
        progress: progress !== undefined && progress !== null ? Number(progress) : undefined,
        status,
        ...extra
      };
      if (status === "BLOCKED") {
        payload.is_blocked = true;
        payload.block_reason = blockReason;
      } else if (status) {
        payload.is_blocked = false;
        payload.block_reason = "";
      }
    }
    return await requestJSON(`/api/v1/projects/daily-tasks/${dailyTaskId}/update_progress/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async deleteDailyTask(dailyTaskId) {
    return await requestJSON(`/api/v1/projects/daily-tasks/${dailyTaskId}/`, { method: "DELETE" });
  },

  // --- Task Transfer Requests ---
  async getTransferRequests(params = {}) {
    let url = "/api/v1/projects/task-transfers/";
    if (params && Object.keys(params).length > 0) {
      url += `?${new URLSearchParams(params)}`;
    }
    return await requestJSON(url, { method: "GET" });
  },

  async requestTaskTransfer(dailyTaskId, toUserId, reason) {
    return await requestJSON(`/api/v1/projects/daily-tasks/${dailyTaskId}/request_transfer/`, {
      method: "POST",
      body: JSON.stringify({ target_user_id: toUserId, reason }),
    });
  },

  async approveTransfer(transferId, reviewNotes = "") {
    return await requestJSON(`/api/v1/projects/task-transfers/${transferId}/approve/`, {
      method: "POST",
      body: JSON.stringify({ review_note: reviewNotes }),
    });
  },

  async rejectTransfer(transferId, reviewNotes = "") {
    return await requestJSON(`/api/v1/projects/task-transfers/${transferId}/reject/`, {
      method: "POST",
      body: JSON.stringify({ review_note: reviewNotes }),
    });
  },

  async cancelTransfer(transferId) {
    return await requestJSON(`/api/v1/projects/task-transfers/${transferId}/cancel/`, {
      method: "POST",
    });
  },

  // --- Activity Logs ---
  async getProjectActivityLogs(projectId) {
    return await requestJSON(`/api/v1/projects/task-activity-logs/?project=${projectId}`, { method: "GET" });
  },
};


