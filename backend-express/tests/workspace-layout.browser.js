/**
 * Starts a local Next dev server (or uses LAYOUT_TEST_URL) with Playwright locally
 * or through MARBOT_TEST_RUNTIME_PACKAGES. All API requests are intercepted;
 * this checks the real pages without accessing or changing company records.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { chromium } = require(process.env.MARBOT_TEST_RUNTIME_PACKAGES
  ? path.join(process.env.MARBOT_TEST_RUNTIME_PACKAGES, 'playwright') : 'playwright');

let baseUrl = process.env.LAYOUT_TEST_URL;
const outputDir = process.env.LAYOUT_TEST_OUTPUT || path.resolve(__dirname, '../../.tmp/workspace-layout');
const companyId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const token = `e30.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.fixture`;
const meetings = ['SCHEDULED', 'COMPLETED', 'DRAFT'].map((status, index) => ({
  id: `meeting-${index}`, request_id: `request-${index}`, status,
  recurrence_type: index === 0 ? 'RECURRING' : 'NON_RECURRING', recurrence_days: [1, 2, 3],
  start_at: '2026-10-09T04:00:00Z', end_at: '2026-10-09T05:00:00Z', timezone: 'Asia/Jakarta',
  location: 'Ruang koordinasi tim dengan nama lokasi yang panjang', meeting_url: 'https://meet.google.com/fixture',
  request: { id: `request-${index}`, request_number: `REQ-123456789-${index}`, status,
    title: `Meeting ${index} untuk koordinasi persiapan proyek`, description: 'Pembahasan progres pekerjaan dan rencana pelaksanaan tim.' },
}));

async function createPage(browser, role = 'ROLE-DIRECTOR') {
  const profile = { id: userId, email: 'layout@example.test', full_name: 'Penguji Tampilan',
    company_id: companyId, company: { id: companyId, name: 'PT Sinergi Muda Arsa' },
    active_role_code: role, roles: [{ role_code: role }], module_access: [],
    enabled_modules: ['CORE', 'REQUESTS', 'PROJECTS', 'FINANCE', 'REPORTING'], delegated_modules: [] };
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: 'access_token', value: token, url: baseUrl }]);
  await context.addInitScript(({ profile, token, companyId }) => {
    localStorage.setItem('erp.access', token);
    localStorage.setItem('erp.user', JSON.stringify(profile));
    localStorage.setItem('erp.company', companyId);
    localStorage.setItem('erp.rightPanel', 'true');
  }, { profile, token, companyId });
  const assignments = [{ id: 'assign-alice', main_task_id: 'main', assignee_id: 'alice' },
    { id: 'assign-bob', main_task_id: 'main', assignee_id: 'bob' }];
  const deletions = [];
  const bundle = () => ({ projects: [{ id: 'project', project_name: 'Proyek Pengujian Layout', project_code: 'QA', status: 'ACTIVE', budget: 13000000 }],
    mainTasks: [{ id: 'main', project_id: 'project', name: 'Main Task Dua Anggota', status: 'PLANNED', weight: 100 }],
    assignments, weeklyTasks: [], dailyTasks: [], tasks: [], milestones: [], stages: [], costEntries: [], proposals: [], fundings: [],
    users: [{ id: 'alice', full_name: 'Alice' }, { id: 'bob', full_name: 'Bob' }] });
  await context.route('**/api/v1/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(/\/$/, '');
    let body = [];
    if (/\/auth\/.*(?:profile|me)$/.test(pathname)) body = profile;
    else if (pathname.endsWith('/dashboard/bootstrap')) body = { projects: bundle() };
    else if (pathname.endsWith('/weekly-tasks/review-workspace')) body = bundle();
    else if (pathname.endsWith('/projects/project/authority')) body = { project_id: 'project', can_manage_project: true, can_manage_wbs: true, can_assign_team: true, can_manage_weekly_tasks: true };
    else if (pathname.endsWith('/projects/projects/project/authority')) body = { project_id: 'project', can_manage_project: true, can_manage_wbs: true, can_assign_team: true, can_manage_weekly_tasks: true };
    else if (pathname.endsWith('/projects/projects')) body = bundle().projects;
    else if (pathname.endsWith('/requests/meetings')) body = meetings;
    else if (pathname.endsWith('/requests')) body = { total: 0, rows: [] };
    else if (pathname.endsWith('/requests/team-members')) body = [];
    else if (pathname.endsWith('/executive-audit-report')) body = { fund_summary: { total_requested: 0, total_disbursed: 0, total_realization: 0, lpj_compliance_rate: 0 }, critical_transactions: [], adjustments: [], closed_periods_count: 0 };
    else if (pathname.endsWith('/sidebar-feed')) body = { notifications: [{ id: 'notice', category: 'MEETING_INVITATION', title: 'Undangan meeting koordinasi proyek', description: 'Undangan rapat untuk membahas rencana tim.', target_url: '/requests', formatted_time: '8 menit lalu', is_read: false }], activities: [], contacts: [] };
    else if (pathname.endsWith('/app-notifications')) body = { rows: [], next_cursor: null };
    else if (request.method() === 'DELETE' && pathname.includes('/task-assignments/')) {
      const id = pathname.split('/').pop();
      deletions.push(id);
      const index = assignments.findIndex(item => item.id === id);
      assert(index >= 0, 'Delete must target an existing assignment');
      assignments.splice(index, 1);
      body = { success: true };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body),
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return { context, page, errors, assignments, deletions };
}

