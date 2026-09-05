/**
 * Q11 generated Express–Next contract BDD matrix.
 *
 * Converts every frontend API call discovered from source into an explicit
 * scenario. Runtime requests deliberately omit credentials: protected routes
 * must reject before controllers or persistence can mutate business records.
 * Public auth routes receive invalid payloads only and must never resolve 404.
 */
const fs = require('node:fs');
const path = require('node:path');
const { backendRoutes, endpoint, frontendCalls, normalizePath } = require('./run-contract-audit');

const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend-express');
process.env.TS_NODE_PROJECT = path.join(backend, 'tsconfig.json');
require(path.join(backend, 'node_modules', 'ts-node', 'register'));
const { createApp } = require(path.join(backend, 'src', 'app.ts'));
const prisma = require(path.join(backend, 'src', 'config', 'database.ts')).default;
const outputJson = path.join(__dirname, 'Q11_CONTRACT_BDD_RESULTS.json');
const outputMd = path.join(__dirname, 'Q11_CONTRACT_BDD_CASES.md');

/** Resolves templates to harmless non-existent values so protected routes never mutate real records. */
function executablePath(route) {
  return route.replace(/:param/g, 'Q11-NONEXISTENT');
}

/** Public auth endpoints are allowed to answer validation/authentication errors but never a missing-route response. */
function isPublicCall(route) {
  return route === '/health' || route.startsWith('/api/v1/auth/token');
}

/** Emits a traceable Gherkin-style case list for all generated scenarios. */
function writeCases(cases) {
  const lines = [
    '# Q11 Generated Express–Next Contract BDD Cases',
    '',
    `Generated from ${cases.length} frontend HTTP call sites.`,
    '',
  ];
  for (const item of cases) {
    lines.push(`## Q11-CONTRACT-${String(item.id).padStart(3, '0')}: ${item.method} ${item.path}`);
    lines.push('');
    lines.push(`- **Given** the Express application is running and the caller has no bearer token.`);
    lines.push(`- **When** frontend call site \`${item.file}\` invokes \`${item.method} ${item.path}\`.`);
    lines.push(`- **Then** the backend route exists and ${item.public ? 'returns a non-404 authentication/validation response.' : 'rejects the request with HTTP 401 before any business mutation.'}`);
    lines.push('');
  }
  fs.writeFileSync(outputMd, lines.join('\n'));
}

/** Runs one safe anonymous call through real Express middleware. */
async function run() {
  const routes = backendRoutes();
  const supported = new Set(routes.map((item) => endpoint(item.method, item.path)));
  const calls = frontendCalls().map((call, index) => ({
    id: index + 1,
    method: call.method.toUpperCase(),
    path: normalizePath(call.path),
    file: path.relative(root, call.file),
    public: isPublicCall(normalizePath(call.path)),
  }));
  writeCases(calls);
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const results = [];
  try {
    for (const call of calls) {
      const key = endpoint(call.method, call.path);
      const staticMatch = supported.has(key);
      let status = null;
      let runtimeError = null;
      try {
        const options = { method: call.method, headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30_000) };
        if (['POST', 'PUT', 'PATCH'].includes(call.method)) options.body = '{}';
        const response = await fetch(`${baseUrl}${executablePath(call.path)}`, options);
        status = response.status;
      } catch (error) {
        runtimeError = `${error.name || 'Error'}: ${error.message || 'request failed'}`;
      }
      const runtimeMatch = runtimeError === null && (call.public ? status !== 404 : status === 401);
      const result = { ...call, static_match: staticMatch, runtime_status: status, runtime_error: runtimeError, result: staticMatch && runtimeMatch ? 'PASS' : 'FAIL' };
      results.push(result);
      process.stdout.write(`${result.result}: Q11-CONTRACT-${String(call.id).padStart(3, '0')} ${call.method} ${call.path} (${runtimeError || `HTTP ${status}`})\n`);
    }
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  }
  const failures = results.filter((item) => item.result !== 'PASS');
  const byMethod = Object.fromEntries([...new Set(results.map((item) => item.method))]
    .sort()
    .map((method) => [method, results.filter((item) => item.method === method).length]));
  const summary = {
    suite: 'Q11 Generated Express–Next Contract BDD',
    safety: 'All runtime scenarios omit bearer credentials. Protected calls must return 401 before controller/persistence execution; no business records are created, updated, or deleted.',
    total: results.length,
    by_method: byMethod,
    protected_calls: results.filter((item) => !item.public).length,
    public_calls: results.filter((item) => item.public).length,
    passed: results.length - failures.length,
    failed: failures.length,
    status: failures.length ? 'FAIL' : 'PASS',
    failures,
    results,
  };
  fs.writeFileSync(outputJson, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ status: summary.status, total: summary.total, passed: summary.passed, failed: summary.failed, results_file: outputJson, cases_file: outputMd }, null, 2));
  if (failures.length) process.exitCode = 2;
}

run().catch((error) => {
  fs.writeFileSync(outputJson, JSON.stringify({ status: 'RUNNER_ERROR', error: error.message, stack: error.stack }, null, 2));
  console.error(error);
  process.exitCode = 1;
});
