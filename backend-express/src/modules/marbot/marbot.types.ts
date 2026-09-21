import { RoleCode } from '@prisma/client';

export type MarbotSyncStatus = 'NOT_PROVISIONED' | 'PROVISIONING' | 'ACTIVE' | 'ERROR';

export interface MarbotTenantConfig {
  externalTenantId: string;
  chatbotUrl: string;
  chatbotApiKey: string;
  inboundContextSecret: string;
  outboundToolSecret: string;
  roleMap?: Partial<Record<RoleCode, string>>;
}

export interface MarbotUserAccess {
  tenantId: string;
  companyId: string;
  userId: string;
  role: RoleCode;
}

export interface MarbotToolScope {
  tenantId: string;
  companyId: string;
  userId: string;
  role: RoleCode;
}

export interface ChatbotProvisionTenantRequest {
  externalTenantId: string;
  tenantName: string;
  erpBaseUrl: string;
}

export interface ChatbotProvisionTenantResponse {
  tenantId: string;
  externalTenantId: string;
  apiKey: {
    key: string;
    keyId: string;
  };
  inboundContextSecret: string;
  outboundToolSecret: string;
  status: string;
}

export interface TenantIntegrationStatus {
  tenantId: string;
  configured: boolean;
  source: 'DATABASE' | 'ENV' | 'NONE';
  syncStatus: MarbotSyncStatus;
  mode: 'MANAGED' | 'LEGACY' | 'UNCONFIGURED';
  chatbotTenantId?: string | null;
  activeKeyId?: string | null;
  lastSyncedAt?: Date | null;
  lastSyncError?: string | null;
  data: {
    tenant_id: string;
    external_tenant_id?: string;
    chatbot_url?: string;
    chatbot_api_key_masked?: string;
    inbound_context_secret_masked?: string;
    outbound_tool_secret_masked?: string;
    role_map_json?: string | null;
    updated_at?: Date | null;
  } | null;
}
