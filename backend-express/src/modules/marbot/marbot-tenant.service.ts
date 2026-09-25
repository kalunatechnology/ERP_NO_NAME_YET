import { createHash, randomUUID } from 'crypto';
import prisma from '../../config/database';
import { env } from '../../config/env';
import { AppError, ValidationError } from '../../utils/errors';
import {
  ChatbotProvisionTenantResponse,
  ChatbotTenantModuleProvision,
  MarbotTenantConfig,
  TenantIntegrationStatus,
} from './marbot.types';
import { envTenantConfig, resolveMarbotTenantConfig } from './marbot.config';
import {
  MarbotControlPlaneClient,
  marbotControlPlaneClient,
} from './marbot-control-plane.client';
import { decryptMarbotSecret, encryptMarbotSecret, hasMarbotEncryptionKey } from './marbot-secret.service';

const MODULE_PERMISSION_CATALOG: Record<string, string[]> = {
  GENERAL: ['READ_GENERAL'],
  MARBOT: ['USE_MARBOT'],
  PROJECTS: ['READ_PROJECT', 'READ_TASK'],
  FINANCE: ['READ_PROJECT_FINANCE', 'READ_COMPANY_FINANCE', 'READ_FINANCE_SUMMARY'],
  CRM: ['READ_CRM_DEALS', 'READ_TICKET'],
};

async function tenantProvisionModules(tenantId: string, db: any): Promise<ChatbotTenantModuleProvision[]> {
  const rows = await db.iam_company_module_access.findMany({
    where: { tenant_id: tenantId, enabled: true, allow_read: true },
    select: { module_code: true },
  });
  const enabled = new Set<string>(['GENERAL', ...rows.map((row: any) => String(row.module_code))]);
  return [...enabled].sort().filter((code) => MODULE_PERMISSION_CATALOG[code]).map((moduleCode) => ({
    moduleCode,
    enabled: true,
    allowedRoles: ['*'],
    permissions: MODULE_PERMISSION_CATALOG[moduleCode],
  }));
}

function protectSecret(secret: string): string {
  if (hasMarbotEncryptionKey()) return encryptMarbotSecret(secret);
  if (env.NODE_ENV === 'production') {
    throw new ValidationError('MARBOT_ENCRYPTION_KEY wajib dikonfigurasi untuk managed provisioning.');
  }
  return secret;
}

