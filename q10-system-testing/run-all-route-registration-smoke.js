/**
 * Executes every inventoried HTTP method/path without credentials.
 * This is mutation-safe because the global authentication boundary must reject
 * protected routes before a handler can write. Public auth routes receive an
 * empty invalid payload. A 404/5xx proves a broken registration/runtime path.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend-express');
process.env.NODE_ENV = 'test';
process.env.TS_NODE_PROJECT = path.join(backend, 'tsconfig.json');
require(path.join(backend, 'node_modules', 'ts-node', 'register'));
const { createApp } = require(path.join(backend, 'src', 'app.ts'));

const inventoryPath = path.join(__dirname, 'ROUTE_INVENTORY.json');
const outputPath = path.join(__dirname, 'ALL_ROUTE_REGISTRATION_RESULTS.json');
const routes = JSON.parse(fs.readFileSync(inventoryPath, 'utf8')).routes;
const placeholder = '00000000-0000-0000-0000-000000000000';

async function main() {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const results = new Array(routes.length);
  let cursor = 0;
  async function worker() {
    while (cursor < routes.length) {
      const index = cursor++;
      const route = routes[index];
      const requestPath = route.path.replaceAll(':param', placeholder);
      const startedAt = performance.now();
      try {
        const response = await fetch(`${baseUrl}${requestPath}`, {
          method: route.method,
          headers: { 'content-type': 'application/json' },
          body: ['GET', 'HEAD'].includes(route.method) ? undefined : '{}',
          signal: AbortSignal.timeout(5000),
        });
        const elapsedMs = Math.round((performance.now() - startedAt) * 10) / 10;
        const passed = response.status !== 404 && response.status < 500;
        results[index] = { id: route.id, status: response.status, elapsed_ms: elapsedMs, result: passed ? 'PASS' : 'FAIL' };
        await response.arrayBuffer();
      } catch (error) {
        results[index] = { id: route.id, result: 'FAIL', error: error?.name || 'RequestError', message: error?.message || String(error) };
      }
    }
  }
  try {
    await Promise.all(Array.from({ length: 32 }, worker));
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
  const failed = results.filter((item) => item.result !== 'PASS');
  const summary = {
    executed_at: new Date().toISOString(),
    suite: 'All inventoried route registration and authentication-boundary smoke',
    status: failed.length ? 'FAIL' : 'PASS',
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    mutation_safety: 'No credentials supplied; protected mutations stop at authentication middleware.',
    results,
  };
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
  process.stdout.write(`${JSON.stringify({ ...summary, results: undefined, output: outputPath }, null, 2)}\n`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
