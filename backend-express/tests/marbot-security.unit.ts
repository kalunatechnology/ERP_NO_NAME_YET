import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { RoleCode } from '@prisma/client';
import prisma from '../src/config/database';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { buildResourceScope, applyAndValidateWriteScope } from '../src/modules/accounts/resource-scope.service';
import { reserveMarbotRequest } from '../src/modules/marbot/marbot-rate-limit.service';
import { marbotAuthorityKey, visibleConversationTitle } from '../src/modules/marbot/marbot-authority.service';
import { requireSignedExternalContract, externalConversationKey, readExternalAnswer } from '../src/modules/marbot/marbot-external-security.service';
import { allowedMcpTools } from '../src/modules/marbot/marbot-mcp.routes';
import { signAccessToken, verifyAccessToken } from '../src/utils/jwt';
import { env } from '../src/config/env';
import jwt from 'jsonwebtoken';

async function main() {
  const pm = { id: 'pm-a', active_role_code: RoleCode.PROJECT_MANAGER, roles: [RoleCode.PROJECT_MANAGER, RoleCode.STAFF], tenant_id: 'tenant-a' };
  const rows = [{ id: 'p-a', company_id: 'company-a', tenant_id: 'tenant-a', created_by_id: 'pm-a' },
    { id: 'p-b', company_id: 'company-a', tenant_id: 'tenant-a', created_by_id: 'pm-b', project_manager_id: 'pm-a' },
    { id: 'p-legacy', company_id: 'company-a', tenant_id: 'tenant-a', created_by_id: null },
    { id: 'p-cross', company_id: 'company-b', tenant_id: 'tenant-b', created_by_id: 'pm-a' }];
  const matches = (row: any, where: any): boolean => Object.entries(where).every(([key, value]) =>
    key === 'AND' ? (value as any[]).every(part => matches(row, part)) : row[key] === value);
  const projects = {
    findMany: async ({ where }: any) => rows.filter(row => matches(row, where)),
    findFirst: async ({ where }: any) => rows.find(row => matches(row, where)) ?? null,
  };
  const db: any = { project_project: projects,
    project_main_task: { findMany: async ({ where }: any) => { assert.deepEqual(where.project_id.in, ['p-a']); return [{ id: 'main-a' }]; } },
    project_weekly_task: { findMany: async ({ where }: any) => { assert.deepEqual(where.main_task_id.in, ['main-a']); return [{ id: 'weekly-a' }]; } },
    project_daily_task: { findMany: async ({ where }: any) => { assert.deepEqual(where.weekly_task_id.in, ['weekly-a']); return [{ id: 'daily-a' }]; } },
  };
  assert.deepEqual(await ProjectsService.managedProjectIds(pm, 'company-a', db), ['p-a']);
  await ProjectsService.assertCanManageProject(pm, 'p-a', 'company-a', db);
  for (const id of ['p-b', 'p-legacy', 'p-cross']) {
    await assert.rejects(() => ProjectsService.assertCanManageProject(pm, id, 'company-a', db));
    await assert.rejects(() => ProjectsService.assertCanViewProject(pm, id, 'company-a', db));
    await assert.rejects(() => ProjectsService.assertCanDelegateProjectAuthority(pm, id, 'company-a', db));
  }
  assert.deepEqual(await ProjectsService.mainTaskAccessWhere(pm, 'company-a', db), { project_id: { in: ['p-a'] } });
  assert.deepEqual(await ProjectsService.weeklyTaskAccessWhere(pm, 'company-a', db), { main_task_id: { in: ['main-a'] } });
  assert.deepEqual(await ProjectsService.dailyTaskAccessWhere(pm, 'company-a', db), { weekly_task_id: { in: ['weekly-a'] } });
  assert.deepEqual(await ProjectsService.taskAssignmentAccessWhere(pm, 'company-a', db), { main_task_id: { in: ['main-a'] } });
  assert.deepEqual(await ProjectsService.taskTransferAccessWhere(pm, 'company-a', db), { daily_task_id: { in: ['daily-a'] } });
  // Generic list/count/aggregate/write routes must retain creator scope even with company_id.
  const delegate = prisma.project_project as any;
  const original = delegate.findMany; delegate.findMany = projects.findMany;
  const req: any = { user: pm, companyId: 'company-a' };
  try {
    const fields = new Set(['id', 'tenant_id', 'company_id', 'project_id']);
    const where = await buildResourceScope(req, 'project_expense', fields);
    assert.deepEqual(where.project_id, { in: ['p-a'] });
    await assert.rejects(() => applyAndValidateWriteScope(req, 'project_expense', fields, { project_id: 'p-b' }));
    assert.equal((await applyAndValidateWriteScope(req, 'project_expense', fields, { project_id: 'p-a' })).company_id, 'company-a');
    await assert.rejects(() => applyAndValidateWriteScope(req, 'project_task_dependency', new Set(['id', 'company_id', 'task_id']), { task_id: 'other-task' }));
  } finally { delegate.findMany = original; }

  const scope = { userId: pm.id, tenantId: pm.tenant_id, companyId: 'company-a', roleCode: RoleCode.PROJECT_MANAGER,
    roleId: 'role', enabledModules: ['MARBOT', 'PROJECTS'], permissions: ['USE_MARBOT', 'READ_PROJECT'], projectScope: { mode: 'LIST' as const, projectIds: ['p-a'] } };
  const key = marbotAuthorityKey(scope);
  assert.notEqual(key, marbotAuthorityKey({ ...scope, userId: 'pm-b' }));
  assert.notEqual(key, marbotAuthorityKey({ ...scope, permissions: ['USE_MARBOT'] }));
  assert.notEqual(key, marbotAuthorityKey({ ...scope, projectScope: { mode: 'LIST', projectIds: [] } }));
  assert.equal(visibleConversationTitle([]), 'Percakapan');
  assert.equal(visibleConversationTitle([{ role: 'assistant', content: 'secret' }]), 'Percakapan');
  assert(allowedMcpTools(scope).has('erp.query'));
  assert(!allowedMcpTools({ ...scope, permissions: ['USE_MARBOT'] }).has('erp.query'));
  assert(!allowedMcpTools({ ...scope, blockedReadModules: ['PROJECTS'] }).has('erp.schema'));

  const config: any = { contractVersion: 2, runtimeContextVersion: 2, dataAccessMode: 'GATEWAY_ONLY', externalTenantId: 't', inboundContextSecret: 'fixture' };
  requireSignedExternalContract(config);
  assert.throws(() => requireSignedExternalContract({ ...config, contractVersion: 1 }));
  assert.throws(() => requireSignedExternalContract({ ...config, runtimeContextVersion: undefined }));
  assert.throws(() => requireSignedExternalContract({ ...config, dataAccessMode: undefined }));
  assert.notEqual(externalConversationKey('local-a', key, config), externalConversationKey('local-a', marbotAuthorityKey({ ...scope, userId: 'pm-b' }), config));
  const stream = (events: unknown[]) => new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } });
  assert.deepEqual(await readExternalAnswer(stream([{ event: 'chunk', data: { delta: 'ERP' } }, { event: 'done', data: { conversationId: 'attacker-id', action: { ticketId: 'fake' }, model: 'fixture' } }])), { content: 'ERP', model: 'fixture' });
  await assert.rejects(() => readExternalAnswer(stream([{ event: 'chunk', data: { delta: 'incomplete' } }])));
  await assert.rejects(() => readExternalAnswer(new Response('unsafe')));
  await assert.rejects(() => readExternalAnswer(stream([{ event: 'done' }, { event: 'chunk', data: { delta: 'late' } }])));
  const payload = { userId: 'u', email: 'fixture', full_name: '', tenant_id: 't', roles: [] };
  const token = signAccessToken(payload);
  assert.equal(verifyAccessToken(token)?.userId, 'u');
  assert.equal(verifyAccessToken(token.slice(0, -5) + 'xxxxx'), null);
  assert.equal(verifyAccessToken(jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: -1 })), null);

  // Model PostgreSQL's transaction-scoped locks, shared by two independent backend instances.
  const locks = new Map<string, Promise<void>>(); const reservations: any[] = [];
  const instance = () => ({ $transaction: async (callback: any, options: any) => {
    assert.equal(options.isolationLevel, 'ReadCommitted');
    let release: (() => void) | undefined; let locked = false;
    const tx = { $queryRaw: async (query: any) => {
      if (query.sql.includes('pg_advisory_xact_lock')) {
        const lock = String(query.values[0]); const prior = locks.get(lock) ?? Promise.resolve();
        const held = new Promise<void>(resolve => { release = resolve; });
        locks.set(lock, prior.then(() => held)); await prior; locked = true; return [{ lock: '' }];
      }
      assert(locked); return [{ current_time: new Date() }];
    }, marbot_request: { count: async ({ where }: any) => {
      assert(locked); return reservations.filter(row => ['tenant_id', 'company_id', 'user_id', 'tool_name'].every(field => row[field] === where[field]) && row.created_at >= where.created_at.gte).length;
    }, create: async ({ data }: any) => { assert(locked); reservations.push(data); return data; } } };
    try { return await callback(tx); } finally { release?.(); }
  } });
  const instances = [instance(), instance()];
  const request = { tenant_id: 't', company_id: 'c', user_id: 'u', tool_name: 'native.chat', outcome: 'STARTED', request_id: 'r' };
  const results = await Promise.allSettled(Array.from({ length: 50 }, (_, i) => reserveMarbotRequest({ ...request, nonce: randomUUID() }, 20, instances[i % 2])));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 20);
  for (const result of results) if (result.status === 'rejected') assert.equal(result.reason.statusCode, 429);
  await reserveMarbotRequest({ ...request, user_id: 'other', nonce: randomUUID() }, 20, instances[0]);
  await assert.rejects(() => reserveMarbotRequest({ ...request, nonce: randomUUID() }, 20, { $transaction: async () => { throw new Error('database unavailable'); } }), /database unavailable/);
  console.log('Marbot security passed: PM creator-only project/task/read/write scope; scoped MCP tools; JWT tamper/expiry; signed-only external contract/history/stream; 50 concurrent requests across two simulated instances reserve exactly 20; fail-closed database errors.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
