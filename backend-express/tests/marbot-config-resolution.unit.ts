import assert from 'assert';
import { CoreService } from '../src/modules/core/core.service';

async function testMarbotConfigResolution() {
  console.log('Testing MarBot config resolution fallback chain...');

  // Mock transaction object
  const mockTenantId = 'test-tenant-' + Date.now();
  const mockTenantCode = 'TEST_TENANT_CODE';

  // Test 1: Neither DB nor env configured -> throws ValidationError
  let errorCaught = false;
  try {
    await CoreService.resolveAndValidateMarbotConfig(mockTenantId, {
      marbot_tenant_config: {
        findUnique: async () => null,
      },
      core_tenant: {
        findUnique: async () => ({ code: mockTenantCode }),
      },
      marbot_request: {
        count: async () => 0,
      },
    });
  } catch (err: any) {
    errorCaught = true;
    assert.ok(
      err.message.includes('belum dikonfigurasi'),
      `Expected message about not configured, got: ${err.message}`
    );
  }
  assert.ok(errorCaught, 'Should throw when neither DB nor env is configured');
  console.log('✓ Rejection when unconfigured passed');

  // Test 2: DB configured with HTTPS -> passes validation
  let passedDb = false;
  try {
    await CoreService.resolveAndValidateMarbotConfig(mockTenantId, {
      marbot_tenant_config: {
        findUnique: async () => ({
          external_tenant_id: mockTenantCode,
          chatbot_url: 'https://chatbot.test.com',
          chatbot_api_key: 'test-api-key',
          inbound_context_secret: 'inbound-secret-1234',
          outbound_tool_secret: 'outbound-secret-5678',
        }),
      },
      core_tenant: {
        findUnique: async () => ({ code: mockTenantCode }),
      },
      marbot_request: {
        count: async () => 0,
      },
    });
    passedDb = true;
  } catch (err: any) {
    console.error('Unexpected error in DB config test:', err);
  }
  assert.ok(passedDb, 'DB configuration should successfully validate');
  console.log('✓ DB configuration resolution passed');

  // Test 3: Same inbound & outbound secret -> throws ValidationError
  let secretMatchError = false;
  try {
    await CoreService.resolveAndValidateMarbotConfig(mockTenantId, {
      marbot_tenant_config: {
        findUnique: async () => ({
          external_tenant_id: mockTenantCode,
          chatbot_url: 'https://chatbot.test.com',
          chatbot_api_key: 'test-api-key',
          inbound_context_secret: 'same-secret',
          outbound_tool_secret: 'same-secret',
        }),
      },
      core_tenant: {
        findUnique: async () => ({ code: mockTenantCode }),
      },
      marbot_request: {
        count: async () => 0,
      },
    });
  } catch (err: any) {
    secretMatchError = true;
    assert.ok(
      err.message.includes('harus berbeda'),
      `Expected error about different secrets, got: ${err.message}`
    );
  }
  assert.ok(secretMatchError, 'Should reject identical inbound and outbound secrets');
  console.log('✓ Secret separation validation passed');

  // Test 4: Insecure HTTP url -> throws ValidationError in production
  let httpError = false;
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await CoreService.resolveAndValidateMarbotConfig(mockTenantId, {
      marbot_tenant_config: {
        findUnique: async () => ({
          external_tenant_id: mockTenantCode,
          chatbot_url: 'http://insecure-chatbot.com',
          chatbot_api_key: 'test-api-key',
          inbound_context_secret: 'inbound-secret-1234',
          outbound_tool_secret: 'outbound-secret-5678',
        }),
      },
      core_tenant: {
        findUnique: async () => ({ code: mockTenantCode }),
      },
      marbot_request: {
        count: async () => 0,
      },
    });
  } catch (err: any) {
    httpError = true;
    assert.ok(
      err.message.includes('HTTPS'),
      `Expected HTTPS validation error, got: ${err.message}`
    );
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
  assert.ok(httpError, 'Should reject non-HTTPS URLs in production');
  console.log('✓ HTTPS protocol enforcement passed');

  console.log('\nAll MarBot config resolution unit tests PASSED successfully!');
}

testMarbotConfigResolution().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