function managedProvisioningBlockers(): string[] {
  const blockers: string[] = [];
  if (env.CHATBOT_CONTRACT_MODE !== 'v2') blockers.push('CHATBOT_CONTRACT_MODE=v2');
  if (!env.CHATBOT_SERVICE_URL) blockers.push('CHATBOT_SERVICE_URL');
  if (!env.CHATBOT_CONTROL_PLANE_SECRET) blockers.push('CHATBOT_CONTROL_PLANE_SECRET');
  if (!env.CHATBOT_ERP_READONLY_DATABASE_URL) blockers.push('CHATBOT_ERP_READONLY_DATABASE_URL');
  if (env.NODE_ENV === 'production' && !env.ERP_BASE_URL) blockers.push('ERP_BASE_URL');
  if (env.NODE_ENV === 'production' && !hasMarbotEncryptionKey()) blockers.push('MARBOT_ENCRYPTION_KEY');
  return blockers;
}

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
    const blockers = managedProvisioningBlockers();
    const dbRow = await db.marbot_tenant_config.findUnique({
      where: { tenant_id: tenantId },
    });

    if (dbRow) {
      const mode: 'MANAGED' | 'LEGACY' = dbRow.chatbot_tenant_id ? 'MANAGED' : 'LEGACY';
      const enabledModules = mode === 'MANAGED' && db.iam_company_module_access?.findMany
        ? (await tenantProvisionModules(tenantId, db)).map((item) => item.moduleCode)
        : undefined;
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
        contractVersion: mode === 'MANAGED' && env.CHATBOT_CONTRACT_MODE === 'v2'
          ? (dbRow.contract_version ?? 2)
          : 1,
        runtimeContextVersion: mode === 'MANAGED' && env.CHATBOT_CONTRACT_MODE === 'v2'
          ? (dbRow.runtime_context_version ?? 2)
          : 1,
        datasourceSourceKey: dbRow.datasource_source_key,
        datasourceStatus: dbRow.datasource_status,
        lastContractSyncAt: dbRow.last_contract_sync_at,
        enabledModules,
        managedProvisioningAvailable: blockers.length === 0,
        provisioningBlockers: blockers,
        data: {
          tenant_id: dbRow.tenant_id,
          external_tenant_id: dbRow.external_tenant_id,
          chatbot_url: dbRow.chatbot_url,
          chatbot_api_key_masked: dbRow.chatbot_api_key ? '••••••••' : '',
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
        contractVersion: 1,
        runtimeContextVersion: 1,
        managedProvisioningAvailable: blockers.length === 0,
        provisioningBlockers: blockers,
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
      contractVersion: null,
      runtimeContextVersion: null,
      managedProvisioningAvailable: blockers.length === 0,
      provisioningBlockers: blockers,
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
    if (env.CHATBOT_CONTRACT_MODE !== 'v2') {
      throw new ValidationError(
        'Managed provisioning membutuhkan CHATBOT_CONTRACT_MODE=v2. Service MarBot production saat ini menggunakan konfigurasi legacy/caller token.',
      );
    }
    // 1. Fail-closed guard on configuration
    client.assertConfigured();
    if (env.NODE_ENV === 'production' && !hasMarbotEncryptionKey()) {
      throw new ValidationError('MARBOT_ENCRYPTION_KEY wajib dikonfigurasi untuk managed provisioning.');
    }
    if (env.NODE_ENV === 'production' && !env.CHATBOT_ERP_READONLY_DATABASE_URL) {
      throw new ValidationError(
        'CHATBOT_ERP_READONLY_DATABASE_URL wajib dikonfigurasi agar MCP-Lite database aktif.',
      );
    }
    if (env.NODE_ENV === 'production' && !env.ERP_BASE_URL) {
      throw new ValidationError('ERP_BASE_URL wajib dikonfigurasi untuk managed provisioning production.');
    }

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

    if (existing && existing.sync_status === 'PROVISIONING') {
      throw new ValidationError('Proses provisioning sedang berjalan untuk tenant ini.');
    }

    const chatbotUrl = (env.CHATBOT_SERVICE_URL || '').replace(/\/+$/, '');
    const resolvedErpBaseUrl =
      (options.erpBaseUrl || env.ERP_BASE_URL || 'https://marka.arsalynk.com').replace(/\/+$/, '');
    const modules = await tenantProvisionModules(tenantId, db);
    let erpHostname: string;
    try {
      erpHostname = new URL(resolvedErpBaseUrl).hostname;
    } catch {
      throw new ValidationError('ERP_BASE_URL tidak valid.');
    }
    const dataSource = env.CHATBOT_ERP_READONLY_DATABASE_URL ? {
      sourceKey: 'ERP_MAIN',
      name: `${tenant.name} ERP Read Model`,
      connectionUrl: env.CHATBOT_ERP_READONLY_DATABASE_URL,
      isolationMode: 'COLUMN' as const,
      scopeColumn: 'company_id',
      scopeContextKey: 'companyId',
      schemaAllowlist: ['public'],
      tableAllowlist: ['ai_projects', 'ai_project_tasks', 'ai_project_finance_summary', 'ai_finance_summary', 'ai_crm_deals'],
      maxRows: 100,
      maxColumns: 30,
      maxResultBytes: 262144,
      statementTimeoutMs: 5000,
    } : null;
    const provisionPayload = {
      contractVersion: 2 as const,
      externalTenantId: tenant.code,
      name: tenant.name,
      erpBaseUrl: resolvedErpBaseUrl,
      allowedErpDomains: [erpHostname],
      allowedInternalCidrs: [],
      credentialScopes: ['chat', 'knowledge:read', 'jobs:read'],
      modules,
      dataSource,
    };
    const isManagedSync = Boolean(existing?.chatbot_tenant_id);
    const payloadHash = createHash('sha256').update(JSON.stringify(provisionPayload)).digest('hex').slice(0, 20);
    const operationId = isManagedSync
      ? `erp:${tenantId}:marbot:sync:v2:${payloadHash}`
      : existing?.provisioning_operation_id || `erp:${tenantId}:marbot:provision:v2`;

    // 3. Atomic CAS state transition to PROVISIONING
    if (existing) {
      const claimed = await db.marbot_tenant_config.updateMany({
        where: {
          tenant_id: tenantId,
          sync_status: { in: ['NOT_PROVISIONED', 'ERROR', 'SYNC_ERROR', 'ACTIVE'] },
        },
        data: {
          sync_status: 'PROVISIONING',
          last_sync_error: null,
          chatbot_url: chatbotUrl || existing.chatbot_url,
          provisioning_operation_id: operationId,
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
            provisioning_operation_id: operationId,
            contract_version: 2,
            runtime_context_version: 2,
            created_by_id: options.adminUserId,
          },
        });
      } catch (err: any) {
        // If unique constraint violated, concurrent claim won
        throw new ValidationError('Gagal mengklaim status provisioning (sedang diproses oleh sesi lain).');
      }
    }

    // 4. Outbound call to Chatbot admin API (outside database transaction)
    let provisionRes: ChatbotProvisionTenantResponse;
    try {
      provisionRes = await client.provisionTenant(provisionPayload, operationId);
    } catch (provisionErr: any) {
      // Existing legacy deployments may already own the externalTenantId. The
      // control plane cannot reveal old raw keys, so adopt the existing tenant,
      // sync its contract/datasource, and rotate credentials exactly once here.
      if (provisionErr?.code === 'CHATBOT_TENANT_ALREADY_EXISTS') {
        try {
          provisionRes = await client.adoptExistingTenant(provisionPayload);
        } catch (adoptErr: any) {
          const sanitizedError = String(adoptErr?.message || 'Tenant adoption failed').slice(0, 500);
          await db.marbot_tenant_config.update({
            where: { tenant_id: tenantId },
            data: { sync_status: 'ERROR', last_sync_error: sanitizedError },
          }).catch(() => undefined);
          throw adoptErr;
        }
      } else {
      // Sanitize error before storing (do not store tokens, secrets, or headers)
        const sanitizedError = String(provisionErr?.message || 'Provisioning failed').slice(0, 500);
        await db.marbot_tenant_config.update({
          where: { tenant_id: tenantId },
          data: {
            sync_status: isManagedSync ? 'SYNC_ERROR' : 'ERROR',
            last_sync_error: sanitizedError,
          },
        }).catch(() => undefined);
        throw provisionErr;
      }
    }

    // 5. Persist credentials and transition to ACTIVE
    const saved = await db.marbot_tenant_config.update({
      where: { tenant_id: tenantId },
      data: {
        external_tenant_id: provisionRes.tenant.externalTenantId,
        chatbot_url: chatbotUrl,
        chatbot_api_key: protectSecret(provisionRes.credentials.apiKey),
        active_key_id: provisionRes.credentials.keyId,
        chatbot_tenant_id: provisionRes.tenant.id,
        inbound_context_secret: protectSecret(provisionRes.credentials.inboundContextSecret),
        outbound_tool_secret: protectSecret(provisionRes.credentials.outboundToolSecret),
        sync_status: 'ACTIVE',
        last_synced_at: new Date(),
        contract_version: 2,
        runtime_context_version: 2,
        datasource_source_key: provisionRes.dataSource?.sourceKey || (env.CHATBOT_ERP_READONLY_DATABASE_URL ? 'ERP_MAIN' : null),
        datasource_status: provisionRes.dataSource?.status || (env.CHATBOT_ERP_READONLY_DATABASE_URL ? 'CONFIGURED' : null),
        last_contract_sync_at: new Date(),
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
      contractVersion: 2,
      runtimeContextVersion: 2,
      datasourceSourceKey: saved.datasource_source_key,
      datasourceStatus: saved.datasource_status,
      lastContractSyncAt: saved.last_contract_sync_at,
      data: {
        tenant_id: saved.tenant_id,
        external_tenant_id: saved.external_tenant_id,
        chatbot_url: saved.chatbot_url,
        chatbot_api_key_masked: saved.chatbot_api_key ? '••••••••' : '',
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
        chatbot_api_key: protectSecret(chatbotApiKey),
        inbound_context_secret: protectSecret(inboundSecret),
        outbound_tool_secret: protectSecret(outboundSecret),
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
        chatbot_api_key: protectSecret(chatbotApiKey),
        inbound_context_secret: protectSecret(inboundSecret),
        outbound_tool_secret: protectSecret(outboundSecret),
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
          apiKey = dbRow.chatbot_api_key ? decryptMarbotSecret(dbRow.chatbot_api_key) : undefined;
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
