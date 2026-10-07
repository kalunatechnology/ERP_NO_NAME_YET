import assert from 'node:assert/strict';
import { calendarWeek, weeklyProgress, weeklyTargetRecords, weeklyTargetsInPeriod } from '../../frontend-next/lib/weekly-dashboard';
import type { Project, WeeklyTask } from '../../frontend-next/lib/api/project.api';

const weekly = (id: string, owner: string, start = '2026-10-05', end = '2026-10-11'): WeeklyTask => ({
  id, main_task: 'main', assignee_id: owner, week_number: 40, start_date: start, end_date: end, status: 'IN_PROGRESS', progress: 75,
  daily_tasks: [
    { id: `${id}-done`, weekly_task: id, owner_id: owner, owner_name: owner, title: 'Completed', status: 'COMPLETED', progress: 100 },
    { id: `${id}-partial`, weekly_task: id, owner_id: 'transferred', owner_name: 'Other Daily Owner', title: 'Partial', status: 'IN_PROGRESS', progress: 50 },
  ],
});
const current = weekly('current', 'alice');
// A transfer must not rename the weekly owner. Invalid child links and duplicate
// payloads must not become rows under the wrong parent.
current.daily_tasks!.reverse();
current.daily_tasks!.push(current.daily_tasks![0], { id: 'orphan', weekly_task: 'other-weekly', title: 'Orphan', status: 'COMPLETED', progress: 100 });
const other = weekly('other', 'bob');
const previous = weekly('previous', 'alice', '2026-09-28', '2026-10-04');
const next = weekly('next', 'alice', '2026-10-12', '2026-10-18');
const main = { id: 'main', project: 'project', name: 'Main', title: 'Main', status: 'PLANNED' };
const project: Project = { id: 'project', project_name: 'Project', main_tasks: [{ ...main, weekly_tasks: [current, other, previous, next, current] }] };
const records = weeklyTargetRecords([project, project]);
assert.equal(records.length, 4);
const record = records.find(row => row.id === 'current')!;
assert.equal(record.dailyCount, 2); assert.equal(record.progress, 75); assert.equal(record.assigneeName, 'alice');
assert.equal(record.dailyTasks[0].owner_name, 'Other Daily Owner');
assert.deepEqual(weeklyTargetsInPeriod(records, '2026-10-07').map(row => row.id), ['current', 'other']);
assert.deepEqual(weeklyTargetsInPeriod(records, '2026-10-11', 'alice').map(row => row.id), ['current']);
assert.deepEqual(weeklyTargetsInPeriod(records, '2026-09-30', 'alice').map(row => row.id), ['previous']);
assert.equal(weeklyTargetsInPeriod(records, '2026-10-07', 'transferred').length, 0);
assert.equal(weeklyTargetsInPeriod(records, '2026-10-07', 'alice', 'other-project').length, 0);
assert.deepEqual(calendarWeek('2027-01-01'), { start: '2026-12-28', end: '2027-01-03' });
assert.equal(weeklyProgress({}, [{ progress: 100 }, { progress: 50 }]), 75);
assert.equal(weeklyProgress({ progress: 75 }, [{ progress: 100 }]), 75, 'A partial visibility scope must retain server rollup');
assert.equal(weeklyProgress({ progress: 100, status: 'PENDING_APPROVAL' }, []), 0);
assert.equal(weeklyProgress({ progress: 100, status: 'REJECTED' }, []), 0);
assert.equal(weeklyProgress({}, []), 0);
const deleted = weeklyTargetRecords([{ ...project, main_tasks: [{ ...main, weekly_tasks: [{ ...current, progress: 0, status: 'PLANNED', daily_tasks: [] }] }] }])[0];
assert.equal(deleted.dailyCount, 0); assert.equal(deleted.progress, 0);
console.log('PASS: Weekly dashboard — owner/transfer identity, relation validation, deduplication, user/project/week isolation, year boundary, partial progress, approval states and post-delete refresh.');
