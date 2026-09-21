import { randomUUID } from 'crypto';
import prisma from '../../config/database';
import { buildMarbotRuntimeAuthority, mapRoleForChatbot } from './marbot-access.service';
import { MarbotRuntimeAuthority, MarbotRuntimeContextV2, MarbotTenantConfig } from './marbot.types';

const MODULE_PERMISSIONS: Record<string, ReadonlySet<string>> = {
  GENERAL: new Set(['USE_MARBOT', 'READ_GENERAL']),
  MARBOT: new Set(['USE_MARBOT']),
  PROJECTS: new Set(['READ_PROJECT', 'READ_TASK']),
  FINANCE: new Set(['READ_FINANCE_SUMMARY', 'READ_PROJECT_FINANCE', 'READ_COMPANY_FINANCE']),
  CRM: new Set(['READ_TICKET', 'READ_CRM_DEALS']),
};

/** Builds the short-lived, signed authority snapshot consumed by MarBot V2. */
export async function buildMarbotRuntimeContextV2(
  userId: string,
  tenantId: string,
  companyId: string,
  config: MarbotTenantConfig,
  db: any = prisma,
): Promise<MarbotRuntimeContextV2> {
  const authority = await buildMarbotRuntimeAuthority(userId, tenantId, companyId, db);
  return createMarbotRuntimeContextV2(userId, companyId, config, authority);
}

export function createMarbotRuntimeContextV2(
  userId: string,
  companyId: string,
  config: MarbotTenantConfig,
  authority: MarbotRuntimeAuthority,
): MarbotRuntimeContextV2 {
  const granted = new Set(authority.permissions);
  const enabledModules = authority.enabledModules
    .filter((module) => {
      const required = MODULE_PERMISSIONS[module];
      return required ? [...required].some((permission) => granted.has(permission)) : false;
    })
    .sort();
  const issuedAt = Math.floor(Date.now() / 1000);
  return {
    contextVersion: 2,
    externalTenantId: config.externalTenantId,
    externalUserId: userId,
    companyId,
    roleCodes: [mapRoleForChatbot(authority.roleCode, config)],
    enabledModules,
    permissions: [...authority.permissions].sort(),
    projectScope: authority.projectScope,
    issuedAt,
    expiresAt: issuedAt + 120,
    jti: randomUUID(),
    locale: 'id-ID',
  };
}
