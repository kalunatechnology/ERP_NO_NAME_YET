import type { Project, ProjectAuthority, WeeklyWorkPeriod } from "../api/project.api";
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
export function weeklyPermissions(
  record: WeeklyTargetRecord,
  userId: string | number | undefined,
  authority: ProjectAuthority | undefined,
  canWrite: boolean
) {
  const own = userId != null && record.assigneeId === String(userId);
  const status = (record.weeklyTask?.status ?? "").toUpperCase();
  const pending = status === "PENDING_APPROVAL";
  const active = !["PENDING_APPROVAL", "REJECTED"].includes(status);
  const createdBy = record.weeklyTask?.created_by_id != null ? String(record.weeklyTask.created_by_id) : undefined;
  const isCreator = userId != null && createdBy === String(userId);

  return {
    canCreateDaily: canWrite && own && active,
    canEdit: canWrite && Boolean(authority?.can_manage_weekly_tasks) && active,
    canDelete: canWrite && Boolean(authority?.can_manage_weekly_tasks) && record.dailyCount === 0,
    canReview: canWrite && Boolean(authority?.can_review_weekly_tasks) && pending && !isCreator,
  };
}

export function sortWeeklyTargets(records: WeeklyTargetRecord[], sort: string, order: string[] = []) {
  const ranks = new Map(order.map((id, index) => [id, index]));
  return [...records].sort((a, b) => {
    if (sort === "manual") return (ranks.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (ranks.get(b.id) ?? Number.MAX_SAFE_INTEGER);
    if (sort === "progress") return b.progress - a.progress;
    if (sort === "title") {
      const titleA = a.weeklyTask?.target_description || a.weeklyTask?.target_output || "";
      const titleB = b.weeklyTask?.target_description || b.weeklyTask?.target_output || "";
      return titleA.localeCompare(titleB, "id-ID");
    }
    return (a.endDate || "9999-12-31").localeCompare(b.endDate || "9999-12-31");
  });
}

/** Personal card ordering never writes approval or progress to the API. */
export function moveWeeklyCard(records: WeeklyTargetRecord[], sourceId: string, targetId: string, today: string): string[] {
  const source = records.find(record => record.id === sourceId);
  const target = records.find(record => record.id === targetId);
  if (!source || !target || weeklyGroup(source, today) !== weeklyGroup(target, today)) return records.map(record => record.id);
  const ids = records.filter(record => record.id !== sourceId).map(record => record.id);
  const targetIndex = ids.indexOf(targetId);
  if (targetIndex === -1) return records.map(record => record.id);
  ids.splice(targetIndex, 0, sourceId);
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
  const status = (record.weeklyTask?.status ?? "").toUpperCase();
  if (status === "PENDING_APPROVAL" || status === "REJECTED") return status as WeeklyGroupId;
  if (["COMPLETED", "DONE"].includes(status) || record.progress >= 100) return "COMPLETED";
  if (record.hasBlockedDaily || status === "BLOCKED" || (record.endDate && record.endDate < today)) return "ATTENTION";
  if (record.progress > 0 || ["IN_PROGRESS", "ON_PROGRESS"].includes(status)) return "IN_PROGRESS";
  return "READY";
}

export function filterWeeklyTargets(records: WeeklyTargetRecord[], filters: {
  query: string;
  projectId: string;
  period: Pick<WeeklyWorkPeriod, "start" | "end"> & Partial<Pick<WeeklyWorkPeriod, "filter_start" | "filter_end">> | null;
  group: string;
  today: string;
}): WeeklyTargetRecord[] {
  const query = filters.query.trim().toLocaleLowerCase("id-ID");
  return records.filter(record => {
    if (filters.projectId && record.projectId !== filters.projectId) return false;
    if (filters.group && weeklyGroup(record, filters.today) !== filters.group) return false;
    if (filters.period) {
      // Membership is based strictly on target creation time; schedule dates are not a fallback.
      const rawCreatedAt = record.weeklyTask?.created_at;
      const createdAt = rawCreatedAt ? new Date(rawCreatedAt).getTime() : NaN;

      // Canonical backend boundaries are Monday 00:00 WIB through before Saturday 00:00 WIB.
      const rawStart = filters.period.filter_start || (filters.period.start ? `${filters.period.start}T00:00:00+07:00` : "");
      const start = rawStart ? new Date(rawStart).getTime() : NaN;
      const end = filters.period.filter_end
        ? new Date(filters.period.filter_end).getTime()
        : filters.period.end
          ? new Date(`${filters.period.end}T00:00:00+07:00`).getTime() + 24 * 60 * 60 * 1000
          : NaN;

      const createdInPeriod = Number.isFinite(createdAt) && Number.isFinite(start) && Number.isFinite(end)
        && createdAt >= start && createdAt < end;
      if (!createdInPeriod) return false;
    }
    return !query || [
      record.projectName,
      record.projectCode,
      record.mainTaskName,
      record.code,
      record.assigneeName,
      record.weeklyTask?.target_description,
      record.weeklyTask?.target_output,
    ].some(value => String(value ?? "").toLocaleLowerCase("id-ID").includes(query));
  });
}
