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
assert.equal(octoberFirst.filter_start, '2026-10-02T15:00:00+07:00');
assert.equal(octoberFirst.filter_end, '2026-10-06T15:00:00+07:00');
assert.equal(selectedWeeklyWorkPeriod('2026-06', 1).filter_start, '2026-05-29T15:00:00+07:00');
assert.equal(selectedWeeklyWorkPeriod('2027-01', 1).filter_start, '2027-01-01T15:00:00+07:00');
assert.deepEqual(weeklyPeriodWhere('2026-10', 1), { OR: [{
  start_date: { lt: new Date('2026-10-10T00:00:00Z') }, end_date: { gte: new Date('2026-10-05T00:00:00Z') },
}, { created_at: {
  gte: new Date('2026-10-02T08:00:00Z'), lt: new Date('2026-10-06T08:00:00Z'),
} }] });
assert.deepEqual(weeklyPeriodWhere('2026-10', undefined), { OR: [{
  start_date: { lt: new Date('2026-10-31T00:00:00Z') }, end_date: { gte: new Date('2026-10-05T00:00:00Z') },
}, { created_at: {
  gte: new Date('2026-10-02T08:00:00Z'), lt: new Date('2026-10-27T08:00:00Z'),
} }] });

const project: Project = { id: 'project', project_name: 'Project', main_tasks: [{ id: 'main', project: 'project', name: 'Main', status: 'PLANNED', weekly_tasks: [
  { id: 'cross', main_task: 'main', week_number: 42, created_at: '2026-09-28T08:00:00Z', start_date: '2026-09-28', end_date: '2026-10-02', status: 'PLANNED', target_description: 'Cross-month target' },
  { id: 'oct', main_task: 'main', week_number: 8, start_date: '2026-10-05', end_date: '2026-10-11', status: 'PLANNED', target_description: 'Legacy Mon–Sun target without timestamp' },
  { id: 'missing', main_task: 'main', week_number: 1, status: 'PLANNED', target_description: 'No schedule' },
] }] };
const records = weeklyTargetRecords([project]);
const filters = { query: '', projectId: '', group: '', today: '2026-10-01' };
for (const [month, week, expected] of [['2026-09', 4, ['cross']], ['2026-10', 1, ['oct']], ['2026-10', 2, []]] as const) {
  const period = selectedWeeklyWorkPeriod(month, week);
  const frontendIds = filterWeeklyTargets(records, { ...filters, period }).map(record => record.id);
  const where = weeklyPeriodWhere(month, week) as { OR: [
    { start_date: { lt: Date }; end_date: { gte: Date } }, { created_at: { gte: Date; lt: Date } },
  ] };
  const backendIds = records.filter(row => Boolean(row.startDate && row.endDate
    && new Date(`${row.startDate}T00:00:00Z`) < where.OR[0].start_date.lt
    && new Date(`${row.endDate}T00:00:00Z`) >= where.OR[0].end_date.gte)
    || Boolean(row.weeklyTask.created_at
      && new Date(row.weeklyTask.created_at) >= where.OR[1].created_at.gte
      && new Date(row.weeklyTask.created_at) < where.OR[1].created_at.lt)).map(record => record.id);
  assert.deepEqual(frontendIds, expected);
  assert.deepEqual(frontendIds, backendIds, 'Frontend filtering must match backend creation timestamp boundaries');
}
assert.equal(records.find(row => row.id === 'cross')!.weeklyTask.week_number, 42, 'Project sequence numbers are preserved');

const boundaryCases = [
  ['2026-10-02T14:59:59.999+07:00', false],
  ['2026-10-02T15:00:00+07:00', true],
  ['2026-10-02T08:00:00.001Z', true],
  ['2026-10-03T01:00:00+07:00', true],
  ['2026-10-06T14:59:59.999+07:00', true],
  ['2026-10-06T15:00:00+07:00', false],
  ['2026-10-06T08:00:00.001Z', false],
  ['2026-10-09T23:59:59.999+07:00', false],
  ['invalid timestamp', false],
  [undefined, false],
] as const;
const boundaryWhere = (weeklyPeriodWhere('2026-10', 1).OR as any[])[1] as { created_at: { gte: Date; lt: Date } };
for (const [created_at, included] of boundaryCases) {
  // Non-overlapping schedules may still appear through the creation timestamp.
  const row = { ...records[0], startDate: '2026-12-01', endDate: '2026-12-31',
    weeklyTask: { ...records[0].weeklyTask, created_at } };
  assert.equal(filterWeeklyTargets([row], { ...filters, period: octoberFirst }).length, included ? 1 : 0, String(created_at));
  const timestamp = created_at ? new Date(created_at) : new Date(NaN);
  assert.equal(timestamp >= boundaryWhere.created_at.gte && timestamp < boundaryWhere.created_at.lt, included);
}
for (const created_at of [undefined, 'invalid timestamp', '2026-09-01T00:00:00Z']) {
  const row = { ...records.find(record => record.id === 'oct')!,
    weeklyTask: { ...records.find(record => record.id === 'oct')!.weeklyTask, created_at } };
  assert.equal(filterWeeklyTargets([row], { ...filters, period: octoberFirst }).length, 1,
    'Schedule matches remain visible regardless of the creation timestamp');
}
const noSchedule = { ...records[0], startDate: '', endDate: '',
  weeklyTask: { ...records[0].weeklyTask, created_at: octoberFirst.filter_start } };
assert.equal(filterWeeklyTargets([noSchedule], { ...filters, period: octoberFirst }).length, 1);
assert.equal(filterWeeklyTargets([noSchedule], { ...filters, period: octoberFirst, projectId: 'other' }).length, 0);

// Every working day maps to one Monday identity, across all month/year/leap boundaries.
for (let year = 2020; year <= 2040; year++) for (let month = 1; month <= 12; month++) {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  const periods = weeklyWorkPeriods(key);
  for (const period of periods) {
    assert.equal(new Date(`${period.start}T00:00:00Z`).getUTCDay(), 1);
    assert.equal(new Date(`${period.end}T00:00:00Z`).getUTCDay(), 5);
    const previousFriday = new Date(`${period.start}T00:00:00Z`);
    previousFriday.setUTCDate(previousFriday.getUTCDate() - 3);
    assert.equal(period.filter_start, `${previousFriday.toISOString().slice(0, 10)}T15:00:00+07:00`);
    const shiftedEnd = new Date(`${period.end}T00:00:00Z`);
    shiftedEnd.setUTCDate(shiftedEnd.getUTCDate() - 3);
    assert.equal(period.filter_end, `${shiftedEnd.toISOString().slice(0, 10)}T15:00:00+07:00`);
    for (let offset = 0; offset < 5; offset++) {
      const date = new Date(`${period.start}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + offset);
      assert.deepEqual(weeklyWorkPeriodForDate(date.toISOString().slice(0, 10)), period);
    }
  }
}
console.log('PASS: Weekly periods — preserved schedules, both creation boundaries shifted three days to 15:00 WIB, millisecond/month/year boundaries and frontend/backend parity.');
