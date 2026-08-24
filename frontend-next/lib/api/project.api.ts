/**
 * Project API — Full 5-Level WBS Hierarchy, Accounting, Gate, and Operational Services
 * Matching uji_prototype/js/services/project.service.js
 */

import api from "./axios";
import { normalizeList } from "./auth.api";

export interface Project {
  id: string | number;
  name?: string;
  project_name?: string;
  code?: string;
  project_code?: string;
  lifecycle_status?: string;
  status?: string;
  progress_percentage?: number;
  progress?: number;
  budget_amount?: number;
  total_budget?: number;
  budget?: number;
  actual_cost?: number;
  start_date?: string;
  end_date?: string;
  planned_start_date?: string;
  planned_end_date?: string;
  description?: string;
  project_manager_name?: string;
  pm_name?: string;
  health_score?: string;
  main_tasks?: MainTask[];
  tasks?: Task[];
  milestones?: Milestone[];
  stages?: Stage[];
  cost_entries?: CostEntry[];
  billing_proposals?: BillingProposal[];
  fundings?: Funding[];
}

export interface TaskAssignment {
  id: string | number;
  main_task: string | number;
  assignee?: string | number;
  assignee_id?: string | number;
  assignee_name?: string;
  assignee_email?: string;
  user_name?: string;
}

export interface MainTask {
  id: string | number;
  project: string | number;
  name: string;
  title?: string;
  description?: string;
  weight?: number;
  progress?: number;
  status: string;
  priority?: string;
  assignments?: TaskAssignment[];
  weekly_tasks?: WeeklyTask[];
  weekly_plans?: WeeklyTask[];
}

export interface WeeklyTask {
  id: string | number;
  main_task: string | number;
  project?: string | number;
  week_number: number;
  target_description?: string;
  target_output?: string;
  start_date?: string;
  end_date?: string;
  status: string;
  progress?: number;
  assignee_name?: string;
  assignee_id?: string | number;
  daily_tasks?: DailyTask[];
}

export interface DailyTask {
  id: string | number;
  weekly_task?: string | number;
  weekly_plan_id?: string | number;
  planned_date?: string;
  time_slot?: string;
  title?: string;
  activity_input?: string;
  output_result?: string;
  status: "PENDING" | "ON_PROGRESS" | "COMPLETED" | "DONE" | "BLOCKED";
  progress?: number;
  notes?: string;
  owner_name?: string;
  owner_id?: string | number;
  is_blocked?: boolean;
  block_reason?: string;
}

export interface Task {
  id: string | number;
  project: string | number;
  title: string;
  status: string;
  priority?: string;
  assigned_to?: string | number;
  parent_task?: string | number | null;
  due_date?: string;
  progress?: number;
  description?: string;
}

export interface Milestone {
  id: string | number;
  project: string | number;
  name: string;
  target_date: string;
  status: string;
  is_passed?: boolean;
}

export interface Stage {
  id: string | number;
  project: string | number;
  stage: number;
  is_passed: boolean;
  notes?: string;
}

export interface CostEntry {
  id: string | number;
  project: string | number;
  category: string;
  amount: number;
  description?: string;
  date?: string;
  is_validated?: boolean;
}

export interface BillingProposal {
  id: string | number;
  project: string | number;
  amount: number;
  status: string;
  description?: string;
  milestone_percentage?: number;
}

export interface Funding {
  id: string | number;
  project: string | number;
  amount: number;
  status: string;
  source?: string;
  purpose?: string;
}

export interface TaskTransfer {
  id: string | number;
  task_id: string | number;
  task_title?: string;
  from_user_name?: string;
  to_user_name?: string;
  reason?: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
}

