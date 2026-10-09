import type { DailyTask, Project } from "../api/project.api";
import { normalizeDateKey } from "../calendar-date";

export interface PersonalDailyTaskRecord {
  projectId: string | number;
  projectName: string;
  projectCode: string;
  mainTaskName: string;
  weekNumber: number;
  task: DailyTask;
}

/** Personal summaries use Daily ownership, including tasks transferred to the user.
 * The input must already be scoped to the active company by the API. */
export function personalDailyTaskRecords(
  projects: Project[], userId: string | number | null | undefined,
): PersonalDailyTaskRecord[] {
  if (userId == null || String(userId).trim() === "") return [];
  const records: PersonalDailyTaskRecord[] = [];
  const seen = new Set<string>();
  for (const project of projects) {
    for (const main of project.main_tasks || []) {
      for (const weekly of main.weekly_tasks || main.weekly_plans || []) {
        for (const task of weekly.daily_tasks || []) {
          if (String(task.owner_id ?? "") !== String(userId)) continue;
          if (seen.has(String(task.id))) continue;
          seen.add(String(task.id));
          records.push({
            projectId: project.id,
            projectName: project.project_name || project.name || `Proyek ${project.id}`,
            projectCode: project.project_code || project.code || "PRJ",
            mainTaskName: main.name || main.title || "Main Task",
            weekNumber: weekly.week_number || 1,
            task,
          });
        }
      }
    }
  }
  return records;
}

/** Dashboard and Tasks share the same planned-day and completion definitions. */
export function personalDailyTaskSummary(records: PersonalDailyTaskRecord[], today: string) {
  const todayTasks = records.filter(({ task }) => normalizeDateKey(task.planned_date) === today);
  const overdueTasks = records.filter(({ task }) => {
    const date = normalizeDateKey(task.planned_date);
    return Boolean(date && date < today && !["COMPLETED", "DONE"].includes(task.status));
  });
  return {
    todayCount: todayTasks.length,
    doneToday: todayTasks.filter(({ task }) => ["COMPLETED", "DONE"].includes(task.status)).length,
    overdueCount: overdueTasks.length,
    activeCount: records.filter(({ task }) => ["ON_PROGRESS", "IN_PROGRESS", "PENDING"].includes(task.status)).length,
    overdueTasks: overdueTasks.map(({ task }) => task),
  };
}
