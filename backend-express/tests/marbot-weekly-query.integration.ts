import assert from 'node:assert/strict';
import { Client } from 'pg';
import { RoleCode, Prisma } from '@prisma/client';
import { answerNative, NativeScope } from '../src/modules/marbot/marbot-native.service';

// All rows live in connection-local temporary tables and are rolled back.
// Refuse shared/cloud databases even if the operational .env selects one.
async function main() {
  assert.equal(process.env.NODE_ENV, 'test');
  const connectionString = process.env.DATABASE_URL!;
  const url = new URL(connectionString);
  assert.equal(url.hostname, '127.0.0.1');
  assert(['55439', '55440'].includes(url.port));
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL search_path TO pg_temp');
    await client.query(`CREATE TEMP TABLE project_main_task
      (id text, tenant_id text, company_id text, project_id text) ON COMMIT DROP`);
    await client.query(`CREATE TEMP TABLE project_weekly_task
      (id text, tenant_id text, company_id text, main_task_id text, assignee_id text,
       target_description text, status text, progress numeric, start_date timestamp,
       end_date timestamp) ON COMMIT DROP`);
    await client.query(`INSERT INTO project_main_task VALUES
      ('main-a', 'tenant-a', 'company-a', 'project-a'),
      ('main-b', 'tenant-a', 'company-a', 'project-b'),
      ('main-other', 'tenant-other', 'company-other', 'project-a')`);
    const add = async (id: string, main: string, owner: string, status = 'PLANNED', tenant = 'tenant-a', company = 'company-a') => {
      await client.query(`INSERT INTO project_weekly_task VALUES
        ($1, $2, $3, $4, $5, $1, $6, 0, '2026-09-14', '2026-09-20')`,
      [id, tenant, company, main, owner, status]);
    };
    await add('Pending personal', 'main-a', 'staff-a', 'PENDING_APPROVAL');
    await add('Rejected personal', 'main-a', 'staff-a', 'REJECTED');
    await add('Other owner', 'main-a', 'staff-b');
    await add('Other project', 'main-b', 'staff-a');
    await add('Other tenant', 'main-other', 'staff-a', 'PLANNED', 'tenant-other', 'company-other');
    await add('Mismatched ancestry', 'main-other', 'staff-a');
    const scope: NativeScope = {
      tenantId: 'tenant-a', companyId: 'company-a', userId: 'staff-a', roleId: 'role-a', roleCode: RoleCode.STAFF,
      enabledModules: ['MARBOT', 'PROJECTS'], permissions: ['USE_MARBOT', 'READ_TASK'],
      projectScope: { mode: 'LIST', projectIds: ['project-a'] },
    };
    const db = { $queryRaw: async (query: Prisma.Sql) => (await client.query(query.text, query.values)).rows } as any;
    const ask = (message: string, authority = scope) => answerNative(message, 'HELPER', authority, db);
    const all = await ask('seluruh weekly task saya');
    assert.match(all.content, /Weekly Task saya: 2/);
    assert.match(all.content, /Pending personal/);
    assert.match(all.content, /Rejected personal/);
    assert.doesNotMatch(all.content, /Other owner|Other project|Other tenant|Mismatched ancestry/);
    const september = await ask('weekly task saya bulan 2026-09');
    assert.match(september.content, /Weekly Task saya: 2/);
    assert.match((await ask('weekly task saya bulan 2026-10')).content, /Belum ada Weekly Task/);
    const pending = await ask('weekly task saya status "PENDING_APPROVAL"');
    assert.match(pending.content, /Weekly Task saya: 1/);
    assert.doesNotMatch(pending.content, /Rejected personal/);
    const exact = await ask('weekly task "Rejected personal" saya');
    assert.match(exact.content, /Weekly Task saya: 1/);
    assert.match(exact.content, /Ditolak/);
    assert.match((await ask('weekly task saya', { ...scope, projectScope: { mode: 'LIST', projectIds: [] } })).content, /Belum ada Weekly Task/);
    const pm = { ...scope, roleCode: RoleCode.PROJECT_MANAGER };
    assert.match((await ask('weekly task saya', pm)).content, /Weekly Task saya: 2/);
    assert.match((await ask('weekly task', pm)).content, /Weekly Task dalam akses Anda: 3/);
    for (let index = 0; index < 23; index++) await add(`Bounded ${index}`, 'main-a', 'staff-a');
    const bounded = await ask('seluruh weekly task saya');
    assert.match(bounded.content, /Weekly Task saya: 25/);
    assert.equal(bounded.content.split('\n').filter(line => line.startsWith('- ')).length, 20);
    console.log('PASS: real PostgreSQL Weekly query — entity, explicit dates/status/name, personal/PM scope, tenant/company/project ancestry, empty scope, exact count and 20-row bound. Temporary rows only.');
  } finally {
    try { await client.query('ROLLBACK'); } finally { await client.end(); }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
