const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
require('ts-node/register/transpile-only');
const { weeklyPeriodCalendar } = require('../src/modules/projects/weekly-period');

async function main() {
  const frontend = path.resolve(__dirname, '../../frontend-next');
  const fixtureDir = path.join(frontend, 'app', 'weekly-management-fixture');
  const fixtureFile = path.join(fixtureDir, 'page.tsx');
  assert(!fs.existsSync(fixtureDir), 'Never overwrite a real route');
  fs.mkdirSync(fixtureDir);
  fs.writeFileSync(fixtureFile, '"use client";\nimport dynamic from "next/dynamic";\nconst TasksClient=dynamic(()=>import("@/app/(app)/tasks/TasksClient"),{ssr:false});\nexport default function Fixture(){return <main className="mx-auto max-w-[1500px] p-4 sm:p-8"><TasksClient/></main>;}');
  let app, server, browser;
  try {
    const { chromium } = require(path.join(process.env.MARBOT_TEST_RUNTIME_PACKAGES, 'playwright'));
    const next = require(path.join(frontend, 'node_modules/next'));
    process.chdir(frontend);
    app = next({ dev: true, dir: frontend, hostname: '127.0.0.1', port: 3014 });
    await app.prepare(); server = http.createServer(app.getRequestHandler());
    await new Promise(resolve => server.listen(3014, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const company = '10000000-0000-0000-0000-000000000099';
    const actor = '20000000-0000-0000-0000-000000000099';
    let activeRole = 'ROLE-PM';
    const user = { id: actor, email: 'fixture@qa.invalid', full_name: 'Ahmad Fixture', company_id: company, active_role_code: activeRole, enabled_modules: ['PROJECTS'], delegated_modules: [], roles: [{ role_code: 'ROLE-PM', company_id: company }, { role_code: 'ROLE-STAFF', company_id: company }] };
    const projects = [{ id: 'a', project_name: 'Portal Inventori', project_code: 'INV', status: 'IN_PROGRESS' }, { id: 'b', project_name: 'Implementasi ERP', project_code: 'ERP', status: 'IN_PROGRESS' }];
    const mains = [{ id: 'main-a', project_id: 'a', name: 'Modul Inventori', status: 'PLANNED' }, { id: 'main-b', project_id: 'b', name: 'Integrasi Data', status: 'PLANNED' }, { id: 'main-other', project_id: 'a', name: 'Main milik orang lain', status: 'PLANNED' }];
    const assignments = [{ id: 'assign-a', main_task_id: 'main-a', assignee_id: actor }, { id: 'assign-b', main_task_id: 'main-b', assignee_id: actor }, { id: 'assign-other', main_task_id: 'main-a', assignee_id: 'other-user', assignee_name: 'Rekan tim' }];
    let weekly = [
      { id: 'ready-a', main_task_id: 'main-a', assignee_id: actor, week_number: 1, target_description: 'Rancang alur penerimaan barang', start_date: '2026-10-05', end_date: '2099-10-11', status: 'PLANNED', progress: 0 },
      { id: 'active-b', main_task_id: 'main-b', assignee_id: actor, week_number: 2, target_description: 'Selesaikan integrasi data master', start_date: '2026-10-05', end_date: '2099-10-11', status: 'IN_PROGRESS', progress: 40 },
      { id: 'pending-a', created_by_id: 'other-user', main_task_id: 'main-a', assignee_id: actor, week_number: 2, target_description: 'Ajukan rancangan laporan stok', start_date: '2026-10-05', end_date: '2099-10-11', status: 'PENDING_APPROVAL', progress: 0 },
      { id: 'rejected-a', main_task_id: 'main-a', assignee_id: actor, week_number: 3, target_description: 'Revisi perencanaan opname', start_date: '2026-10-05', end_date: '2099-10-11', status: 'REJECTED', progress: 0 },
      { id: 'other', main_task_id: 'main-a', assignee_id: 'other-user', week_number: 1, target_description: 'TARGET RAHASIA REKAN', start_date: '2026-10-05', end_date: '2099-10-11', status: 'IN_PROGRESS', progress: 10 },
      { id: 'cross-month', main_task_id: 'main-a', assignee_id: actor, week_number: 42, target_description: 'Target lintas September Oktober', start_date: '2026-09-28', end_date: '2026-10-02', status: 'PLANNED', progress: 0 },
    ];
    const daily = [{ id: 'daily-a', weekly_task_id: 'ready-a', owner_id: actor, title: 'Validasi kebutuhan gudang', status: 'IN_PROGRESS', progress: 0, planned_date: '2026-10-09', output_target: 'Dokumen kebutuhan gudang' }];
    let failCreate = true, failCalendar = false, submitted = 0, lastPayload, edits = 0, reviews = 0, deletes = 0;
    const token = `e30.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.fixture`;
    await page.context().addCookies([{ name: 'access_token', value: token, url: 'http://127.0.0.1:3014' }]);
    await page.addInitScript(({ token, company, user }) => {
      localStorage.setItem('erp.access', token); localStorage.setItem('erp.company', company); localStorage.setItem('erp.user', JSON.stringify(user));
      const NativeDate = Date;
      const fixedDate = `${localStorage.getItem('qa.today') || '2026-10-09'}T05:00:00Z`;
      window.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [fixedDate])); }
        static now() { return new NativeDate(fixedDate).getTime(); }
      };
    }, { token, company, user });
    await page.route('**/api/v1/**', async route => {
      const request = route.request(), url = new URL(request.url()), endpoint = url.pathname;
      const json = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      if (endpoint.includes('/auth/me')) return json({ ...user, active_role_code: activeRole });
      if (endpoint.endsWith('/weekly-tasks/periods')) {
        if (failCalendar) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Kalender sementara tidak tersedia.' }) });
        return json(weeklyPeriodCalendar(url.searchParams.get('month') ?? undefined, url.searchParams.get('today') ?? undefined));
      }
      if (endpoint.endsWith('/authority')) { const id = endpoint.split('/').at(-2); const manage = activeRole === 'ROLE-PM' && id === 'a'; return json({ project_id: id, can_manage_weekly_tasks: manage, can_review_weekly_tasks: manage, can_manage_project: manage }); }
      if (endpoint.endsWith('/weekly-tasks/review-workspace')) return json({ projects: activeRole === 'ROLE-PM' ? projects.filter(project => project.id === 'a') : [], mainTasks: mains.filter(main => main.project_id === 'a'), weeklyTasks: weekly.filter(row => row.main_task_id !== 'main-b'), assignments: assignments.filter(row => row.main_task_id === 'main-a'), dailyTasks: daily, users: [{ id: actor, full_name: user.full_name }, { id: 'other-user', full_name: 'Rekan tim' }], tasks: [], milestones: [], stages: [], costEntries: [], proposals: [], fundings: [] });
      if (endpoint.endsWith('/review')) { reviews++; const row = weekly.find(row => row.id === endpoint.split('/').at(-2)); assert.equal(row.created_by_id === actor, false); row.status = request.postDataJSON().decision === 'APPROVE' ? 'PLANNED' : 'REJECTED'; return json(row); }
      if (/\/weekly-tasks\/[^/]+\/?$/.test(endpoint) && request.method() === 'PATCH') { edits++; const payload = request.postDataJSON(); assert.deepEqual(Object.keys(payload).sort(), ['end_date', 'start_date', 'target_description', 'week_number']); const row = weekly.find(row => row.id === endpoint.replace(/\/$/, '').split('/').at(-1)); Object.assign(row, payload); return json(row); }
      if (/\/weekly-tasks\/[^/]+\/?$/.test(endpoint) && request.method() === 'DELETE') { deletes++; const id = endpoint.replace(/\/$/, '').split('/').at(-1); weekly = weekly.filter(row => row.id !== id); return route.fulfill({ status: 204 }); }
      if (/\/weekly-tasks\/?$/.test(endpoint) && request.method() === 'POST') {
        submitted++; lastPayload = request.postDataJSON();
        assert.equal(lastPayload.assignee, actor);
        assert.equal(lastPayload.main_task, 'main-b');
        assert.equal(lastPayload.status, undefined); assert.equal(lastPayload.progress, undefined);
        if (failCreate) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ detail: 'Assignment sudah berubah. Silakan periksa kembali.' }) });
        const created = { ...lastPayload, id: 'new-weekly', created_by_id: actor, main_task_id: lastPayload.main_task, assignee_id: lastPayload.assignee, status: 'PENDING_APPROVAL', progress: 0 };
        weekly.push(created); return json(created);
      }
      if (endpoint.includes('/projects/projects')) return json({ results: projects, count: projects.length });
      if (endpoint.includes('/main-tasks')) return json({ results: mains, count: mains.length });
      if (endpoint.includes('/task-assignments')) {
        const current = Number(url.searchParams.get('page') || '1');
        return json({ results: assignments.slice(current - 1, current), count: assignments.length });
      }
      if (endpoint.includes('/weekly-tasks')) return json({ results: weekly, count: weekly.length });
      if (endpoint.includes('/daily-tasks')) return json({ results: daily, count: daily.length });
      if (endpoint.includes('/task-participants')) return json([{ id: actor, full_name: user.full_name }]);
      if (endpoint.includes('/sidebar-feed')) return json({ notifications: [], contacts: [], activities: [] });
      return json([]);
    });
    await page.goto('http://127.0.0.1:3014/weekly-management-fixture', { waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: 'Task Management' }).click();
    await page.getByRole('button', { name: 'Buat Weekly Target', exact: true }).waitFor();
    await page.getByLabel('Weekly dalam bulan').selectOption('1');
    assert.equal(await page.getByLabel('Bulan Weekly Target').inputValue(), '2026-10');
    assert.equal(await page.getByLabel('Weekly dalam bulan').locator('option').count(), 4);
    assert.match(await page.getByLabel('Rentang Weekly terpilih').textContent(), /5 Okt 2026.*9 Okt 2026/);
    assert.equal(await page.getByText('Target lintas September Oktober', { exact: false }).count(), 0);
    assert.equal(await page.getByText('TARGET RAHASIA REKAN').count(), 0);
    await page.getByRole('button', { name: 'Board', exact: true }).click();
    await page.getByRole('button', { name: 'Daftar', exact: true }).click();
    await page.getByLabel('Filter proyek Weekly Target').selectOption('b');
    await page.getByRole('button', { name: /^W#.*Selesaikan integrasi data master/ }).waitFor();
    assert.equal(await page.getByRole('button', { name: /^W#.*Rancang alur penerimaan barang/ }).count(), 0);
    await page.getByRole('button', { name: 'Reset filter' }).click();
    await page.getByLabel('Cari Weekly Target').fill('laporan stok');
    await page.getByRole('button', { name: /^W#.*Ajukan rancangan laporan stok/ }).waitFor();
    assert.equal(await page.getByRole('button', { name: /^W#.*Selesaikan integrasi data master/ }).count(), 0);
    await page.getByRole('button', { name: 'Reset filter' }).click();
    await page.getByLabel('Bulan Weekly Target').fill('2026-09');
    await page.getByRole('button', { name: /^W#.*Target lintas September Oktober/ }).waitFor({ state: 'hidden' });
    await page.getByLabel('Weekly dalam bulan').selectOption('4');
    await page.getByRole('button', { name: /^W#42.*Target lintas September Oktober/ }).waitFor();
    assert.match(await page.getByLabel('Rentang Weekly terpilih').textContent(), /28 Sep 2026.*2 Okt 2026/);
    assert.equal(await page.getByRole('button', { name: /^W#.*Rancang alur penerimaan barang/ }).count(), 0);
    await page.getByLabel('Bulan Weekly Target').fill('2026-08');
    await page.getByLabel('Weekly dalam bulan').selectOption('5');
    assert.match(await page.getByLabel('Rentang Weekly terpilih').textContent(), /31 Agu 2026.*4 Sep 2026/);
    await page.getByLabel('Bulan Weekly Target').fill('2026-10');
    await page.getByLabel('Weekly dalam bulan').selectOption('1');
    assert.equal(await page.getByLabel('Weekly dalam bulan').locator('option').count(), 4, 'Week 5 must reset when changing to a four-week month');
    assert.equal(await page.getByText('Target lintas September Oktober', { exact: false }).count(), 0);
    await page.getByRole('button', { name: 'Reset filter' }).click();

    await page.getByRole('button', { name: 'Buat Weekly Target', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Tutup', exact: true }).focus();
    await page.keyboard.press('Tab');
    assert(await dialog.getByLabel('Proyek Weekly Target').evaluate(element => element === document.activeElement), 'Tab must reach form controls inside the modal');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    assert(await dialog.getByRole('button', { name: 'Batal', exact: true }).evaluate(element => element === document.activeElement), 'Shift+Tab wraps inside modal when submit is disabled');
    await dialog.getByLabel('Proyek Weekly Target').selectOption('a');
    assert.equal(await dialog.getByLabel('Main Task Weekly Target').locator('option').count(), 2, 'Unassigned Main must be excluded');
    await dialog.getByLabel('Main Task Weekly Target').selectOption('main-a');
    await dialog.getByLabel('Proyek Weekly Target').selectOption('b');
    assert.equal(await dialog.getByLabel('Main Task Weekly Target').inputValue(), '', 'Changing project resets Main selection');
    await dialog.getByLabel('Main Task Weekly Target').selectOption('main-b');
    await dialog.getByLabel('Target pekerjaan mingguan').fill('Siapkan migrasi transaksi inventori');
    await dialog.getByRole('button', { name: 'Simpan Weekly Target' }).click();
    await dialog.getByRole('alert').filter({ hasText: 'Assignment sudah berubah' }).waitFor();
    assert.equal(await dialog.getByLabel('Target pekerjaan mingguan').inputValue(), 'Siapkan migrasi transaksi inventori');
    assert.equal(await page.getByRole('button', { name: /^W#.*Siapkan migrasi transaksi inventori/ }).count(), 0, 'Failed save cannot create a visible row');
    failCreate = false;
    await dialog.getByRole('button', { name: 'Simpan Weekly Target' }).click();
    await page.getByRole('button', { name: /^W#.*Siapkan migrasi transaksi inventori/ }).waitFor();
    assert.equal(submitted, 2);
    assert.equal(lastPayload.target_description, 'Siapkan migrasi transaksi inventori');
    await page.getByRole('button', { name: /^W#.*Siapkan migrasi transaksi inventori/ }).click();
    assert.equal(await page.getByRole('dialog').getByRole('button', { name: 'Buat Daily Task', exact: true }).count(), 0, 'Pending approval cannot create Daily');
    await page.getByRole('dialog').getByRole('button', { name: 'Tutup', exact: true }).click();
    await page.getByRole('button', { name: /^W#.*Rancang alur penerimaan barang/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Buat Daily Task', exact: true }).click();
    const dailyDialog = page.getByRole('dialog', { name: 'Buat Tugas Harian Baru' });
    assert.equal(await dailyDialog.locator('select').nth(0).inputValue(), 'a');
    assert.equal(await dailyDialog.locator('select').nth(1).inputValue(), 'ready-a');
    await dailyDialog.getByRole('button').first().click();
    await page.getByRole('button', { name: /^W#.*Rancang alur penerimaan barang/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Lihat Daily Task saya' }).click();
    assert.equal(await page.locator('#workspace-tab-daily').getAttribute('aria-selected'), 'true');
    await page.getByText('Validasi kebutuhan gudang', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Board', exact: true }).click();
    await page.getByLabel('Status Validasi kebutuhan gudang').selectOption('COMPLETED');
    await page.getByRole('dialog', { name: 'Edit Daily Task' }).waitFor();
    assert.equal(await page.locator('[data-daily-column="COMPLETED"] [data-daily-card="daily-a"]').count(), 0, 'Daily drop/status choice cannot commit before saving output');
    await page.getByRole('dialog', { name: 'Edit Daily Task' }).getByRole('button').first().click();
    await page.getByRole('tab', { name: 'Task Management' }).click();
    await page.getByRole('button', { name: 'Tim proyek', exact: true }).click();
    await page.getByText('TARGET RAHASIA REKAN', { exact: false }).first().waitFor();
    assert.equal(await page.getByLabel('Filter proyek Weekly Target').locator('option[value="b"]').count(), 0, 'PM team scope must exclude projects without authority');
    await page.getByRole('button', { name: /^W#.*Ajukan rancangan laporan stok/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Setujui target', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Konfirmasi keputusan' }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(reviews, 1);
    await page.getByRole('button', { name: /^W#.*Ajukan rancangan laporan stok/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Edit target', exact: true }).click();
    await page.getByLabel('Ubah target pekerjaan').fill('Rancangan laporan stok diperbarui');
    await page.getByRole('dialog').getByRole('button', { name: 'Simpan perubahan' }).click();
    await page.getByRole('dialog').getByText('Rancangan laporan stok diperbarui', { exact: true }).waitFor();
    assert.equal(edits, 1);
    const artifacts = path.resolve(frontend, '../.tmp/weekly-management-20261009');
    fs.mkdirSync(artifacts, { recursive: true });
    await page.waitForFunction(() => !document.querySelector('[role="status"]'), null, { timeout: 8000 });
    await page.screenshot({ path: path.join(artifacts, 'team-detail-desktop.png'), fullPage: true });
    await page.getByRole('dialog').getByRole('button', { name: 'Hapus target', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Ya, hapus target', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(deletes, 1);
    await page.getByRole('button', { name: 'Milik saya', exact: true }).click();
    await page.getByRole('button', { name: 'Board', exact: true }).click();
    await page.getByLabel('Urutkan Weekly Target').selectOption('title');
    await page.getByRole('button', { name: 'Daftar', exact: true }).click();

    await page.waitForFunction(() => !document.querySelector('[role="status"]'), null, { timeout: 8000 });
    await page.screenshot({ path: path.join(artifacts, 'table-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: 'Board', exact: true }).click();
    await page.screenshot({ path: path.join(artifacts, 'board-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Board must scroll inside its container on mobile');
    await page.screenshot({ path: path.join(artifacts, 'board-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Buat Weekly Target', exact: true }).click();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Creation form must fit mobile');
    await page.screenshot({ path: path.join(artifacts, 'create-mobile.png'), fullPage: true });
    await page.getByRole('dialog').getByRole('button', { name: 'Tutup', exact: true }).click();
    activeRole = 'ROLE-STAFF';
    await page.evaluate(user => localStorage.setItem('erp.user', JSON.stringify(user)), { ...user, active_role_code: activeRole });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: 'Task Management' }).click();
    assert.equal(await page.getByRole('button', { name: 'Tim proyek', exact: true }).count(), 0, 'Ordinary Staff never get team management');
    assert.equal(await page.getByText('TARGET RAHASIA REKAN').count(), 0);
    await page.getByRole('button', { name: 'Daftar', exact: true }).click();
    await page.getByRole('button', { name: /^W#.*Rancang alur penerimaan barang/ }).click();
    assert.equal(await page.getByRole('dialog').getByRole('button', { name: 'Edit target', exact: true }).count(), 0);
    assert.equal(await page.getByRole('dialog').getByRole('button', { name: 'Hapus target', exact: true }).count(), 0);
    assert.equal(await page.getByRole('dialog').getByRole('button', { name: 'Setujui target', exact: true }).count(), 0);
    await page.getByRole('dialog').getByRole('button', { name: 'Tutup', exact: true }).click();
    user.module_access = [{ module_code: 'PROJECTS', allow_read: true, allow_write: false }];
    await page.evaluate(user => localStorage.setItem('erp.user', JSON.stringify(user)), { ...user, active_role_code: activeRole });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: 'Task Management' }).click();
    assert(await page.getByRole('button', { name: 'Buat Weekly Target', exact: true }).isDisabled(), 'Read-only module override disables weekly creation');
    await page.locator('#workspace-tab-daily').click();
    await page.getByRole('button', { name: 'Board', exact: true }).click();
    assert(await page.getByLabel('Status Validasi kebutuhan gudang').isDisabled(), 'Read-only Daily board disables transitions');
    assert.equal(await page.locator('[data-daily-card="daily-a"]').getAttribute('draggable'), 'false');
    await page.evaluate(() => localStorage.setItem('qa.today', '2026-10-01'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: 'Task Management' }).click();
    await page.getByRole('button', { name: /^W#42.*Target lintas September Oktober/ }).waitFor();
    assert.equal(await page.getByLabel('Bulan Weekly Target').inputValue(), '2026-09', 'Early October defaults to September workweek identity');
    assert.equal(await page.getByLabel('Weekly dalam bulan').inputValue(), '4');
    await page.evaluate(() => localStorage.setItem('qa.today', '2027-01-01'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: 'Task Management' }).click();
    await page.getByLabel('Weekly dalam bulan').selectOption('4');
    assert.equal(await page.getByLabel('Bulan Weekly Target').inputValue(), '2026-12');
    assert.match(await page.getByLabel('Rentang Weekly terpilih').textContent(), /28 Des 2026.*1 Jan 2027/);
    failCalendar = true;
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: 'Task Management' }).click();
    await page.getByRole('alert').filter({ hasText: 'Kalender sementara tidak tersedia.' }).waitFor();
    assert.equal(await page.getByText('Tidak ada target yang sesuai filter', { exact: true }).count(), 0, 'Calendar failure must not look like an empty result');
    failCalendar = false;
    await page.getByRole('button', { name: 'Coba muat periode' }).click();
    await page.getByLabel('Weekly dalam bulan').selectOption('4');
    assert.deepEqual(errors, []);
    console.log('PASS: Weekly management browser — monthly workweek filtering, cross-month/year defaults, error recovery, project-based creation, existing Staff/PM workflows and desktop/mobile layout.');
    console.log(`Screenshots: ${artifacts}`);
  } finally {
    if (browser) await browser.close();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (app) await app.close();
    fs.unlinkSync(fixtureFile); fs.rmdirSync(fixtureDir);
    const generatedType = path.join(frontend, '.next/types/app/weekly-management-fixture/page.ts');
    if (fs.existsSync(generatedType)) fs.unlinkSync(generatedType);
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