async function assertLayout(page, label) {
  const result = await page.evaluate(() => {
    const main = document.querySelector('#main-content');
    const overflow = [...main.querySelectorAll('button, select, .workspace-kpis > *')]
      .filter(element => {
        const r = element.getBoundingClientRect();
        // Tabs and tables intentionally scroll inside their own wrappers.
        for (let parent = element.parentElement; parent && parent !== main; parent = parent.parentElement) {
          if (['auto', 'scroll', 'hidden'].includes(getComputedStyle(parent).overflowX)) return false;
        }
        return r.width && r.height && r.right > main.getBoundingClientRect().right + 1;
      }).map(element => element.textContent.trim().slice(0, 60));
    return { pageOverflow: document.documentElement.scrollWidth > innerWidth,
      mainOverflow: main.scrollWidth > main.clientWidth + 1, overflow };
  });
  assert.equal(result.pageOverflow, false, `${label}: page overflow`);
  assert.equal(result.mainOverflow, false, `${label}: workspace overflow`);
  assert.deepEqual(result.overflow, [], `${label}: controls must stay within workspace`);
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  let app, server, browser;
  try {
    if (!baseUrl) {
      const frontend = path.resolve(__dirname, '../../frontend-next');
      const next = require(path.join(frontend, 'node_modules/next'));
      process.chdir(frontend);
      app = next({ dev: true, dir: frontend, hostname: '127.0.0.1', port: 3015 });
      await app.prepare();
      server = http.createServer(app.getRequestHandler());
      await new Promise(resolve => server.listen(3015, '127.0.0.1', resolve));
      baseUrl = 'http://127.0.0.1:3015';
    }
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const { page, context, errors } = await createPage(browser);
    for (const width of [320, 390, 768, 1024, 1280, 1440, 1536, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${baseUrl}/requests`, { waitUntil: 'networkidle', timeout: 120000 });
      await page.getByText(meetings[0].request.title, { exact: true }).waitFor();
      await assertLayout(page, `Meeting ${width}`);
      const card = page.locator('.group.relative').filter({ hasText: meetings[0].request.title });
      const status = await card.getByText('TERJADWAL', { exact: true }).boundingBox();
      const remove = await card.getByRole('button', { name: `Hapus meeting ${meetings[0].request.title}` }).boundingBox();
      assert(status.y + status.height <= remove.y, `Meeting ${width}: status and delete overlap`);
      const finished = page.getByText('SELESAI', { exact: true });
      assert(await finished.evaluate(el => getComputedStyle(el).color !== getComputedStyle(el).backgroundColor), 'Completed status must be readable');
      if ([390, 768, 1440, 1920].includes(width)) await page.screenshot({ path: path.join(outputDir, `meeting-${width}.png`) });
      await page.getByRole('button', { name: 'Buka Notifikasi & Feed Tim' }).click();
      if (width < 1536) {
        const drawer = page.getByRole('dialog', { name: 'Notifikasi dan kontak tim' });
        await drawer.waitFor();
        await assertLayout(page, `Notifications ${width}`);
        await page.getByRole('button', { name: 'Tutup panel kanan', exact: true }).click();
        await drawer.waitFor({ state: 'detached' });
      } else {
        await page.getByRole('button', { name: 'Buka Notifikasi & Feed Tim' }).click();
      }
      await page.goto(`${baseUrl}/finance?tab=executive_report`, { waitUntil: 'networkidle', timeout: 120000 });
      await page.getByText('Executive Financial & Governance Audit Report', { exact: true }).waitFor();
      await page.getByText('0%', { exact: true }).waitFor();
      await assertLayout(page, `Finance ${width}`);
      if (width < 1280) {
        await page.getByRole('button', { name: 'Buka Menu', exact: true }).click();
        const menu = page.getByRole('dialog', { name: 'Menu Finance' });
        await menu.waitFor();
        await menu.getByRole('complementary').getByRole('button', { name: 'Tutup menu Finance', exact: true }).click();
      }
      if ([390, 768, 1440, 1920].includes(width)) await page.screenshot({ path: path.join(outputDir, `finance-${width}.png`) });
      await page.goto(`${baseUrl}/reporting?tab=executive`, { waitUntil: 'networkidle', timeout: 120000 });
      await page.getByText('Kinerja Finansial Seluruh Proyek', { exact: true }).waitFor();
      await assertLayout(page, `Reporting ${width}`);
      if ([390, 768, 1440, 1920].includes(width)) await page.screenshot({ path: path.join(outputDir, `reporting-${width}.png`) });
      console.log(`PASS: Meeting, Finance, Reporting and notifications at ${width}px`);
    }
    assert.deepEqual(errors, []);
    await context.close();
    const pm = await createPage(browser, 'ROLE-PM');
    await pm.page.goto(`${baseUrl}/projects?project=project&tab=TREE`, { waitUntil: 'networkidle', timeout: 120000 });
    await pm.page.getByRole('heading', { name: 'Main Task Dua Anggota', exact: true }).waitFor();
    const expand = pm.page.getByRole('button', { name: 'Buka paket kerja', exact: true });
    if (await expand.count()) await expand.click();
    await pm.page.getByRole('button', { name: 'Hapus penugasan Alice', exact: true }).click();
    await pm.page.getByRole('button', { name: 'Hapus penugasan Alice', exact: true }).waitFor({ state: 'detached' });
    await pm.page.getByRole('button', { name: 'Hapus penugasan Bob', exact: true }).waitFor();
    assert.deepEqual(pm.deletions, ['assign-alice']);
    assert.equal(pm.assignments.length, 1);
    await pm.page.getByRole('button', { name: 'Hapus penugasan Bob', exact: true }).click();
    await pm.page.getByRole('button', { name: 'Hapus penugasan Bob', exact: true }).waitFor({ state: 'detached' });
    assert.deepEqual(pm.deletions, ['assign-alice', 'assign-bob']);
    assert.deepEqual(pm.errors, []);
    await pm.context.close();
    console.log('PASS: remove one of multiple main-task assignees, preserve the other, then remove the last');
  } finally {
    if (browser) await browser.close();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (app) await app.close();
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
