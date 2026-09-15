import assert from 'assert';

async function main() {
  const base = (process.argv[2] || 'https://chatbot-arsalynk.vercel.app').replace(/\/+$/, '');
  const health = await fetch(`${base}/health`, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  assert.equal(health.status, 200, 'chatbot health endpoint must be available');
  assert.equal((await health.json() as { status: string }).status, 'ok');

  const specResponse = await fetch(`${base}/docs/openapi.json`, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  assert.equal(specResponse.status, 200, 'chatbot OpenAPI endpoint must be available');
  const spec = await specResponse.json() as { paths: Record<string, { post?: unknown }> };
  assert(spec.paths['/api/v1/chat/completions']?.post, 'chat completions POST contract is missing');

  const denied = await fetch(`${base}/api/v1/chat/completions`, {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'uji kontrak tanpa kredensial' }),
  });
  assert.equal(denied.status, 401, 'unauthenticated chat must be denied');
  console.log(JSON.stringify({ base, health: health.status, openapi: specResponse.status, unauthenticatedChat: denied.status }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
