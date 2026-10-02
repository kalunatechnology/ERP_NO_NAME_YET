import assert from 'node:assert/strict';
import express from 'express';
import { RoleCode } from '@prisma/client';
import prisma from '../src/config/database';
import { env } from '../src/config/env';
import * as accessContext from '../src/modules/accounts/access-context.service';
import * as authority from '../src/modules/marbot/marbot-access.service';
import * as configuration from '../src/modules/marbot/marbot.config';
import { signAccessToken } from '../src/utils/jwt';
import { canonicalJson, matchesHmac } from '../src/modules/marbot/marbot-signature.service';

async function main() {
  env.MARBOT_RUNTIME = 'external';
  const scope = { roleCode: RoleCode.PROJECT_MANAGER, roleId: 'role-a', enabledModules: ['MARBOT', 'PROJECTS'],
    permissions: ['USE_MARBOT', 'READ_PROJECT'], projectScope: { mode: 'LIST' as const, projectIds: ['project-a'] } };
  let currentScope = scope;
  const config: any = { externalTenantId: 'tenant-code', chatbotUrl: 'https://fixture.invalid', chatbotApiKey: 'service-key',
    inboundContextSecret: 'inbound-fixture', outboundToolSecret: 'outbound-fixture', contractVersion: 2, runtimeContextVersion: 2, dataAccessMode: 'GATEWAY_ONLY' };
  // Real bearer signature/expiry and company middleware, hermetic identity/database fixtures.
  (accessContext as any).loadAuthenticationSnapshotCoalesced = async () => ({ user: {
    id: 'user-a', tenant_id: 'tenant-a', is_active: true, email: 'fixture', active_role_id: 'role-a',
  }, rows: {} });
  (accessContext as any).loadUserAccessContext = async () => ({ companyId: 'company-a', companyIds: ['company-a'],
    roles: [RoleCode.PROJECT_MANAGER], activeRoleCode: RoleCode.PROJECT_MANAGER, enabledModules: ['MARBOT', 'PROJECTS'], delegatedModules: [] });
  (authority as any).buildMarbotRuntimeAuthority = async () => currentScope;
  (configuration as any).resolveMarbotTenantConfig = async () => config;
  const db: any = prisma;
  db.iam_field_permission.findMany = async () => [];
  db.iam_role_data_scope.findMany = async () => [];
  db.marbot_request.count = async () => 0;
  db.marbot_request.create = async () => ({});
  db.marbot_request.update = async () => ({});
  db.$queryRaw = async (query: any) => query.sql.includes('clock_timestamp') ? [{ current_time: new Date() }] : [];
  db.$transaction = async (operation: any) => typeof operation === 'function' ? operation(db) : Promise.all(operation);
  const localId = 'b75d14c9-365c-49a8-b4c0-de618d827c25';
  db.marbot_conversation.findFirst = async () => null;
  db.marbot_conversation.create = async () => ({ id: localId });
  db.marbot_message.create = async () => ({});
  const { marbotUserRouter } = require('../src/modules/marbot/marbot.routes');
  const app = express(); app.use(express.json()); app.use('/api/v1/marbot', marbotUserRouter);
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode || 500).json({ error: { message: error.message } }));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/v1/marbot`;
  const token = signAccessToken({ userId: 'user-a', email: 'fixture', full_name: '', tenant_id: 'tenant-a', roles: ['DIRECTOR'] });
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0; let revokeDuringAnswer = false;
  globalThis.fetch = async (url: any, options?: any) => {
    if (!String(url).startsWith('https://fixture.invalid')) return originalFetch(url, options);
    upstreamCalls++;
    const body = JSON.parse(options.body);
    assert(matchesHmac(canonicalJson(body.context), options.headers['X-Context-Signature'], config.inboundContextSecret));
    assert.equal(options.headers.Authorization, 'Bearer service-key');
    assert(!options.body.includes(token), 'ERP personal token must never be sent to an external service');
    assert.deepEqual(body.context.roleCodes, ['PROJECT_MANAGER'], 'JWT role claims cannot escalate database authority');
    assert.deepEqual(body.context.projectScope.projectIds, ['project-a']);
    assert.notEqual(body.conversationId, localId);
    if (revokeDuringAnswer) currentScope = { ...scope, permissions: ['USE_MARBOT'] };
    return new Response('data: {"event":"chunk","data":{"delta":"ERP answer"}}\n\ndata: {"event":"done","data":{"conversationId":"remote-id","action":{"ticketId":"fake"}}}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  };
  const chat = (body: any = { message: 'proyek' }, bearer = token, company = 'company-a') => originalFetch(base + '/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'X-Company-ID': company, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  try {
    assert.equal((await chat(undefined, 'forged')).status, 401);
    assert.equal((await chat(undefined, token, 'company-b')).status, 403);
    assert.equal((await chat({ message: 'proyek', role: 'DIRECTOR' })).status, 400);
    assert.equal((await chat({ message: 'proyek', conversationId: localId })).status, 403);
    config.contractVersion = 1; assert.equal((await chat()).status, 403); config.contractVersion = 2;
    config.dataAccessMode = undefined; assert.equal((await chat()).status, 403); config.dataAccessMode = 'GATEWAY_ONLY';
    assert.equal(upstreamCalls, 0, 'rejected sessions never reach the external model');
    const good = await chat(); assert.equal(good.status, 200);
    const events = await good.text(); assert(events.includes(localId)); assert(!events.includes('remote-id')); assert(!events.includes('fake'));
    revokeDuringAnswer = true;
    const revoked = await chat(); assert.equal(revoked.status, 403); assert(!(await revoked.text()).includes('ERP answer'));
    currentScope = scope;
    // Gateway remains available when the language provider uses external mode.
    const tools = await originalFetch(base + '/mcp', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'X-Company-ID': 'company-a', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
    assert.equal(tools.status, 200);
    assert((await tools.json() as any).result.tools.some((tool: any) => tool.name === 'erp.query'));
    console.log('External HTTP passed: real JWT verification/company boundary, forged-role rejection, legacy/direct-database blocked before fetch, signed scope, private token separation, owned history IDs, no external action tickets, mid-request revocation, and ERP MCP in external mode.');
  } finally {
    globalThis.fetch = originalFetch; server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve())); await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
