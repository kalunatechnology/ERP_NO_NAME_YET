import assert from 'node:assert/strict';
import { RoleCode } from '@prisma/client';
import { proposeAction } from '../src/modules/marbot/marbot-action.service';
import { answerNative, NativeScope, queryPeriod, detectTools } from '../src/modules/marbot/marbot-native.service';
import { discoverMarbotSchema, readableTables } from '../src/modules/marbot/marbot-schema.service';
import prisma from '../src/config/database';
import { loadNativePolicyRestrictions } from '../src/modules/marbot/marbot-policy.service';

const scope: NativeScope = { tenantId: 't', companyId: 'c', userId: 'u', roleId: 'r', roleCode: RoleCode.PROJECT_MANAGER, enabledModules: ['MARBOT', 'PROJECTS'], permissions: ['USE_MARBOT', 'READ_PROJECT', 'READ_TASK'], projectScope: { mode: 'LIST', projectIds: ['p'] } };
const id = 'b75d14c9-365c-49a8-b4c0-de618d827c25';
async function main() {
  const queries: any[] = [];
  assert.deepEqual(detectTools('biaya proyek minggu ini'), ['finance']);
  assert.deepEqual(detectTools('task in progress'), ['tasks']);
  assert.equal(queryPeriod('hari ini', new Date('2026-10-01T18:00:00Z')).start.toISOString(), '2026-10-01T17:00:00.000Z');
  assert.equal(queryPeriod('minggu depan', new Date('2026-10-01T00:00:00Z')).start.toISOString(), '2026-10-04T17:00:00.000Z');
  assert.throws(() => queryPeriod('2026-02-30'));
  assert.throws(() => queryPeriod('2026-13'));
  const restrictions = await loadNativePolicyRestrictions(scope, {
    iam_field_permission: { findMany: async () => [{ module_code: 'FINANCE', can_view: false, can_edit: false, masking_type: 'NONE' }] },
    iam_role_data_scope: { findMany: async () => [{ policy_id: 'policy' }] },
    iam_data_scope_policy: { findMany: async () => [{ module_code: 'PROJECTS' }] },
  } as any);
  assert.deepEqual(restrictions.blockedReadModules, ['FINANCE', 'PROJECTS']);
  assert.deepEqual(restrictions.blockedWriteModules, ['FINANCE', 'PROJECTS']);
  assert.equal(proposeAction('buat proyek {}', { ...scope, ...restrictions })!.action, undefined);
  assert.deepEqual(readableTables({ ...scope, ...restrictions }), []);
  const db: any = {
    project_project: { count: async (args: any) => { queries.push(args); return 0; }, findMany: async () => [] },
    $queryRaw: async (query: any) => { queries.push(query); return []; },
  };
  assert.match((await answerNative('fitur sistem', 'HELPER', scope, db)).content, /Main Task/);
  assert.match((await answerNative('fitur Finance', 'HELPER', scope, db)).content, /belum tersedia/);
  assert.match((await answerNative('hak akses saya', 'HELPER', scope, db)).content, /PROJECT_MANAGER/);
  assert.equal(queries.length, 0);
  const projects = await answerNative('Berapa project yang sedang berjalan?', 'HELPER', scope, db);
  assert.match(projects.content, /: 0/);
  assert.deepEqual(queries[0].where.status.in, ['IN_PROGRESS', 'STARTED', 'ACTIVE']);
  assert.deepEqual(queries[0].where.id.in, ['p']);
  await answerNative('task in progress minggu ini', 'HELPER', scope, db);
  assert.ok(queries.at(-1).values.includes('IN_PROGRESS'));
  assert.ok(queries.at(-1).values.includes('t'));
  assert.ok(queries.at(-1).values.includes('c'));
  const hostile = 'tugas "x\' OR 1=1 --" minggu ini';
  await answerNative(hostile, 'HELPER', scope, db);
  assert.ok(queries.at(-1).values.includes("x' OR 1=1 --"));
  assert.ok(!queries.at(-1).strings.join('').includes("OR 1=1"));
  const empty = await answerNative('tugas', 'HELPER', scope, db);
  assert.match(empty.content, /Belum ada task/);
  const ticketQueries: any[] = [];
  const tickets = await answerNative('tiket selesai', 'HELPER', { ...scope, roleCode: RoleCode.CRM_LEAD, enabledModules: ['MARBOT', 'CRM'], permissions: ['USE_MARBOT', 'READ_TICKET'] }, {
    service_case: { count: async (args: any) => { ticketQueries.push(args); return 0; } },
  } as any);
  assert.match(tickets.content, /selesai\/ditutup: 0/);
  assert.deepEqual(ticketQueries[0].where.status.in, ['CLOSED', 'RESOLVED']);
  const partial = await answerNative('proyek dan tugas', 'HELPER', scope, { ...db, $queryRaw: async () => { throw new Error('offline'); } });
  assert.match(partial.content, /query database gagal/);
  assert.deepEqual(partial.tools, ['projects']);
  const deniedScope = { ...scope, permissions: ['USE_MARBOT'] };
  assert.deepEqual(readableTables(deniedScope), []);
  assert.deepEqual((await discoverMarbotSchema(deniedScope, db)).columns, []);
  const schema = await discoverMarbotSchema(scope, db);
  assert.equal(schema.source, 'database');
  assert.ok(queries.at(-1).values.includes('project_project'));
  assert.match(proposeAction('buat proyek', scope)!.content, /wajib diisi/);
  const project = proposeAction('buat proyek {"project_name":"A","customer_name":"B","manager_name":"C"}', scope)!;
  assert.equal(project.action!.kind, 'project.create');
  assert.match(project.content, /Belum disimpan/);
  assert.equal(proposeAction('buat proyek {"project_name":"A","customer_name":"B","manager_name":"C","tenant_id":"evil"}', scope)!.action, undefined);
  assert.equal(proposeAction('buat proyek {}', { ...scope, roleCode: RoleCode.STAFF })!.action, undefined);
  assert.equal(proposeAction(`ubah task {"id":"${id}","status":"COMPLETED","output_result":"hasil"}`, scope)!.action!.kind, 'task.update');
  assert.equal(proposeAction(`ubah task {"id":"${id}","status":"ADMIN"}`, scope)!.action, undefined);
  assert.equal(proposeAction(`buat task {"project_id":"${id}","name":"A","weight":10}`, scope)!.action!.kind, 'task.create');
  assert.equal(proposeAction(`buat tugas harian {"weekly_task_id":"${id}","title":"A","time_slot":"09-10","output_target":"B"}`, scope)!.action!.kind, 'daily.create');
  assert.equal(proposeAction(`buat target mingguan {"main_task_id":"${id}","assignee_id":"${id}","week_number":1,"start_date":"2026-10-05","end_date":"2026-10-11","target_description":"A"}`, scope)!.action!.kind, 'weekly.create');
  console.log('Marbot capabilities: knowledge, authority, scope, filtering, empty data, injection, partial failure, live discovery and strict confirmed action proposals passed.');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
