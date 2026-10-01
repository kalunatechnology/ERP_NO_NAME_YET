import assert from 'node:assert/strict';
import express from 'express';
import { RoleCode } from '@prisma/client';
import prisma from '../src/config/database';
import * as authority from '../src/modules/marbot/marbot-access.service';
import { nativeMarbotRouter } from '../src/modules/marbot/marbot-native.routes';

async function main() {
  // Hermetic HTTP test: no production database, provider, or ERP writes.
  delete process.env.MARBOT_AI_API_KEY;
  const scope = { roleCode: RoleCode.STAFF, roleId: 'role', enabledModules: ['MARBOT'], permissions: ['USE_MARBOT'], projectScope: { mode: 'LIST', projectIds: [] } };
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
  db.$transaction = async (operations: any[]) => Promise.all(operations);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).user = { id: 'user-a', tenant_id: 'tenant-a' }; req.companyId = 'company-a'; next(); });
  app.use(nativeMarbotRouter);
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode || 500).json({ error: { message: error.message } }));
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
    assert.equal((await send({ message: 'hi', conversationId: id })).status, 403);
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
