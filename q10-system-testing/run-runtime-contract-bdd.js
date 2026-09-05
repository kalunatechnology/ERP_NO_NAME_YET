/**
 * Q10 runtime contract BDD audit.
 *
 * Boots the actual Express application on an ephemeral port and validates the
 * runtime behaviour behind static findings. The runner is read-only with
 * respect to business records; successful logins may update last_login_at as
 * implemented by the application itself.
 */
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend-express');
process.env.TS_NODE_PROJECT = path.join(backend, 'tsconfig.json');
require(path.join(backend, 'node_modules', 'ts-node', 'register'));
const { createApp } = require(path.join(backend, 'src', 'app.ts'));
const prisma = require(path.join(backend, 'src', 'config', 'database.ts')).default;

const password = process.env.Q10_DEMO_PASSWORD || 'DummyPass123!';

/** Starts one isolated listener so the test exercises the real middleware stack. */
async function withServer(run) {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const port = server.address().port;
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    // Abort-driven scenarios can leave a keep-alive socket briefly open.
    // Force it closed so a failing route cannot block the audit teardown.
    server.closeAllConnections?.();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  }
}

/** Uses the same bearer-header contract expected by Express. */
async function request(baseUrl, route, options = {}, token) {
  const headers = new Headers(options.headers || {});
  headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  return fetch(`${baseUrl}${route}`, {
    ...options,
    headers,
    // A contract audit must classify a hung endpoint as a failure instead of
    // leaving the Express listener alive indefinitely.
    signal: options.signal || AbortSignal.timeout(15000),
  });
}

