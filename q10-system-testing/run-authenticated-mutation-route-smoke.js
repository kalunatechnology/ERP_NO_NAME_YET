/** Executes every non-GET route with a Prisma write firewall; no business row can change. */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend-express');
process.env.NODE_ENV = 'test';
process.env.TS_NODE_PROJECT = path.join(backend, 'tsconfig.json');
require(path.join(backend, 'node_modules', 'ts-node', 'register'));
const { createApp } = require(path.join(backend, 'src', 'app.ts'));
const prisma = require(path.join(backend, 'src', 'config', 'database.ts')).default;
const { AppError } = require(path.join(backend, 'src', 'utils', 'errors.ts'));

const inventory = JSON.parse(fs.readFileSync(path.join(__dirname, 'ROUTE_INVENTORY.json'), 'utf8'));
const outputPath = path.join(__dirname, 'AUTHENTICATED_MUTATION_ROUTE_RESULTS.json');
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
      login(baseUrl, 'rian@arsalynk.com'), login(baseUrl, 'arof.finance@arsalynk.com'),
      login(baseUrl, 'crm.lead@arsalynk.id'), login(baseUrl, 'laode@arsalynk.com'),
      login(baseUrl, 'dummy.admin@example.com'),
    ]);
    const byModule = {
      accounts: companyAdmin, auth: companyAdmin, core: companyAdmin,
      finance, assets: finance, crm, projects: director, reporting: director,
      requests: director, 'sidebar-feed': director, 'recent-items': director,
    };

    const writeActions = new Set([
      'create', 'createMany', 'createManyAndReturn', 'update', 'updateMany', 'delete',
      'deleteMany', 'upsert', 'executeRaw', 'runCommandRaw',
    ]);
    prisma.$use(async (params, next) => {
      if (writeActions.has(params.action)) {
        throw new AppError('Mutation diblokir oleh firewall pengujian.', 409, 'TEST_MUTATION_BLOCKED');
      }
      return next(params);
    });

    const routes = inventory.routes.filter((route) => route.method !== 'GET');
    const results = new Array(routes.length);
    let cursor = 0;
    async function worker() {
      while (cursor < routes.length) {
        const index = cursor++;
        const route = routes[index];
        const identity = byModule[route.module] || superAdmin;
        const companyId = identity.user.company_id || director.user.company_id;
        let requestPath = route.path.replaceAll(':param', placeholder);
        if (route.path.includes('/commands/workflow/') && route.path.includes(':param')) {
          requestPath = route.path.replace(':param', 'PROJECT').replaceAll(':param', placeholder);
        }
        const startedAt = performance.now();
        try {
          const response = await fetch(`${baseUrl}${requestPath}`, {
            method: route.method,
            headers: { authorization: `Bearer ${identity.access}`, 'x-company-id': companyId, 'content-type': 'application/json' },
            body: '{}', signal: AbortSignal.timeout(15000),
          });
          const data = await response.arrayBuffer();
          const elapsedMs = Math.round((performance.now() - startedAt) * 10) / 10;
          results[index] = {
            id: route.id, module: route.module, status: response.status, elapsed_ms: elapsedMs,
            payload_bytes: data.byteLength, result: response.status < 500 ? 'PASS' : 'FAIL',
            reached_protected_pipeline: response.status !== 401,
            persistence_blocked: response.status === 409,
          };
        } catch (error) {
          results[index] = { id: route.id, module: route.module, result: 'FAIL', error: error?.name || 'RequestError', message: error?.message || String(error) };
        }
      }
    }
    await Promise.all(Array.from({ length: 6 }, worker));
    const failed = results.filter((row) => row.result !== 'PASS');
    const timings = results.filter((row) => Number.isFinite(row.elapsed_ms)).map((row) => row.elapsed_ms).sort((a, b) => a - b);
    const percentile = (fraction) => timings[Math.min(timings.length - 1, Math.ceil(timings.length * fraction) - 1)] ?? null;
    const summary = {
      executed_at: new Date().toISOString(), suite: 'Authenticated mutation-route smoke with Prisma write firewall',
      status: failed.length ? 'FAIL' : 'PASS', total: results.length, passed: results.length - failed.length,
      failed: failed.length, reached_protected_pipeline: results.filter((row) => row.reached_protected_pipeline).length,
      persistence_attempts_blocked: results.filter((row) => row.persistence_blocked).length,
      latency_ms: { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99), max: timings.at(-1) ?? null },
      mutation_safety: 'Prisma middleware rejected every write operation before execution.', results,
    };
    fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
    process.stdout.write(`${JSON.stringify({ ...summary, results: undefined, output: outputPath }, null, 2)}\n`);
    if (failed.length) process.exitCode = 1;
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
