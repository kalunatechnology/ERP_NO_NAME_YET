const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

async function main() {
  const frontend = path.resolve(__dirname, '../../frontend-next');
  const fixtureDir = path.join(frontend, 'app', 'marbot-audit-fixture');
  const fixtureFile = path.join(fixtureDir, 'page.tsx');
  assert.ok(fixtureFile.startsWith(frontend + path.sep));
  assert.ok(!fs.existsSync(fixtureDir), 'Never overwrite an existing app route');
  fs.mkdirSync(fixtureDir);
  fs.writeFileSync(fixtureFile, '"use client";\nimport { useState, useEffect } from "react";\nimport { ChatbotDrawer } from "@/components/chatbot/ChatbotDrawer";\nexport default function Fixture() { const [version, setVersion] = useState(0); useEffect(() => { const change = () => setVersion(v => v + 1); window.addEventListener("marbot-audit-context", change); return () => window.removeEventListener("marbot-audit-context", change); }, []); return <ChatbotDrawer isOpen={true} onClose={() => {}} currentUser={{ id: "audit-fixture", companyName: "Audit fixture", authorityKey: String(version) }} />; }');
  let app, server, browser;
  const errors = [];
  try {
    const runtimePackages = process.env.MARBOT_TEST_RUNTIME_PACKAGES;
    if (!runtimePackages) throw new Error('Set MARBOT_TEST_RUNTIME_PACKAGES to the bundled Node packages directory.');
    const { chromium } = require(path.join(runtimePackages, 'playwright'));
    const next = require(path.join(frontend, 'node_modules/next'));
    process.chdir(frontend);
    app = next({ dev: true, dir: frontend, hostname: '127.0.0.1', port: 3011 });
    await app.prepare();
    server = http.createServer(app.getRequestHandler());
    await new Promise(resolve => server.listen(3011, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.context().addCookies([{ name: 'access_token', value: 'isolated-ui-fixture', url: 'http://127.0.0.1:3011' }]);
    page.on('pageerror', error => errors.push(error.message));
    let mode = 'long';
    let writes = 0;
    const id = 'b75d14c9-365c-49a8-b4c0-de618d827c25';
    const payload = { project_name: 'Fixture Project', customer_name: 'Fixture Customer', manager_name: 'Fixture Manager' };
    await page.route('**/api/v1/**', async route => {
      const request = route.request();
      const url = request.url();
      const json = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      if (url.endsWith('/marbot/status')) return json({ data: { online: true, contractMode: 'native', dashboardAvailable: true, mcpLiteReady: true } });
      if (url.endsWith('/marbot/conversations')) return json({ data: [] });
      if (url.endsWith('/marbot/chat/completions')) {
        if (mode === 'error') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Database fixture unavailable' } }) });
        await new Promise(resolve => setTimeout(resolve, 400));
        const content = mode === 'action' ? 'Usulan fixture. Belum disimpan.' : 'Hasil panjang\n\n' + '| Task | Keterangan |\n|---|---|\n' + Array.from({ length: 100 }, (_, i) => `| Task ${i} | ${'panjang'.repeat(35)} |`).join('\n');
        const done = { conversationId: id, ...(mode === 'action' ? { action: { kind: 'project.create', payload } } : {}) };
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: `data: ${JSON.stringify({ event: 'chunk', data: { delta: content } })}\n\ndata: ${JSON.stringify({ event: 'done', data: done })}\n\n` });
      }
      if (url.includes('/projects/projects/')) {
        if (request.method() === 'POST') writes++;
        return json({ id, ...payload, status: 'IN_PROGRESS' });
      }
      return json({ data: [] });
    });
    await page.goto('http://127.0.0.1:3011/marbot-audit-fixture', { waitUntil: 'networkidle', timeout: 120000 });
    const input = page.locator('input').first();
    await input.fill('tugas minggu ini');
    await input.press('Enter');
    await page.getByText('Sedang memproses...', { exact: true }).waitFor();
    await page.getByText('Hasil panjang', { exact: true }).waitFor();
    const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth, tableContainers: [...document.querySelectorAll('table')].map(t => getComputedStyle(t.parentElement).overflowX === 'auto') }));
    assert.ok(overflow.width <= overflow.viewport);
    assert.ok(overflow.tableContainers.some(Boolean));
    await page.screenshot({ path: path.resolve(__dirname, '../../docs/marbot/ui-mobile.png'), fullPage: true });
    mode = 'error';
    await input.fill('query error fixture'); await input.press('Enter');
    await page.getByText(/Database fixture unavailable/).waitFor();
    mode = 'action';
    await input.fill('buat proyek fixture'); await input.press('Enter');
    const confirm = page.getByRole('button', { name: 'Konfirmasi dan simpan' });
    await confirm.waitFor();
    assert.equal(writes, 0);
    page.once('dialog', d => d.dismiss()); await confirm.click();
    assert.equal(writes, 0);
    page.once('dialog', d => d.accept()); await confirm.click();
    await page.getByText(/Hasil tersimpan dan dibaca ulang/).waitFor();
    assert.equal(writes, 1);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForFunction(() => document.querySelector('[role="dialog"]').getBoundingClientRect().width <= 411);
    const bounds = await page.getByRole('dialog').boundingBox();
    assert.ok(bounds.width <= 411, 'Desktop drawer must retain its 410px width with long table content');
    const buttonInventory = await page.locator('button').evaluateAll(items => items.map(el => ({ label: el.getAttribute('aria-label'), text: el.textContent, x: el.getBoundingClientRect().x, width: el.getBoundingClientRect().width })));
    const closeGeometry = buttonInventory.find(item => /^(Close|Tutup)$/i.test(item.label || ''));
    assert.ok(closeGeometry, `Close must exist: ${JSON.stringify(buttonInventory)}`);
    assert.ok(closeGeometry.x + closeGeometry.width <= 1440, `Close control must stay inside viewport: ${JSON.stringify(closeGeometry)}`);
    await page.screenshot({ path: path.resolve(__dirname, '../../docs/marbot/ui-desktop.png'), fullPage: true });
    await page.evaluate(() => window.dispatchEvent(new Event('marbot-audit-context')));
    await page.waitForFunction(() => !document.querySelector('[role="log"]').textContent.includes('Usulan fixture'));
    mode = 'long';
    await input.fill('query pending before scope change'); await input.press('Enter');
    await page.getByText('Sedang memproses...', { exact: true }).waitFor();
    await page.evaluate(() => window.dispatchEvent(new Event('marbot-audit-context')));
    await page.waitForTimeout(600);
    assert.ok(!(await page.getByRole('log').textContent()).includes('Hasil panjang'));
    assert.deepEqual(errors, []);
    console.log('Browser UI passed: mobile/desktop long conversations, wide tables, loading/error, confirmation, verified fixture write, visible Close, and authority changes clearing history/cancelling stale responses.');
  } finally {
    if (browser) await browser.close();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (app) await app.close();
    fs.unlinkSync(fixtureFile);
    fs.rmdirSync(fixtureDir);
    const generatedDir = path.join(frontend, '.next/types/app/marbot-audit-fixture');
    const generatedFile = path.join(generatedDir, 'page.ts');
    assert.ok(generatedFile.startsWith(frontend + path.sep));
    if (fs.existsSync(generatedFile)) fs.unlinkSync(generatedFile);
    if (fs.existsSync(generatedDir) && fs.readdirSync(generatedDir).length === 0) fs.rmdirSync(generatedDir);
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