/* ── Load all PM data in parallel ────────────────── */
export async function loadAllProjects(): Promise<Project[]> {
  const [
    projectsRes, mainTasksRes, assignmentsRes, weeklyTasksRes, dailyTasksRes,
    tasksRes, milestonesRes, stagesRes,
    costEntriesRes, proposalsRes, fundingsRes, usersRes
  ] = await Promise.all([
    api.get("/api/v1/projects/projects/?page_size=100").catch(() => ({ data: [] })),
    api.get("/api/v1/projects/main-tasks/?page_size=300").catch(() => ({ data: [] })),
    api.get("/api/v1/projects/task-assignments/?page_size=500").catch(() => ({ data: [] })),
    api.get("/api/v1/projects/weekly-tasks/?page_size=500").catch(() => ({ data: [] })),
    api.get("/api/v1/projects/daily-tasks/?page_size=1000").catch(() => ({ data: [] })),
    api.get("/api/v1/projects/tasks/?page_size=500").catch(() => ({ data: [] })),
    api.get("/api/v1/projects/milestones/?page_size=300").catch(() => ({ data: [] })),
    api.get("/api/v1/projects/readiness-checks/?page_size=200").catch(() => ({ data: [] })),
    api.get("/api/v1/finance/project-cost-entries/?page_size=300").catch(() => ({ data: [] })),
    api.get("/api/v1/finance/billing-proposals/?page_size=200").catch(() => ({ data: [] })),
    api.get("/api/v1/finance/project-fundings/?page_size=100").catch(() => ({ data: [] })),
    api.get("/api/v1/auth/users/?page_size=200").catch(() => ({ data: [] })),
  ]);

  const projects     = normalizeList<Project>(projectsRes.data).rows;
  const rawMainTasks = normalizeList<any>(mainTasksRes.data).rows;
  const rawAssigns   = normalizeList<any>(assignmentsRes.data).rows;
  const rawWeekly    = normalizeList<any>(weeklyTasksRes.data).rows;
  const rawDaily     = normalizeList<any>(dailyTasksRes.data).rows;
  const rawTasks     = normalizeList<any>(tasksRes.data).rows;
  const milestones   = normalizeList<Milestone>(milestonesRes.data).rows;
  const stages       = normalizeList<Stage>(stagesRes.data).rows;
  const costEntries  = normalizeList<CostEntry>(costEntriesRes.data).rows;
  const proposals    = normalizeList<BillingProposal>(proposalsRes.data).rows;
  const fundings     = normalizeList<Funding>(fundingsRes.data).rows;
  const rawUsers     = normalizeList<any>(usersRes.data).rows;

  const userMap: Record<string, string> = {};
  rawUsers.forEach((u: any) => {
    userMap[String(u.id)] = u.full_name || u.name || u.email?.split("@")[0] || u.username || "Member";
  });

  return projects.map((p) => {
    const pid = String(p.id);

    // 0. Build assignments mapped by main_task
    const assignmentsByMain: Record<string, TaskAssignment[]> = {};
    rawAssigns.forEach((a: any) => {
      const mId = String(a.main_task || a.main_task_id || "");
      if (!assignmentsByMain[mId]) assignmentsByMain[mId] = [];
      const uName = a.assignee_name || a.user_name || userMap[String(a.assignee)] || "Team Member";
      assignmentsByMain[mId].push({
        id: a.id,
        main_task: mId,
        assignee: a.assignee,
        assignee_id: a.assignee,
        assignee_name: uName,
        user_name: uName,
        assignee_email: a.assignee_email || "",
      });
    });

    // 1. Build daily tasks mapped by weekly_task
    const dailyByWeekly: Record<string, DailyTask[]> = {};
    rawDaily.forEach((d: any) => {
      const wId = String(d.weekly_task || d.weekly_task_id || d.weekly_plan || d.weekly_plan_id || "");
      if (!dailyByWeekly[wId]) dailyByWeekly[wId] = [];
      dailyByWeekly[wId].push({
        id: d.id,
        weekly_task: wId,
        planned_date: d.planned_date || d.task_date || new Date().toISOString().split("T")[0],
        time_slot: d.time_slot || d.time || "09.00 - 12.00",
        title: d.title || d.activity_input || d.name || "Aktivitas Harian",
        activity_input: d.activity_input || d.title || "",
        output_result: d.output_result || d.output || "",
        status: (d.status === "DONE" || d.status === "COMPLETED") ? "COMPLETED" : (d.status || "PENDING"),
        progress: Number(d.progress || (d.status === "COMPLETED" || d.status === "DONE" ? 100 : 0)),
        notes: d.notes || "",
        owner_name: d.owner_name || d.owner_username || d.assignee_name || "Member",
        owner_id: d.owner_id || d.owner || d.assigned_to,
        is_blocked: d.is_blocked || d.status === "BLOCKED",
        block_reason: d.block_reason || "",
      });
    });

    // 2. Build weekly tasks mapped by main_task
    const weeklyByMain: Record<string, WeeklyTask[]> = {};
    rawWeekly.forEach((w: any) => {
      const mId = String(w.main_task || w.main_task_id || "");
      if (!weeklyByMain[mId]) weeklyByMain[mId] = [];
      const wId = String(w.id);
      const wDailies = dailyByWeekly[wId] || [];
      const doneDailies = wDailies.filter(d => d.status === "COMPLETED" || d.status === "DONE");
      const calcProg = wDailies.length ? Math.round((doneDailies.length / wDailies.length) * 100) : Number(w.progress || 0);

      weeklyByMain[mId].push({
        id: w.id,
        main_task: mId,
        project: pid,
        week_number: Number(w.week_number || 1),
        target_description: w.target_description || w.target_output || w.name || `Target Minggu #${w.week_number || 1}`,
        target_output: w.target_output || w.target_description || "",
        start_date: w.start_date || w.planned_start || "",
        end_date: w.end_date || w.planned_end || "",
        status: w.status || "PLANNED",
        progress: calcProg,
        assignee_name: w.assignee_name || w.assignee_username || w.owner_name || "Assignee Tim",
        assignee_id: w.assignee_id || w.assignee || w.assigned_to,
        daily_tasks: wDailies,
      });
    });

    // 3. Main Tasks
    let pMainTasks: MainTask[] = rawMainTasks
      .filter((m: any) => String(m.project) === pid)
      .map((m: any) => {
        const mId = String(m.id);
        const wTasks = weeklyByMain[mId] || [];
        const assigns = assignmentsByMain[mId] || [];
        return {
          id: m.id,
          project: pid,
          name: m.name || m.title || `Work Package #${String(m.id).slice(0, 4)}`,
          title: m.name || m.title || `Work Package #${String(m.id).slice(0, 4)}`,
          description: m.description || "",
          weight: Number(m.weight || 10),
          progress: Number(m.progress || 0),
          status: m.status || "PLANNED",
          priority: m.priority || "MEDIUM",
          assignments: assigns,
          weekly_tasks: wTasks,
          weekly_plans: wTasks,
        };
      });

    // Fallback: If no ProjectMainTask exists yet, generate from standard Task objects
    const pGenericTasks = rawTasks
      .filter((t: any) => String(t.project) === pid)
      .map((t: any) => ({
        id: t.id,
        project: pid,
        title: t.task_name || t.name || t.title || t.description || `Task #${String(t.id).slice(0, 6)}`,
        name: t.task_name || t.name || t.title || t.description || `Task #${String(t.id).slice(0, 6)}`,
        description: t.description || "",
        status: t.status || "PENDING",
        priority: t.priority || "MEDIUM",
        progress: Number(t.progress_percent || t.progress || 0),
        parent_task: t.parent_task,
      }));

    if (pMainTasks.length === 0 && pGenericTasks.length > 0) {
      pMainTasks = pGenericTasks.map((gt: any) => ({
        id: gt.id,
        project: pid,
        name: gt.title,
        title: gt.title,
        description: gt.description,
        weight: 10,
        progress: gt.status === "DONE" || gt.status === "COMPLETED" ? 100 : 0,
        status: gt.status,
        priority: gt.priority,
        weekly_tasks: weeklyByMain[String(gt.id)] || [],
        weekly_plans: weeklyByMain[String(gt.id)] || [],
      }));
    }

    const calcBudget = Number(p.budget_amount || p.total_budget || 0);
    const actualCost = Number(p.actual_cost || 0);

    return {
      ...p,
      project_name: p.name || p.project_name || `Proyek ${p.id}`,
      project_code: p.code || p.project_code || `PRJ-${String(p.id).slice(0, 6)}`,
      status: p.lifecycle_status || p.status || "DRAFT",
      progress: Number((p as any).progress_percent || p.progress_percentage || p.progress || 0),
      budget: calcBudget,
      actual_cost: actualCost,
      main_tasks: pMainTasks,
      tasks: pGenericTasks,
      milestones: milestones.filter((m) => String(m.project) === pid),
      stages: stages.filter((s) => String(s.project) === pid),
      cost_entries: costEntries.filter((c) => String(c.project) === pid),
      billing_proposals: proposals.filter((pr) => String(pr.project) === pid),
      fundings: fundings.filter((f) => String(f.project) === pid),
    };
  });
}

