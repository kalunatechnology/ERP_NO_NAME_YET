const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

async function main() {
  const frontend = path.resolve(__dirname, '../../frontend-next');
  const fixtureDir = path.join(frontend, 'app/marbot-recovery-fixture');
  assert(!fs.existsSync(fixtureDir));
  fs.mkdirSync(fixtureDir);
  fs.writeFileSync(path.join(fixtureDir, 'page.tsx'), `"use client";
import dynamic from "next/dynamic";
const Chat = dynamic(() => import("@/components/chatbot/ChatbotDrawer"), { ssr: false });
export default function Fixture(){return <Chat isOpen onClose={()=>{}} currentUser={{id:"actor-qa",companyId:"company-qa",companyName:"QA",authorityKey:"staff-qa"}}/>;}`);
  let app, server, browser;
  try {
    const { chromium } = require(path.join(process.env.MARBOT_TEST_RUNTIME_PACKAGES, 'playwright'));
    const next = require(path.join(frontend, 'node_modules/next'));
    process.chdir(frontend);
    app = next({ dev: true, dir: frontend, hostname: '127.0.0.1', port: 3014 });
    await app.prepare(); server = http.createServer(app.getRequestHandler());
    await new Promise(resolve => server.listen(3014, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const page = await browser.newPage({ viewport: { width: 427, height: 952 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const token = `e30.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.fixture`;
    await page.context().addCookies([{ name: 'access_token', value: token, url: 'http://127.0.0.1:3014' }]);
    await page.addInitScript(token => { localStorage.setItem('erp.access', token); localStorage.setItem('erp.company', 'company-qa'); }, token);
    const bodies = []; let failure;
    const id = 'b75d14c9-365c-49a8-b4c0-de618d827c25';
    await page.route('**/api/v1/**', async route => {
      const endpoint = new URL(route.request().url()).pathname;
      const json = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      if (endpoint.endsWith('/marbot/status')) return json({ data: { online: true, contractMode: 'native', dashboardAvailable: false, mcpLiteReady: true } });
      if (endpoint.endsWith('/marbot/conversations')) return json({ data: [] });
      if (endpoint.endsWith('/marbot/chat/completions')) {
        bodies.push(route.request().postDataJSON());
        if (failure) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ success: false, error: failure.code, detail: failure.message }) });
        const content = `Jawaban QA ${bodies.length}`;
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: `data: ${JSON.stringify({ event: 'chunk', data: { delta: content } })}\n\ndata: ${JSON.stringify({ event: 'done', data: { conversationId: id, model: 'erp-native' } })}\n\n` });
      }
      return json({ data: [] });
    });
    await page.goto('http://127.0.0.1:3014/marbot-recovery-fixture', { waitUntil: 'networkidle', timeout: 120000 });
    await page.getByRole('button', { name: 'AI Helper', exact: true }).waitFor();
    const send = async (message, expected) => {
      await page.getByPlaceholder('Tanyakan panduan atau data ERP…').fill(message);
      await page.getByPlaceholder('Tanyakan panduan atau data ERP…').press('Enter');
      await page.getByRole('log').getByText(expected, { exact: false }).waitFor();
      await page.waitForLoadState('networkidle');
    };
    await send('hari ini saya memiliki berapa daily task', 'Jawaban QA 1');
    assert.equal(bodies[0].conversationId, undefined);
    failure = { code: 'MARBOT_CONVERSATION_UNAVAILABLE', message: 'Percakapan tidak tersedia untuk akun dan company aktif. Pesan berikutnya akan membuka chat baru.' };
    await send('seluruh daily task saya', failure.message);
    assert.equal(bodies[1].conversationId, id); assert.equal(bodies.length, 2, 'No automatic retry after 403');
    assert.equal(await page.getByText(/HTTP Error 403/).count(), 0);
    failure = undefined;
    await send('seluruh daily task saya ulang', 'Jawaban QA 3');
    assert.equal(bodies[2].conversationId, undefined, 'Next explicit send starts a new owned chat');
    failure = { code: 'FORBIDDEN', message: 'Anda tidak memiliki akses untuk data ini.' };
    await send('data terbatas', failure.message);
    failure = undefined;
    await send('pertanyaan baru', 'Jawaban QA 5');
    assert.equal(bodies[4].conversationId, id, 'Generic denial cannot be bypassed by clearing conversation');
    failure = { code: 'MARBOT_AUTHORITY_CHANGED', message: 'Hak akses berubah selama pemrosesan. Kirim ulang pertanyaan sesuai sesi aktif.' };
    await send('uji pencabutan', failure.message);
    assert.equal(await page.getByText('Jawaban QA 1', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Jawaban QA 5', { exact: true }).count(), 0);
    failure = undefined;
    await send('pertanyaan sesuai akses', 'Jawaban QA 7');
    assert.equal(bodies[6].conversationId, undefined);
    assert.equal(bodies[6].mode, 'HELPER');
    assert.deepEqual(errors, []);
    console.log('PASS: mobile 427x952 real ChatbotDrawer — backend detail shown; unavailable chat recovers on next explicit send; generic 403 preserves access denial; revoked authority clears old messages; no silent retry.');
  } finally {
    if (browser) await browser.close();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (app) await app.close();
    fs.unlinkSync(path.join(fixtureDir, 'page.tsx')); fs.rmdirSync(fixtureDir);
    const generatedDir = path.join(frontend, '.next/types/app/marbot-recovery-fixture');
    const generatedFile = path.join(generatedDir, 'page.ts');
    if (fs.existsSync(generatedFile)) fs.unlinkSync(generatedFile);
    if (fs.existsSync(generatedDir) && fs.readdirSync(generatedDir).length === 0) fs.rmdirSync(generatedDir);
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
