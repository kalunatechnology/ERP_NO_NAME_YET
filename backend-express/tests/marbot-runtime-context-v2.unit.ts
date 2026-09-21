import assert from 'assert';
import { RoleCode } from '@prisma/client';
import { createMarbotRuntimeContextV2 } from '../src/modules/marbot/marbot-runtime.service';

const context = createMarbotRuntimeContextV2('user-1', 'company-1', {
  externalTenantId: 'TENANT_A', chatbotUrl: 'https://chat.test', chatbotApiKey: 'key',
  inboundContextSecret: 'in', outboundToolSecret: 'out', contractVersion: 2, runtimeContextVersion: 2,
}, {
  roleCode: RoleCode.STAFF, roleId: 'role-1', enabledModules: ['MARBOT', 'PROJECTS', 'FINANCE'],
  permissions: ['USE_MARBOT', 'READ_TASK', 'READ_PROJECT'],
  projectScope: { mode: 'LIST', projectIds: ['project-a', 'project-c'] },
});

assert.equal(context.contextVersion, 2);
assert.equal(context.companyId, 'company-1');
assert.deepEqual(context.permissions, ['READ_PROJECT', 'READ_TASK', 'USE_MARBOT']);
assert.deepEqual(context.enabledModules, ['MARBOT', 'PROJECTS']);
assert.deepEqual(context.projectScope, { mode: 'LIST', projectIds: ['project-a', 'project-c'] });
assert.ok(context.expiresAt - context.issuedAt === 120);
assert.equal(context.locale, 'id-ID');
console.log('MarBot runtime context V2: passed');