/* ── Project CRUD ────────────────────────────────── */
export async function getProject(id: string | number): Promise<Project> {
  const { data } = await api.get<Project>(`/api/v1/projects/projects/${id}/`);
  return data;
}

export async function createProject(payload: {
  name: string;
  code?: string;
  budget_amount?: number;
  planned_start_date?: string;
  planned_end_date?: string;
  description?: string;
}) {
  const { data } = await api.post("/api/v1/projects/projects/", {
    ...payload,
    project_name: payload.name,
    project_code: payload.code,
  });
  return data;
}

export async function updateProject(id: string | number, payload: Partial<Project>) {
  const { data } = await api.patch(`/api/v1/projects/projects/${id}/`, payload);
  return data;
}

export async function deleteProject(id: string | number) {
  await api.delete(`/api/v1/projects/projects/${id}/`);
}

export async function recalculateProjectHealth(id: number | string) {
  const { data } = await api.post(`/api/v1/projects/projects/${id}/recalculate_health/`);
  return data;
}

export async function advancePMFlow(projectId: number | string, action: string = "advance") {
  const { data } = await api.post(`/api/v1/projects/projects/${projectId}/advance_stage/`, { action });
  return data;
}

/* ── Level 1: Main Task CRUD ─────────────────────── */
export async function createMainTask(payload: {
  project: string | number;
  title: string;
  description?: string;
  weight?: number;
  priority?: string;
}) {
  // Try main-tasks endpoint first, fallback to tasks
  try {
    const { data } = await api.post("/api/v1/projects/main-tasks/", {
      project: payload.project,
      name: payload.title,
      description: payload.description || "",
      weight: payload.weight || 10,
      priority: payload.priority || "MEDIUM",
      status: "PLANNED",
    });
    return data;
  } catch {
    const { data } = await api.post("/api/v1/projects/tasks/", {
      project: payload.project,
      task_name: payload.title,
      name: payload.title,
      title: payload.title,
      description: payload.description || "",
      priority: payload.priority || "MEDIUM",
      status: "PLANNED",
      parent_task: null,
    });
    return data;
  }
}

