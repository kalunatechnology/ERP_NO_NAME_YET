import assert from 'node:assert/strict';
import { weeklyPeriodCalendar, weeklyPeriodWhere, weeklyWorkPeriodForDate, weeklyWorkPeriods, selectedWeeklyWorkPeriod } from '../src/modules/projects/weekly-period';
import { filterWeeklyTargets } from '../../frontend-next/lib/tasks/weekly-management';
import { weeklyTargetRecords } from '../../frontend-next/lib/weekly-dashboard';
import type { Project } from '../../frontend-next/lib/api/project.api';

assert.deepEqual(weeklyWorkPeriods('2026-10').map(({ week, start, end, filter_start, filter_end }) => ({ week, start, end, filter_start, filter_end })), [
  { week: 1, start: '2026-10-05', end: '2026-10-09', filter_start: '2026-10-02T15:00:00+07:00', filter_end: '2026-10-09T15:00:00+07:00' },
  { week: 2, start: '2026-10-12', end: '2026-10-16', filter_start: '2026-10-09T15:00:00+07:00', filter_end: '2026-10-16T15:00:00+07:00' },
  { week: 3, start: '2026-10-19', end: '2026-10-23', filter_start: '2026-10-16T15:00:00+07:00', filter_end: '2026-10-23T15:00:00+07:00' },
  { week: 4, start: '2026-10-26', end: '2026-10-30', filter_start: '2026-10-23T15:00:00+07:00', filter_end: '2026-10-30T15:00:00+07:00' },
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
  const { filter_start, filter_end, ...period } = weeklyWorkPeriodForDate(date);
  assert.deepEqual(period, { id: `${month}:W${week}`, month, week, start, end }, date);
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

const octoberFirst = selectedWeeklyWorkPeriod('2026-10', 1);
assert.deepEqual(weeklyPeriodWhere('2026-10', 1), { created_at: {
  gte: new Date('2026-10-02T08:00:00.000Z'), lt: new Date('2026-10-09T08:00:00.000Z'),
} });
assert.deepEqual(weeklyPeriodWhere('2026-10', undefined), { created_at: {
  gte: new Date('2026-10-02T08:00:00.000Z'), lt: new Date('2026-10-30T08:00:00.000Z'),
} });

const project: Project = { id: 'project', project_name: 'Project', main_tasks: [{ id: 'main', project: 'project', name: 'Main', status: 'PLANNED', weekly_tasks: [
  { id: 'old-schedule', main_task: 'main', week_number: 42, created_at: '2026-10-08T04:00:00Z', start_date: '2026-10-12', end_date: '2026-10-16', status: 'PLANNED', target_description: 'Schedule overlaps Week 2 but created Week 1' },
  { id: 'created-week2', main_task: 'main', week_number: 8, created_at: '2026-10-12T02:00:00Z', start_date: '2026-11-01', end_date: '2026-11-10', status: 'PLANNED', target_description: 'Created during Week 2 despite later schedule' },
  { id: 'created-week1', main_task: 'main', week_number: 1, created_at: '2026-10-08T02:00:00Z', start_date: '2026-10-05', end_date: '2026-10-09', status: 'PLANNED', target_description: 'Created Week 1' },
  { id: 'missing', main_task: 'main', week_number: 1, status: 'PLANNED', target_description: 'Missing creation timestamp' },
] }] };
const records = weeklyTargetRecords([project]);
const filters = { query: '', projectId: '', group: '', today: '2026-10-01' };
const week1 = selectedWeeklyWorkPeriod('2026-10', 1);
const week2 = selectedWeeklyWorkPeriod('2026-10', 2);
assert.deepEqual(filterWeeklyTargets(records, { ...filters, period: week1 }).map(record => record.id), ['created-week1', 'old-schedule']);
assert.deepEqual(filterWeeklyTargets(records, { ...filters, period: week2 }).map(record => record.id), ['created-week2']);
assert.deepEqual(filterWeeklyTargets(records, { ...filters, period: week2, projectId: 'other' }).map(record => record.id), []);
assert.equal(records.find(row => row.id === 'old-schedule')!.weeklyTask.week_number, 42, 'Project sequence numbers are preserved');

const boundaries = [
  ['2026-10-02T07:59:59.999Z', false],
  ['2026-10-02T08:00:00.000Z', true],
  ['2026-10-09T07:59:59.999Z', true],
  ['2026-10-09T08:00:00.000Z', false],
  ['invalid timestamp', false],
  [undefined, false],
] as const;
const where = weeklyPeriodWhere('2026-10', 1) as { created_at: { gte: Date; lt: Date } };
for (const [created_at, included] of boundaries) {
  const row = { ...records[0], startDate: '2026-12-01', endDate: '2026-12-31',
    weeklyTask: { ...records[0].weeklyTask, created_at } };
  assert.equal(filterWeeklyTargets([row], { ...filters, period: octoberFirst }).length, included ? 1 : 0, String(created_at));
  const timestamp = created_at ? new Date(created_at) : new Date(NaN);
  assert.equal(timestamp >= where.created_at.gte && timestamp < where.created_at.lt, included);
}

// Calendar mapping remains stable over month/year/leap boundaries; production filters from the previous Friday 15:00 WIB through the current Friday 15:00 WIB.
for (let year = 2020; year <= 2040; year++) for (let month = 1; month <= 12; month++) {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  for (const period of weeklyWorkPeriods(key)) {
    assert.equal(new Date(`${period.start}T00:00:00Z`).getUTCDay(), 1);
    assert.equal(new Date(`${period.end}T00:00:00Z`).getUTCDay(), 5);
    const previousFriday = new Date(`${period.start}T00:00:00Z`);
    previousFriday.setUTCDate(previousFriday.getUTCDate() - 3);
    assert.equal(period.filter_start, `${previousFriday.toISOString().slice(0, 10)}T15:00:00+07:00`);
    assert.equal(period.filter_end, `${period.end}T15:00:00+07:00`);
    for (let offset = 0; offset < 5; offset++) {
      const date = new Date(`${period.start}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + offset);
      assert.deepEqual(weeklyWorkPeriodForDate(date.toISOString().slice(0, 10)), period);
    }
  }
}
console.log('PASS: Weekly filters classify targets by created_at only and preserve production Friday 15:00 WIB boundaries.');
