import assert from 'assert';
import { createHash, createHmac } from 'crypto';
import { Request } from 'express';
import { canonicalJson, toolSignaturePayload } from '../src/modules/marbot/marbot.routes';

// These vectors follow the unmodified chatbot's canonicalJson and
// buildOutboundToolSignaturePayload contracts, including its sorted GET query.
assert.equal(canonicalJson({ roleCodes: ['EXECUTIVE'], companyId: 'c1', issuedAt: 42 }),
  '{"companyId":"c1","issuedAt":42,"roleCodes":["EXECUTIVE"]}');
const headers: Record<string, string> = {
  'X-Timestamp': '1789430000', 'X-Nonce': 'nonce-1', 'X-Request-Id': 'request-1',
  'X-User-Id': 'user-1', 'X-User-Roles': 'EXECUTIVE',
};
const req = {
  baseUrl: '/internal/marbot', path: '/projects/tasks',
  query: { status: 'ALL', projectId: 'p-1' },
  header: (name: string) => headers[name],
} as unknown as Request;
const config = { externalTenantId: 'tenant-1' } as any;
const payload = toolSignaturePayload(req, 'project.task_overview', config);
assert.equal(payload, [
  'GET', '/internal/marbot/projects/tasks?projectId=p-1&status=ALL', '1789430000',
  'nonce-1', createHash('sha256').update('').digest('hex'), 'tenant-1', 'user-1',
  'EXECUTIVE', 'project.task_overview', 'request-1',
].join('\n'));
assert.equal(createHmac('sha256', 'secret').update(payload).digest('hex').length, 64);
console.log('Marbot chatbot signature compatibility: passed');
