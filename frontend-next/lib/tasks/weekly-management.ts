import type { Project, ProjectAuthority, WeeklyWorkPeriod } from "../api/project.api";
import { normalizeDateKey } from "../calendar-date";
import { weeklyTargetRecords, type WeeklyTargetRecord } from "../weekly-dashboard";

export const WEEKLY_GROUPS = [
  { id: "PENDING_APPROVAL", label: "Menunggu persetujuan", color: "#A36B16", soft: "#FFF7E7" },
  { id: "READY", label: "Siap dikerjakan", color: "#64748B", soft: "#F1F5F9" },
  { id: "IN_PROGRESS", label: "Sedang berjalan", color: "#294BB2", soft: "#EAF6FF" },
  { id: "ATTENTION", label: "Perlu perhatian", color: "#D34848", soft: "#FFF1F2" },
  { id: "COMPLETED", label: "Selesai", color: "#6366C4", soft: "#F0F0FF" },
  { id: "REJECTED", label: "Ditolak", color: "#A34D70", soft: "#FFF0F6" },
] as const;
export type WeeklyGroupId = typeof WEEKLY_GROUPS[number]["id"];

/** UI capabilities mirror project authority; ownership alone never grants review. */
export function weeklyPermissions(record: WeeklyTargetRecord, userId: string | number | undefined,
  authority: ProjectAuthority | undefined, canWrite: boolean) {
  const own = userId != null && record.assigneeId === String(userId);
  const pending = record.weeklyTask.status === "PENDING_APPROVAL";
  const active = !["PENDING_APPROVAL", "REJECTED"].includes(record.weeklyTask.status);
  return {
    canCreateDaily: canWrite && own && active,
    canEdit: canWrite && Boolean(authority?.can_manage_weekly_tasks) && active,
    canDelete: canWrite && Boolean(authority?.can_manage_weekly_tasks) && record.dailyCount === 0,
    canReview: canWrite && Boolean(authority?.can_review_weekly_tasks) && pending
      && Boolean(record.weeklyTask.created_by_id) && String(record.weeklyTask.created_by_id) !== String(userId),
  };
}

export function sortWeeklyTargets(records: WeeklyTargetRecord[], sort: string, order: string[] = []) {
  const ranks = new Map(order.map((id, index) => [id, index]));
  return [...records].sort((a, b) => {
    if (sort === "manual") return (ranks.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (ranks.get(b.id) ?? Number.MAX_SAFE_INTEGER);
    if (sort === "progress") return b.progress - a.progress;
    if (sort === "title") return (a.weeklyTask.target_description || "").localeCompare(b.weeklyTask.target_description || "", "id-ID");
    return (a.endDate || "9999-12-31").localeCompare(b.endDate || "9999-12-31");
  });
}

/** Personal card ordering never writes approval or progress to the API. */
export function moveWeeklyCard(records: WeeklyTargetRecord[], sourceId: string, targetId: string, today: string): string[] {
  const source = records.find(record => record.id === sourceId);
  const target = records.find(record => record.id === targetId);
  if (!source || !target || weeklyGroup(source, today) !== weeklyGroup(target, today)) return records.map(record => record.id);
  const ids = records.filter(record => record.id !== sourceId).map(record => record.id);
  ids.splice(ids.indexOf(targetId), 0, sourceId);
  return ids;
}

/** Creation choices come from Main assignments, not historical Weekly ownership. */
export function weeklyCreationProjects(projects: Project[], userId: string | number | null | undefined): Project[] {
  if (userId == null || String(userId).trim() === "") return [];
  return projects.map(project => ({ ...project, main_tasks: (project.main_tasks || []).filter(main =>
    (main.assignments || []).some(assignment => String(assignment.assignee_id ?? assignment.assignee ?? "") === String(userId)),
  ) })).filter(project => project.main_tasks.length > 0);
}

export function personalWeeklyTargets(projects: Project[], userId: string | number | null | undefined): WeeklyTargetRecord[] {
  if (userId == null || String(userId).trim() === "") return [];
  return weeklyTargetRecords(projects).filter(record => record.assigneeId === String(userId));
}

export function weeklyGroup(record: WeeklyTargetRecord, today: string): WeeklyGroupId {
  const status = record.weeklyTask.status.toUpperCase();
  if (status === "PENDING_APPROVAL" || status === "REJECTED") return status;
  if (["COMPLETED", "DONE"].includes(status) || record.progress >= 100) return "COMPLETED";
  if (record.hasBlockedDaily || status === "BLOCKED" || (record.endDate && record.endDate < today)) return "ATTENTION";
  if (record.progress > 0 || ["IN_PROGRESS", "ON_PROGRESS"].includes(status)) return "IN_PROGRESS";
  return "READY";
}

export function filterWeeklyTargets(records: WeeklyTargetRecord[], filters: {
  query: string; projectId: string; period: Pick<WeeklyWorkPeriod, "start" | "end"> & Partial<Pick<WeeklyWorkPeriod, "filter_start" | "filter_end">> | null; group: string; today: string;
}): WeeklyTargetRecord[] {
  const query = filters.query.trim().toLocaleLowerCase("id-ID");
  return records.filter(record => {
    if (filters.projectId && record.projectId !== filters.projectId) return false;
    if (filters.group && weeklyGroup(record, filters.today) !== filters.group) return false;
    if (filters.period) {
      const scheduleStart = normalizeDateKey(record.startDate);
      const scheduleEnd = normalizeDateKey(record.endDate);
      const overlapsSchedule = Boolean(scheduleStart && scheduleEnd
        && scheduleStart <= filters.period.end && scheduleEnd >= filters.period.start);
      const createdAt = record.weeklyTask.created_at ? new Date(record.weeklyTask.created_at).getTime() : NaN;
      const start = filters.period.filter_start ? new Date(filters.period.filter_start).getTime() : NaN;
      const end = filters.period.filter_end ? new Date(filters.period.filter_end).getTime() : NaN;
      const createdInPeriod = Number.isFinite(createdAt) && Number.isFinite(start) && Number.isFinite(end)
        && createdAt >= start && createdAt < end;
      if (!overlapsSchedule && !createdInPeriod) return false;
    }
    return !query || [record.projectName, record.projectCode, record.mainTaskName, record.code,
      record.weeklyTask.target_description, record.weeklyTask.target_output,
    ].some(value => String(value ?? "").toLocaleLowerCase("id-ID").includes(query));
  });
}
