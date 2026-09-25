import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app';

async function assertAllowedOrigin(port: number, origin: string) {
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/auth/token/`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.match(response.headers.get('access-control-allow-methods') ?? '', /POST/);
}

async function main() {
  const server = createApp().listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;

    const allowedOrigins = [
      'https://markha.arsalynk.com',
      'https://markasuite.com',
      'https://www.markasuite.com',
      'https://app.markasuite.com',
      'https://app.markasuit.com',
    ];

    for (const origin of allowedOrigins) {
      await assertAllowedOrigin(port, origin);
    }

    const rejected = await fetch(`http://127.0.0.1:${port}/api/v1/auth/token/`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.markasuit.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    assert.equal(rejected.headers.get('access-control-allow-origin'), null);

    console.log('PASS: Arsalynk transition and Marka Suite production CORS origins are accepted before database middleware.');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
