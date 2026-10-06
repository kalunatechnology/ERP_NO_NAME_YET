import assert from 'node:assert/strict';
import { RoleCode } from '@prisma/client';
import { answerNative, canUseDashboard, detectTools, followUpQuestion, isNativeTaskReadQuestion, NativeScope, queryPeriod, taskDateIntent } from '../src/modules/marbot/marbot-native.service';
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
  project_project: delegate('projects'), master_employee: delegate('employee'),
  core_organization: delegate('organizations'),
  fin_project_cost_entry: {
    aggregate: async (args: any) => {
      calls.push({ model: 'project-cost', args });
      return { _sum: { total_cost: 1250000 } };
    },
  },
  analytics_kpi_definition: delegate('kpi-def'), analytics_kpi_result: delegate('kpi-result'),
  $queryRaw: async (query: any) => {
    calls.push({ model: 'daily', args: query });
    return [{ title: 'halo', output_result: '', status: 'ON_PROGRESS', progress: 0, planned_date: new Date('2026-09-16T00:00:00Z'), is_blocked: false, block_reason: '', total: 1n, completed: 0n, overdue: 1n, blocked: 0n }];
  },
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
  assert.match(helperAnswer('Bagaimana cara memulai timer kerja?'), /timer kerja/);
  assert.match(helperAnswer('Bagaimana cara membuat invoice?'), /Terbitkan Billing/);
  const naturalProject = await answerNative('Buat proyek Website Toko untuk PT Contoh dengan PM Melika', 'HELPER', { ...staff, roleCode: RoleCode.PROJECT_MANAGER }, db);
  assert.deepEqual(naturalProject.action?.payload, { project_name: 'Website Toko', customer_name: 'PT Contoh', manager_name: 'Melika' });
  assert.equal((await answerNative('Buat proyek Website Toko', 'HELPER', { ...staff, roleCode: RoleCode.PROJECT_MANAGER }, db)).action, undefined);
  assert.equal((await answerNative('Buat proyek Website Toko untuk PT Contoh dengan PM Melika', 'HELPER', staff, db)).action, undefined, 'Natural input retains role checks');
  const beforeHistoryQuery = calls.length;
  const historical = await answerNative('Berapa jumlah proyek berjalan bulan lalu?', 'HELPER', staff, db);
  assert.match(historical.content, /status historis/);
  assert.deepEqual(historical.tools, []);
  assert.equal(calls.length, beforeHistoryQuery, 'An ambiguous historical project query must not read current counts');
  const currentProjects = await answerNative('Berapa proyek yang sedang berjalan?', 'HELPER', staff, db);
  assert.doesNotMatch(currentProjects.content, /Periode filter waktu/);
  calls.length = 0;
  const namedCalls: any[] = [];
  const namedDb: any = { $queryRaw: async (query: any) => { namedCalls.push(query); return [{ id: '11111111-1111-4111-8111-111111111111' }]; } };
  const namedUpdate = await answerNative('Ubah tugas "Login" catatan "Validasi selesai"', 'HELPER', staff, namedDb);
  assert.equal(namedUpdate.action?.payload.notes, 'Validasi selesai');
  assert(namedCalls[0].values.includes(staff.userId) && namedCalls[0].values.includes(staff.companyId) && namedCalls[0].values.includes('project-a'));
  assert.match(namedCalls[0].sql, /owner_id/);
  const namedDaily = await answerNative('Buat tugas harian "Login" untuk target mingguan "Sprint 1" jam "08:00-09:00" hasil "Login berfungsi"', 'HELPER', staff, namedDb);
  assert.equal(namedDaily.action?.kind, 'daily.create');
  assert.match(namedCalls[1].sql, /assignee_id/);
  const ambiguous = await answerNative('Ubah tugas "Login" catatan "x"', 'HELPER', staff, { $queryRaw: async () => [{ id: 'a' }, { id: 'b' }] } as any);
  assert.equal(ambiguous.action, undefined);
  assert.match(ambiguous.content, /lebih dari satu/);
  const absent = await answerNative('Ubah tugas "Login" catatan "x"', 'HELPER', staff, { $queryRaw: async () => [] } as any);
  assert.equal(absent.action, undefined);
  assert.match(absent.content, /tidak ditemukan/);
  const deniedNamed = await answerNative('Ubah tugas "Login" catatan "x"', 'HELPER', { ...staff, permissions: ['USE_MARBOT'] }, { $queryRaw: async () => { throw new Error('Forbidden lookup'); } } as any);
  assert.equal(deniedNamed.action, undefined);
  assert.deepEqual(detectTools('progres proyek dan task serta biaya'), ['projects', 'tasks', 'finance']);
  assert.match(followUpQuestion('kalau bulan lalu?', 'biaya bulan ini'), /biaya/);
  assert.doesNotMatch(followUpQuestion('kalau bulan lalu?', 'biaya bulan ini'), /bulan ini/);
  const week = queryPeriod('minggu ini', new Date('2026-09-27T18:00:00Z'));
  assert.equal(week.start.toISOString(), '2026-09-27T17:00:00.000Z');
  assert.equal(week.end.toISOString(), '2026-10-04T17:00:00.000Z');
  assert.equal(queryPeriod('bulan lalu', new Date('2026-01-02T00:00:00Z')).start.toISOString(), '2025-11-30T17:00:00.000Z');
  const reference = new Date('2026-10-06T03:00:00Z');
  for (const phrase of ['bukan hari ini', 'selain hari ini', 'not today']) {
    const intent = taskDateIntent(`daily task saya ${phrase}`, reference);
    assert.equal(intent.excludeToday, true);
    assert.equal(intent.hasPeriod, false);
  }
  assert.equal(taskDateIntent('seluruh daily task saya', reference).hasPeriod, false);
  assert.equal(taskDateIntent('tugas "Review hari ini"', reference).hasPeriod, false);
  assert.equal(taskDateIntent('seluruh daily task saya hari ini', reference).period.start.toISOString(), '2026-10-05T17:00:00.000Z');
  assert.equal(taskDateIntent('bulan ini selain hari ini', reference).hasPeriod, true);
  for (const phrase of ['hari ini saya memiliki berapa daily task', 'bagaimana dengan daily task lain yang bukan hari ini', 'maksud saya adalah seluruh daily task saya']) assert(isNativeTaskReadQuestion(phrase));
  for (const phrase of ['cara membuat daily task', 'ubah tugas "Login"', 'data {"resource":"projects.daily-tasks"}', 'tugas dan biaya', 'modul daily task']) assert(!isNativeTaskReadQuestion(phrase));
  const outsideToday = await answerNative('bagaimana dengan daily task lain yang bukan hari ini', 'HELPER', staff, db);
  assert.deepEqual(outsideToday.tools, ['tasks']);
  assert.match(outsideToday.content, /hari ini dikecualikan/);
  assert.doesNotMatch(outsideToday.content, /Periode filter waktu/);
  let lastQuery = calls.filter(c => c.model === 'daily').at(-1)!.args;
  assert.match(lastQuery.sql, /planned_date IS NULL OR d.planned_date </);
  assert.doesNotMatch(lastQuery.sql, /AND d.planned_date >=/);
  await answerNative('maksud saya adalah seluruh daily task saya', 'HELPER', { ...staff, roleCode: RoleCode.PROJECT_MANAGER }, db);
  lastQuery = calls.filter(c => c.model === 'daily').at(-1)!.args;
  assert.match(lastQuery.sql, /AND d.owner_id =/);
  assert(lastQuery.values.includes(staff.userId));
  assert(lastQuery.values.includes(staff.companyId) && lastQuery.values.includes('project-a'));
  assert.doesNotMatch(lastQuery.sql, /AND d.planned_date >=/);
  assert.doesNotMatch(lastQuery.sql, /planned_date IS NULL OR/);
  await answerNative('tugas "Review 2026-02-30"', 'HELPER', staff, db);
  lastQuery = calls.filter(c => c.model === 'daily').at(-1)!.args;
  assert(lastQuery.values.includes('Review 2026-02-30'));
  assert.doesNotMatch(lastQuery.sql, /AND d.planned_date >=/);
  await answerNative('hari ini saya memiliki berapa daily task', 'HELPER', staff, db);
  assert.match(calls.filter(c => c.model === 'daily').at(-1)!.args.sql, /AND d.planned_date >=/);
  const result = await answerNative('tugas minggu ini', 'HELPER', staff, db);
  assert.match(result.content, /Task harian saya/);
  assert.match(result.content, /Terlambat: 1/);
  const daily = calls.find(c => c.model === 'daily')!;
  assert.ok(daily.args.values.includes('project-a'));
  assert.ok(daily.args.values.includes('user-a'));
  assert.match(daily.args.strings.join(' '), /project_daily_task/);
  assert.match(daily.args.strings.join(' '), /planned_date/);
  const before = calls.length;
  await assert.rejects(() => answerNative('tim A minggu ini sudah mengerjakan apa?', 'HELPER', staff, db));
  assert.equal(calls.length, before, 'Staff must be rejected before organization lookup');
  const write = await answerNative('hapus tugas', 'HELPER', staff, db);
    assert.match(write.content, /belum dapat dipetakan/);
  assert.equal(calls.length, before);
  const emptyScope = { ...staff, projectScope: { mode: 'LIST' as const, projectIds: [] } };
  await answerNative('tugas', 'HELPER', emptyScope, db);
  assert.match(calls.filter(c => c.model === 'daily').at(-1)!.args.strings.join(' '), /AND FALSE/);
  const director = { ...staff, roleCode: RoleCode.DIRECTOR };
  const financeDirector: NativeScope = {
    ...director,
    enabledModules: [...director.enabledModules, 'FINANCE'],
    permissions: [...director.permissions, 'READ_PROJECT_FINANCE'],
  };
  const financeResult = await answerNative('biaya proyek bulan ini', 'DASHBOARD', financeDirector, db);
  assert.match(financeResult.content, /1\.250\.000/);
  assert.deepEqual(calls.find(c => c.model === 'project-cost')!.args.where.status, {
    in: ['VALIDATED', 'APPROVED', 'POSTED_TO_WIP'],
  });
  assert.deepEqual(calls.find(c => c.model === 'project-cost')!.args.where.project_id, { in: ['project-a'] });
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
  assert.match(teamResult.content, /Task harian tim A/);
  const teamDaily = calls.filter(c => c.model === 'daily').at(-1)!;
  assert.ok(teamDaily.args.values.includes('user-team-a'));
  const missing = await answerNative('KPI bulan ini', 'DASHBOARD', director, db);
  assert.match(missing.content, /belum dapat disimpulkan/);
  assert.deepEqual(calls.find(c => c.model === 'kpi-result')!.args.where.project_id, { in: ['project-a'] });
  const failure = await answerNative('tugas', 'HELPER', staff, { ...db, $queryRaw: async () => { throw new Error('DB offline'); } });
  assert.match(failure.content, /query database gagal/);
  assert.deepEqual(failure.tools, []);
  delete process.env.MARBOT_AI_API_KEY;
  assert.deepEqual(await renderNativeAnswer('hi', 'verified', new AbortController().signal), { content: 'verified', model: 'erp-native' });
  console.log('Native MarBot: scope, permissions, weekly data, periods, knowledge, multi-domain, clarification, and provider fallback passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
