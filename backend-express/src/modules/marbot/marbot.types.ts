import { RoleCode } from '@prisma/client';

export type MarbotSyncStatus = 'NOT_PROVISIONED' | 'PROVISIONING' | 'ACTIVE' | 'ERROR' | 'SYNC_ERROR';

export interface MarbotTenantConfig {
  externalTenantId: string;
  chatbotUrl: string;
  chatbotApiKey: string;
  inboundContextSecret: string;
  outboundToolSecret: string;
  roleMap?: Partial<Record<RoleCode, string>>;
  contractVersion?: 1 | 2;
  runtimeContextVersion?: 2;
}

export interface MarbotProjectScope { mode: 'ALL' | 'LIST'; projectIds: string[]; }

export interface MarbotRuntimeContextV2 {
  contextVersion: 2;
  externalTenantId: string;
  externalUserId: string;
  companyId: string;
  roleCodes: string[];
  enabledModules: string[];
  permissions: string[];
  projectScope: MarbotProjectScope;
  issuedAt: number;
  expiresAt: number;
  jti: string;
  locale: string;
}

export interface MarbotRuntimeAuthority {
  roleCode: RoleCode;
  roleId: string;
  enabledModules: string[];
  permissions: string[];
  projectScope: MarbotProjectScope;
}

export interface ChatbotTenantModuleProvision {
  moduleCode: string;
  enabled: boolean;
  allowedRoles: string[];
  permissions: string[];
}

export interface ChatbotDataSourceProvision {
  sourceKey: string;
  name: string;
  connectionUrl: string;
  isolationMode: 'COLUMN' | 'DATABASE';
  scopeColumn: string;
  scopeContextKey: string;
  schemaAllowlist: string[];
  tableAllowlist: string[];
  maxRows: number;
  maxColumns: number;
  maxResultBytes: number;
  statementTimeoutMs: number;
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
  permissions: string[];
  projectScope: MarbotProjectScope;
}

export interface ChatbotProvisionTenantRequestV2 {
  contractVersion: 2;
  externalTenantId: string;
  name: string;
  erpBaseUrl: string;
  allowedErpDomains: string[];
  allowedInternalCidrs: string[];
  credentialScopes: string[];
  modules: ChatbotTenantModuleProvision[];
  dataSource?: ChatbotDataSourceProvision | null;
}

export interface ChatbotProvisionTenantResponseV2 {
  contractVersion: 2;
  tenant: { id: string; externalTenantId: string; status: string };
  credentials: {
    apiKey: string;
    keyId: string;
    inboundContextSecret: string;
    outboundToolSecret: string;
  };
  dataSource?: { id?: string; sourceKey?: string; status?: string } | null;
}

export type ChatbotProvisionTenantRequest = ChatbotProvisionTenantRequestV2;
export type ChatbotProvisionTenantResponse = ChatbotProvisionTenantResponseV2;

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
  contractVersion?: number | null;
  runtimeContextVersion?: number | null;
  datasourceSourceKey?: string | null;
  datasourceStatus?: string | null;
  lastContractSyncAt?: Date | null;
  enabledModules?: string[];
  managedProvisioningAvailable?: boolean;
  provisioningBlockers?: string[];
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
