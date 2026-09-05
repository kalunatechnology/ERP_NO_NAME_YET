/**
 * Q10 login loading BDD.
 *
 * Boots the real Express application and verifies that canonical demo users
 * receive a complete authentication response within the agreed 15-second
 * loading budget. It records latency and identity metadata without printing
 * passwords or tokens. Login can update last_login_at by application design.
 */
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend-express');
process.env.TS_NODE_PROJECT = path.join(backend, 'tsconfig.json');
require(path.join(backend, 'node_modules', 'ts-node', 'register'));

const { createApp } = require(path.join(backend, 'src', 'app.ts'));
const prisma = require(path.join(backend, 'src', 'config', 'database.ts')).default;

const password = process.env.Q10_DEMO_PASSWORD || 'DummyPass123!';
const loginBudgetMs = 15000;
const personas = [
  { email: 'rian@arsalynk.com', expectedRole: 'ROLE-DIRECTOR' },
  { email: 'laode@arsalynk.com', expectedRole: 'ROLE-COMPANY-ADMIN' },
  { email: 'melika@arsalynk.com', expectedRole: 'ROLE-PM' },
  { email: 'arof@arsalynk.com', expectedRole: 'ROLE-PM' },
  { email: 'arof.finance@arsalynk.com', expectedRole: 'ROLE-FINANCE' },
  { email: 'crm.lead@arsalynk.id', expectedRole: 'ROLE-CRM-LEAD' },
  { email: 'admin.director@arsalynk.id', expectedRole: null },
  { email: 'dummy.admin@example.com', expectedRole: null, expectedSuperuser: true },
];

/** Starts the actual Express middleware stack on an ephemeral local port. */
async function startServer() {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

/**
 * Exercises the public token endpoint with an explicit loading deadline.
 * The response body is reduced to non-secret identity evidence.
 */
async function attemptLogin(baseUrl, persona) {
  const startedAt = performance.now();
  try {
    const response = await fetch(`${baseUrl}/api/v1/auth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: persona.email, password }),
      signal: AbortSignal.timeout(loginBudgetMs),
    });
    const elapsedMs = Math.round(performance.now() - startedAt);
    const body = await response.json().catch(() => null);
    const actualRole = body?.user?.active_role_code || null;
    const tokenShapeValid = typeof body?.access === 'string' && body.access.length > 20;
    const identityValid = typeof body?.user?.id === 'string' && typeof body?.user?.email === 'string';
    const roleValid = !persona.expectedRole || actualRole === persona.expectedRole;
    const superuserValid = persona.expectedSuperuser === undefined || Boolean(body?.user?.is_superuser) === persona.expectedSuperuser;
    const passed = response.status === 200 && elapsedMs <= loginBudgetMs && tokenShapeValid && identityValid && roleValid && superuserValid;
    return {
      email: persona.email,
      status: response.status,
      elapsed_ms: elapsedMs,
      within_15_seconds: elapsedMs <= loginBudgetMs,
      token_shape_valid: tokenShapeValid,
      identity_valid: identityValid,
      expected_role: persona.expectedRole,
      actual_role: actualRole,
      role_valid: roleValid,
      expected_superuser: persona.expectedSuperuser,
      actual_superuser: Boolean(body?.user?.is_superuser),
      result: passed ? 'PASS' : 'FAIL',
    };
  } catch (error) {
    return {
      email: persona.email,
      elapsed_ms: Math.round(performance.now() - startedAt),
      within_15_seconds: false,
      result: 'FAIL',
      error: error?.name || 'UnknownError',
      message: error?.message || 'Login request failed',
    };
  }
}

/** Runs positive personas plus negative credential behavior and prints JSON evidence. */
async function main() {
  const { server, baseUrl } = await startServer();
  const results = [];
  try {
    for (const persona of personas) {
      const result = await attemptLogin(baseUrl, persona);
      results.push(result);
      process.stdout.write(`${result.result}: ${persona.email} (${result.elapsed_ms} ms)\n`);
    }

    const invalidStartedAt = performance.now();
    const invalid = await fetch(`${baseUrl}/api/v1/auth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'rian@arsalynk.com', password: 'Q10-Definitely-Wrong' }),
      signal: AbortSignal.timeout(loginBudgetMs),
    });
    const invalidElapsedMs = Math.round(performance.now() - invalidStartedAt);
    const negativeResult = {
      scenario: 'invalid password is rejected',
      status: invalid.status,
      elapsed_ms: invalidElapsedMs,
      within_15_seconds: invalidElapsedMs <= loginBudgetMs,
      result: invalid.status === 401 && invalidElapsedMs <= loginBudgetMs ? 'PASS' : 'FAIL',
    };
    results.push(negativeResult);

    const failures = results.filter((item) => item.result !== 'PASS');
    console.log(JSON.stringify({
      suite: 'Q10 Login Loading BDD',
      loading_budget_ms: loginBudgetMs,
      status: failures.length ? 'FAIL' : 'PASS',
      passed: results.length - failures.length,
      failed: failures.length,
      results,
    }, null, 2));
    if (failures.length) process.exitCode = 2;
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
