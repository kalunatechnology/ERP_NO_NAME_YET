/** End-to-end HTTP benchmark for login plus the initial Executive dashboard BFF. */
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend-express');
process.env.TS_NODE_PROJECT = path.join(backend, 'tsconfig.json');
require(path.join(backend, 'node_modules', 'ts-node', 'register'));

const { createApp } = require(path.join(backend, 'src', 'app.ts'));
const prisma = require(path.join(backend, 'src', 'config', 'database.ts')).default;
const budgetMs = 3000;

async function main() {
  await prisma.$connect();
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const startedAt = performance.now();
  try {
    const loginStartedAt = performance.now();
    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'rian@arsalynk.com', password: process.env.Q10_DEMO_PASSWORD || 'DummyPass123!' }),
    });
    const loginMs = Math.round(performance.now() - loginStartedAt);
    const login = await loginResponse.json();
    if (!loginResponse.ok) throw new Error(`Login failed with HTTP ${loginResponse.status}`);

    const dashboardStartedAt = performance.now();
    const headers = { authorization: `Bearer ${login.access}`, 'x-company-id': login.user.company_id };
    const requestStartedAt = performance.now();
    const requestPromise = fetch(`${baseUrl}/api/v1/requests?page_size=25`, { headers }).then(async (response) => ({
      status: response.status,
      elapsedMs: Math.round(performance.now() - requestStartedAt),
      body: await response.text(),
    }));
    const dashboardResponse = await fetch(`${baseUrl}/api/v1/dashboard/bootstrap?sections=projects,finance`, { headers });
    const dashboardText = await dashboardResponse.text();
    const dashboardMs = Math.round(performance.now() - dashboardStartedAt);
    const body = JSON.parse(dashboardText);
    const requestResult = await requestPromise;
    const totalMs = Math.round(performance.now() - startedAt);
    const cachedRequestStartedAt = performance.now();
    const cachedRequestResponse = await fetch(`${baseUrl}/api/v1/requests?page_size=25`, { headers });
    await cachedRequestResponse.text();
    const cachedRequestMs = Math.round(performance.now() - cachedRequestStartedAt);
    const cachedStartedAt = performance.now();
    const cachedResponse = await fetch(`${baseUrl}/api/v1/dashboard/bootstrap?sections=projects,finance`, { headers });
    await cachedResponse.arrayBuffer();
    const cachedDashboardMs = Math.round(performance.now() - cachedStartedAt);
    const evidence = {
      suite: 'Q10 Login to Dashboard HTTP Benchmark',
      status: dashboardResponse.ok && totalMs <= budgetMs ? 'PASS' : 'FAIL',
      budget_ms: budgetMs,
      login_ms: loginMs,
      dashboard_ms: dashboardMs,
      requests_ms: requestResult.elapsedMs,
      requests_status: requestResult.status,
      cached_requests_ms: cachedRequestMs,
      cached_requests_status: cachedRequestResponse.status,
      cached_requests_cache: cachedRequestResponse.headers.get('x-request-cache'),
      total_ms: totalMs,
      server_timing: dashboardResponse.headers.get('server-timing'),
      first_dashboard_cache: dashboardResponse.headers.get('x-dashboard-cache'),
      cached_dashboard_ms: cachedDashboardMs,
      cached_dashboard_status: cachedResponse.status,
      cached_dashboard_cache: cachedResponse.headers.get('x-dashboard-cache'),
      payload_bytes: Buffer.byteLength(dashboardText),
      project_count: body?.data?.projects?.projects?.length,
      finance_kpis_present: Boolean(body?.data?.finance?.view?.kpis),
      sections: body?.meta?.sections,
    };
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
    process.exitCode = evidence.status === 'PASS' ? 0 : 1;
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
