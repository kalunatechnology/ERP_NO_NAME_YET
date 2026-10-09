import assert from 'node:assert/strict';
import { weeklyPeriodCalendar, weeklyPeriodWhere, weeklyWorkPeriodForDate, weeklyWorkPeriods, selectedWeeklyWorkPeriod } from '../src/modules/projects/weekly-period';
import { filterWeeklyTargets } from '../../frontend-next/lib/tasks/weekly-management';
import { weeklyTargetRecords } from '../../frontend-next/lib/weekly-dashboard';
import type { Project } from '../../frontend-next/lib/api/project.api';

assert.deepEqual(weeklyWorkPeriods('2026-10').map(({ week, start, end }) => ({ week, start, end })), [
  { week: 1, start: '2026-10-05', end: '2026-10-09' },
  { week: 2, start: '2026-10-12', end: '2026-10-16' },
  { week: 3, start: '2026-10-19', end: '2026-10-23' },
  { week: 4, start: '2026-10-26', end: '2026-10-30' },
]);
for (const [date, month, week, start, end] of [
  ['2026-10-01', '2026-09', 4, '2026-09-28', '2026-10-02'],
  ['2026-10-02', '2026-09', 4, '2026-09-28', '2026-10-02'],
  ['2026-10-03', '2026-09', 4, '2026-09-28', '2026-10-02'],
  ['2026-10-04', '2026-09', 4, '2026-09-28', '2026-10-02'],
  ['2026-10-05', '2026-10', 1, '2026-10-05', '2026-10-09'],
  ['2027-01-01', '2026-12', 4, '2026-12-28', '2027-01-01'],
  ['2027-01-04', '2027-01', 1, '2027-01-04', '2027-01-08'],
  ['2026-06-01', '2026-06', 1, '2026-06-01', '2026-06-05'],
  ['2026-08-31', '2026-08', 5, '2026-08-31', '2026-09-04'],
  ['2026-09-01', '2026-08', 5, '2026-08-31', '2026-09-04'],
  ['2024-02-29', '2024-02', 4, '2024-02-26', '2024-03-01'],
] as const) {
  assert.deepEqual(weeklyWorkPeriodForDate(date), { id: `${month}:W${week}`, month, week, start, end }, date);
}
assert.equal(weeklyPeriodCalendar(undefined, '2026-10-01').month, '2026-09');
assert.equal(weeklyPeriodCalendar('2026-10', '2026-10-01').periods[0].start, '2026-10-05');
assert.equal(weeklyPeriodCalendar(undefined, '2026-10-09').current.week, 1);
assert.throws(() => weeklyWorkPeriods('2026-13'));
assert.throws(() => weeklyWorkPeriodForDate('2026-02-30'));
assert.throws(() => weeklyPeriodCalendar([], '2026-10-01'));
assert.throws(() => weeklyPeriodCalendar('2026-10', []));
assert.throws(() => selectedWeeklyWorkPeriod('2026-10', '5'));
assert.throws(() => weeklyPeriodWhere(undefined, '1'));
assert.deepEqual(weeklyPeriodWhere(undefined, undefined), {});

const project: Project = { id: 'project', project_name: 'Project', main_tasks: [{ id: 'main', project: 'project', name: 'Main', status: 'PLANNED', weekly_tasks: [
  { id: 'cross', main_task: 'main', week_number: 42, start_date: '2026-09-28', end_date: '2026-10-02', status: 'PLANNED', target_description: 'Cross-month target' },
  { id: 'oct', main_task: 'main', week_number: 8, start_date: '2026-10-05', end_date: '2026-10-11', status: 'PLANNED', target_description: 'Legacy Mon–Sun target' },
  { id: 'missing', main_task: 'main', week_number: 1, status: 'PLANNED', target_description: 'No schedule' },
] }] };
const records = weeklyTargetRecords([project]);
const filters = { query: '', projectId: '', group: '', today: '2026-10-01' };
for (const [month, week, expected] of [['2026-09', 4, ['cross']], ['2026-10', 1, ['oct']], ['2026-10', 2, []]] as const) {
  const period = selectedWeeklyWorkPeriod(month, week);
  const frontendIds = filterWeeklyTargets(records, { ...filters, period }).map(record => record.id);
  const where = weeklyPeriodWhere(month, week) as { start_date: { lt: Date }; end_date: { gte: Date } };
  const backendIds = records.filter(row => row.startDate && row.endDate
    && new Date(`${row.startDate}T00:00:00Z`) < where.start_date.lt
    && new Date(`${row.endDate}T00:00:00Z`) >= where.end_date.gte).map(record => record.id);
  assert.deepEqual(frontendIds, expected);
  assert.deepEqual(frontendIds, backendIds, 'Frontend filtering must match backend date-only range conditions');
}
assert.equal(records.find(row => row.id === 'cross')!.weeklyTask.week_number, 42, 'Project sequence numbers are preserved');

// Every working day maps to one Monday identity, across all month/year/leap boundaries.
for (let year = 2020; year <= 2040; year++) for (let month = 1; month <= 12; month++) {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  const periods = weeklyWorkPeriods(key);
  for (const period of periods) {
    assert.equal(new Date(`${period.start}T00:00:00Z`).getUTCDay(), 1);
    assert.equal(new Date(`${period.end}T00:00:00Z`).getUTCDay(), 5);
    for (let offset = 0; offset < 5; offset++) {
      const date = new Date(`${period.start}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + offset);
      assert.deepEqual(weeklyWorkPeriodForDate(date.toISOString().slice(0, 10)), period);
    }
  }
}
console.log('PASS: Weekly periods — monthly Monday–Friday numbering, early-month carry-over, partial final week, leap/year/weekend boundaries and frontend/backend range parity.');
