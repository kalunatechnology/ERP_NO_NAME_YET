import assert from 'node:assert/strict';
import { RoleCode } from '@prisma/client';
import { answerNative, canUseDashboard, detectTools, followUpQuestion, NativeScope, queryPeriod } from '../src/modules/marbot/marbot-native.service';
import { helperAnswer } from '../src/modules/marbot/marbot-knowledge';
import { renderNativeAnswer } from '../src/modules/marbot/marbot-provider.service';
import prisma from '../src/config/database';

const staff: NativeScope = { tenantId: 'tenant-a', companyId: 'company-a', userId: 'user-a', roleId: 'role-a', roleCode: RoleCode.STAFF, enabledModules: ['MARBOT', 'PROJECTS'], permissions: ['USE_MARBOT', 'READ_TASK', 'READ_PROJECT'], projectScope: { mode: 'LIST', projectIds: ['project-a'] } };
const calls: Array<{ model: string; args: any }> = [];
const delegate = (name: string, rows: any[] = []) => ({
  count: async (args: any) => { calls.push({ model: name, args }); return 2; },
  findMany: async (args: any) => { calls.push({ model: name, args }); return rows; },
  findFirst: async (args: any) => { calls.push({ model: name, args }); return { id: 'employee-a' }; },
});
const db: any = {
  project_task: delegate('tasks', [{ task_name: 'Test task', status: 'OPEN', progress_percent: 10 }]),
  project_project: delegate('projects'), master_employee: delegate('employee'),
  core_organization: delegate('organizations'),
  analytics_kpi_definition: delegate('kpi-def'), analytics_kpi_result: delegate('kpi-result'),
  $queryRaw: async (query: any) => { calls.push({ model: 'daily', args: query }); return []; },
};

async function main() {
  assert.equal(canUseDashboard(staff), false);
  await assert.rejects(() => answerNative('KPI', 'DASHBOARD', staff, db));
  const denied = await answerNative('biaya perusahaan', 'HELPER', staff, db);
  assert.match(denied.content, /tidak tersedia untuk hak akses/);
  assert.deepEqual(denied.tools, []);
  assert.equal(calls.length, 0, 'Forbidden finance must never touch DB');
  const helper = await answerNative('Laporan kerja di mana?', 'HELPER', staff, db);
  assert.match(helper.content, /\/reporting/);
  assert.equal(calls.length, 0, 'Procedures do not read business data');
  assert.match(helperAnswer('cara ajukan cuti'), /Leave Request/);
  assert.match(helperAnswer('cara ajukan cuti'), /\/dashboard/);
  assert.deepEqual(detectTools('progres proyek dan task serta biaya'), ['projects', 'tasks', 'finance']);
  assert.match(followUpQuestion('kalau bulan lalu?', 'biaya bulan ini'), /biaya/);
  assert.doesNotMatch(followUpQuestion('kalau bulan lalu?', 'biaya bulan ini'), /bulan ini/);
  const week = queryPeriod('minggu ini', new Date('2026-09-27T18:00:00Z'));
  assert.equal(week.start.toISOString(), '2026-09-27T17:00:00.000Z');
  assert.equal(week.end.toISOString(), '2026-10-04T17:00:00.000Z');
  assert.equal(queryPeriod('bulan lalu', new Date('2026-01-02T00:00:00Z')).start.toISOString(), '2025-11-30T17:00:00.000Z');
  const result = await answerNative('tugas minggu ini', 'HELPER', staff, db);
  assert.match(result.content, /Tugas saya/);
  for (const call of calls.filter(c => c.model === 'tasks')) {
    assert.equal(call.args.where.tenant_id, staff.tenantId);
    assert.equal(call.args.where.company_id, staff.companyId);
    assert.deepEqual(call.args.where.project_id, { in: ['project-a'] });
    assert.deepEqual(call.args.where.assigned_to_id, { in: ['user-a', 'employee-a'] });
  }
  const daily = calls.find(c => c.model === 'daily')!;
  assert.ok(daily.args.values.includes('project-a'));
  assert.ok(daily.args.values.includes('user-a'));
  const before = calls.length;
  await assert.rejects(() => answerNative('tim A minggu ini sudah mengerjakan apa?', 'HELPER', staff, db));
  assert.equal(calls.length, before, 'Staff must be rejected before organization lookup');
  const write = await answerNative('hapus tugas', 'HELPER', staff, db);
  assert.match(write.content, /formulir ERP/);
  assert.equal(calls.length, before);
  const emptyScope = { ...staff, projectScope: { mode: 'LIST' as const, projectIds: [] } };
  await answerNative('tugas', 'HELPER', emptyScope, db);
  assert.deepEqual(calls.filter(c => c.model === 'tasks').at(-1)!.args.where.project_id, { in: [] });
  const director = { ...staff, roleCode: RoleCode.DIRECTOR };
  const teamDb: any = {
    ...db,
    core_organization: { findMany: async (args: any) => {
      assert.equal(args.where.tenant_id, staff.tenantId);
      assert.equal(args.where.company_id, staff.companyId);
      return [{ id: 'org-a', organization_name: 'A' }];
    } },
    master_employee: {
      ...db.master_employee,
      findMany: async (args: any) => {
        assert.equal(args.where.department_id, 'org-a');
        return [{ id: 'employee-team-a', user_id: 'user-team-a' }];
      },
    },
  };
  const teamResult = await answerNative('tim A minggu ini sudah mengerjakan apa?', 'DASHBOARD', director, teamDb);
  assert.match(teamResult.content, /Tugas tim A/);
  const teamTask = calls.filter(c => c.model === 'tasks').at(-1)!;
  assert.deepEqual(teamTask.args.where.assigned_to_id, { in: ['user-team-a', 'employee-team-a'] });
  const teamDaily = calls.filter(c => c.model === 'daily').at(-1)!;
  assert.ok(teamDaily.args.values.includes('user-team-a'));
  const missing = await answerNative('KPI bulan ini', 'DASHBOARD', director, db);
  assert.match(missing.content, /belum dapat disimpulkan/);
  assert.deepEqual(calls.find(c => c.model === 'kpi-result')!.args.where.project_id, { in: ['project-a'] });
  await assert.rejects(() => answerNative('tugas', 'HELPER', staff, { ...db, project_task: { count: async () => { throw new Error('DB offline'); }, findMany: async () => [] } }));
  delete process.env.MARBOT_AI_API_KEY;
  assert.deepEqual(await renderNativeAnswer('hi', 'verified', new AbortController().signal), { content: 'verified', model: 'erp-native' });
  console.log('Native MarBot: scope, permissions, weekly data, periods, knowledge, multi-domain, clarification, and provider fallback passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
