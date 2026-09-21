import assert from 'assert';
import { MarbotControlPlaneClient } from '../src/modules/marbot/marbot-control-plane.client';

const originalFetch = global.fetch;
let captured: any;
global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  captured = { url: String(url), init };
  return new Response(JSON.stringify({
    contractVersion: 2,
    tenant: { id: 'chat-1', externalTenantId: 'TENANT_A', status: 'ACTIVE' },
    credentials: { apiKey: 'key', keyId: 'kid', inboundContextSecret: 'in', outboundToolSecret: 'out' },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

async function run() {
  try {
    const client = new MarbotControlPlaneClient('https://chat.example', 'control-secret');
    const result = await client.provisionTenant({
      contractVersion: 2, externalTenantId: 'TENANT_A', name: 'Tenant A',
      erpBaseUrl: 'https://erp.example', allowedErpDomains: ['erp.example'],
      allowedInternalCidrs: [], credentialScopes: ['chat'], modules: [], dataSource: null,
    }, 'erp:tenant-a:marbot:provision:v2');
    assert.equal(captured.url, 'https://chat.example/api/v1/control-plane/tenants');
    assert.equal((captured.init.headers as Record<string, string>)['X-Idempotency-Key'], 'erp:tenant-a:marbot:provision:v2');
    assert.equal(result.contractVersion, 2);
    assert.equal(result.tenant.id, 'chat-1');
    console.log('MarBot control plane V2: passed');
  } finally { global.fetch = originalFetch; }
}
run().catch((error) => { console.error(error); process.exit(1); });
