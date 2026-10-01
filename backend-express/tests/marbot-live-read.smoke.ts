import assert from 'node:assert/strict';
import prisma from '../src/config/database';
import { buildMarbotRuntimeAuthority } from '../src/modules/marbot/marbot-access.service';
import { answerNative, NativeScope } from '../src/modules/marbot/marbot-native.service';
import { discoverMarbotSchema } from '../src/modules/marbot/marbot-schema.service';
import { loadNativePolicyRestrictions } from '../src/modules/marbot/marbot-policy.service';

// Explicit read-only smoke test. Never create fixtures in the connected database.
async function main() {
  const members = await prisma.iam_user_company_membership.findMany({ where: { status: 'ACTIVE' }, select: { user_id: true, tenant_id: true, company_id: true }, take: 100 });
  let scope: NativeScope | undefined;
  for (const member of members) {
    if (!member.tenant_id || !member.company_id) continue;
    try {
      const authority = await buildMarbotRuntimeAuthority(member.user_id, member.tenant_id, member.company_id);
      if (!authority.permissions.includes('READ_PROJECT') || !authority.permissions.includes('READ_TASK')) continue;
      scope = { ...authority, tenantId: member.tenant_id, companyId: member.company_id, userId: member.user_id };
      scope = { ...scope, ...await loadNativePolicyRestrictions(scope) };
      if (scope.blockedReadModules?.includes('PROJECTS')) { scope = undefined; continue; }
      break;
    } catch { /* Ineligible active context: continue without exposing identities. */ }
  }
  if (!scope) throw new Error('No eligible Marka Plus project reader found; live business-data verification unavailable.');
  const schema = await discoverMarbotSchema(scope);
  assert.ok((schema.columns as any[]).some(c => c.table_name === 'project_daily_task' && c.column_name === 'planned_date'));
  const where = { tenant_id: scope.tenantId, company_id: scope.companyId, status: { in: ['IN_PROGRESS', 'STARTED', 'ACTIVE'] }, ...(scope.projectScope.mode === 'LIST' ? { id: { in: scope.projectScope.projectIds } } : {}) };
  const actual = await prisma.project_project.count({ where });
  const answer = await answerNative('Berapa project yang sedang berjalan?', 'HELPER', scope);
  assert.ok(answer.content.includes(`: ${actual}.`));
  assert.deepEqual(answer.tools, ['projects']);
  const taskAnswer = await answerNative('tugas minggu ini', 'HELPER', scope);
  assert.deepEqual(taskAnswer.tools, ['tasks']);
  assert.doesNotMatch(taskAnswer.content, /query database gagal/);
  console.log('Live read smoke passed: active authority, physical schema, exact scoped project count and joined weekly daily-task query. No business writes performed.');
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Live verification failed'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
