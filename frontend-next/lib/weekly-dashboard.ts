import type { DailyTask, Project, WeeklyTask } from './api/project.api';

export function weeklyProgress(weekly: { progress?: unknown; status?: string }, dailyTasks: Array<{ progress?: unknown; status?: string }>): number {
  if (['PENDING_APPROVAL', 'REJECTED'].includes(weekly.status || '')) return 0;
  // The persisted rollup is authoritative, including when read permissions
  // expose only some children (for example after a Daily Task transfer).
  const persisted = weekly.progress == null ? NaN : Number(weekly.progress);
  if (Number.isFinite(persisted)) return Math.min(100, Math.max(0, persisted));
  const average = dailyTasks.length ? dailyTasks.reduce((sum, task) => {
    const progress = Number(task.progress ?? (['COMPLETED', 'DONE'].includes(task.status || '') ? 100 : 0));
    return sum + (Number.isFinite(progress) ? progress : 0);
  }, 0) / dailyTasks.length : 0;
  return Math.round(Math.min(100, Math.max(0, average)) * 100) / 100;
}

export function calendarWeek(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  const start = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  return { start, end: date.toISOString().slice(0, 10) };
}

export type WeeklyTargetRecord = {
  id: string; code: string; projectId: string; projectCode: string; projectName: string;
  mainTaskName: string; assigneeId: string; assigneeName: string;
  startDate: string; endDate: string; progress: number;
  dailyCount: number; completedDailyCount: number; hasBlockedDaily: boolean;
  dailyTasks: DailyTask[]; weeklyTask: WeeklyTask;
};

export function weeklyTargetRecords(projects: Project[]): WeeklyTargetRecord[] {
  const seenWeekly = new Set<string>();
  const seenDaily = new Set<string>();
  const records: WeeklyTargetRecord[] = [];
  for (const project of projects) {
    for (const main of project.main_tasks || []) {
      for (const weekly of main.weekly_tasks || main.weekly_plans || []) {
        const id = String(weekly.id);
        if (seenWeekly.has(id) || String(weekly.main_task) !== String(main.id)) continue;
        seenWeekly.add(id);
        const dailyTasks = (weekly.daily_tasks || []).filter(daily => {
          if (String(daily.weekly_task || daily.weekly_plan_id || '') !== id || seenDaily.has(String(daily.id))) return false;
          seenDaily.add(String(daily.id));
          return true;
        });
        const assigneeId = String(weekly.assignee_id || '');
        const assignmentName = (main.assignments || []).find(assignment =>
          String(assignment.assignee_id ?? assignment.assignee ?? '') === assigneeId)?.assignee_name;
        // A transferred Daily Task's owner is not the Weekly Task's assignee.
        const matchingOwnerName = dailyTasks.find(daily => String(daily.owner_id) === assigneeId)?.owner_name;
        const projectCode = project.project_code || project.code || 'PROJECT';
        records.push({
          id, code: `${projectCode} · W#${weekly.week_number || 1}`,
          projectId: String(project.id), projectCode, projectName: project.project_name || project.name || 'Project',
          mainTaskName: main.name || main.title || 'Main Task', assigneeId,
          assigneeName: weekly.assignee_name || assignmentName || matchingOwnerName || assigneeId || 'Belum ditentukan',
          startDate: weekly.start_date?.slice(0, 10) || '', endDate: weekly.end_date?.slice(0, 10) || '',
          progress: weeklyProgress(weekly, dailyTasks), dailyCount: dailyTasks.length,
          completedDailyCount: dailyTasks.filter(daily => ['COMPLETED', 'DONE'].includes(daily.status)).length,
          hasBlockedDaily: dailyTasks.some(daily => daily.is_blocked || daily.status === 'BLOCKED'), dailyTasks, weeklyTask: weekly,
        });
      }
    }
  }
  return records.sort((a, b) => a.assigneeName.localeCompare(b.assigneeName) || a.projectName.localeCompare(b.projectName) || a.code.localeCompare(b.code));
}

export function weeklyTargetsInPeriod(records: WeeklyTargetRecord[], week: string, userId = 'all', projectId = 'all') {
  const period = calendarWeek(week);
  return records.filter(record => record.startDate && record.endDate && record.startDate <= period.end && record.endDate >= period.start
    && (userId === 'all' || (record.assigneeId || 'unassigned') === userId)
    && (projectId === 'all' || record.projectId === projectId));
}
