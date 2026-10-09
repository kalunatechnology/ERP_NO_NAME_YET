import assert from 'node:assert/strict';
import type { Project, WeeklyTask } from '../../frontend-next/lib/api/project.api';
import { filterWeeklyTargets, moveWeeklyCard, personalWeeklyTargets, sortWeeklyTargets, weeklyCreationProjects, weeklyGroup, weeklyPermissions } from '../../frontend-next/lib/tasks/weekly-management';
import { weeklyPlanningPatch } from '../src/modules/projects/weekly-planning';
import type { ProjectAuthority } from '../../frontend-next/lib/api/project.api';

const weekly = (id: string, assignee: string, status: string): WeeklyTask => ({
  id, main_task: 'main', assignee_id: assignee, week_number: 1,
  target_description: `${id} inventory plan`, start_date: '2026-10-05', end_date: '2026-10-11',
  status, progress: 0, daily_tasks: [],
});
const project: Project = { id: 'project', project_name: 'Operations', project_code: 'OPS', main_tasks: [{
  id: 'main', project: 'project', name: 'Inventory', status: 'PLANNED',
  assignments: [{ id: 'other-assignment', main_task: 'main', assignee_id: 'other' }, { id: 'own-assignment', main_task: 'main', assignee: 'me' }],
  weekly_tasks: [weekly('pending', 'me', 'PENDING_APPROVAL'), weekly('ready', 'me', 'PLANNED'), weekly('rejected', 'me', 'REJECTED'), weekly('other', 'other', 'IN_PROGRESS')],
}, { id: 'unassigned', project: 'project', name: 'Historical assignment', status: 'PLANNED', weekly_tasks: [{ ...weekly('history', 'me', 'COMPLETED'), main_task: 'unassigned', progress: 100 }] }] };
const today = '2026-10-09';
const personal = personalWeeklyTargets([project, project], 'me');
assert.equal(personal.length, 4);
assert(!personal.some(record => record.id === 'other'));
assert.equal(personalWeeklyTargets([project], undefined).length, 0);
assert.equal(weeklyCreationProjects([project], undefined).length, 0);
assert.deepEqual(weeklyCreationProjects([project], 'me')[0].main_tasks?.map(main => main.id), ['main']);
assert.equal(personal.find(record => record.id === 'history')?.progress, 100, 'Historical target stays visible when Main assignment is removed');
const pending = personal.find(record => record.id === 'pending')!;
assert.equal(weeklyGroup({ ...pending, progress: 100 }, today), 'PENDING_APPROVAL', 'Approval state precedes progress');
assert.equal(weeklyGroup(personal.find(record => record.id === 'rejected')!, today), 'REJECTED');
const ready = personal.find(record => record.id === 'ready')!;
assert.equal(weeklyGroup(ready, today), 'READY');
assert.equal(weeklyGroup({ ...ready, progress: 25 }, today), 'IN_PROGRESS');
assert.equal(weeklyGroup({ ...ready, hasBlockedDaily: true }, today), 'ATTENTION');
assert.equal(weeklyGroup({ ...ready, endDate: '2026-10-08' }, today), 'ATTENTION');
assert.equal(weeklyGroup(personal.find(record => record.id === 'history')!, today), 'COMPLETED');
const filters = { query: '', projectId: '', period: null, group: '', today };
assert.equal(filterWeeklyTargets(personal, filters).length, 4);
assert.equal(filterWeeklyTargets(personal, { ...filters, period: { start: '2026-10-05', end: '2026-10-09' } }).length, 4);
assert.equal(filterWeeklyTargets(personal, { ...filters, period: { start: '2026-10-12', end: '2026-10-16' } }).length, 0);
assert.equal(filterWeeklyTargets(personal, { ...filters, projectId: 'different-company-project' }).length, 0);
assert.deepEqual(filterWeeklyTargets(personal, { ...filters, group: 'PENDING_APPROVAL' }).map(record => record.id), ['pending']);
assert.equal(filterWeeklyTargets(personal, { ...filters, query: 'OPS' }).length, 4);
assert.deepEqual(filterWeeklyTargets(personal, { ...filters, query: 'ready inventory' }).map(record => record.id), ['ready']);
const authority = { project_id: 'project', can_manage_weekly_tasks: true, can_review_weekly_tasks: true } as ProjectAuthority;
assert.equal(weeklyPermissions(ready, 'me', undefined, true).canEdit, false, 'Unknown project authority fails closed');
assert.equal(weeklyPermissions(ready, 'me', authority, false).canEdit, false, 'Read-only users cannot edit');
assert.equal(weeklyPermissions(ready, 'me', authority, true).canCreateDaily, true);
assert.equal(weeklyPermissions(ready, 'other', authority, true).canCreateDaily, false, 'PM cannot execute another user Daily');
assert.equal(weeklyPermissions(pending, 'me', authority, true).canEdit, false);
assert.equal(weeklyPermissions(pending, 'me', authority, true).canReview, false, 'Missing creator prevents self-review ambiguity');
assert.equal(weeklyPermissions({ ...pending, weeklyTask: { ...pending.weeklyTask, created_by_id: 'me' } }, 'me', authority, true).canReview, false);
assert.equal(weeklyPermissions({ ...pending, weeklyTask: { ...pending.weeklyTask, created_by_id: 'staff' } }, 'me', authority, true).canReview, true);
assert.equal(weeklyPermissions({ ...ready, dailyCount: 1 }, 'me', authority, true).canDelete, false);
assert.deepEqual(weeklyPlanningPatch({ target_description: 'Changed', week_number: 3, status: 'COMPLETED', progress: 100,
  tenant_id: 'other', company_id: 'other', main_task_id: 'other', assignee_id: 'other', created_by_id: 'me', is_progress_overridden: true }),
  { target_description: 'Changed', week_number: 3 });
const readyTwo = { ...ready, id: 'ready-two', endDate: '2026-10-10' };
assert.deepEqual(sortWeeklyTargets([ready, readyTwo], 'due').map(row => row.id), ['ready-two', 'ready']);
assert.deepEqual(moveWeeklyCard([ready, readyTwo], 'ready-two', 'ready', today), ['ready-two', 'ready']);
assert.deepEqual(moveWeeklyCard([ready, pending], 'ready', 'pending', today), ['ready', 'pending'], 'Drag ordering cannot alter approval/progress state');
console.log('PASS: Weekly management — ownership, project authority, staff/PM capabilities, self-review prevention, payload injection, sorting and safe card ordering.');
