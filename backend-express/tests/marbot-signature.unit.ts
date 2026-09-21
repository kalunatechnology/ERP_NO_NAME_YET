import assert from 'assert';
import { createHash, createHmac } from 'crypto';
import { Request } from 'express';
import {
  canonicalJson,
  toolSignaturePayload,
  buildToolSignaturePayload,
  matchesHmac,
  createHmacSignature,
  verifyHmacSignature,
} from '../src/modules/marbot/marbot-signature.service';
import {
  canonicalJson as routesCanonicalJson,
  toolSignaturePayload as routesToolSignaturePayload,
} from '../src/modules/marbot/marbot.routes';

// These vectors follow the unmodified chatbot's canonicalJson and
// buildOutboundToolSignaturePayload contracts, including its sorted GET query.
assert.equal(
  canonicalJson({ roleCodes: ['EXECUTIVE'], companyId: 'c1', issuedAt: 42 }),
  '{"companyId":"c1","issuedAt":42,"roleCodes":["EXECUTIVE"]}',
);
assert.equal(
  routesCanonicalJson({ roleCodes: ['EXECUTIVE'], companyId: 'c1', issuedAt: 42 }),
  '{"companyId":"c1","issuedAt":42,"roleCodes":["EXECUTIVE"]}',
);

const headers: Record<string, string> = {
  'X-Timestamp': '1789430000',
  'X-Nonce': 'nonce-1',
  'X-Request-Id': 'request-1',
  'X-User-Id': 'user-1',
  'X-User-Roles': 'EXECUTIVE',
  'X-Company-Id': 'company-1',
  'X-User-Permissions': 'READ_TASK,READ_PROJECT',
  'X-Project-Scope': '{"projectIds":["p-1"],"mode":"LIST"}',
};
const req = {
  baseUrl: '/internal/marbot',
  path: '/projects/tasks',
  query: { status: 'ALL', projectId: 'p-1' },
  header: (name: string) => headers[name],
} as unknown as Request;

const config = { externalTenantId: 'tenant-1' } as any;
const payload = toolSignaturePayload(req, 'project.task_overview', config);
const payloadAlias = buildToolSignaturePayload(req, 'project.task_overview', config);
const payloadRoutes = routesToolSignaturePayload(req, 'project.task_overview', config);

const expectedPayload = [
  'GET',
  '/internal/marbot/projects/tasks?projectId=p-1&status=ALL',
  '1789430000',
  'nonce-1',
  createHash('sha256').update('').digest('hex'),
  'tenant-1',
  'user-1',
  'EXECUTIVE',
  'project.task_overview',
  'request-1',
  'company-1',
  'READ_PROJECT,READ_TASK',
  '{"mode":"LIST","projectIds":["p-1"]}',
].join('\n');

assert.equal(payload, expectedPayload);
assert.equal(payloadAlias, expectedPayload);
assert.equal(payloadRoutes, expectedPayload);

const sig = createHmacSignature(payload, 'secret');
assert.equal(sig.length, 64);
assert.equal(createHmac('sha256', 'secret').update(payload).digest('hex'), sig);
assert.strictEqual(matchesHmac(payload, sig, 'secret'), true);
assert.strictEqual(verifyHmacSignature(payload, sig, 'secret'), true);
assert.strictEqual(matchesHmac(payload, 'bad' + sig.slice(3), 'secret'), false);

headers['X-Company-Id'] = 'company-tampered';
assert.notEqual(toolSignaturePayload(req, 'project.task_overview', config), payload);
headers['X-Company-Id'] = 'company-1';
headers['X-User-Permissions'] = 'READ_TASK';
assert.notEqual(toolSignaturePayload(req, 'project.task_overview', config), payload);
headers['X-User-Permissions'] = 'READ_TASK,READ_PROJECT';
headers['X-Project-Scope'] = '{"mode":"ALL","projectIds":[]}';
assert.notEqual(toolSignaturePayload(req, 'project.task_overview', config), payload);

console.log('Marbot chatbot signature compatibility: passed');
