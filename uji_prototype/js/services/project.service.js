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
    const [projectsRes, stagesRes, tasksRes, milestonesRes, resourcesRes, timesheetsRes, equipmentRes, costsRes, briefsRes, costEntriesRes, proposalsRes, fundingsRes] =
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

    state.pm.projects = projects.map(p => {
      const pTasks = tasks.filter(t => String(t.project) === String(p.id));
      const pStages = stages.filter(s => String(s.project) === String(p.id));
      const pMilestones = milestones.filter(m => String(m.project) === String(p.id));
      const pResources = resources.filter(r => String(r.project) === String(p.id));
      const pTimesheets = timesheets.filter(t => String(t.project) === String(p.id));
      const pEquipment = equipment.filter(e => String(e.project) === String(p.id));
      const pCost = costs.find(c => String(c.project) === String(p.id)) || {};
      const pBrief = briefs.find(b => String(b.project) === String(p.id)) || null;
      const pCostEntries = costEntries.filter(c => String(c.project) === String(p.id));
      const pProposals = proposals.filter(pr => String(pr.project) === String(p.id));
      const pFundings = fundings.filter(f => String(f.project) === String(p.id));

      const calcBudget = Number(p.budget_amount || p.total_budget || 0);
      const actualCost = Number(pCost.actual_cost || p.actual_cost || 0);

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
      requestJSON("/api/v1/projects/funding-requests/?page_size=200").catch(() => []),
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
  return requestJSON(`/api/v1/commands/projects/funding-requests/${id}/submit/`, { method: "POST", body: {} });
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
      funding_type: data.funding_type || "PROJECT_EXECUTION",
      status: "SUBMITTED",
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
