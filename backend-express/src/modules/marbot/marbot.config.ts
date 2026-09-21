import { RoleCode } from '@prisma/client';
import prisma from '../../config/database';
import { env } from '../../config/env';
import { ForbiddenError } from '../../utils/errors';
import { MarbotTenantConfig } from './marbot.types';
import { decryptMarbotSecret } from './marbot-secret.service';

export function envTenantConfig(tenantId: string): MarbotTenantConfig | null {
  try {
    const map = JSON.parse(process.env.MARBOT_TENANT_CONFIG_JSON || '{}');
    const config = map[tenantId];
    if (
      !config?.externalTenantId ||
      !config.chatbotUrl ||
      !config.chatbotApiKey ||
      !config.inboundContextSecret ||
      !config.outboundToolSecret
    ) {
      return null;
    }
    return { ...config, contractVersion: 1 } as MarbotTenantConfig;
  } catch {
    return null;
  }
}

function validateChatbotUrl(rawUrl: string, sourceName: string): URL {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.hostname === 'localhost')) {
      throw new ForbiddenError(`Endpoint MarBot ${sourceName} tidak aman (harus HTTPS).`);
    }
    return url;
  } catch (err) {
    if (err instanceof ForbiddenError) throw err;
    throw new ForbiddenError(`Endpoint MarBot ${sourceName} tidak valid.`);
  }
}

/**
 * Resolves MarBot config for a tenant using the lifecycle-aware fallback chain:
 *  1. Database:
 *     - If sync_status === 'ACTIVE' and all credentials present: use DB config.
 *     - If DB row exists but status is PROVISIONING / ERROR / NOT_PROVISIONED / credential incomplete:
 *       fall back to legacy ENV if present and valid; otherwise reject with ForbiddenError.
 *  2. If DB row not found:
 *     - Fall back to legacy ENV if present and valid; otherwise reject with ForbiddenError.
 *
 * Throws ForbiddenError if neither source provides a ready, valid configuration.
 */
export async function resolveMarbotTenantConfig(
  tenantId: string,
  db: any = prisma,
): Promise<MarbotTenantConfig> {
  const dbRow = await db.marbot_tenant_config.findUnique({
    where: { tenant_id: tenantId },
    select: {
      external_tenant_id: true,
      chatbot_url: true,
      chatbot_api_key: true,
      inbound_context_secret: true,
      outbound_tool_secret: true,
      role_map_json: true,
      sync_status: true,
      contract_version: true,
      runtime_context_version: true,
    },
  });

  if (
    dbRow &&
    dbRow.sync_status === 'ACTIVE' &&
    dbRow.external_tenant_id &&
    dbRow.chatbot_url &&
    dbRow.chatbot_api_key &&
    dbRow.inbound_context_secret &&
    dbRow.outbound_tool_secret
  ) {
    let roleMap: Partial<Record<RoleCode, string>> | undefined;
    if (dbRow.role_map_json) {
      try {
        roleMap = JSON.parse(dbRow.role_map_json);
      } catch {
        /* ignore malformed JSON */
      }
    }
    validateChatbotUrl(dbRow.chatbot_url, 'dari database');
    return {
      externalTenantId: dbRow.external_tenant_id,
      chatbotUrl: dbRow.chatbot_url,
      chatbotApiKey: decryptMarbotSecret(dbRow.chatbot_api_key),
      inboundContextSecret: decryptMarbotSecret(dbRow.inbound_context_secret),
      outboundToolSecret: decryptMarbotSecret(dbRow.outbound_tool_secret),
      roleMap,
      contractVersion: env.CHATBOT_CONTRACT_MODE === 'v2' && dbRow.contract_version === 2 ? 2 : 1,
      runtimeContextVersion: dbRow.runtime_context_version === 2 ? 2 : undefined,
    };
  }

  // If DB row exists but is not ACTIVE or has incomplete credentials,
  // or if DB row does not exist at all: try legacy ENV fallback
  const envConfig = envTenantConfig(tenantId);
  if (envConfig) {
    validateChatbotUrl(envConfig.chatbotUrl, '');
    return envConfig;
  }

  if (dbRow && dbRow.sync_status === 'PROVISIONING') {
    throw new ForbiddenError('Layanan MarBot untuk tenant ini sedang dalam proses sinkronisasi.');
  }

  if (dbRow && ['ERROR', 'SYNC_ERROR'].includes(dbRow.sync_status)) {
    throw new ForbiddenError('Layanan MarBot untuk tenant ini mengalami kendala konfigurasi.');
  }

  throw new ForbiddenError('Integrasi MarBot belum dikonfigurasi untuk tenant ini.');
}

/** @deprecated Use resolveMarbotTenantConfig() (async) instead. Kept for backwards compatibility. */
export function tenantConfig(tenantId: string): MarbotTenantConfig {
  let map: Record<string, MarbotTenantConfig>;
  try {
    map = JSON.parse(process.env.MARBOT_TENANT_CONFIG_JSON || '{}');
  } catch {
    throw new ForbiddenError('Konfigurasi Marbot tidak valid.');
  }
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    throw new ForbiddenError('Konfigurasi Marbot tidak valid.');
  }
  const config = map[tenantId];
  if (
    !config?.externalTenantId ||
    !config.chatbotUrl ||
    !config.chatbotApiKey ||
    !config.inboundContextSecret ||
    !config.outboundToolSecret
  ) {
    throw new ForbiddenError('Integrasi Marbot belum dikonfigurasi untuk tenant ini.');
  }
  validateChatbotUrl(config.chatbotUrl, '');
  return config;
}
