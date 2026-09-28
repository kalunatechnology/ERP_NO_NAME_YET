import assert from 'assert';
import { ForbiddenError, ValidationError, AppError } from '../src/utils/errors';
import { resolveMarbotTenantConfig } from '../src/modules/marbot/marbot.config';
import { MarbotTenantService } from '../src/modules/marbot/marbot-tenant.service';
import { MarbotControlPlaneClient } from '../src/modules/marbot/marbot-control-plane.client';
import { RoleCode } from '@prisma/client';
import { env } from '../src/config/env';

async function runMarbotTenantTests() {
  console.log('Running MarBot tenant & control plane unit test suite...');

  const originalEnv = { ...process.env };

  try {
    // --------------------------------------------------------------------------
    // 1. resolveMarbotTenantConfig lifecycle tests
    // --------------------------------------------------------------------------
    console.log('\n--- 1. Testing resolveMarbotTenantConfig lifecycle ---');

    // Case 1A: DB ACTIVE with full credentials -> returns DB config
    const mockDbActive = {
      marbot_tenant_config: {
        findUnique: async () => ({
          external_tenant_id: 'CORP_A',
          chatbot_url: 'https://chatbot.test.com',
          chatbot_api_key: 'key-123',
          inbound_context_secret: 'inbound-secret',
          outbound_tool_secret: 'outbound-secret',
          role_map_json: JSON.stringify({ DIRECTOR: 'EXECUTIVE' }),
          sync_status: 'ACTIVE',
          chatbot_tenant_id: 'cb-tenant-uuid-active',
          contract_version: 2,
          runtime_context_version: 2,
        }),
      },
      iam_company_module_access: { findMany: async () => [{ module_code: 'MARBOT' }] },
    };
    const activeCfg = await resolveMarbotTenantConfig('t-active', mockDbActive);
    assert.strictEqual(activeCfg.externalTenantId, 'CORP_A');
    assert.strictEqual(activeCfg.chatbotUrl, 'https://chatbot.test.com');
    assert.strictEqual(activeCfg.roleMap?.DIRECTOR, 'EXECUTIVE');
    assert.strictEqual(activeCfg.contractVersion, env.CHATBOT_CONTRACT_MODE === 'v2' ? 2 : 1);
    console.log('✓ Case 1A: DB ACTIVE with full credentials passed');

    // Case 1B: DB PROVISIONING without ENV fallback -> throws ForbiddenError
    delete process.env.MARBOT_TENANT_CONFIG_JSON;
    const mockDbProvisioning = {
      marbot_tenant_config: {
        findUnique: async () => ({
          external_tenant_id: 'CORP_B',
          chatbot_url: 'https://chatbot.test.com',
          chatbot_api_key: null,
          inbound_context_secret: null,
          outbound_tool_secret: null,
          role_map_json: null,
          sync_status: 'PROVISIONING',
        }),
      },
    };
    await assert.rejects(
      async () => resolveMarbotTenantConfig('t-prov', mockDbProvisioning),
      (err: any) => err instanceof ForbiddenError && err.message.includes('sedang dalam proses'),
      'PROVISIONING status must reject with ForbiddenError',
    );
    console.log('✓ Case 1B: DB PROVISIONING rejected passed');

    // Case 1C: DB ERROR without ENV fallback -> throws ForbiddenError
    const mockDbError = {
      marbot_tenant_config: {
        findUnique: async () => ({
          external_tenant_id: 'CORP_C',
          chatbot_url: 'https://chatbot.test.com',
          chatbot_api_key: null,
          inbound_context_secret: null,
          outbound_tool_secret: null,
          role_map_json: null,
          sync_status: 'ERROR',
        }),
      },
    };
    await assert.rejects(
      async () => resolveMarbotTenantConfig('t-err', mockDbError),
      (err: any) => err instanceof ForbiddenError && err.message.includes('mengalami kendala'),
      'ERROR status must reject with ForbiddenError',
    );
    console.log('✓ Case 1C: DB ERROR rejected passed');

    // Case 1D: DB unready/incomplete but ENV fallback available -> uses ENV
    process.env.MARBOT_TENANT_CONFIG_JSON = JSON.stringify({
      't-fallback': {
        externalTenantId: 'CORP_ENV',
        chatbotUrl: 'https://chatbot-env.test.com',
        chatbotApiKey: 'env-key',
        inboundContextSecret: 'env-inbound',
        outboundToolSecret: 'env-outbound',
      },
    });
    const fallbackCfg = await resolveMarbotTenantConfig('t-fallback', mockDbProvisioning);
    assert.strictEqual(fallbackCfg.externalTenantId, 'CORP_ENV');
    assert.strictEqual(fallbackCfg.chatbotUrl, 'https://chatbot-env.test.com');
    assert.strictEqual(fallbackCfg.contractVersion, 1, 'ENV fallback must stay on the legacy contract');
    console.log('✓ Case 1D: DB unready with valid ENV fallback passed');

    // Case 1E: DB row does not exist -> uses ENV fallback
    const mockDbNone = {
      marbot_tenant_config: {
        findUnique: async () => null,
      },
    };
    const envOnlyCfg = await resolveMarbotTenantConfig('t-fallback', mockDbNone);
    assert.strictEqual(envOnlyCfg.externalTenantId, 'CORP_ENV');
    console.log('✓ Case 1E: DB empty with valid ENV fallback passed');

    // Case 1F: DB row does not exist and no ENV -> rejects
    await assert.rejects(
      async () => resolveMarbotTenantConfig('t-unknown', mockDbNone),
      (err: any) => err instanceof ForbiddenError && err.message.includes('belum dikonfigurasi'),
      'Non-existent tenant must throw ForbiddenError',
    );
    console.log('✓ Case 1F: DB empty without ENV rejected passed');

    // --------------------------------------------------------------------------
    // 2. MarbotTenantService.getTenantIntegrationStatus tests
    // --------------------------------------------------------------------------
    console.log('\n--- 2. Testing getTenantIntegrationStatus ---');

    // Case 2A: MANAGED mode (has chatbot_tenant_id)
    const mockDbManaged = {
      marbot_tenant_config: {
        findUnique: async () => ({
          tenant_id: 't-managed',
          external_tenant_id: 'CORP_MANAGED',
          chatbot_url: 'https://chatbot.test.com',
          chatbot_api_key: 'sk_live_1234567890',
          chatbot_tenant_id: 'cb-tenant-uuid-1',
          active_key_id: 'key-id-1',
          inbound_context_secret: 'secret-in',
          outbound_tool_secret: 'secret-out',
          sync_status: 'ACTIVE',
          last_synced_at: new Date('2026-09-21T00:00:00Z'),
          last_sync_error: null,
          role_map_json: null,
          updated_at: new Date('2026-09-21T00:00:00Z'),
        }),
      },
    };
    const managedStatus = await MarbotTenantService.getTenantIntegrationStatus(
      't-managed',
      mockDbManaged,
    );
    assert.strictEqual(managedStatus.mode, 'MANAGED');
    assert.strictEqual(managedStatus.source, 'DATABASE');
    assert.strictEqual(managedStatus.configured, true);
    assert.strictEqual(managedStatus.chatbotTenantId, 'cb-tenant-uuid-1');
    assert.strictEqual(managedStatus.activeKeyId, 'key-id-1');
    assert.strictEqual(managedStatus.data?.chatbot_api_key_masked, '••••••••');
    assert.strictEqual(managedStatus.data?.inbound_context_secret_masked, '••••••••');
    console.log('✓ Case 2A: MANAGED mode status passed');

    // Case 2B: LEGACY mode in DB (no chatbot_tenant_id)
    const mockDbLegacy = {
      marbot_tenant_config: {
        findUnique: async () => ({
          tenant_id: 't-legacy',
          external_tenant_id: 'CORP_LEGACY',
          chatbot_url: 'https://chatbot.test.com',
          chatbot_api_key: 'manual-api-key',
          chatbot_tenant_id: null,
          active_key_id: null,
          inbound_context_secret: 'secret-in',
          outbound_tool_secret: 'secret-out',
          sync_status: 'ACTIVE',
          last_synced_at: null,
          last_sync_error: null,
          role_map_json: null,
          updated_at: new Date(),
        }),
      },
    };
    const legacyStatus = await MarbotTenantService.getTenantIntegrationStatus(
      't-legacy',
      mockDbLegacy,
    );
    assert.strictEqual(legacyStatus.mode, 'LEGACY');
    assert.strictEqual(legacyStatus.source, 'DATABASE');
    assert.strictEqual(legacyStatus.chatbotTenantId, null);
    console.log('✓ Case 2B: LEGACY mode status passed');

    // Case 2C: UNCONFIGURED mode
    delete process.env.MARBOT_TENANT_CONFIG_JSON;
    const unconfiguredStatus = await MarbotTenantService.getTenantIntegrationStatus(
      't-none',
      mockDbNone,
    );
    assert.strictEqual(unconfiguredStatus.mode, 'UNCONFIGURED');
    assert.strictEqual(unconfiguredStatus.source, 'NONE');
    assert.strictEqual(unconfiguredStatus.configured, false);
    assert.strictEqual(unconfiguredStatus.data, null);
    console.log('✓ Case 2C: UNCONFIGURED mode status passed');

    // --------------------------------------------------------------------------
    // 3. MarbotTenantService.provisionTenant tests
    // --------------------------------------------------------------------------
    console.log('\n--- 3. Testing provisionTenant flow & guards ---');
    (env as any).CHATBOT_CONTRACT_MODE = 'v2';

    // Case 3A: Fail-closed when CHATBOT_SERVICE_URL or SECRET missing
    const unconfiguredClient = new MarbotControlPlaneClient('', '');
    await assert.rejects(
      async () =>
        MarbotTenantService.provisionTenant(
          't-1',
          { client: unconfiguredClient },
          mockDbNone,
        ),
      (err: any) => err instanceof ValidationError && err.message.includes('CHATBOT_SERVICE_URL'),
      'Unconfigured control plane client must throw ValidationError',
    );
    console.log('✓ Case 3A: Fail-closed client configuration guard passed');

    // Case 3B: LEGACY active tenant must NOT be auto-provisioned
    const mockClient = new MarbotControlPlaneClient(
      'https://chatbot-cp.test.com',
      'control-plane-secret-xyz',
    );
    const mockDbWithTenant = {
      ...mockDbLegacy,
      core_tenant: {
        findUnique: async () => ({ id: 't-legacy', code: 'LEGACY_CORP', name: 'Legacy Corp' }),
      },
    };
    await assert.rejects(
      async () =>
        MarbotTenantService.provisionTenant(
          't-legacy',
          { client: mockClient },
          mockDbWithTenant,
        ),
      (err: any) => err instanceof ValidationError && err.message.includes('legacy'),
      'Legacy active tenant must be protected from auto-provisioning',
    );
    console.log('✓ Case 3B: Legacy tenant protection passed');

    // Case 3C: Successful provisioning lifecycle with externalTenantId = tenant.code
    let createdRow: any = null;
    let updatedRow: any = null;
    const mockProvisionDb = {
      core_tenant: {
        findUnique: async () => ({ id: 't-new', code: 'ALPHA_CORP', name: 'Alpha Corp' }),
      },
      marbot_tenant_config: {
        findUnique: async () => createdRow,
        create: async ({ data }: any) => {
          createdRow = { ...data };
          return createdRow;
        },
        updateMany: async () => ({ count: 1 }),
        update: async ({ data }: any) => {
          updatedRow = { ...createdRow, ...data };
          createdRow = updatedRow;
          return updatedRow;
        },
      },
      iam_company_module_access: {
        findMany: async () => [{ module_code: 'MARBOT' }, { module_code: 'PROJECTS' }],
      },
    };

    let sentPayload: any = null;
    mockClient.provisionTenant = async (payload, idempotencyKey) => {
      sentPayload = payload;
      assert.strictEqual(idempotencyKey, 'erp:t-new:marbot:provision:v2');
      return {
        contractVersion: 2,
        tenant: { id: 'cb-alpha-id', externalTenantId: payload.externalTenantId, status: 'ACTIVE' },
        credentials: {
          apiKey: 'new-key-12345678', keyId: 'key-id-alpha',
          inboundContextSecret: 'inbound-sec', outboundToolSecret: 'outbound-sec',
        },
      };
    };

    const provResult = await MarbotTenantService.provisionTenant(
      't-new',
      { erpBaseUrl: 'https://erp.test.com', client: mockClient },
      mockProvisionDb,
    );

    assert.strictEqual(sentPayload.externalTenantId, 'ALPHA_CORP');
    assert.strictEqual(sentPayload.name, 'Alpha Corp');
    assert.strictEqual(sentPayload.contractVersion, 2);
    assert.strictEqual(sentPayload.erpBaseUrl, 'https://erp.test.com');
    assert.strictEqual(provResult.mode, 'MANAGED');
    assert.strictEqual(provResult.syncStatus, 'ACTIVE');
    assert.strictEqual(provResult.chatbotTenantId, 'cb-alpha-id');
    assert.strictEqual(provResult.activeKeyId, 'key-id-alpha');
    assert.strictEqual(updatedRow.sync_status, 'ACTIVE');
    assert.strictEqual(updatedRow.chatbot_api_key, 'new-key-12345678');
    console.log('✓ Case 3C: Successful provisioning lifecycle passed');

    // Case 3D: Error during outbound call transitions to ERROR and sanitizes message
    let errorStatusRow: any = null;
    mockProvisionDb.marbot_tenant_config.findUnique = async () => null;
    mockProvisionDb.marbot_tenant_config.update = async ({ data }: any) => {
      errorStatusRow = data;
      return data;
    };
    mockClient.provisionTenant = async () => {
      throw new AppError('Upstream network timeout on POST /tenants', 504);
    };

    await assert.rejects(
      async () =>
        MarbotTenantService.provisionTenant(
          't-fail',
          { client: mockClient },
          mockProvisionDb,
        ),
      (err: any) => err instanceof AppError && err.statusCode === 504,
      'Failed outbound call must propagate AppError',
    );
    assert.strictEqual(errorStatusRow.sync_status, 'ERROR');
    assert.strictEqual(errorStatusRow.last_sync_error, 'Upstream network timeout on POST /tenants');
    console.log('✓ Case 3D: Outbound call failure transition to ERROR passed');

    // --------------------------------------------------------------------------
    // 4. MarbotTenantService local disconnect test
    // --------------------------------------------------------------------------
    console.log('\n--- 4. Testing local disconnect ---');
    let deletedWhere: any = null;
    const mockDisconnectDb = {
      marbot_tenant_config: {
        deleteMany: async ({ where }: any) => {
          deletedWhere = where;
        },
      },
    };
    await MarbotTenantService.disconnectTenant('t-delete', mockDisconnectDb);
    assert.deepStrictEqual(deletedWhere, { tenant_id: 't-delete' });
    console.log('✓ Case 4: Local disconnect passed');

    console.log('\n======================================================');
    console.log('All MarBot tenant & control plane unit tests PASSED!');
    console.log('======================================================\n');
  } finally {
    process.env = originalEnv;
  }
}

runMarbotTenantTests().catch((err) => {
  console.error('Test suite failure:', err);
  process.exit(1);
});
