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

    const calls: Array<{ url: string; method: string }> = [];
    global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      const method = init?.method || 'GET';
      calls.push({ url: target, method });
      let data: any;
      if (method === 'GET') {
        data = { id: 'chat-existing', externalTenantId: 'TENANT_A', status: 'ACTIVE' };
      } else if (target.endsWith('/rotate-keys')) {
        data = { keyId: 'kid-rotated', inboundContextKey: 'in-rotated', outboundToolKey: 'out-rotated' };
      } else if (target.endsWith('/rotate-credential')) {
        data = { newApiKey: 'api-rotated', scopes: ['chat'] };
      } else if (target.endsWith('/data-sources')) {
        data = { id: 'ds-1', sourceKey: 'ERP_MAIN', status: 'ACTIVE' };
      } else {
        data = { ok: true };
      }
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const adopted = await client.adoptExistingTenant({
      contractVersion: 2,
      externalTenantId: 'TENANT_A',
      name: 'Tenant A',
      erpBaseUrl: 'https://erp.example',
      allowedErpDomains: ['erp.example'],
      allowedInternalCidrs: [],
      credentialScopes: ['chat'],
      modules: [{ moduleCode: 'PROJECTS', enabled: true, allowedRoles: ['*'], permissions: ['READ_PROJECT'] }],
      dataSource: {
        sourceKey: 'ERP_MAIN', name: 'ERP', connectionUrl: 'postgresql://reader@db/erp',
        isolationMode: 'COLUMN', scopeColumn: 'company_id', scopeContextKey: 'companyId',
        schemaAllowlist: ['public'], tableAllowlist: ['ai_projects'], maxRows: 100,
        maxColumns: 30, maxResultBytes: 262144, statementTimeoutMs: 5000,
      },
    });
    assert.equal(adopted.tenant.id, 'chat-existing');
    assert.equal(adopted.credentials.apiKey, 'api-rotated');
    assert.equal(adopted.credentials.inboundContextSecret, 'in-rotated');
    assert.equal(adopted.dataSource?.status, 'ACTIVE');
    assert(calls.some((call) => call.url.endsWith('/modules') && call.method === 'PATCH'));
    assert(calls.some((call) => call.url.endsWith('/data-sources') && call.method === 'POST'));
    assert(calls.some((call) => call.url.endsWith('/rotate-keys') && call.method === 'POST'));
    assert(calls.some((call) => call.url.endsWith('/rotate-credential') && call.method === 'POST'));
    console.log('MarBot control plane V2: passed');
  } finally { global.fetch = originalFetch; }
}
run().catch((error) => { console.error(error); process.exit(1); });
