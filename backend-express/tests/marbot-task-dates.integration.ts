import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import prisma from '../src/config/database';
import { env } from '../src/config/env';
import { createApp } from '../src/app';
import { signAccessToken } from '../src/utils/jwt';
import { queryPeriod } from '../src/modules/marbot/marbot-native.service';
import { buildMarbotRuntimeAuthority } from '../src/modules/marbot/marbot-access.service';

async function main() {
  const url = new URL(env.DATABASE_URL);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '55440');
  assert.equal(url.pathname, '/marka_qa_20261005');
  assert.equal(env.NODE_ENV, 'test', 'QA only; never modify a shared database');
  assert(!env.MARBOT_AI_API_KEY, 'No paid provider in integration tests');
  const pm = await prisma.iam_user.findUniqueOrThrow({ where: { email: 'pm.lead@arsalynk.id' } });
  const staff = await prisma.iam_user.findUniqueOrThrow({ where: { email: 'staff.dev@arsalynk.id' } });
  const membership = await prisma.iam_user_company_membership.findUniqueOrThrow({ where: { user_id: staff.id } });
  const tenantId = membership.tenant_id, companyId = membership.company_id;
  for (const module of ['MARBOT', 'PROJECTS']) await prisma.iam_company_module_access.upsert({
    where: { company_id_module_code: { company_id: companyId, module_code: module } },
    create: { tenant_id: tenantId, company_id: companyId, module_code: module, enabled: true, allow_read: true, allow_write: true },
    update: { enabled: true, allow_read: true, allow_write: true },
  });
  for (const code of ['USE_MARBOT', 'READ_PROJECT', 'READ_TASK']) {
    const permission = await prisma.iam_permission.upsert({ where: { permission_code: code }, update: {},
      create: { permission_code: code, module_code: code === 'USE_MARBOT' ? 'MARBOT' : 'PROJECTS', resource_name: 'test', action_name: 'read' } });
    for (const actor of [staff, pm]) if (!await prisma.iam_role_permission.findFirst({ where: { tenant_id: tenantId, company_id: companyId, role_id: actor.active_role_id, permission_id: permission.id, allowed: true } })) {
      await prisma.iam_role_permission.create({ data: { tenant_id: tenantId, company_id: companyId, role_id: actor.active_role_id, permission_id: permission.id, allowed: true } });
    }
  }
  const stamp = randomUUID(), projectIds: string[] = [], mainIds: string[] = [], weeklyIds: string[] = [];
  const createTree = async (name: string, company = companyId, assigned = true) => {
    const base = { tenant_id: tenantId, company_id: company, created_by_id: pm.id };
    const project = await prisma.project_project.create({ data: { ...base, project_code: stamp + name, project_name: name,
      customer_name: 'QA', manager_name: pm.full_name, description: '', status: 'STARTED', lifecycle_status: 'STARTED', health_status: 'ON_TRACK', source_type: 'MANUAL' } });
    projectIds.push(project.id);
    const main = await prisma.project_main_task.create({ data: { ...base, project_id: project.id, name: 'QA Main', description: '', priority: 'MEDIUM', weight: 100, progress: 0, status: 'NOT_STARTED', is_progress_overridden: false, override_reason: '', created_at: new Date(), updated_at: new Date() } });
    mainIds.push(main.id);
    if (assigned) await prisma.project_task_assignment.create({ data: { ...base, main_task_id: main.id, assignee_id: staff.id, assigned_by_id: pm.id, assigned_at: new Date() } });
    const weekly = await prisma.project_weekly_task.create({ data: { ...base, main_task_id: main.id, assignee_id: staff.id, week_number: 41, target_description: 'QA Weekly', progress: 0, status: 'PLANNED', is_progress_overridden: false, override_reason: '', created_at: new Date(), updated_at: new Date() } });
    weeklyIds.push(weekly.id);
    return { project, weekly };
  };
  const app = createApp(); app.locals.databaseReady = true;
  const qaCompany = await prisma.core_company.findUniqueOrThrow({ where: { id: companyId } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as any).port}/api/v1/marbot`;
  const call = (actor: typeof staff, body: unknown) => fetch(`${baseUrl}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Company-ID': companyId,
      Authorization: `Bearer ${signAccessToken({ userId: actor.id, email: actor.email, full_name: actor.full_name, tenant_id: tenantId, roles: [] })}` }, body: JSON.stringify(body),
  });
  try {
    // This seed intentionally marks its sample company GHOST. Activate it only
    // for the isolated test, then restore it; production checks stay unchanged.
    await prisma.core_company.update({ where: { id: companyId }, data: { status: 'ACTIVE' } });
    await buildMarbotRuntimeAuthority(staff.id, tenantId, companyId);
    const tree = await createTree(`Chatbot Date QA ${stamp}`);
    const hidden = await createTree(`Hidden QA ${stamp}`, companyId, false);
    const foreign = await createTree(`Foreign QA ${stamp}`, randomUUID());
    const today = queryPeriod('hari ini').start;
    const add = (title: string, date: Date | null, weekly = tree.weekly, owner = staff.id) => prisma.project_daily_task.create({ data: {
      tenant_id: tenantId, company_id: weekly.company_id, created_by_id: owner, weekly_task_id: weekly.id, owner_id: owner,
      title, description: '', planned_date: date, time_slot: '09:00-10:00', output_result: '', notes: '', progress: 0, status: 'NOT_STARTED', is_blocked: false, block_reason: '', created_at: new Date(), updated_at: new Date(),
    } });
    await add('QA Today', new Date(today.getTime() + 2 * 3600000));
    await add('QA Yesterday', new Date(today.getTime() - 86400000));
    await add('QA Tomorrow', new Date(today.getTime() + 86400000));
    await add('QA Undated', null);
    await add('QA Other owner', today, tree.weekly, pm.id);
    await add('QA Hidden project', today, hidden.weekly);
    await add('QA Foreign company', today, foreign.weekly);
    let conversationId: string | undefined;
    const chat = async (message: string, actor = staff) => {
      const response = await call(actor, { message: `${message} proyek "${tree.project.project_name}"`, ...(actor.id === staff.id ? { conversationId } : {}) });
      const text = await response.text(); assert.equal(response.status, 200, text);
      const events = text.split('\n').filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5)));
      const done = events.find(event => event.event === 'done').data;
      if (actor.id === staff.id) { if (conversationId) assert.equal(done.conversationId, conversationId); conversationId = done.conversationId; }
      const content = events.find(event => event.event === 'chunk').data.delta;
      assert.doesNotMatch(content, /QA Other owner|QA Hidden project|QA Foreign company/);
      return content as string;
    };
    const current = await chat('hari ini saya memiliki berapa daily task');
    assert.match(current, /Task harian saya: 1/); assert.match(current, /QA Today/);
    assert.doesNotMatch(current, /QA Yesterday|QA Tomorrow|QA Undated/);
    const elsewhere = await chat('bagaimana dengan daily task lain yang bukan hari ini');
    assert.match(elsewhere, /Task harian saya: 3/); assert.doesNotMatch(elsewhere, /QA Today/);
    for (const title of ['QA Yesterday', 'QA Tomorrow', 'QA Undated']) assert(elsewhere.includes(title));
    assert.match(elsewhere, /hari ini dikecualikan/);
    const all = await chat('maksud saya adalah seluruh daily task saya');
    assert.match(all, /Task harian saya: 4/); assert.match(all, /seluruh tanggal/);
    for (const title of ['QA Today', 'QA Yesterday', 'QA Tomorrow', 'QA Undated']) assert(all.includes(title));
    assert.doesNotMatch(all, /Periode filter waktu/);
    const pmOwn = await call(pm, { message: `seluruh daily task saya proyek "${tree.project.project_name}"` });
    const pmText = await pmOwn.text(); assert.equal(pmOwn.status, 200, pmText);
    assert.match(pmText, /Task harian saya: 1/); assert.match(pmText, /QA Other owner/); assert.doesNotMatch(pmText, /QA Today/);
    const denied = await call(pm, { message: 'seluruh daily task saya', conversationId });
    assert.equal(denied.status, 403); assert.equal((await denied.json() as any).error, 'MARBOT_CONVERSATION_UNAVAILABLE');
    console.log('PASS: real HTTP/QA SQL — screenshot sequence in one conversation; today/excluded/all/undated tasks; Staff and PM self ownership; foreign project/company and conversation isolation.');
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await prisma.project_daily_task.deleteMany({ where: { weekly_task_id: { in: weeklyIds } } });
    await prisma.project_weekly_task.deleteMany({ where: { id: { in: weeklyIds } } });
    await prisma.project_task_assignment.deleteMany({ where: { main_task_id: { in: mainIds } } });
    await prisma.project_main_task.deleteMany({ where: { id: { in: mainIds } } });
    await prisma.project_project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.core_company.update({ where: { id: companyId }, data: { status: qaCompany.status } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
