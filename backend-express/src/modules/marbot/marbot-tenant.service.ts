import { randomUUID } from 'crypto';
import prisma from '../../config/database';
import { env } from '../../config/env';
import { AppError, ValidationError } from '../../utils/errors';
import {
  ChatbotProvisionTenantResponse,
  MarbotTenantConfig,
  TenantIntegrationStatus,
} from './marbot.types';
import { envTenantConfig, resolveMarbotTenantConfig } from './marbot.config';
import {
  MarbotControlPlaneClient,
  marbotControlPlaneClient,
} from './marbot-control-plane.client';

export class MarbotTenantService {
  /**
   * Asserts that a tenant is fully ready for MarBot operations by resolving its configuration.
   * Leverages resolveMarbotTenantConfig to ensure exact parity with runtime authentication.
   */
  static async assertTenantReady(
    tenantId: string,
    db: any = prisma,
  ): Promise<MarbotTenantConfig> {
    return resolveMarbotTenantConfig(tenantId, db);
  }

  /**
   * Retrieves the integration status for a tenant with secrets masked,
   * explicitly indicating whether the tenant is MANAGED, LEGACY, or UNCONFIGURED.
   */
  static async getTenantIntegrationStatus(
    tenantId: string,
    db: any = prisma,
  ): Promise<TenantIntegrationStatus> {
    const dbRow = await db.marbot_tenant_config.findUnique({
      where: { tenant_id: tenantId },
    });

    if (dbRow) {
      const mode: 'MANAGED' | 'LEGACY' = dbRow.chatbot_tenant_id ? 'MANAGED' : 'LEGACY';
      return {
        tenantId,
        configured: dbRow.sync_status === 'ACTIVE',
        source: 'DATABASE',
        syncStatus: dbRow.sync_status as any,
        mode,
        chatbotTenantId: dbRow.chatbot_tenant_id,
        activeKeyId: dbRow.active_key_id,
        lastSyncedAt: dbRow.last_synced_at,
        lastSyncError: dbRow.last_sync_error,
        data: {
          tenant_id: dbRow.tenant_id,
          external_tenant_id: dbRow.external_tenant_id,
          chatbot_url: dbRow.chatbot_url,
          chatbot_api_key_masked:
            '••••••••' + (dbRow.chatbot_api_key ? dbRow.chatbot_api_key.slice(-4) : ''),
          inbound_context_secret_masked: '••••••••',
          outbound_tool_secret_masked: '••••••••',
          role_map_json: dbRow.role_map_json,
          updated_at: dbRow.updated_at,
        },
      };
    }

    const envConfig = envTenantConfig(tenantId);
    if (envConfig) {
      return {
        tenantId,
        configured: true,
        source: 'ENV',
        syncStatus: 'ACTIVE',
        mode: 'LEGACY',
        chatbotTenantId: null,
        activeKeyId: null,
        lastSyncedAt: null,
        lastSyncError: null,
        data: {
          tenant_id: tenantId,
          external_tenant_id: envConfig.externalTenantId,
          chatbot_url: envConfig.chatbotUrl,
          chatbot_api_key_masked: '••••••••',
          inbound_context_secret_masked: '••••••••',
          outbound_tool_secret_masked: '••••••••',
          role_map_json: envConfig.roleMap ? JSON.stringify(envConfig.roleMap) : null,
          updated_at: null,
        },
      };
    }

    return {
      tenantId,
      configured: false,
      source: 'NONE',
      syncStatus: 'NOT_PROVISIONED',
      mode: 'UNCONFIGURED',
      chatbotTenantId: null,
      activeKeyId: null,
      lastSyncedAt: null,
      lastSyncError: null,
      data: null,
    };
  }

