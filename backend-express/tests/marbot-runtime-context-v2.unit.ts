import assert from 'assert';
import { RoleCode } from '@prisma/client';
import { createMarbotRuntimeContextV2 } from '../src/modules/marbot/marbot-runtime.service';
import { normalizeRequestPath, normalizeRequestUrl } from '../src/middlewares/path-normalization.middleware';

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

// Browser/API base URLs may end in `/`, producing requests such as
// `//api/v1/marbot/chat/completions`. The backend must canonicalize those
// requests before Express performs route matching.
assert.equal(
  normalizeRequestUrl('//api/v1/marbot/chat/completions'),
  '/api/v1/marbot/chat/completions',
);
assert.equal(
  normalizeRequestUrl('//api//v1/marbot/chat/completions?conversationId=abc'),
  '/api/v1/marbot/chat/completions?conversationId=abc',
);
assert.equal(
  normalizeRequestUrl('/api/v1/marbot/chat/completions?next=https%3A%2F%2Fexample.com%2Fa%2Fb'),
  '/api/v1/marbot/chat/completions?next=https%3A%2F%2Fexample.com%2Fa%2Fb',
);

const mockRequest = {
  url: '//api/v1/marbot/chat/completions',
  originalUrl: '//api/v1/marbot/chat/completions',
} as any;
let normalizationContinued = false;
normalizeRequestPath(mockRequest, {} as any, () => {
  normalizationContinued = true;
});
assert.equal(mockRequest.url, '/api/v1/marbot/chat/completions');
assert.equal(mockRequest.originalUrl, '/api/v1/marbot/chat/completions');
assert.equal(normalizationContinued, true);

console.log('MarBot runtime context V2 + request path normalization: passed');
