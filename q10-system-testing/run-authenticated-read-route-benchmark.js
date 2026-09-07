/** Benchmarks every inventoried GET route through real auth, scope, and database middleware. */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend-express');
process.env.NODE_ENV = 'test';
process.env.TS_NODE_PROJECT = path.join(backend, 'tsconfig.json');
require(path.join(backend, 'node_modules', 'ts-node', 'register'));
const { createApp } = require(path.join(backend, 'src', 'app.ts'));
const prisma = require(path.join(backend, 'src', 'config', 'database.ts')).default;

const inventory = JSON.parse(fs.readFileSync(path.join(__dirname, 'ROUTE_INVENTORY.json'), 'utf8'));
const outputPath = path.join(__dirname, process.env.Q10_ROUTE_FILTER
  ? 'AUTHENTICATED_READ_ROUTE_BENCHMARK_FILTERED.json'
  : 'AUTHENTICATED_READ_ROUTE_BENCHMARK.json');
const placeholder = '00000000-0000-0000-0000-000000000000';
const password = process.env.Q10_DEMO_PASSWORD || 'DummyPass123!';

async function login(baseUrl, email) {
  const response = await fetch(`${baseUrl}/api/v1/auth/token`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(10000),
  });
  const body = await response.json();
  if (!response.ok || !body?.access) throw new Error(`${email}: login HTTP ${response.status}`);
  return body;
}

function percentile(sorted, fraction) {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] : null;
}

async function main() {
  await prisma.$connect();
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const [director, finance, crm, companyAdmin, superAdmin] = await Promise.all([
      login(baseUrl, 'rian@arsalynk.com'),
      login(baseUrl, 'arof.finance@arsalynk.com'),
      login(baseUrl, 'crm.lead@arsalynk.id'),
      login(baseUrl, 'laode@arsalynk.com'),
      login(baseUrl, 'dummy.admin@example.com'),
    ]);
    const byModule = {
      accounts: companyAdmin, auth: companyAdmin, core: companyAdmin,
      finance, assets: finance, crm,
      projects: director, reporting: director, requests: director,
      'sidebar-feed': director, 'recent-items': director, dashboard: director,
    };
    const routeFilter = process.env.Q10_ROUTE_FILTER ? new RegExp(process.env.Q10_ROUTE_FILTER) : null;
    const routes = inventory.routes.filter((route) => route.method === 'GET' && (!routeFilter || routeFilter.test(route.id)));
    const results = new Array(routes.length);
    let cursor = 0;
    async function worker() {
      while (cursor < routes.length) {
        const index = cursor++;
        const route = routes[index];
        let identity = byModule[route.module] || superAdmin;
        if (route.path === '/api/v1/core/companies/:param/modules') identity = superAdmin;
        const companyId = identity.user.company_id || director.user.company_id;
        let requestPath = route.path.replaceAll(':param', placeholder);
        if (route.path === '/api/v1/core/companies/:param/modules') {
          requestPath = `/api/v1/core/companies/${director.user.company_id}/modules`;
        } else if (route.path === '/api/v1/commands/workflow/transitions/:param/:param') {
          requestPath = `/api/v1/commands/workflow/transitions/PROJECT/${placeholder}`;
        }
        const separator = requestPath.includes('?') ? '&' : '?';
        const url = `${baseUrl}${requestPath}${separator}page=1&page_size=1`;
        const startedAt = performance.now();
        try {
          const response = await fetch(url, {
            headers: { authorization: `Bearer ${identity.access}`, 'x-company-id': companyId },
            signal: AbortSignal.timeout(15000),
          });
          const data = await response.arrayBuffer();
          const elapsedMs = Math.round((performance.now() - startedAt) * 10) / 10;
          results[index] = {
            id: route.id, module: route.module, status: response.status, elapsed_ms: elapsedMs,
            payload_bytes: data.byteLength,
            result: response.status < 500 ? 'PASS' : 'FAIL',
            reached_data_handler: response.status !== 401 && response.status !== 403,
          };
        } catch (error) {
          results[index] = { id: route.id, module: route.module, result: 'FAIL', error: error?.name || 'RequestError', message: error?.message || String(error) };
        }
      }
    }
    await Promise.all(Array.from({ length: 6 }, worker));
    const failures = results.filter((row) => row.result !== 'PASS');
    const handlerRows = results.filter((row) => row.reached_data_handler);
    const timings = handlerRows.map((row) => row.elapsed_ms).sort((a, b) => a - b);
    const modules = {};
    for (const row of results) {
      const item = modules[row.module] ||= { total: 0, passed: 0, reached_data_handler: 0, failed: 0 };
      item.total += 1;
      item[row.result === 'PASS' ? 'passed' : 'failed'] += 1;
      if (row.reached_data_handler) item.reached_data_handler += 1;
    }
    const summary = {
      executed_at: new Date().toISOString(), suite: 'Authenticated GET route benchmark',
      status: failures.length ? 'FAIL' : 'PASS', total: results.length,
      passed: results.length - failures.length, failed: failures.length,
      reached_data_handler: handlerRows.length,
      latency_ms: { p50: percentile(timings, 0.5), p95: percentile(timings, 0.95), p99: percentile(timings, 0.99), max: timings.at(-1) ?? null },
      modules, results,
    };
    fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
    process.stdout.write(`${JSON.stringify({ ...summary, results: undefined, output: outputPath }, null, 2)}\n`);
    if (failures.length) process.exitCode = 1;
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
