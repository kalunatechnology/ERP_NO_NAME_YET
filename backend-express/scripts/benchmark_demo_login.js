/** Production demo-login benchmark. Login updates last_login_at; never print credentials or JWTs. */
const endpoint = process.env.Q10_LOGIN_URL;
const email = process.env.Q10_LOGIN_EMAIL || 'dummy.admin@example.com';
const password = process.env.Q10_DEMO_PASSWORD || 'DummyPass123!';

async function main() {
  if (!endpoint) throw new Error('Set Q10_LOGIN_URL explicitly before benchmarking a login.');
  const target = new URL(endpoint);
  const permittedRemote = target.origin === 'https://lavender-alligator-903719.hostingersite.com';
  const permittedLocal = ['localhost', '127.0.0.1'].includes(target.hostname);
  if ((!permittedRemote && !permittedLocal) || target.pathname !== '/api/v1/auth/token/') {
    throw new Error('Q10_LOGIN_URL must target the approved ERP login endpoint.');
  }
  const runs = Number(process.env.Q10_LOGIN_RUNS || 1);
  if (!Number.isInteger(runs) || runs < 1 || runs > 9) throw new Error('Q10_LOGIN_RUNS must be an integer from 1 to 9.');
  const samples = [];
  let accessToken = null;
  for (let index = 0; index < runs; index += 1) {
    const startedAt = performance.now();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://marka.arsalynk.com' },
      body: JSON.stringify({ email, username: email, password }),
      signal: AbortSignal.timeout(35_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) accessToken = payload.access || payload.data?.access || null;
    const elapsedMs = Math.round(performance.now() - startedAt);
    samples.push({
      status: response.status,
      elapsed_ms: elapsedMs,
      q10_under_3000ms: response.ok && elapsedMs < 3000,
      server_timing: response.headers.get('server-timing'),
      auth_role: response.ok ? payload.user?.active_role_code ?? null : null,
      error_code: response.ok ? null : payload.error ?? null,
    });
  }
  let profile = null;
  if (process.env.Q10_VERIFY_PROFILE === '1' && accessToken) {
    const profileStartedAt = performance.now();
    const profileResponse = await fetch(`${target.origin}/api/v1/auth/me/`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    const profilePayload = await profileResponse.json().catch(() => ({}));
    profile = {
      status: profileResponse.status,
      elapsed_ms: Math.round(performance.now() - profileStartedAt),
      super_admin: Boolean(profilePayload.user?.is_superuser),
      error_code: profileResponse.ok ? null : profilePayload.error ?? null,
    };
  }
  console.log(JSON.stringify({ runs, pass_count: samples.filter((sample) => sample.q10_under_3000ms).length, samples, profile }));
  if (samples.some((sample) => !sample.q10_under_3000ms) || (profile && (profile.status !== 200 || !profile.super_admin))) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ benchmark_error: error.name || 'NETWORK_ERROR' }));
  process.exitCode = 1;
});
