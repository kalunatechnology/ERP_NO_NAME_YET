const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

async function main() {
  const frontend = path.resolve(__dirname, '../../frontend-next');
  const fixtureDir = path.join(frontend, 'app', 'project-workspace-fixture');
  const fixtureFile = path.join(fixtureDir, 'page.tsx');
  assert(!fs.existsSync(fixtureDir), 'Never overwrite a real route');
  fs.mkdirSync(fixtureDir);
  fs.writeFileSync(fixtureFile, '"use client";\nimport { Suspense } from "react";\nimport dynamic from "next/dynamic";\nimport { useSearchParams } from "next/navigation";\nconst Sidebar = dynamic(() => import("@/components/layout/Sidebar").then(module => module.Sidebar), { ssr: false });\nconst ProjectsClient = dynamic(() => import("@/app/(app)/projects/ProjectsClient"), { ssr: false });\nconst TasksClient = dynamic(() => import("@/app/(app)/tasks/TasksClient"), { ssr: false });\nfunction Surface(){ return useSearchParams().get("surface") === "tasks" ? <TasksClient/> : <div className="flex"><Sidebar/><div className="min-w-0 flex-1"><ProjectsClient/></div></div>; }\nexport default function Fixture(){return <Suspense><Surface/></Suspense>;}');
  let app, server, browser;
  try {
    const { chromium } = require(path.join(process.env.MARBOT_TEST_RUNTIME_PACKAGES, 'playwright'));
    const next = require(path.join(frontend, 'node_modules/next'));
    process.chdir(frontend);
    app = next({ dev: true, dir: frontend, hostname: '127.0.0.1', port: 3012 });
    await app.prepare(); server = http.createServer(app.getRequestHandler());
    await new Promise(resolve => server.listen(3012, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let role = 'ROLE-PM', bootstraps = 0, edits = 0, deletes = 0, submissions = 0, reviews = 0, supervisorActive = true;
    const company = '10000000-0000-0000-0000-000000000099';
    const actorId = '20000000-0000-0000-0000-000000000099';
    const profile = () => ({ id: actorId, email: 'fixture@qa.invalid', full_name: 'Fixture User', company_id: company, active_role_code: role, enabled_modules: ['PROJECTS'], delegated_modules: role === 'ROLE-SUPERVISOR' ? ['PROJECTS'] : [], roles: [{ role_code: 'ROLE-STAFF', company_id: company }, { role_code: role, company_id: company }] });
    const projects = ['a', 'b', 'c'].map(id => ({ id, project_name: `Project ${id.toUpperCase()}`, project_code: id.toUpperCase(), customer_name: 'QA', manager_name: 'Fixture User', progress: 0, status: 'IN_PROGRESS' }));
    const mainTasks = ['a', 'b', 'c'].map(id => ({ id: `main-${id}`, project_id: id, name: `Main ${id}`, title: `Main ${id}`, weight: 100, status: 'PLANNED' }));
    const assignments = [{ id: 'other-first', main_task_id: 'main-b', assignee_id: 'other-user', assignee_name: 'Other User' }, ...['a', 'b', 'c'].map(id => ({ id: `assign-${id}`, main_task_id: `main-${id}`, assignee_id: actorId, assignee_name: 'Fixture User' }))];
    const weeklies = [{ id: 'week-a', main_task_id: 'main-a', assignee_id: actorId, week_number: 1, target_description: 'Approved weekly', start_date: '2026-10-05', end_date: '2026-10-11', status: 'PLANNED', progress: 0 }, { id: 'other-week-c', main_task_id: 'main-c', assignee_id: 'other-user', target_description: 'Other user weekly', status: 'PLANNED', progress: 0 }];
    let dailies = [{ id: 'daily-a', weekly_task_id: 'week-a', owner_id: actorId, title: 'Daily editable', time_slot: '09:00-10:00', planned_date: '2026-10-06', output_target: 'Report', output_result: '', notes: '', status: 'IN_PROGRESS', progress: 0 }];
    const bundle = () => ({ projects, mainTasks, assignments, weeklyTasks: weeklies, dailyTasks: dailies, tasks: [], milestones: [], stages: [], costEntries: [], proposals: [], fundings: [], users: [] });
    const token = `e30.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.fixture`;
    await page.context().addCookies([{ name: 'access_token', value: token, url: 'http://127.0.0.1:3012' }]);
    await page.addInitScript(({ token, company, user }) => { localStorage.setItem('erp.access', token); localStorage.setItem('erp.company', company); localStorage.setItem('erp.user', JSON.stringify(user)); }, { token, company, user: profile() });
    await page.route('**/api/v1/**', async route => {
      const request = route.request(), url = new URL(request.url()), endpoint = url.pathname;
      const json = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      if (endpoint.includes('/auth/me')) return json(profile());
      if (endpoint.includes('/dashboard/bootstrap')) {
        bootstraps++;
        if (role === 'ROLE-STAFF') assert.equal(url.searchParams.has('project_workspace'), false, 'Ordinary Staff must request personal project data');
        if (role === 'ROLE-SUPERVISOR') {
          if (url.searchParams.get('project_workspace') === 'management') {
            if (!supervisorActive) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ detail: 'No active supervision' }) });
            return json({ data: { projects: { ...bundle(), projects: projects.filter(p => p.id === 'a'), mainTasks: mainTasks.filter(m => m.project_id === 'a'), assignments: assignments.filter(a => a.main_task_id === 'main-a'), weeklyTasks: weeklies.filter(w => w.main_task_id === 'main-a') } } });
          }
          return json({ data: { projects: { ...bundle(), weeklyTasks: weeklies.filter(w => w.assignee_id === actorId) } } });
        }
        return json({ data: { projects: bundle() } });
      }
      if (endpoint.endsWith('/authority')) {
        const projectId = endpoint.split('/').at(-2);
        const manage = role === 'ROLE-PM' || (role === 'ROLE-SUPERVISOR' && supervisorActive && projectId === 'a');
        return json({ project_id: projectId, is_acting_project_manager: role === 'ROLE-SUPERVISOR' && manage, can_manage_project: manage, can_manage_wbs: manage, can_manage_weekly_tasks: manage, can_assign_team: false, can_view_financials: manage });
      }
      if (endpoint.endsWith('/supervisor')) return json(null);
      if (/\/weekly-tasks\/?$/.test(endpoint) && request.method() === 'POST') {
        submissions++; const body = request.postDataJSON();
        assert.equal(body.assignee, actorId);
        const row = { ...body, id: `submitted-${submissions}`, main_task_id: body.main_task, assignee_id: actorId, status: 'PENDING_APPROVAL', progress: 0 };
        weeklies.push(row); return json(row);
      }
      if (endpoint.endsWith('/review')) { reviews++; const row = weeklies.find(w => w.id === endpoint.split('/').at(-2)); row.status = request.postDataJSON().decision === 'APPROVE' ? 'PLANNED' : 'REJECTED'; return json(row); }
      if (endpoint.endsWith('/update-progress')) { edits++; const body = request.postDataJSON(); assert(!('owner_id' in body)); assert(!('weekly_task_id' in body)); dailies[0] = { ...dailies[0], ...body }; return json(dailies[0]); }
      if (/\/daily-tasks\/[^/]+\/?$/.test(endpoint) && request.method() === 'DELETE') { deletes++; dailies = []; return route.fulfill({ status: 204 }); }
      for (const [suffix, rows] of [['projects', projects], ['main-tasks', mainTasks], ['task-assignments', assignments], ['weekly-tasks', weeklies], ['daily-tasks', dailies]]) {
        if (endpoint === `/api/v1/projects/${suffix}/` || endpoint === `/api/v1/projects/${suffix}`) return json({ results: rows });
      }
      return json({ results: [] });
    });
    const origin = 'http://127.0.0.1:3012/project-workspace-fixture';
    await page.goto(`${origin}?project=a&tab=TREE`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.locator('#project-selector').selectOption('b');
    await page.waitForURL(/project=b/);
    await page.getByTitle('Segarkan data proyek').click();
    await page.getByTitle('Segarkan data proyek').waitFor();
    assert.equal(await page.locator('#project-selector').inputValue(), 'b');
    for (const [name, tab] of [['Workspace Personal Saya', 'WORKSPACE'], ['Transfer Requests', 'TRANSFERS'], ['Milestones & Gates', 'MILESTONES'], ['Biaya, Dana & Billing', 'FINANCIAL'], ['Hierarki Task', 'TREE']]) {
      await page.getByRole('button', { name: new RegExp(name) }).click();
      await page.waitForURL(new RegExp(`project=b.*tab=${tab}`));
      assert.equal(await page.locator('#project-selector').inputValue(), 'b');
    }
    const settledBootstraps = bootstraps;
    await page.getByRole('button', { name: /Milestones & Gates/ }).click();
    await page.waitForURL(/project=b.*tab=MILESTONES/);
    await page.waitForTimeout(150); assert.equal(bootstraps, settledBootstraps, 'Tab changes must not reload/reset project data');
    await page.reload({ waitUntil: 'networkidle' }); assert.equal(await page.locator('#project-selector').inputValue(), 'b');
    await page.locator('#project-selector').selectOption('a'); await page.waitForURL(/project=a/);
    await page.getByRole('button', { name: /Hierarki Task/ }).click(); await page.waitForURL(/tab=TREE/);
    role = 'ROLE-STAFF';
    await page.evaluate(user => localStorage.setItem('erp.user', JSON.stringify(user)), profile());
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('nav a[href="/projects"]').waitFor();
    await page.locator('#project-selector').selectOption('b'); await page.waitForURL(/project=b/);
    await page.getByRole('heading', { name: 'Main b', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Ajukan Target Mingguan' }).click();
    assert.equal(await page.getByRole('dialog').locator('select').inputValue(), actorId, 'Shared Main Task with another assignee first must still default to self');
    await page.keyboard.press('Escape');
    await page.locator('#project-selector').selectOption('a'); await page.waitForURL(/project=a/);
    await page.getByRole('button', { name: 'Ajukan Target Mingguan' }).click();
    const modal = page.getByRole('dialog');
    await modal.locator('textarea').fill('Staff proposed weekly');
    assert.equal(await modal.locator('select').inputValue(), actorId);
    assert(await modal.locator('select').isDisabled());
    await modal.getByRole('button', { name: 'Ajukan Target Mingguan' }).click();
    await page.getByText('Target mingguan diajukan dan menunggu approval PM.', { exact: true }).waitFor();
    assert.equal(submissions, 1);
    await page.getByRole('button', { name: 'Buka Semua' }).click();
    await page.getByRole('button', { name: /^(Daily Task|Tugas Harian)$/ }).first().waitFor();
    assert.equal(await page.getByRole('button', { name: /^(Daily Task|Tugas Harian)$/ }).count(), 1, 'Pending Weekly has no Daily create action');
    assert.equal(await page.getByRole('button', { name: 'Approve', exact: true }).count(), 0);
    role = 'ROLE-PM'; await page.evaluate(user => localStorage.setItem('erp.user', JSON.stringify(user)), profile());
    await page.reload({ waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'Buka Semua' }).click();
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await page.getByText('Weekly Task disetujui.', { exact: true }).waitFor(); assert.equal(reviews, 1);
    role = 'ROLE-SUPERVISOR'; await page.evaluate(user => localStorage.setItem('erp.user', JSON.stringify(user)), profile());
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('#project-selector option').count(), 3, 'Supervisor must receive personal projects as well as managed projects, deduplicated');
    await page.locator('#project-selector').selectOption('b'); await page.waitForURL(/project=b/);
    await page.getByRole('button', { name: 'Ajukan Target Mingguan' }).click();
    assert.equal(await modal.locator('select').inputValue(), actorId); assert(await modal.locator('select').isDisabled());
    await modal.locator('textarea').fill('Shared Main personal proposal');
    await modal.getByRole('button', { name: 'Ajukan Target Mingguan' }).click();
    await page.getByText('Target mingguan diajukan dan menunggu approval PM.', { exact: true }).waitFor();
    assert.equal(submissions, 2);
    assert.equal(await page.getByRole('button', { name: 'Tambah Main Task', exact: true }).count(), 0, 'Personal assignment cannot grant project management');
    await page.locator('#project-selector').selectOption('c'); await page.waitForURL(/project=c/);
    await page.getByRole('button', { name: 'Ajukan Target Mingguan' }).waitFor();
    assert.equal(await page.getByText('Other user weekly', { exact: true }).count(), 0);
    supervisorActive = false;
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Ajukan Target Mingguan' }).waitFor();
    assert.equal(await page.locator('#project-selector option').count(), 3, 'No management scope must not suppress personal assignment data');
    role = 'ROLE-PM'; await page.evaluate(user => localStorage.setItem('erp.user', JSON.stringify(user)), profile());
    await page.goto(`${origin}?surface=tasks`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^Semua \(/ }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTitle('Edit output & catatan').click();
    const editBounds = await page.getByRole('dialog').boundingBox();
    assert(editBounds.y >= 0 && editBounds.y + editBounds.height <= 844, 'Daily edit must fit the mobile viewport');
    await page.getByLabel('Aktivitas Harian', { exact: true }).fill('Edited in browser');
    await page.getByLabel('Tanggal', { exact: true }).fill('2026-10-07');
    await page.getByLabel('Slot Waktu', { exact: true }).fill('11:00-12:00');
    await page.getByRole('dialog').getByRole('button', { name: /Simpan/ }).click();
    await page.getByText('Task berhasil diperbarui.', { exact: true }).waitFor();
    assert.equal(edits, 1); assert.equal(dailies[0].title, 'Edited in browser'); assert.equal(dailies[0].weekly_task_id, 'week-a');
    page.once('dialog', dialog => dialog.dismiss()); await page.getByTitle(/^Hapus (Daily Task|Tugas Harian)$/).click(); assert.equal(deletes, 0);
    page.once('dialog', dialog => dialog.accept()); await page.getByTitle(/^Hapus (Daily Task|Tugas Harian)$/).click();
    await page.getByText(/^(Daily Task|Tugas Harian) dihapus\.$/).waitFor(); assert.equal(deletes, 1);
    assert.deepEqual(errors, []);
    console.log('PASS: real React clients/browser with intercepted API fixtures — shared Main assignment, personal+managed projects without duplicates, self PIC, pending gate, supervisor fallback/permissions, PM review, Daily edit/delete.');
  } finally {
    if (browser) await browser.close();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (app) await app.close();
    fs.unlinkSync(fixtureFile); fs.rmdirSync(fixtureDir);
    const generatedDir = path.join(frontend, '.next/types/app/project-workspace-fixture');
    const generatedFile = path.join(generatedDir, 'page.ts');
    if (fs.existsSync(generatedFile)) fs.unlinkSync(generatedFile);
    if (fs.existsSync(generatedDir) && fs.readdirSync(generatedDir).length === 0) fs.rmdirSync(generatedDir);
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