  /**
   * Provisions a tenant on the Chatbot system via the Control Plane.
   * Guarantees:
   * - Fail-closed configuration check prior to DB mutation.
   * - Atomic CAS transition to PROVISIONING with winner check.
   * - Outbound HTTP call strictly outside database transaction with 10s timeout.
   * - Sanitized error storage without secret leaks.
   * - Uses tenant.code as externalTenantId (never tenant.id).
   * - Refuses auto-provisioning for existing LEGACY tenants to prevent 409 conflict.
   */
  static async provisionTenant(
    tenantId: string,
    options: {
      erpBaseUrl?: string;
      adminUserId?: string;
      client?: MarbotControlPlaneClient;
    } = {},
    db: any = prisma,
  ): Promise<TenantIntegrationStatus> {
    const client = options.client || marbotControlPlaneClient;
    // 1. Fail-closed guard on configuration
    client.assertConfigured();

    const tenant = await db.core_tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, code: true, name: true },
    });
    if (!tenant) throw new ValidationError('Tenant tidak ditemukan.');

    const existing = await db.marbot_tenant_config.findUnique({
      where: { tenant_id: tenantId },
    });

    // 2. Prevent conflicting provisioning on legacy active tenants
    if (existing && existing.sync_status === 'ACTIVE' && !existing.chatbot_tenant_id) {
      throw new ValidationError(
        'Tenant ini menggunakan konfigurasi manual/legacy. Disconnect terlebih dahulu sebelum beralih ke managed provisioning.',
      );
    }

    if (existing && existing.sync_status === 'ACTIVE' && existing.chatbot_tenant_id) {
      throw new ValidationError('Tenant sudah aktif terintegrasi dengan MarBot.');
    }

    if (existing && existing.sync_status === 'PROVISIONING') {
      throw new ValidationError('Proses provisioning sedang berjalan untuk tenant ini.');
    }

    const chatbotUrl = (env.CHATBOT_SERVICE_URL || '').replace(/\/+$/, '');

    // 3. Atomic CAS state transition to PROVISIONING
    if (existing) {
      const claimed = await db.marbot_tenant_config.updateMany({
        where: {
          tenant_id: tenantId,
          sync_status: { in: ['NOT_PROVISIONED', 'ERROR'] },
        },
        data: {
          sync_status: 'PROVISIONING',
          last_sync_error: null,
          chatbot_url: chatbotUrl || existing.chatbot_url,
        },
      });
      if (claimed.count !== 1) {
        throw new ValidationError('Gagal mengklaim status provisioning (sedang diproses oleh sesi lain).');
      }
    } else {
      try {
        await db.marbot_tenant_config.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            external_tenant_id: tenant.code,
            chatbot_url: chatbotUrl,
            sync_status: 'PROVISIONING',
            created_by_id: options.adminUserId,
          },
        });
      } catch (err: any) {
        // If unique constraint violated, concurrent claim won
        throw new ValidationError('Gagal mengklaim status provisioning (sedang diproses oleh sesi lain).');
      }
    }

    // 4. Outbound call to Chatbot admin API (outside database transaction)
    const resolvedErpBaseUrl =
      (options.erpBaseUrl || env.ERP_BASE_URL || 'https://marka.arsalynk.com').replace(/\/+$/, '');

    let provisionRes: ChatbotProvisionTenantResponse;
    try {
      provisionRes = await client.provisionTenant({
        externalTenantId: tenant.code,
        tenantName: tenant.name,
        erpBaseUrl: resolvedErpBaseUrl,
      });
    } catch (provisionErr: any) {
      // Sanitize error before storing (do not store tokens, secrets, or headers)
      const sanitizedError = String(provisionErr?.message || 'Provisioning failed').slice(0, 500);
      await db.marbot_tenant_config.update({
        where: { tenant_id: tenantId },
        data: {
          sync_status: 'ERROR',
          last_sync_error: sanitizedError,
        },
      }).catch(() => undefined);
      throw provisionErr;
    }

    // 5. Persist credentials and transition to ACTIVE
    const saved = await db.marbot_tenant_config.update({
      where: { tenant_id: tenantId },
      data: {
        external_tenant_id: provisionRes.externalTenantId || tenant.code,
        chatbot_url: chatbotUrl,
        chatbot_api_key: provisionRes.apiKey.key,
        active_key_id: provisionRes.apiKey.keyId,
        chatbot_tenant_id: provisionRes.tenantId,
        inbound_context_secret: provisionRes.inboundContextSecret,
        outbound_tool_secret: provisionRes.outboundToolSecret,
        sync_status: 'ACTIVE',
        last_synced_at: new Date(),
        last_sync_error: null,
      },
    });

    return {
      tenantId,
      configured: true,
      source: 'DATABASE',
      syncStatus: 'ACTIVE',
      mode: 'MANAGED',
      chatbotTenantId: saved.chatbot_tenant_id,
      activeKeyId: saved.active_key_id,
      lastSyncedAt: saved.last_synced_at,
      lastSyncError: null,
      data: {
        tenant_id: saved.tenant_id,
        external_tenant_id: saved.external_tenant_id,
        chatbot_url: saved.chatbot_url,
        chatbot_api_key_masked:
          '••••••••' + (saved.chatbot_api_key ? saved.chatbot_api_key.slice(-4) : ''),
        inbound_context_secret_masked: '••••••••',
        outbound_tool_secret_masked: '••••••••',
        role_map_json: saved.role_map_json,
        updated_at: saved.updated_at,
      },
    };
  }

  /**
   * Saves manual legacy credentials for a tenant in the database.
   */
  static async saveLegacyConfig(
    tenantId: string,
    body: any,
    adminUserId?: string,
    db: any = prisma,
  ) {
    const tenant = await db.core_tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new ValidationError('Tenant tidak ditemukan.');

    const externalTenantId = (body.external_tenant_id || tenant.code).trim();
    const chatbotUrl = (body.chatbot_url || '').trim();
    let chatbotApiKey = (body.chatbot_api_key || '').trim();
    let inboundSecret = (body.inbound_context_secret || '').trim();
    let outboundSecret = (body.outbound_tool_secret || '').trim();
    const roleMapJson =
      body.role_map_json !== undefined
        ? typeof body.role_map_json === 'string'
          ? body.role_map_json
          : JSON.stringify(body.role_map_json)
        : null;

    if (!chatbotUrl) throw new ValidationError('URL chatbot wajib diisi.');
    try {
      const parsedUrl = new URL(chatbotUrl);
      if (
        parsedUrl.protocol !== 'https:' &&
        !(process.env.NODE_ENV !== 'production' && parsedUrl.hostname === 'localhost')
      ) {
        throw new ValidationError('URL chatbot harus menggunakan HTTPS.');
      }
    } catch (e: any) {
      throw new ValidationError(e.message || 'Format URL chatbot tidak valid.');
    }

    const existing = await db.marbot_tenant_config.findUnique({
      where: { tenant_id: tenantId },
    });

    if (
      (!chatbotApiKey || chatbotApiKey.includes('•••') || chatbotApiKey === '***CONFIGURED***') &&
      existing?.chatbot_api_key
    ) {
      chatbotApiKey = existing.chatbot_api_key;
    }
    if (
      (!inboundSecret || inboundSecret.includes('•••') || inboundSecret === '***CONFIGURED***') &&
      existing?.inbound_context_secret
    ) {
      inboundSecret = existing.inbound_context_secret;
    }
    if (
      (!outboundSecret || outboundSecret.includes('•••') || outboundSecret === '***CONFIGURED***') &&
      existing?.outbound_tool_secret
    ) {
      outboundSecret = existing.outbound_tool_secret;
    }

    if (!chatbotApiKey) throw new ValidationError('API Key chatbot wajib diisi.');
    if (!inboundSecret) throw new ValidationError('Inbound Context Secret wajib diisi.');
    if (!outboundSecret) throw new ValidationError('Outbound Tool Secret wajib diisi.');

    if (inboundSecret === outboundSecret) {
      throw new ValidationError('Kunci konteks dan kunci tool MarBot harus berbeda demi keamanan.');
    }

    const saved = await db.marbot_tenant_config.upsert({
      where: { tenant_id: tenantId },
      update: {
        external_tenant_id: externalTenantId,
        chatbot_url: chatbotUrl,
        chatbot_api_key: chatbotApiKey,
        inbound_context_secret: inboundSecret,
        outbound_tool_secret: outboundSecret,
        role_map_json: roleMapJson,
        sync_status: 'ACTIVE',
        last_synced_at: new Date(),
        last_sync_error: null,
        created_by_id: adminUserId,
      },
      create: {
        id: randomUUID(),
        tenant_id: tenantId,
        external_tenant_id: externalTenantId,
        chatbot_url: chatbotUrl,
        chatbot_api_key: chatbotApiKey,
        inbound_context_secret: inboundSecret,
        outbound_tool_secret: outboundSecret,
        role_map_json: roleMapJson,
        sync_status: 'ACTIVE',
        last_synced_at: new Date(),
        created_by_id: adminUserId,
      },
    });

    return saved;
  }

  /**
   * Local disconnect only. Removes the MarBot integration row from ERP database
   * without calling external chatbot endpoints.
   */
  static async disconnectTenant(tenantId: string, db: any = prisma): Promise<void> {
    await db.marbot_tenant_config.deleteMany({
      where: { tenant_id: tenantId },
    });
  }

  /**
   * Tests connectivity to the MarBot chatbot endpoint.
   * Preserves exact status code and statusText from the upstream server.
   */
  static async testConnectivity(
    tenantId: string,
    options: { chatbotUrl?: string; apiKey?: string } = {},
    db: any = prisma,
  ): Promise<{ reachable: boolean; status?: number; statusText?: string; message: string }> {
    let chatbotUrl = options.chatbotUrl;
    let apiKey = options.apiKey;

    if (!chatbotUrl || !apiKey || apiKey.includes('•••') || apiKey === '***CONFIGURED***') {
      const dbRow = await db.marbot_tenant_config.findUnique({ where: { tenant_id: tenantId } });
      if (dbRow) {
        chatbotUrl = chatbotUrl || dbRow.chatbot_url;
        if (!apiKey || apiKey.includes('•••') || apiKey === '***CONFIGURED***') {
          apiKey = dbRow.chatbot_api_key || undefined;
        }
      }
    }

    if (!chatbotUrl) {
      throw new ValidationError('URL endpoint chatbot belum ditentukan.');
    }

    const targetUrl = new URL(chatbotUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const resp = await fetch(targetUrl.toString(), {
        method: 'GET',
        signal: controller.signal,
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      });
      clearTimeout(timeout);
      return {
        reachable: true,
        status: resp.status,
        statusText: resp.statusText,
        message: `Endpoint chatbot merespon status ${resp.status} (${resp.statusText || 'OK'}).`,
      };
    } catch (networkErr: any) {
      clearTimeout(timeout);
      return {
        reachable: false,
        message: `Tidak dapat terhubung ke endpoint chatbot: ${networkErr.message || 'Connection refused/timed out'}.`,
      };
    }
  }
}
