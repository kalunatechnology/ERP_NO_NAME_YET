/**
 * Project dashboard timeline projection.
 *
 * This pure adapter converts only real WBS Main Tasks into timeline rows. It is
 * deliberately independent from React so the no-synthetic-progress invariant
 * can be verified by system tests as well as reused by the dashboard.
 */
import type { Project } from "../api/project.api";

export interface ProjectTimelineItem {
  id: string;
  name: string;
  startWeek: number;
  endWeek: number;
  progress: number;
  assignee?: string;
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "BLOCKED" | string;
}

/**
 * Builds timeline rows exclusively from persisted Main Tasks.
 *
 * Business rule: a project, generic task, or Main Task without Weekly Tasks
 * cannot independently claim execution progress.
 */
export function buildMainTaskTimeline(projects: Project[]): ProjectTimelineItem[] {
  return projects.flatMap((project) => (project.main_tasks || []).map((mainTask) => {
    const weeklyTasks = mainTask.weekly_tasks || mainTask.weekly_plans || [];
    const weekNumbers = weeklyTasks.map((weekly) => Number(weekly.week_number || 1)).filter(Number.isFinite);
    const assignments = mainTask.assignments || [];
    return {
      id: String(mainTask.id),
      name: mainTask.name || mainTask.title || `Main Task ${String(mainTask.id).slice(0, 6)}`,
      startWeek: weekNumbers.length ? Math.max(1, Math.min(...weekNumbers)) : 1,
      endWeek: weekNumbers.length ? Math.min(8, Math.max(...weekNumbers)) : 1,
      progress: weeklyTasks.length ? Number(mainTask.progress || 0) : 0,
      assignee: assignments.map((assignment) => assignment.assignee_name).filter(Boolean).join(", ") || undefined,
      status: mainTask.status || "PLANNED",
    };
  }));
}