export async function deleteMainTask(id: string | number) {
  try {
    await api.delete(`/api/v1/projects/main-tasks/${id}/`);
  } catch {
    await api.delete(`/api/v1/projects/tasks/${id}/`);
  }
}

/* ── Level 2: Weekly Plan CRUD ───────────────────── */
export async function createWeeklyTask(payload: {
  main_task: string | number;
  project?: string | number;
  week_number: number;
  target_description: string;
  start_date?: string;
  end_date?: string;
  assignee_name?: string;
}) {
  try {
    const { data } = await api.post("/api/v1/projects/weekly-tasks/", {
      main_task: payload.main_task,
      project: payload.project,
      week_number: payload.week_number,
      target_description: payload.target_description,
      target_output: payload.target_description,
      start_date: payload.start_date || undefined,
      end_date: payload.end_date || undefined,
      assignee_name: payload.assignee_name || "Assignee Tim",
      status: "PLANNED",
    });
    return data;
  } catch {
    const { data } = await api.post("/api/v1/projects/tasks/", {
      project: payload.project,
      parent_task: payload.main_task,
      task_name: `[W${payload.week_number}] ${payload.target_description}`,
      name: payload.target_description,
      title: payload.target_description,
      status: "PLANNED",
    });
    return data;
  }
}

export async function deleteWeeklyTask(id: string | number) {
  try {
    await api.delete(`/api/v1/projects/weekly-tasks/${id}/`);
  } catch {
    await api.delete(`/api/v1/projects/tasks/${id}/`);
  }
}

