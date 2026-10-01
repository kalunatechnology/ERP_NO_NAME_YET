import assert from 'node:assert/strict';
import { RoleCode } from '@prisma/client';
import catalog from '../src/modules/marbot/resource-catalog.generated.json';
import { planResourceQuestion, resourceCatalog, resourceDefinition, validateResourcePlan } from '../src/modules/marbot/marbot-resource.service';
import type { NativeScope } from '../src/modules/marbot/marbot-native.service';
import { env } from '../src/config/env';
import prisma from '../src/config/database';

async function main() {
  const scope: NativeScope = { tenantId: 'tenant', companyId: 'company', userId: 'user', roleId: 'role', roleCode: RoleCode.PROJECT_MANAGER,
    enabledModules: [...new Set(catalog.resources.map(r => r.module))], permissions: ['USE_MARBOT', 'READ_PROJECT', 'READ_TASK', 'READ_COMPANY_FINANCE', 'READ_CRM_DEALS'], projectScope: { mode: 'ALL', projectIds: [] } };
  assert.equal(resourceCatalog(scope).length, catalog.resources.length);
  for (const entry of catalog.resources) {
    const definition = resourceDefinition(entry.key, scope);
    assert(definition.fields.length, entry.key);
    assert.match(entry.path, /^\/api\/v1\/[a-z-]+\/[a-z-]+\/$/);
    assert(!definition.fields.some(f => /password|secret|token|credential/i.test(f.name)));
  }
  const order = resourceDefinition('procurement.purchase-orders', scope);
  assert.equal(order.fields.find(f => f.name === 'status')!.isRequired, true, 'actual schema required flag must survive Rust-free DMMF');
  assert.throws(() => validateResourcePlan({ resource: order.key, operation: 'create', payload: { total_amount: 10 } }, scope), /status/);
  assert.throws(() => validateResourcePlan({ resource: order.key, operation: 'list', sql: 'DROP TABLE x' }, scope));
  assert.throws(() => validateResourcePlan({ resource: order.key, operation: 'list', filters: { company_id: 'other' } }, scope));
  assert.throws(() => validateResourcePlan({ resource: order.key, operation: 'list', filters: { status: true } }, scope));
  assert.throws(() => validateResourcePlan({ resource: order.key, operation: 'list', filters: { status: 'null' } }, scope));
  assert.throws(() => validateResourcePlan({ resource: order.key, operation: 'update', id: 'b75d14c9-365c-49a8-b4c0-de618d827c25', payload: { order_date: '2026-02-30' } }, scope));
  assert.throws(() => validateResourcePlan({ resource: order.key, operation: 'create', payload: { status: 'DRAFT', tenant_id: 'other' } }, scope));
  assert.throws(() => resourceDefinition(order.key, { ...scope, blockedReadModules: ['PROCUREMENT'] }));
  assert.throws(() => resourceDefinition(order.key, { ...scope, blockedWriteModules: ['PROCUREMENT'] }, true));
  assert.throws(() => resourceDefinition('procurement.three-way-matches', scope, true));
  assert.throws(() => resourceDefinition('accounts.users', scope));
  assert.throws(() => validateResourcePlan({ resource: order.key, operation: 'aggregate', sum: 'status' }, scope));
  assert.equal(validateResourcePlan({ resource: order.key, operation: 'aggregate', sum: 'total_amount', groupBy: 'status' }, scope).sum, 'total_amount');
  const signal = new AbortController().signal;
  assert.equal((await planResourceQuestion('berapa procurement.purchase-orders?', scope, signal))!.operation, 'count');
  const originalFetch = globalThis.fetch;
  const key = env.MARBOT_AI_API_KEY;
  const model = env.MARBOT_AI_MODEL;
  env.MARBOT_AI_API_KEY = 'fixture'; env.MARBOT_AI_MODEL = 'fixture';
  try {
    const fixture = (plan: unknown) => { globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(plan) } }] })); };
    fixture({ resource: order.key, operation: 'count', filters: { status: 'DRAFT' } });
    assert.equal((await planResourceQuestion('Berapa PO procurement dengan status DRAFT?', scope, signal))!.filters.status, 'DRAFT');
    fixture({ resource: order.key, operation: 'count', filters: { status: 'SECRET' } });
    assert.equal(await planResourceQuestion('Berapa PO procurement dengan status DRAFT?', scope, signal), null);
    fixture({ resource: order.key, operation: 'create', payload: { status: 'DRAFT' } });
    assert.equal(await planResourceQuestion('Berapa PO DRAFT procurement?', scope, signal), null, 'questions cannot become writes');
    fixture({ resource: 'accounts.users', operation: 'list' });
    assert.equal(await planResourceQuestion('Tampilkan procurement', scope, signal), null);
    globalThis.fetch = async () => { throw new Error('provider unavailable'); };
    assert.equal(await planResourceQuestion('Tampilkan procurement', scope, signal), null);
  } finally { globalThis.fetch = originalFetch; env.MARBOT_AI_API_KEY = key; env.MARBOT_AI_MODEL = model; }
  console.log(`Marbot resources passed: ${catalog.resources.length} actual catalogue entries, required fields, types, invalid dates, blocked policies, read-only records, injection and provider-plan grounding.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
