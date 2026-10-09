import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { personalDailyTaskRecords, personalDailyTaskSummary } from '../../frontend-next/lib/tasks/personal-workspace';
import { localDateKey, normalizeDateKey } from '../../frontend-next/lib/calendar-date';
import type { DailyTask, Project } from '../../frontend-next/lib/api/project.api';

// Reproduce the reported mismatch with synthetic data: the managed portfolio
// has 13 tasks today (one completed) and eight overdue, while the PM owns only
// one overdue task. These fixtures are not production records.
const today = '2026-10-09';
const tasks: DailyTask[] = [
  ...Array.from({ length: 13 }, (_, index): DailyTask => ({
    id: `team-today-${index}`, owner_id: 'teammate', planned_date: today,
    status: index === 0 ? 'COMPLETED' : 'IN_PROGRESS',
  })),
  ...Array.from({ length: 8 }, (_, index): DailyTask => ({
    id: `overdue-${index}`, owner_id: index === 0 ? 'pm' : 'teammate',
    planned_date: '2026-10-08T00:00:00.000Z', status: 'BLOCKED',
  })),
];
function project(dailyTasks: DailyTask[]): Project {
  return { id: 'project', project_name: 'Synthetic project', main_tasks: [{
    id: 'main', project: 'project', name: 'Main', status: 'IN_PROGRESS',
    weekly_tasks: [{ id: 'weekly', main_task: 'main', assignee_id: 'teammate',
      week_number: 41, status: 'IN_PROGRESS', daily_tasks: dailyTasks }],
  }] };
}
const portfolio = [project(tasks)];
const personal = personalDailyTaskRecords(portfolio, 'pm');
const summary = personalDailyTaskSummary(personal, today);
assert.equal(summary.todayCount, 0);
assert.equal(summary.doneToday, 0);
assert.equal(summary.overdueCount, 1);
assert.equal(summary.activeCount, 0);
assert.deepEqual(summary.overdueTasks.map(task => task.id), ['overdue-0']);
assert.equal(personalDailyTaskRecords(portfolio, undefined).length, 0);
assert.equal(personalDailyTaskRecords(portfolio, '').length, 0);
assert.equal(personalDailyTaskRecords(portfolio, 'unknown').length, 0);
assert.equal(personalDailyTaskRecords([...portfolio, ...portfolio], 'pm').length, 1);

const ownTasks: DailyTask[] = [
  { id: 'done', owner_id: 7, planned_date: `${today}T00:00:00.000Z`, status: 'DONE' },
  { id: 'active', owner_id: '7', planned_date: today, status: 'ON_PROGRESS' },
  { id: 'old-done', owner_id: 7, planned_date: '2026-10-08', status: 'COMPLETED' },
  { id: 'future', owner_id: 7, planned_date: '2026-10-10', status: 'PENDING' },
  { id: 'undated', owner_id: 7, status: 'NOT_STARTED' },
  { id: 'unowned', planned_date: today, status: 'PENDING' },
];
const own = personalDailyTaskRecords([project(ownTasks)], '7');
const ownSummary = personalDailyTaskSummary(own, today);
assert.equal(own.length, 5, 'Daily ownership controls inclusion even when Weekly belongs to someone else');
assert.equal(ownSummary.todayCount, 2);
assert.equal(ownSummary.doneToday, 1);
assert.equal(ownSummary.overdueCount, 0, 'Completed, future and undated tasks are not overdue');
assert.equal(ownSummary.activeCount, 2);
assert.equal(localDateKey(new Date(2026, 9, 9, 0, 5)), today);
assert.equal(normalizeDateKey(`${today}T00:00:00.000Z`), today);
assert.equal(normalizeDateKey('invalid'), '');

// Ensure both rendered pages continue to use the tested owner scope and counts.
const dashboard = readFileSync(`${__dirname}/../../frontend-next/app/(app)/dashboard/DashboardClient.tsx`, 'utf8');
const pm = dashboard.slice(dashboard.indexOf('function PMDashboard'), dashboard.indexOf('function FinanceDashboard'));
const workspace = readFileSync(`${__dirname}/../../frontend-next/app/(app)/tasks/TasksClient.tsx`, 'utf8');
assert(pm.includes('personalDailyTaskRecords(projects, userId)'));
assert(pm.includes('personalDailyTaskSummary('));
assert(!pm.includes('projects.flatMap'));
assert(dashboard.includes('userId={user?.id}'));
assert(workspace.includes('personalDailyTaskRecords(projects, user?.id)'));
assert(workspace.includes('personalDailyTaskSummary(allTasks, today)'));
console.log('PASS: Personal daily summary — reported 13/1/8 portfolio mismatch, ownership, transfers, missing identity, duplicates, dates, completion and page integration.');