/* ── Level 3: Daily Task CRUD ────────────────────── */
export async function createDailyTask(payload: {
  weekly_task: string | number;
  planned_date: string;
  time_slot?: string;
  title: string;
  activity_input?: string;
  output_result?: string;
  notes?: string;
  status?: string;
}) {
  const normStatus = (payload.status === "ON_PROGRESS" || payload.status === "PENDING")
    ? "IN_PROGRESS"
    : (payload.status === "DONE" || payload.status === "COMPLETED")
    ? "COMPLETED"
    : (payload.status || "IN_PROGRESS");

  const cleanPayload = {
    weekly_task: payload.weekly_task,
    planned_date: payload.planned_date || new Date().toISOString().split("T")[0],
    time_slot: payload.time_slot || "09.00 - 12.00",
    title: payload.title || payload.activity_input || "Aktivitas Harian",
    output_result: payload.output_result || "",
    notes: payload.notes || "",
    status: normStatus,
    progress: normStatus === "COMPLETED" ? 100 : 0,
  };

  const { data } = await api.post("/api/v1/projects/daily-tasks/", cleanPayload);
  return data;
}

export async function updateDailyTask(id: string | number, payload: Partial<DailyTask>) {
  const normStatus = (payload.status === "ON_PROGRESS" || payload.status === "PENDING")
    ? "IN_PROGRESS"
    : (payload.status === "DONE" || payload.status === "COMPLETED")
    ? "COMPLETED"
    : payload.status;

  const cleanPayload = {
    ...payload,
    ...(normStatus ? { status: normStatus } : {})
  };
  const { data } = await api.patch(`/api/v1/projects/daily-tasks/${id}/`, cleanPayload);
  return data;
}

export async function deleteDailyTask(id: string | number) {
  await api.delete(`/api/v1/projects/daily-tasks/${id}/`);
}

/* ── Level 4: Task Transfer Requests ─────────────── */
export async function requestTaskTransfer(payload: {
  daily_task_id: string | number;
  reason: string;
}) {
  const { data } = await api.post("/api/v1/projects/task-transfers/", payload);
  return data;
}

export async function getTransferRequests(): Promise<TaskTransfer[]> {
  const { data } = await api.get("/api/v1/projects/task-transfers/");
  return normalizeList<TaskTransfer>(data).rows;
}

export async function approveTransfer(id: string | number) {
  const { data } = await api.post(`/api/v1/projects/task-transfers/${id}/approve/`);
  return data;
}

export async function rejectTransfer(id: string | number) {
  const { data } = await api.post(`/api/v1/projects/task-transfers/${id}/reject/`);
  return data;
}

/* ── Financials: Cost Entries, Fundings, Billing ─── */
export async function createProjectCostEntry(payload: {
  project: string | number;
  category: string;
  amount: number;
  description?: string;
}) {
  const { data } = await api.post("/api/v1/finance/project-cost-entries/", payload);
  return data;
}

export async function deleteProjectCostEntry(id: string | number) {
  await api.delete(`/api/v1/finance/project-cost-entries/${id}/`);
}

export async function createFundingRequest(payload: {
  project: string | number;
  amount: number;
  source?: string;
  purpose?: string;
}) {
  const { data } = await api.post("/api/v1/finance/project-fundings/", payload);
  return data;
}

export async function deleteFundingRequest(id: string | number) {
  await api.delete(`/api/v1/finance/project-fundings/${id}/`);
}

export async function createBillingProposal(payload: {
  project: string | number;
  amount: number;
  description?: string;
  milestone_percentage?: number;
}) {
  const { data } = await api.post("/api/v1/finance/billing-proposals/", payload);
  return data;
}

export async function deleteBillingProposal(id: string | number) {
  await api.delete(`/api/v1/finance/billing-proposals/${id}/`);
}

export async function fetchProjectFinancialPerformance(projectId: string | number) {
  const { data } = await api.get(`/api/v1/projects/projects/${projectId}/financial-performance/`);
  return data;
}

export async function updateProjectFinancials(projectId: string | number, payload: {
  contract_amount?: number;
  budget_amount?: number;
  target_margin_percent?: number;
}) {
  const { data } = await api.post(`/api/v1/projects/projects/${projectId}/update_financials/`, payload);
  return data;
}

export async function fetchProjectFundingRequests(projectId: string | number) {
  const { data } = await api.get(`/api/v1/projects/projects/${projectId}/funding_requests/`);
  return data;
}

export async function submitProjectFundingRequest(projectId: string | number, payload: {
  amount: number;
  category?: string;
  description?: string;
}) {
  const { data } = await api.post(`/api/v1/projects/projects/${projectId}/funding_requests/`, payload);
  return data;
}

