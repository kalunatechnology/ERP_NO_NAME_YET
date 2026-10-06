const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

async function main() {
  const frontend = path.resolve(__dirname, '../../frontend-next');
  const fixtureDir = path.join(frontend, 'app', 'request-auto-fixture');
  assert(!fs.existsSync(fixtureDir), 'Never overwrite an existing route');
  fs.mkdirSync(fixtureDir);
  fs.writeFileSync(path.join(fixtureDir, 'page.tsx'), `"use client";
import { Suspense, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
const Requests = dynamic(() => import("@/app/(app)/requests/RequestsClient"), { ssr: false });
const Review = dynamic(() => import("@/components/requests/RequestReviewModal").then(m=>m.RequestReviewModal), { ssr: false });
const Success = dynamic(() => import("@/components/requests/RequestSuccessModal").then(m=>m.RequestSuccessModal), { ssr: false });
function Surface(){const mode=useSearchParams().get("mode");const [closed,setClosed]=useState(false);
 if(mode==="review")return closed?<p>Meeting removed</p>:<Review isOpen onClose={()=>setClosed(true)} onActionComplete={()=>setClosed(true)} request={{id:"ticket-dashboard",request_type:"MEETING",title:"Dashboard meeting",status:"REGISTERED",tagged_users:[],approvals:[]}}/>;
 if(mode==="success")return <Success isOpen onClose={()=>{}} requestData={{request_type:"MEETING",title:"Created meeting",request_number:"QA-1"}}/>;
 return <Requests/>;}
export default function Fixture(){return <Suspense><Surface/></Suspense>;}`);
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
    let role = 'ROLE-STAFF', deletes = 0, creates = 0;
    const company = '10000000-0000-0000-0000-000000000099', actor = '20000000-0000-0000-0000-000000000099';
    const profile = () => ({ id: actor, email: 'request@qa.invalid', full_name: 'Fixture User', company_id: company, active_role_code: role,
      enabled_modules: ['REQUESTS'], delegated_modules: [], roles: [{ role_code: role, company_id: company }] });
    let meetings = ['1', '2'].map(id => ({ id: `meeting-${id}`, request_id: `ticket-${id}`, meeting_type: 'INTERNAL', recurrence_type: 'NON_RECURRING',
      recurrence_days: [1, 2, 3, 4, 5], start_at: '2026-10-06T02:00:00Z', end_at: '2026-10-06T03:00:00Z', timezone: 'Asia/Jakarta',
      status: 'SCHEDULED', request: { id: `ticket-${id}`, title: `Automatic meeting ${id}`, description: '', request_number: `QA-${id}`, priority: 'MEDIUM', status: 'REGISTERED' } }));
    const detail = row => ({ ...row, organizer_user_id: actor, notetaker_user_id: actor, notetaker: { id: actor, full_name: 'Fixture User', email: 'fixture@qa.invalid' },
      permissions: { can_edit_minutes: true, can_publish: false, can_delete: role === 'ROLE-PM' || role === 'ROLE-DIRECTOR' },
      selected_occurrence_date: '2026-10-06', notes: [{ occurrence_date: '2026-10-06', minutes_id: null, status: 'NOT_CREATED' }], participants: [], agenda: [], minutes: null });
    const token = `e30.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.fixture`;
    await page.context().addCookies([{ name: 'access_token', value: token, url: 'http://127.0.0.1:3013' }]);
    await page.addInitScript(({ token, company, user }) => { localStorage.setItem('erp.access', token); localStorage.setItem('erp.company', company); localStorage.setItem('erp.user', JSON.stringify(user)); }, { token, company, user: profile() });
    const calls = [];
    await page.route('**/api/v1/**', async route => {
      const request = route.request(), endpoint = new URL(request.url()).pathname;
      calls.push(`${request.method()} ${endpoint}`);
      const json = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      if (endpoint.includes('/auth/me')) return json(profile());
      if (endpoint.endsWith('/team-members')) return json([{ id: actor, name: 'Fixture User', email: 'fixture@qa.invalid', role: 'STAFF' }]);
      if (endpoint.endsWith('/requests/meetings') && request.method() === 'POST') {
        const body = request.postDataJSON(); assert.equal(body.is_draft, false); creates++;
        const row = { ...meetings[0], ...body, id: 'created', request_id: 'created-ticket', status: 'SCHEDULED',
          request: { ...meetings[0].request, id: 'created-ticket', title: body.title, status: 'REGISTERED' } };
        meetings.push(row); return json({ id: row.request_id, status: 'REGISTERED' });
      }
      if (endpoint.endsWith('/requests/meetings')) return json(meetings);
      if (request.method() === 'DELETE') {
        assert(role === 'ROLE-PM' || role === 'ROLE-DIRECTOR'); deletes++;
        meetings = meetings.filter(row => row.id !== endpoint.split('/').at(-1));
        return route.fulfill({ status: 204 });
      }
      if (/\/requests\/meetings\/[^/]+$/.test(endpoint)) return json(detail(meetings.find(row => row.id === endpoint.split('/').at(-1))));
      if (endpoint.endsWith('/requests')) return json({ success: true, data: { rows: [], total: 0 } });
      return json({ results: [] });
    });
    const origin = 'http://127.0.0.1:3013/request-auto-fixture';
    await page.goto(origin, { waitUntil: 'networkidle', timeout: 120000 });
    await page.getByText('Automatic meeting 1', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: /^Hapus/ }).count(), 0);
    await page.getByRole('button', { name: 'Meeting Baru', exact: true }).click();
    await page.getByLabel(/Meeting Type/).selectOption('NON_RECURRING');
    await page.getByLabel('Meeting Date', { exact: true }).fill('2026-10-06');
    await page.getByLabel(/^(Start Time|Jam Mulai)$/).fill('09:00');
    await page.getByLabel(/^(End Time|Jam Selesai)$/).fill('10:00');
    await page.getByLabel('Ticket Title', { exact: true }).fill('Created in browser');
    await page.getByRole('button', { name: 'Buat Meeting', exact: true }).click();
    await page.getByText('Created in browser', { exact: true }).waitFor(); assert.equal(creates, 1);
    role = 'ROLE-PM'; await page.evaluate(user => localStorage.setItem('erp.user', JSON.stringify(user)), profile());
    await page.reload({ waitUntil: 'networkidle' });
    const remove = page.getByRole('button', { name: 'Hapus meeting Automatic meeting 1', exact: true });
    await remove.waitFor();
    page.once('dialog', dialog => dialog.dismiss()); await remove.click(); assert.equal(deletes, 0);
    page.once('dialog', dialog => dialog.accept()); await remove.click();
    await page.getByText('Meeting berhasil dihapus.', { exact: true }).waitFor(); assert.equal(deletes, 1);
    assert.equal(await page.getByText('Automatic meeting 1', { exact: true }).count(), 0);
    role = 'ROLE-DIRECTOR'; await page.evaluate(user => localStorage.setItem('erp.user', JSON.stringify(user)), profile());
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('Automatic meeting 2', { exact: true }).click();
    await page.getByRole('button', { name: 'Hapus Meeting', exact: true }).waitFor();
    page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Hapus Meeting', exact: true }).click();
    await page.getByText('Meeting berhasil dihapus.', { exact: true }).waitFor(); assert.equal(deletes, 2);
    role = 'ROLE-STAFF'; await page.evaluate(user => localStorage.setItem('erp.user', JSON.stringify(user)), profile());
    await page.goto(`${origin}?mode=review`, { waitUntil: 'networkidle' });
    assert.equal(await page.getByRole('button', { name: 'Hapus Meeting', exact: true }).count(), 0);
    role = 'ROLE-PM'; await page.evaluate(user => localStorage.setItem('erp.user', JSON.stringify(user)), profile());
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Hapus Meeting', exact: true }).waitFor();
    page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Hapus Meeting', exact: true }).click();
    await page.getByText('Meeting removed', { exact: true }).waitFor(); assert.equal(deletes, 3);
    await page.goto(`${origin}?mode=success`, { waitUntil: 'networkidle' });
    await page.getByText('Meeting Created', { exact: true }).waitFor();
    await page.getByText('Scheduled', { exact: true }).waitFor();
    assert(!calls.some(call => /approve-exec|validate-om/.test(call)));
    assert.deepEqual(errors, []);
    console.log('PASS: real React browser fixture — automatic meeting creation, Staff permissions, PM cancel/confirm deletion, Executive deletion, dashboard deletion, and success status without approval.');
  } finally {
    if (browser) await browser.close();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (app) await app.close();
    fs.unlinkSync(path.join(fixtureDir, 'page.tsx')); fs.rmdirSync(fixtureDir);
    const generatedDir = path.join(frontend, '.next/types/app/request-auto-fixture'), generatedFile = path.join(generatedDir, 'page.ts');
    if (fs.existsSync(generatedFile)) fs.unlinkSync(generatedFile);
    if (fs.existsSync(generatedDir) && fs.readdirSync(generatedDir).length === 0) fs.rmdirSync(generatedDir);
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
