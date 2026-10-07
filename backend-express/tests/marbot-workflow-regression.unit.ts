import assert from 'node:assert/strict';
import { RoleCode } from '@prisma/client';
import { answerNative, followUpQuestion, isNativeTaskReadQuestion, NativeScope, taskDateIntent } from '../src/modules/marbot/marbot-native.service';
import { executeCanonicalAction } from '../src/modules/marbot/marbot-execution.service';
import { systemKnowledgeAnswer } from '../src/modules/marbot/marbot-knowledge';

const id = '11111111-1111-4111-8111-111111111111';
const staff: NativeScope = {
  tenantId: 'tenant-a', companyId: 'company-a', userId: id, roleId: 'role-a', roleCode: RoleCode.STAFF,
  enabledModules: ['MARBOT', 'PROJECTS'], permissions: ['USE_MARBOT', 'READ_TASK'],
  projectScope: { mode: 'LIST', projectIds: ['project-a'] },
};
async function main() {
  const failures: string[] = [];
  const scenario = async (name: string, run: () => Promise<void>) => {
    try { await run(); console.log(`PASS: ${name}`); }
    catch (error) { failures.push(name); console.error(`FAIL: ${name}: ${(error as Error).message}`); }
  };
  const noQueries = { $queryRaw: async () => { throw new Error('A procedure must not query business rows'); } } as any;
  await scenario('Weekly self-submission guidance', async () => {
  for (const question of ['Bagaimana cara membuat weekly task sendiri?', 'Bagaimana membuat weekly task sendiri?', 'Bagaimana cara membuat target mingguan?', 'cara membuat tugas mingguan']) {
    const guide = await answerNative(question, 'HELPER', staff, noQueries);
    assert.match(guide.content, /Ajukan Target Mingguan/);
    assert.match(guide.content, /Menunggu Approval/);
    assert.match(guide.content, /PM/);
    assert.deepEqual(guide.tools, ['help.procedure']);
  }
  const workflow = await answerNative('alur pengajuan weekly task', 'HELPER', staff, noQueries);
  assert.match(workflow.content, /PENDING_APPROVAL/);
  assert.match(workflow.content, /REJECTED/);
  const dailyGuide = await answerNative('Bagaimana cara membuat daily task dari weekly task?', 'HELPER', staff, noQueries);
  assert.match(dailyGuide.content, /Buka Tugas Harian/);
  assert.doesNotMatch(dailyGuide.content, /Ajukan Target Mingguan/);
  });
  await scenario('Weekly entity is distinct from Daily and calendar periods', async () => {
  let weeklyQuery: any;
  const weekly = await answerNative('seluruh weekly task saya', 'HELPER', staff, {
    $queryRaw: async (query: any) => {
      weeklyQuery = query;
      return [{ id, target_description: 'Sprint review', status: 'PENDING_APPROVAL', progress: 0,
        start_date: new Date('2026-09-14T00:00:00Z'), end_date: new Date('2026-09-20T00:00:00Z'), total: 1n }];
    },
  } as any);
  assert.match(weeklyQuery.sql, /FROM project_weekly_task/);
  assert(weeklyQuery.values.includes(staff.userId) && weeklyQuery.values.includes(staff.companyId) && weeklyQuery.values.includes('project-a'));
  assert(!weeklyQuery.values.some((value: unknown) => value instanceof Date), 'Weekly entity name must not imply a current-week filter');
  assert.match(weekly.content, /Sprint review/);
  assert.match(weekly.content, /Menunggu Approval/);
  assert.doesNotMatch(weekly.content, /Task harian saya/);
  assert.equal(taskDateIntent('seluruh weekly task saya').hasPeriod, false);
  assert.equal(taskDateIntent('weekly task saya minggu lalu').hasPeriod, true);
  assert(isNativeTaskReadQuestion('jumlah target mingguan saya'));
  await answerNative('weekly task saya status "PENDING_APPROVAL" minggu lalu', 'HELPER', staff, { $queryRaw: async (query: any) => {
    assert(query.values.includes('PENDING_APPROVAL'));
    assert.equal(query.values.filter((value: unknown) => value instanceof Date).length, 2);
    return [];
  } } as any);
  const empty = await answerNative('weekly task saya', 'HELPER', staff, { $queryRaw: async () => [] } as any);
  assert.match(empty.content, /Belum ada Weekly Task/);
  const denied = await answerNative('weekly task saya', 'HELPER', { ...staff, permissions: ['USE_MARBOT'] }, noQueries);
  assert.deepEqual(denied.tools, []);
  assert.match(denied.content, /hak akses/);
  const mixed = await answerNative('jumlah weekly task dan daily task saya', 'HELPER', staff, noQueries);
  assert.match(mixed.content, /terpisah/);
  assert.deepEqual(mixed.tools, []);
  });
  await scenario('Follow-ups preserve Weekly entity and personal ownership for PM', async () => {
    const question = followUpQuestion('kalau bulan lalu?', 'weekly task saya bulan ini');
    assert.match(question, /weekly task saya/);
    await answerNative(question, 'HELPER', { ...staff, roleCode: RoleCode.PROJECT_MANAGER }, {
      $queryRaw: async (query: any) => { assert.match(query.sql, /AND w.assignee_id =/); assert(query.values.includes(staff.userId)); return []; },
    } as any);
    assert.match(followUpQuestion('yang selesai?', 'daily task saya bulan ini'), /tugas saya/);
    assert.match(followUpQuestion('bagaimana dengan weekly task lain?', 'weekly task saya hari ini'), /saya/);
    assert.doesNotMatch(followUpQuestion('bagaimana dengan weekly task tim "Produksi"?', 'weekly task saya hari ini'), /saya/);
    assert.equal(followUpQuestion('seluruh weekly task', 'weekly task saya hari ini'), 'seluruh weekly task');
  });
  await scenario('Pending/rejected Weekly cannot prepare a Daily ticket', async () => {
  for (const status of ['PENDING_APPROVAL', 'REJECTED']) {
    const proposal = await answerNative('Buat tugas harian "Daily" untuk target mingguan "Sprint" jam "09:00-10:00" hasil "Report"', 'HELPER', staff, {
      $queryRaw: async () => [{ id, status }],
    } as any);
    assert.equal(proposal.action, undefined, 'Unapproved Weekly must not produce a Daily action ticket');
    assert.match(proposal.content, /belum disetujui|ditolak/i);
  }
  });
  await scenario('Finance guidance reflects Admin overrides', async () => {
  assert.match(systemKnowledgeAnswer('fitur Finance', ['FINANCE']), /Admin/);
  });
  await scenario('Weekly schedule must match readback', async () => {
  const payload = { main_task_id: id, assignee_id: id, week_number: 2,
    target_description: 'Sprint', start_date: '2026-10-05', end_date: '2026-10-11' };
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, options) => new Response(JSON.stringify({ id, ...payload,
      start_date: '2026-10-05T00:00:00.000Z', end_date: '2026-10-11T00:00:00.000Z',
      ...(options?.method === 'GET' ? { week_number: 3 } : {}), status: 'PENDING_APPROVAL',
    }), { status: 200 });
    const req = { socket: { localPort: 1234 }, headers: { authorization: 'Bearer fixture' }, companyId: staff.companyId } as any;
    await assert.rejects(() => executeCanonicalAction(req, { kind: 'weekly.create', payload }, id), /week_number/);
    globalThis.fetch = async () => new Response(JSON.stringify({ id, ...payload, start_date: '2026-10-05T00:00:00.000Z', end_date: '2026-10-11T00:00:00.000Z', status: 'PENDING_APPROVAL' }), { status: 200 });
    assert.match(await executeCanonicalAction(req, { kind: 'weekly.create', payload }, id), /Status aktual: PENDING_APPROVAL/);
    globalThis.fetch = async (_url, options) => new Response(JSON.stringify({ id, ...payload, ...(options?.method === 'GET' ? { end_date: '2026-10-12T00:00:00.000Z' } : {}), status: 'PENDING_APPROVAL' }), { status: 200 });
    await assert.rejects(() => executeCanonicalAction(req, { kind: 'weekly.create', payload }, id), /end_date/);
  } finally { globalThis.fetch = originalFetch; }
  });
  assert.deepEqual(failures, [], 'Workflow regressions must be resolved');
  console.log('PASS: Weekly guidance/query entity, pending/rejected Daily preflight, Admin guidance and schedule readback.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
