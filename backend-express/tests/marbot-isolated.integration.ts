import assert from 'node:assert/strict';
import prisma from '../src/config/database';
import { createApp } from '../src/app';
import { signAccessToken } from '../src/utils/jwt';
import { env } from '../src/config/env';
import { randomUUID } from 'node:crypto';

async function main() {
  // Deliberately refuses all shared/cloud databases, even when explicitly configured elsewhere.
  const url = new URL(env.DATABASE_URL);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '55439');
  assert.equal(env.NODE_ENV, 'test');
  const user = await prisma.iam_user.findUniqueOrThrow({ where: { email: 'melika@arsalynk.com' } });
  const assignee = await prisma.iam_user.findUniqueOrThrow({ where: { email: 'jundy@arsalynk.com' } });
  const membership = await prisma.iam_user_company_membership.findFirstOrThrow({ where: { user_id: user.id } });
  const companyId = membership.company_id;
  const tenantId = user.tenant_id!;
  for (const module of ['MARBOT', 'PROJECTS', 'PROCUREMENT', 'IMPLEMENTATION']) await prisma.iam_company_module_access.upsert({
    where: { company_id_module_code: { company_id: companyId, module_code: module } },
    update: { enabled: true, allow_read: true, allow_write: true },
    create: { tenant_id: tenantId, company_id: companyId, module_code: module, enabled: true, allow_read: true, allow_write: true },
  });
  for (const code of ['USE_MARBOT', 'READ_PROJECT', 'READ_TASK']) {
    const permission = await prisma.iam_permission.upsert({ where: { permission_code: code }, update: {},
      create: { permission_code: code, module_code: code === 'USE_MARBOT' ? 'MARBOT' : 'PROJECTS', resource_name: 'test', action_name: 'read' } });
    await prisma.iam_role_permission.create({ data: { tenant_id: tenantId, company_id: companyId, role_id: user.active_role_id, permission_id: permission.id, allowed: true } });
    await prisma.iam_role_permission.create({ data: { tenant_id: tenantId, company_id: companyId, role_id: assignee.active_role_id, permission_id: permission.id, allowed: true } });
  }
  const token = signAccessToken({ userId: user.id, email: user.email, full_name: user.full_name || '', tenant_id: tenantId, roles: [] });
  let activeToken = token;
  const app = createApp();
  app.locals.databaseReady = true;
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/v1/marbot`;
  const request = (path: string, body?: unknown, company = companyId) => fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${activeToken}`, 'Content-Type': 'application/json', 'X-Company-ID': company },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const mcp = (method: string, params: Record<string, unknown> = {}, id: number | null = 1, origin?: string) => fetch(base + '/mcp', {
    method: 'POST', headers: { Authorization: `Bearer ${activeToken}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'X-Company-ID': companyId, 'MCP-Protocol-Version': '2025-11-25', ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', ...(id === null ? {} : { id }), method, params }),
  });
  const chat = async (message: string) => {
    const response = await request('/chat/completions', { message });
    const text = await response.text();
    assert.equal(response.status, 200, text);
    const events = text.split('\n').filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5)));
    return { text, done: events.find(e => e.event === 'done').data };
  };
  try {
    assert.equal((await request('/status')).status, 200);
    assert.equal((await request('/status', undefined, randomUUID())).status, 403);
    assert.match((await chat('Apa role dan permission saya?')).text, /PROJECT_MANAGER/);
    assert.match((await chat('Jelaskan fitur proyek')).text, /Main Task/);
    assert.equal((await request('/chat/completions', { message: '' })).status, 400);
    const initialized = await mcp('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    assert.equal(initialized.status, 200, await initialized.clone().text());
    assert.equal((await initialized.json() as any).result.protocolVersion, '2025-11-25');
    const listed = await (await mcp('tools/list')).json() as any;
    assert(listed.result.tools.some((tool: any) => tool.name === 'erp.query'));
    assert.equal((await mcp('notifications/initialized', {}, null)).status, 202);
    assert.equal((await mcp('tools/list', {}, 2, 'https://evil.example')).status, 403);
    const mcpRead = await (await mcp('tools/call', { name: 'erp.query', arguments: { resource: 'procurement.purchase-orders', operation: 'count', filters: {} } })).json() as any;
    assert.equal(mcpRead.result.isError, false, JSON.stringify(mcpRead));
    assert.equal(JSON.parse(mcpRead.result.content[0].text).count, await prisma.proc_purchase_order.count({ where: { tenant_id: tenantId, company_id: companyId } }));
    const mcpMutation = await (await mcp('tools/call', { name: 'erp.query', arguments: { resource: 'implementation.work-items', operation: 'create', payload: { title: 'forbidden' } } })).json() as any;
    assert.equal(mcpMutation.result.isError, true, 'read-only MCP query tool must reject writes');
    const name = `Marka isolated ${randomUUID()}`;
    const proposal = await chat(`buat proyek ${JSON.stringify({ project_name: name, customer_name: 'Isolated customer', manager_name: user.full_name })}`);
    assert(proposal.done.action?.ticketId);
    assert.equal(await prisma.project_project.count({ where: { project_name: name } }), 0, 'proposal cannot mutate');
    assert.equal((await request(`/actions/${proposal.done.action.ticketId}/execute`, { confirmed: false })).status, 400);
    const execute = () => request(`/actions/${proposal.done.action.ticketId}/execute`, { confirmed: true });
    const responses = await Promise.all([execute(), execute()]);
    const bodies = await Promise.all(responses.map(r => r.json())) as any[];
    assert(responses.some(r => r.status === 200), JSON.stringify(bodies));
    assert.equal(await prisma.project_project.count({ where: { project_name: name } }), 1, 'duplicate confirmation must create once');
    const history = await (await request(`/conversations/${proposal.done.conversationId}`)).json() as any;
    assert(history.data.messages.some((m: any) => /dibaca ulang/.test(m.content)), 'persisted verified result');
    const project = await prisma.project_project.findFirstOrThrow({ where: { project_name: name } });
    const task = await chat(`buat task ${JSON.stringify({ project_id: project.id, name: 'Isolated task', weight: 10 })}`);
    assert(task.done.action?.ticketId, task.text);
    const taskResult = await request(`/actions/${task.done.action.ticketId}/execute`, { confirmed: true });
    assert.equal(taskResult.status, 200, await taskResult.text());
    const main = await prisma.project_main_task.findFirstOrThrow({ where: { project_id: project.id, name: 'Isolated task' } });
    const assignment = await chat(`assign task ${JSON.stringify({ id: main.id, user_ids: [assignee.id] })}`);
    const assignResult = await request(`/actions/${assignment.done.action.ticketId}/execute`, { confirmed: true });
    assert.equal(assignResult.status, 200, await assignResult.text());
    assert.equal(await prisma.project_task_assignment.count({ where: { main_task_id: main.id, assignee_id: assignee.id } }), 1);
    const weeklyProposal = await chat(`buat target mingguan ${JSON.stringify({ main_task_id: main.id, assignee_id: assignee.id, week_number: 40, start_date: '2026-09-28', end_date: '2026-10-04', target_description: 'Output uji lokal' })}`);
    const weeklyResult = await request(`/actions/${weeklyProposal.done.action.ticketId}/execute`, { confirmed: true });
    assert.equal(weeklyResult.status, 200, await weeklyResult.text());
    const weekly = await prisma.project_weekly_task.findFirstOrThrow({ where: { main_task_id: main.id } });
    const query = await request('/query', { resource: 'procurement.purchase-orders', operation: 'count', filters: { status: 'NON_EXISTENT' } });
    assert.equal(query.status, 200, await query.clone().text());
    assert.equal((await query.json() as any).data.count, 0);
    assert.equal((await request('/query', { resource: 'accounts.users', operation: 'list' })).status, 403);
    assert.equal((await request('/query', { resource: 'procurement.purchase-orders', operation: 'list', filters: { company_id: randomUUID() } })).status, 400);
    const aggregate = await request('/query', { resource: 'procurement.purchase-orders', operation: 'aggregate', groupBy: 'status' });
    assert.equal(aggregate.status, 200, await aggregate.clone().text());
    assert.deepEqual((await aggregate.json() as any).data.aggregate, await prisma.proc_purchase_order.groupBy({ by: ['status'], where: { tenant_id: tenantId, company_id: companyId }, _count: { _all: true }, orderBy: { status: 'asc' } }));
    activeToken = signAccessToken({ userId: assignee.id, email: assignee.email, full_name: assignee.full_name || '', tenant_id: tenantId, roles: [] });
    const dailyProposal = await chat(`buat tugas harian ${JSON.stringify({ weekly_task_id: weekly.id, title: 'Isolated daily', time_slot: '08:00-09:00', output_target: 'Output uji lokal' })}`);
    const dailyResult = await request(`/actions/${dailyProposal.done.action.ticketId}/execute`, { confirmed: true });
    assert.equal(dailyResult.status, 200, await dailyResult.text());
    const daily = await prisma.project_daily_task.findFirstOrThrow({ where: { weekly_task_id: weekly.id } });
    const update = await chat(`ubah task ${JSON.stringify({ id: daily.id, notes: 'Catatan uji terverifikasi', output_result: 'Output uji lokal' })}`);
    const updateResult = await request(`/actions/${update.done.action.ticketId}/execute`, { confirmed: true });
    assert.equal(updateResult.status, 200, await updateResult.text());
    assert.equal((await prisma.project_daily_task.findUniqueOrThrow({ where: { id: daily.id } })).notes, 'Catatan uji terverifikasi');
    activeToken = token;
    const resourceTitle = `Implementation ${randomUUID()}`;
    const resourceCreate = await chat(`data ${JSON.stringify({ resource: 'implementation.work-items', operation: 'create', payload: { module_code: 'MARBOT', work_item_type: 'TEST', title: resourceTitle, description: 'Isolated database write', status: 'OPEN' } })}`);
    assert.equal(resourceCreate.done.action.kind, 'resource.write');
    assert.equal(await prisma.implementation_work_item.count({ where: { title: resourceTitle } }), 0, 'resource proposal cannot mutate');
    const createdResponse = await request(`/actions/${resourceCreate.done.action.ticketId}/execute`, { confirmed: true });
    assert.equal(createdResponse.status, 200, await createdResponse.text());
    const workItem = await prisma.implementation_work_item.findFirstOrThrow({ where: { title: resourceTitle, company_id: companyId } });
    const resourceUpdate = await chat(`data ${JSON.stringify({ resource: 'implementation.work-items', operation: 'update', id: workItem.id, payload: { status: 'DONE', description: 'Verified update' } })}`);
    const updatedResponse = await request(`/actions/${resourceUpdate.done.action.ticketId}/execute`, { confirmed: true });
    assert.equal(updatedResponse.status, 200, await updatedResponse.text());
    assert.deepEqual(await prisma.implementation_work_item.findUnique({ where: { id: workItem.id }, select: { status: true, description: true } }), { status: 'DONE', description: 'Verified update' });
    activeToken = signAccessToken({ userId: assignee.id, email: assignee.email, full_name: assignee.full_name || '', tenant_id: tenantId, roles: [] });
    // Revocation after proposal must prevent execution even with the original authenticated token.
    const revoked = await chat(`ubah task ${JSON.stringify({ id: daily.id, notes: 'Must not save' })}`);
    const policy = await prisma.iam_field_permission.create({ data: { tenant_id: tenantId, company_id: companyId, role_id: assignee.active_role_id, module_code: 'PROJECTS', entity_name: 'project_daily_task', field_name: 'notes', can_view: true, can_edit: false, masking_type: 'NONE' } });
    try {
      assert.equal((await request(`/actions/${revoked.done.action.ticketId}/execute`, { confirmed: true })).status, 403);
      assert.notEqual((await prisma.project_daily_task.findUniqueOrThrow({ where: { id: daily.id } })).notes, 'Must not save');
    } finally { await prisma.iam_field_permission.delete({ where: { id: policy.id } }); }
    console.log('Isolated PostgreSQL E2E passed: MCP handshake/tools, real auth/scope, aggregates, cross-module create/update, project hierarchy, assignment, readback, concurrent replay, persisted verification and permission revocation.');
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