/** Logs in a canonical persona without printing tokens or passwords. */
async function login(baseUrl, email) {
  process.stdout.write(`LOGIN: ${email}\n`);
  let response;
  try {
    response = await request(baseUrl, '/api/v1/auth/token', {
      method: 'POST', body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    process.stdout.write(`LOGIN_RESULT: ${email} ${error.name || 'request failure'}\n`);
    return null;
  }
  const body = await response.json().catch(() => null);
  process.stdout.write(`LOGIN_RESULT: ${email} HTTP ${response.status}\n`);
  if (response.status !== 200 || !body?.access) return null;
  return body;
}

/** Records an observed violation without terminating later scenarios. */
function violation(violations, id, expected, observed, evidence) {
  violations.push({ id, expected, observed, evidence });
  process.stdout.write(`VIOLATION: ${id} — expected ${expected}; observed ${observed}\n`);
}

async function main() {
  const violations = [];
  const observations = [];
  await withServer(async (baseUrl) => {
    // Public self-registration is forbidden: stale signup API calls must stay
    // protected while the Next route redirects to the invitation/login flow.
    const signup = await request(baseUrl, '/api/v1/auth/signup', { method: 'POST', body: JSON.stringify({}) });
    observations.push({ id: 'Q10-RT-01', endpoint: 'POST /api/v1/auth/signup', status: signup.status });
    if (signup.status !== 401) {
      violation(violations, 'Q10-RT-01', 'public signup remains closed with HTTP 401', `HTTP ${signup.status}`, 'accounts are invitation/admin managed');
    }

    const finance = await login(baseUrl, 'arof.finance@arsalynk.com');
    if (!finance) {
      violation(violations, 'Q10-RT-03', 'runnable finance persona fixture', 'Finance demo login failed', 'runtime audit cannot validate Finance and Assets routes');
      return;
    }
    try {
      const anonymousPeriod = await request(baseUrl, '/api/v1/finance/fiscal-periods/status');
      const authenticatedPeriod = await request(baseUrl, '/api/v1/finance/fiscal-periods/status', {}, finance.access);
      observations.push({ id: 'Q10-RT-03', endpoint: 'GET /api/v1/finance/fiscal-periods/status', anonymous: anonymousPeriod.status, authenticated: authenticatedPeriod.status });
      if (anonymousPeriod.status !== 401 || authenticatedPeriod.status !== 200) violation(violations, 'Q10-RT-03', 'anonymous=401 and Finance=200', `anonymous=${anonymousPeriod.status}, authenticated=${authenticatedPeriod.status}`, 'Finance authorization contract');
    } catch (error) {
      violation(violations, 'Q10-RT-03', 'endpoint responds within 15 seconds', error.name || 'request failure', 'Finance fiscal-period status runtime check');
    }

    try {
      const anonymousAssets = await request(baseUrl, '/api/v1/assets/assets?page_size=1');
      const authenticatedAssets = await request(baseUrl, '/api/v1/assets/assets?page_size=1', {}, finance.access);
      observations.push({ id: 'Q10-RT-04', endpoint: 'GET /api/v1/assets/assets', anonymous: anonymousAssets.status, authenticated: authenticatedAssets.status });
      if (anonymousAssets.status !== 401 || authenticatedAssets.status !== 200) violation(violations, 'Q10-RT-04', 'anonymous=401 and authorized user=200', `anonymous=${anonymousAssets.status}, authenticated=${authenticatedAssets.status}`, 'Assets authorization contract');
    } catch (error) {
      violation(violations, 'Q10-RT-04', 'endpoint responds within 15 seconds', error.name || 'request failure', 'Assets runtime check');
    }
  });

  // Configuration scenarios do not require a live database.
  const fs = require('node:fs');
  const axios = fs.readFileSync(path.join(root, 'frontend-next', 'lib', 'api', 'axios.ts'), 'utf8');
  const nextConfig = fs.readFileSync(path.join(root, 'frontend-next', 'next.config.mjs'), 'utf8');
  const middleware = fs.readFileSync(path.join(root, 'frontend-next', 'middleware.tsx'), 'utf8');
  const authApi = fs.readFileSync(path.join(root, 'frontend-next', 'lib', 'api', 'auth.api.ts'), 'utf8');
  const crmApi = fs.readFileSync(path.join(root, 'frontend-next', 'lib', 'api', 'crm.api.ts'), 'utf8');
  const signupPage = fs.readFileSync(path.join(root, 'frontend-next', 'app', 'signup', 'page.tsx'), 'utf8');
  const periodWorkspace = fs.readFileSync(path.join(root, 'frontend-next', 'components', 'finance', 'PeriodClosingWorkspace.tsx'), 'utf8');
  const assetsWorkspace = fs.readFileSync(path.join(root, 'frontend-next', 'components', 'finance', 'FixedAssetsWorkspace.tsx'), 'utf8');
  if (/\/api\/v1\/auth\/signup/.test(authApi) || !/redirect\('\/login'\)/.test(signupPage)) violation(violations, 'Q10-RT-01-FE', 'invitation-only frontend with no signup API call', 'public signup contract remains exposed', 'auth.api.ts / signup page');
  if (/\/check-status\//.test(crmApi)) violation(violations, 'Q10-RT-02', 'no client call to an unimplemented service-case action', 'stale check-status call remains', 'crm.api.ts');
  if (/\bfetch\s*\(/.test(periodWorkspace) || !/from '@\/lib\/api\/axios'/.test(periodWorkspace)) violation(violations, 'Q10-RT-03-FE', 'Period Closing uses shared authenticated Axios client', 'native fetch or missing shared client', 'PeriodClosingWorkspace.tsx');
  if (/\bfetch\s*\(/.test(assetsWorkspace) || !/from '@\/lib\/api\/axios'/.test(assetsWorkspace)) violation(violations, 'Q10-RT-04-FE', 'Fixed Assets uses shared authenticated Axios client', 'native fetch or missing shared client', 'FixedAssetsWorkspace.tsx');
  if (/127\.0\.0\.1:8000/.test(axios) && /127\.0\.0\.1:8001/.test(nextConfig)) {
    violation(violations, 'Q10-RT-05', 'one default local backend origin', 'Axios=8000; Next rewrite=8001', 'configuration mismatch');
  }
  if (!/isPublicErrorPage/.test(middleware)) {
    violation(violations, 'Q10-RT-06', 'public error pages bypass authentication redirect', 'route exception absent', 'middleware.tsx');
  }

  console.log(JSON.stringify({
    status: violations.length ? 'CONTRACT_VIOLATIONS_FOUND' : 'PASS',
    observations,
    violations,
    next_action: violations.length ? 'Write an approved remediation scenario for each violation before changing FE or BE.' : 'Proceed to generated generic CRUD matrix.',
  }, null, 2));
  if (violations.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
