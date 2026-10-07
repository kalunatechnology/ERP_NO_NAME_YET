const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

async function main() {
  const frontend = path.resolve(__dirname, '../../frontend-next');
  const fixtureDir = path.join(frontend, 'app', 'weekly-dashboard-fixture');
  const fixtureFile = path.join(fixtureDir, 'page.tsx');
  assert(!fs.existsSync(fixtureDir), 'Never overwrite a real route');
  fs.mkdirSync(fixtureDir);
  fs.writeFileSync(fixtureFile, `"use client";
import { useEffect, useState } from "react";
import { ExecutiveWeeklyTargetMonitor } from "@/components/executive/ExecutiveWeeklyTargetMonitor";
import { loadAllProjects, type Project } from "@/lib/api/project.api";
const weekly = [
  { id:"alice-current", main_task_id:"main", assignee_id:"alice", week_number:40, start_date:"2026-10-05", end_date:"2026-10-11", status:"IN_PROGRESS", progress:75, target_description:"Alice active week" },
  { id:"bob-current", main_task_id:"main", assignee_id:"bob", week_number:40, start_date:"2026-10-05", end_date:"2026-10-11", status:"PENDING_APPROVAL", progress:0, target_description:"Bob proposal" },
  { id:"alice-old", main_task_id:"main", assignee_id:"alice", week_number:39, start_date:"2026-09-28", end_date:"2026-10-04", status:"COMPLETED", progress:100, target_description:"Alice previous week" },
];
const daily = [
  { id:"daily-completed", weekly_task_id:"alice-current", owner_id:"alice", title:"Alice completed daily", status:"COMPLETED", progress:100, planned_date:"2026-10-06" },
  { id:"daily-partial", weekly_task_id:"alice-current", owner_id:"bob", title:"Transferred partial daily", status:"IN_PROGRESS", progress:50, planned_date:"2026-10-07" },
];
export default function Fixture() {
  const [projects,setProjects] = useState<Project[]>([]);
  async function refresh(deleted=false) {
    const bundle = { projects:[{id:"project", project_name:"QA Project",project_code:"QA"}],mainTasks:[{id:"main",project_id:"project",name:"QA Main",status:"PLANNED"}], assignments:[],weeklyTasks:weekly.map(w=>deleted&&w.id==="alice-current"?{...w,progress:0,status:"PLANNED"}:w), dailyTasks:deleted?[]:daily, tasks:[],milestones:[],stages:[],costEntries:[],proposals:[],fundings:[],users:[{id:"alice",full_name:"Alice"},{id:"bob",full_name:"Bob"}] };
    setProjects(await loadAllProjects(["PROJECTS"],bundle,{activeRoleCode:"ROLE-DIRECTOR"}));
  }
  useEffect(()=>{void refresh();},[]);
  return <><button onClick={()=>refresh(true)}>Simulate delete refresh</button><ExecutiveWeeklyTargetMonitor projects={projects}/></>;
}`);
  let app, server, browser;
  try {
    const { chromium } = require(path.join(process.env.MARBOT_TEST_RUNTIME_PACKAGES, 'playwright'));
    const next = require(path.join(frontend, 'node_modules/next'));
    process.chdir(frontend);
    app = next({ dev: true, dir: frontend, hostname: '127.0.0.1', port: 3013 });
    await app.prepare(); server = http.createServer(app.getRequestHandler());
    await new Promise(resolve => server.listen(3013, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const token = `e30.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.fixture`;
    await page.context().addCookies([{ name: 'access_token', value: token, url: 'http://127.0.0.1:3013' }]);
    await page.goto('http://127.0.0.1:3013/weekly-dashboard-fixture', { waitUntil: 'networkidle', timeout: 120000 });
    await page.getByRole('combobox').first().locator('option[value="alice"]').waitFor({ state: 'attached' });
    await page.getByLabel('Minggu aktif').fill('2026-10-07');
    await page.getByText('Alice active week', { exact: true }).waitFor();
    assert.equal(await page.getByText('Alice previous week', { exact: true }).count(), 0);
    assert.equal(await page.getByText('75%', { exact: true }).count(), 1, 'Partial daily rollup must match backend 75%, not completed count 50%');
    await page.getByRole('combobox').first().selectOption('alice');
    assert.equal(await page.getByText('Bob proposal', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Lihat Daily Task', exact: true }).click();
    await page.getByText('Transferred partial daily', { exact: true }).waitFor();
    const dailyRow = page.getByRole('row').filter({ hasText: 'Transferred partial daily' }).last();
    assert((await dailyRow.innerText()).includes('Bob')); assert((await dailyRow.innerText()).includes('50%'));
    await page.getByRole('combobox').first().selectOption('bob');
    await page.getByText('Bob proposal', { exact: true }).waitFor();
    assert.equal(await page.getByText('Alice active week', { exact: true }).count(), 0);
    await page.getByText('Menunggu Approval', { exact: true }).waitFor();
    await page.getByRole('combobox').first().selectOption('alice');
    await page.getByLabel('Minggu aktif').fill('2026-09-30');
    await page.getByText('Alice previous week', { exact: true }).waitFor();
    assert.equal(await page.getByText('Alice active week', { exact: true }).count(), 0);
    await page.getByLabel('Minggu aktif').fill('2026-10-07');
    await page.getByRole('button', { name: 'Simulate delete refresh' }).click();
    await page.getByText('Belum ada Daily Task.', { exact: true }).waitFor();
    assert.equal(await page.getByText('75%', { exact: true }).count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Table must scroll within its container on mobile');
    assert.deepEqual(errors, []);
    console.log('PASS: real browser + fixture data — API mapper partial progress, user/week filters, daily transfer owner, pending status, post-delete refresh and mobile width.');
  } finally {
    if (browser) await browser.close();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (app) await app.close();
    // Only the exact temporary files created above are removed, no recursive deletion.
    fs.unlinkSync(fixtureFile); fs.rmdirSync(fixtureDir);
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