export async function createMilestone(payload: {
  project: string | number;
  name: string;
  target_date: string;
}) {
  const { data } = await api.post("/api/v1/projects/milestones/", payload);
  return data;
}

/* ── Task Assignment Helper ──────────────────────── */
export const DEFAULT_TEAM_MEMBERS = [
  { id: "e0000000-0000-0000-0000-000000000002", email: "dummy.pm@example.com", username: "pm.dummy", full_name: "Budi Santoso", role_in_project: "PROJECT_MANAGER (PM)", department: "Engineering & PM" },
  { id: "e0000000-0000-0000-0000-000000000005", email: "dummy.assignee@example.com", username: "assignee.dummy", full_name: "Ahmad Rizki", role_in_project: "LEAD_EDITOR / ASSIGNEE", department: "Creative & Production" },
  { id: "e0000000-0000-0000-0000-000000000003", email: "dummy.staff@example.com", username: "staff.dummy", full_name: "Rina Sari", role_in_project: "UI/UX & 3D ARTIST", department: "Design & Media" },
  { id: "e0000000-0000-0000-0000-000000000004", email: "dummy.finance@example.com", username: "finance.dummy", full_name: "Siti Rahma", role_in_project: "FINANCE_OFFICER", department: "Finance & Costing" },
  { id: "e0000000-0000-0000-0000-000000000001", email: "dummy.admin@example.com", username: "admin.dummy", full_name: "System Administrator", role_in_project: "SYS_ADMIN", department: "Management" },
  { id: "e0000000-0000-0000-0000-000000000006", email: "dummy.executive@example.com", username: "exec.dummy", full_name: "Hendra Wijaya", role_in_project: "DIRECTOR / EXECUTIVE", department: "Executive Board" },
];

export async function assignMemberToMainTask(payload: {
  main_task: string | number;
  user_ids: (string | number)[];
}) {
  try {
    const { data } = await api.post(`/api/v1/projects/main-tasks/${payload.main_task}/assign_members/`, {
      user_ids: payload.user_ids,
    });
    return data;
  } catch {
    // Fallback: iterate over task-assignments
    const results = [];
    for (const uid of payload.user_ids) {
      const res = await api.post("/api/v1/projects/task-assignments/", {
        main_task: payload.main_task,
        assignee: uid,
      }).catch(() => null);
      if (res?.data) results.push(res.data);
    }
    return results;
  }
}

export async function removeTaskAssignment(id: string | number) {
  await api.delete(`/api/v1/projects/task-assignments/${id}/`).catch(() => {});
}

export async function fetchCompanyUsers(): Promise<any[]> {
  try {
    const [accRes, projMembersRes] = await Promise.all([
      api.get("/api/v1/accounts/users/?page_size=200").catch(() => null),
      api.get("/api/v1/projects/members/?page_size=200").catch(() => null)
    ]);

    let list: any[] = [];
    if (accRes?.data) {
      list = normalizeList<any>(accRes.data).rows;
    }
    if (list.length === 0 && projMembersRes?.data) {
      list = normalizeList<any>(projMembersRes.data).rows.map((m: any) => ({
        id: m.user_id || m.id,
        email: m.email || m.username,
        username: m.username,
        full_name: m.full_name || m.user_name || m.username,
        role_in_project: m.project_role || m.role || "MEMBER",
      }));
    }

    // Merge with default team members so team list is never empty
    const seen = new Set<string>();
    const merged: any[] = [];

    list.forEach((u) => {
      const emailOrId = u.email || String(u.id);
      if (!seen.has(emailOrId)) {
        seen.add(emailOrId);
        merged.push({
          id: u.id,
          email: u.email,
          username: u.username || u.email?.split("@")[0],
          full_name: u.full_name || u.name || u.username || u.email,
          role_in_project: u.role || u.role_in_project || "MEMBER",
          department: u.department || "Operations"
        });
      }
    });

    DEFAULT_TEAM_MEMBERS.forEach((dm) => {
      if (!seen.has(dm.email)) {
        seen.add(dm.email);
        merged.push(dm);
      }
    });

    return merged;
  } catch {
    return DEFAULT_TEAM_MEMBERS;
  }
}
