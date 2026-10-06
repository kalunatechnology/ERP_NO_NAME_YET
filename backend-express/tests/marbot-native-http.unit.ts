import assert from 'node:assert/strict';
import express from 'express';
import { RoleCode } from '@prisma/client';
import prisma from '../src/config/database';
import * as authority from '../src/modules/marbot/marbot-access.service';
import { nativeMarbotRouter } from '../src/modules/marbot/marbot-native.routes';
import { marbotAuthorityKey } from '../src/modules/marbot/marbot-authority.service';
import { errorHandler } from '../src/middlewares/error.middleware';
import * as resource from '../src/modules/marbot/marbot-resource.service';
import * as planner from '../src/modules/marbot/marbot-planner.service';
import { env } from '../src/config/env';

async function main() {
  // Hermetic HTTP test: no production database, provider, or ERP writes.
  delete process.env.MARBOT_AI_API_KEY;
  const scope = { roleCode: RoleCode.STAFF, roleId: 'role', enabledModules: ['MARBOT'], permissions: ['USE_MARBOT'], projectScope: { mode: 'LIST' as const, projectIds: [] } };
  (authority as any).buildMarbotRuntimeAuthority = async () => scope;
  const id = 'b75d14c9-365c-49a8-b4c0-de618d827c25';
  const stored: any[] = [];
  let requestCount = 0;
  const db = prisma as any;
  db.iam_field_permission.findMany = async () => [];
  db.iam_role_data_scope.findMany = async () => [];
  db.marbot_request.count = async () => requestCount;
  db.marbot_request.create = async () => ({});
  db.marbot_request.update = async () => ({});
  db.marbot_conversation.count = async () => 0;
  db.marbot_conversation.create = async ({ data }: any) => ({ id, ...data });
  db.marbot_conversation.update = async () => ({});
  db.marbot_conversation.findFirst = async ({ where }: any) => {
    assert.equal(where.tenant_id, 'tenant-a');
    assert.equal(where.company_id, 'company-a');
    assert.equal(where.user_id, 'user-a');
    return null;
  };
  db.marbot_message.findFirst = async () => null;
  db.marbot_message.create = async ({ data }: any) => { stored.push(data); return data; };
  db.$queryRaw = async (query: any) => query.sql.includes('clock_timestamp') ? [{ current_time: new Date() }] : [{ pg_advisory_xact_lock: '' }];
  db.$transaction = async (operations: any) => typeof operations === 'function' ? operations(db) : Promise.all(operations);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).user = { id: 'user-a', tenant_id: 'tenant-a' }; req.companyId = 'company-a'; next(); });
  app.use(nativeMarbotRouter);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as any).port;
  const send = (body: unknown) => fetch(`http://127.0.0.1:${port}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const status = await fetch(`http://127.0.0.1:${port}/status`);
    assert.equal((await status.json() as any).data.contractMode, 'native');
    const good = await send({ message: 'Laporan kerja di mana?' });
    assert.equal(good.status, 200);
    assert.match(good.headers.get('content-type')!, /event-stream/);
    const events = await good.text();
    assert.match(events, /\/reporting/);
    assert.match(events, /"event":"done"/);
    assert.equal(stored.length, 2);
    assert.equal(stored[0].metadata.authority, stored[1].metadata.authority);
    assert.equal(stored[1].metadata.model, 'erp-native');
    assert.equal((await send({ message: 'hi', mode: 'DASHBOARD' })).status, 403);
    assert.equal((await send({ message: '' })).status, 400);
    assert.equal((await send({ message: 'hi', companyId: 'company-b' })).status, 400);
    const unavailable = await send({ message: 'hi', conversationId: id });
    assert.equal(unavailable.status, 403);
    assert.equal((await unavailable.json() as any).error, 'MARBOT_CONVERSATION_UNAVAILABLE');
    const taskScope = { ...scope, roleCode: RoleCode.STAFF as RoleCode, enabledModules: ['MARBOT', 'PROJECTS'], permissions: ['USE_MARBOT', 'READ_TASK'], projectScope: { mode: 'LIST' as const, projectIds: ['project-a'] } };
    let scopes = [taskScope, taskScope];
    (authority as any).buildMarbotRuntimeAuthority = async () => scopes.length > 1 ? scopes.shift()! : scopes[0];
    const originalResourcePlanner = resource.planResourceQuestion, originalNativePlanner = planner.planNativeQuestion;
    const savedKey = env.MARBOT_AI_API_KEY, savedModel = env.MARBOT_AI_MODEL;
    (env as any).MARBOT_AI_API_KEY = 'fixture-key'; (env as any).MARBOT_AI_MODEL = 'fixture-model';
    (resource as any).planResourceQuestion = async () => { throw new Error('Task read must not use provider resource planning'); };
    (planner as any).planNativeQuestion = async () => { throw new Error('Task read must not rewrite ownership or period'); };
    const originalQuery = db.$queryRaw;
    let taskReads = 0;
    db.$queryRaw = async (query: any) => {
      if (!query.sql.includes('FROM project_daily_task')) return originalQuery(query);
      taskReads++;
      assert(query.values.includes('company-a') && query.values.includes('project-a') && query.values.includes('user-a'));
      return [{ title: 'Fixture task', owner_id: 'user-a', status: 'NOT_STARTED', progress: 0, total: 1n, completed: 0n, overdue: 0n, blocked: 0n }];
    };
    try {
      for (const message of ['hari ini saya memiliki berapa daily task', 'bagaimana dengan daily task lain yang bukan hari ini', 'maksud saya adalah seluruh daily task saya']) {
        scopes = [taskScope, taskScope];
        const result = await send({ message }); assert.equal(result.status, 200);
        assert.match(await result.text(), /Fixture task/);
      }
      assert.equal(taskReads, 3);
      scopes = [taskScope, { ...taskScope, projectScope: { mode: 'LIST', projectIds: ['project-a', 'new-project'] } }];
      const expanded = await send({ message: 'seluruh daily task saya' });
      assert.equal(expanded.status, 200, 'An added project cannot invalidate data from the original allowed scope');
      await expanded.text();
      for (const changed of [
        { ...taskScope, projectScope: { mode: 'LIST' as const, projectIds: [] } },
        { ...taskScope, permissions: ['USE_MARBOT'] },
        { ...taskScope, roleCode: RoleCode.PROJECT_MANAGER },
        { ...taskScope, enabledModules: ['MARBOT'] },
      ]) {
        scopes = [taskScope, changed]; const beforeStored: number = stored.length;
        const revoked = await send({ message: 'seluruh daily task saya' });
        assert.equal(revoked.status, 403);
        const body = await revoked.json() as any;
        assert.equal(body.error, 'MARBOT_AUTHORITY_CHANGED');
        assert(!JSON.stringify(body).includes('Fixture task'));
        assert.equal(stored.length, beforeStored, 'Revoked results cannot enter conversation history');
      }
    } finally {
      (resource as any).planResourceQuestion = originalResourcePlanner;
      (planner as any).planNativeQuestion = originalNativePlanner;
      (env as any).MARBOT_AI_API_KEY = savedKey; (env as any).MARBOT_AI_MODEL = savedModel;
      db.$queryRaw = originalQuery;
      (authority as any).buildMarbotRuntimeAuthority = async () => scope;
    }
    const activeAuthority = marbotAuthorityKey({ ...scope, userId: 'user-a', tenantId: 'tenant-a', companyId: 'company-a' });
    db.marbot_conversation.findMany = async ({ where, include }: any) => {
      assert.equal(where.messages.some.OR[0].metadata.equals, activeAuthority);
      assert.equal(include.messages.where.OR[0].metadata.equals, activeAuthority);
      return [{ id, title: 'Rahasia director dari role lama', messages: [{ role: 'user', content: 'Pertanyaan staff sekarang', metadata: { authority: activeAuthority } }] }];
    };
    const list = await fetch(`http://127.0.0.1:${port}/conversations`);
    assert.equal((await list.json() as any).data[0].title, 'Pertanyaan staff sekarang');
    db.marbot_conversation.findFirst = async () => ({ id, title: 'Rahasia director dari role lama', messages: [
      { role: 'assistant', content: 'Anggaran rahasia', metadata: { authority: 'old-role' } },
      { role: 'user', content: 'Pertanyaan staff sekarang', metadata: { authority: activeAuthority } },
    ] });
    const history = await fetch(`http://127.0.0.1:${port}/conversations/${id}`);
    const historyBody = await history.json() as any;
    assert.equal(historyBody.data.title, 'Pertanyaan staff sekarang');
    assert.equal(historyBody.data.messages.length, 1);
    assert(!JSON.stringify(historyBody).includes('rahasia'));
    const mcp = async (method: string, params?: unknown) => fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const tools = await (await mcp('tools/list')).json() as any;
    assert.deepEqual(tools.result.tools.map((tool: any) => tool.name), ['erp.capabilities']);
    assert.equal((await mcp('tools/call', { name: 'erp.query', arguments: { resource: 'projects.projects', operation: 'list' } })).status, 403);
    // A forged role in arguments cannot enable a hidden tool.
    assert.equal((await mcp('tools/call', { name: 'erp.readQuestion', arguments: { question: 'biaya', role: 'DIRECTOR' } })).status, 403);
    requestCount = 20;
    assert.equal((await send({ message: 'hi' })).status, 429);
    console.log('Native MarBot HTTP: SSE, persistence, authority, input validation, ownership and rate limit passed.');
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
