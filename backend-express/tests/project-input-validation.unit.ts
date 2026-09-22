import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  validateMainTaskWeight,
  validateProjectFundingRequest,
  validateWeeklyTaskFields,
} from '../src/modules/projects/projects.routes';

function mustReject(run: () => unknown, message: RegExp) {
  assert.throws(run, message);
}

async function main() {
  for (const amount of [undefined, null, '', 0, -1, 'not-a-number']) {
    mustReject(
      () => validateProjectFundingRequest({ amount, category: 'OPERATIONAL', description: 'Keperluan lapangan' }),
      /lebih besar dari 0/,
    );
  }
  mustReject(
    () => validateProjectFundingRequest({ amount: 1, category: '', description: 'Keperluan lapangan' }),
    /Kategori pengeluaran/,
  );
  mustReject(
    () => validateProjectFundingRequest({ amount: 1, category: 'INVALID', description: 'Keperluan lapangan' }),
    /Kategori pengeluaran/,
  );
  mustReject(
    () => validateProjectFundingRequest({ amount: 1, category: 'OTHER', description: '   ' }),
    /Keterangan/,
  );
  assert.deepEqual(
    validateProjectFundingRequest({ amount: '80000000', category: 'material', description: '  Material kritis  ' }),
    { amount: 80_000_000, category: 'MATERIAL', description: 'Material kritis' },
  );

  for (const weight of [undefined, null, '', 0, -1, 101, 'invalid']) {
    mustReject(() => validateMainTaskWeight(weight), /Bobot kontribusi/);
  }
  assert.equal(validateMainTaskWeight(1), 1);
  assert.equal(validateMainTaskWeight('100'), 100);

  const validWeekly = { week_number: 12, start_date: '2026-09-21', end_date: '2026-09-27' };
  assert.equal(validateWeeklyTaskFields(validWeekly).weekNumber, 12);
  for (const week_number of [0, 53, 1.5, 'invalid']) {
    mustReject(() => validateWeeklyTaskFields({ ...validWeekly, week_number }), /Nomor minggu/);
  }
  mustReject(() => validateWeeklyTaskFields({ ...validWeekly, start_date: '' }), /Tanggal mulai/);
  mustReject(() => validateWeeklyTaskFields({ ...validWeekly, end_date: '' }), /Tanggal selesai/);
  mustReject(
    () => validateWeeklyTaskFields({ ...validWeekly, start_date: '2026-09-28', end_date: '2026-09-27' }),
    /tidak boleh lebih awal/,
  );

  const repositoryRoot = path.resolve(__dirname, '..', '..');
  const [client, api, routes, schema, wbsNode] = await Promise.all([
    readFile(path.join(repositoryRoot, 'frontend-next/app/(app)/projects/ProjectsClient.tsx'), 'utf8'),
    readFile(path.join(repositoryRoot, 'frontend-next/lib/api/project.api.ts'), 'utf8'),
    readFile(path.join(repositoryRoot, 'backend-express/src/modules/projects/projects.routes.ts'), 'utf8'),
    readFile(path.join(repositoryRoot, 'backend-express/prisma/schema.prisma'), 'utf8'),
    readFile(path.join(repositoryRoot, 'frontend-next/components/projects/ProjectWbsNode.tsx'), 'utf8'),
  ]);
  const migration = await readFile(
    path.join(repositoryRoot, 'backend-express/prisma/migrations/20260922000000_production_baseline/migration.sql'),
    'utf8',
  );

  assert.match(client, /amount:\s*""/);
  assert.match(client, /fundingRequestErrors\.amount/);
  assert.match(client, /weeklyErrors\.target_description/);
  assert.match(client, /mainTaskErrors\.title/);
  assert.match(client, /cost_owner_division_id:\s*mainTaskForm\.cost_owner_division_id/);
  assert.doesNotMatch(client, /value=\{costForm\.division_id\}/);
  assert.match(api, /start_date:\s*string;\s*end_date:\s*string;\s*assignee_id:\s*string \| number;/);
  assert.match(api, /cost_owner_division_id:\s*m\.cost_owner_division_id \|\| null/);
  assert.match(client, /cost_owner_division_name:\s*mainTask\.cost_owner_division_id/);
  assert.match(wbsNode, /Divisi Biaya: \{main\.cost_owner_division_name\}/);
  assert.match(routes, /assertCanManageProject\(req\.user, project\.id, companyId\)/);
  assert.match(routes, /requested_by_id:\s*req\.user\?\.id/);
  assert.match(routes, /submitted_at:\s*new Date\(\)/);
  assert.doesNotMatch(routes, /requested_amount:\s*req\.body\.amount \?\? req\.body\.requested_amount \?\? 0/);
  assert.doesNotMatch(routes, /purpose:\s*req\.body\.description \?\? req\.body\.purpose \?\?/);
  assert.match(routes, /validateWeeklyTaskFields\(data\)/);
  assert.match(routes, /data\.weight === undefined[\s\S]*?\? 10[\s\S]*?: validateMainTaskWeight\(data\.weight\)/);
  assert.doesNotMatch(routes, /project_task_assignment\.deleteMany\([\s\S]*?assignee_id:\s*\{\s*notIn:\s*userIds/);
  assert.match(routes, /Assignment is additive/);
  assert.match(client, /await removeTaskAssignment\(assignmentId\)/);
  assert.match(schema, /cost_owner_division_id\s+String\?/);
  assert.match(migration, /"cost_owner_division_id" TEXT/);

  process.stdout.write('PASS: project funding, weekly task, and main task validation contract\n');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
