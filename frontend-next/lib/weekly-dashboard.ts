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

export function creationWeeklyPeriod(now: Date | string | number = new Date()) {
  const date = new Date(now);
  const wibMs = date.getTime() + 7 * 3600 * 1000;
  const wibDate = new Date(wibMs);
  const day = wibDate.getUTCDay();
  const hours = wibDate.getUTCHours();

  let daysToMonday = 0;
  if (day === 5 && hours >= 15) {
    daysToMonday = 3;
  } else if (day === 6) {
    daysToMonday = 2;
  } else if (day === 0) {
    daysToMonday = 1;
  } else {
    daysToMonday = -(day - 1);
  }

  const mondayMs = wibMs + daysToMonday * 86400 * 1000;
  const monday = new Date(mondayMs).toISOString().slice(0, 10);
  const fridayMs = mondayMs + 4 * 86400 * 1000;
  const friday = new Date(fridayMs).toISOString().slice(0, 10);
  return { start: monday, end: friday };
}

export interface TargetCalendarWeekInput {
  created_at?: string;
  start_date?: string;
  week_number?: number;
  weeklyTask?: {
    created_at?: string;
    week_number?: number;
    start_date?: string;
  };
  startDate?: string;
}

export function resolveTargetCalendarWeek(target: TargetCalendarWeekInput) {
  const startDate = target.startDate ?? target.start_date ?? target.weeklyTask?.start_date;
  if (!startDate) {
    const weekNumber = target.weeklyTask?.week_number ?? target.week_number ?? 1;
    return {
      calendarWeek: 0,
      calendarWeekLabel: "Belum dijadwalkan",
      calendarMonth: "",
      sequenceLabel: `Target #${weekNumber}`,
      sequenceCode: `W#${weekNumber}`,
    };
  }
  const date = new Date(`${startDate.slice(0, 10)}T00:00:00Z`);
  const wibMs = (Number.isFinite(date.getTime()) ? date.getTime() : Date.now()) + 7 * 3600 * 1000;
  const wibDate = new Date(wibMs);
  const day = wibDate.getUTCDay();
  const daysToMonday = -(day - 1);

  const mondayMs = wibMs + daysToMonday * 86400 * 1000;
  const mondayDate = new Date(mondayMs);
  const mondayKey = mondayDate.toISOString().slice(0, 10);
  const calendarMonth = mondayKey.slice(0, 7);

  const firstOfMonth = new Date(`${calendarMonth}-01T00:00:00Z`);
  const firstMondayDay = (8 - firstOfMonth.getUTCDay()) % 7 + 1;
  const mondayDayOfMonth = mondayDate.getUTCDate();
  const week = Math.max(1, Math.floor((mondayDayOfMonth - firstMondayDay) / 7) + 1);

  const weekNumber = target.weeklyTask?.week_number ?? target.week_number ?? 1;
  return {
    calendarWeek: week,
    calendarWeekLabel: `Weekly ${week}`,
    calendarMonth,
    sequenceLabel: `Target #${weekNumber}`,
    sequenceCode: `W#${weekNumber}`,
  };
}

export type WeeklyTargetRecord = {
  id: string; code: string; projectId: string; projectCode: string; projectName: string;
  mainTaskName: string; assigneeId: string; assigneeName: string;
  startDate: string; endDate: string; progress: number;
  dailyCount: number; completedDailyCount: number; hasBlockedDaily: boolean;
  dailyTasks: DailyTask[]; weeklyTask: WeeklyTask;
  calendarWeek: number; calendarWeekLabel: string; calendarMonth: string;
  sequenceLabel: string; sequenceCode: string;
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
        const projectCode = (project.project_code || project.code || 'PROJECT').replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim();
        const calendarMeta = resolveTargetCalendarWeek(weekly);
        records.push({
          id, code: `${projectCode} · W#${weekly.week_number || 1}`,
          projectId: String(project.id), projectCode, projectName: project.project_name || project.name || 'Project',
          mainTaskName: main.name || main.title || 'Main Task', assigneeId,
          assigneeName: weekly.assignee_name || assignmentName || matchingOwnerName || assigneeId || 'Belum ditentukan',
          startDate: weekly.start_date?.slice(0, 10) || '', endDate: weekly.end_date?.slice(0, 10) || '',
          progress: weeklyProgress(weekly, dailyTasks), dailyCount: dailyTasks.length,
          completedDailyCount: dailyTasks.filter(daily => ['COMPLETED', 'DONE'].includes(daily.status)).length,
          hasBlockedDaily: dailyTasks.some(daily => daily.is_blocked || daily.status === 'BLOCKED'), dailyTasks, weeklyTask: weekly,
          ...calendarMeta,
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
