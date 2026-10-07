import { createHash } from 'node:crypto';
import type { NativeScope } from './marbot-native.service';
import { canonicalJson } from './marbot-signature.service';
import { z } from 'zod';

export const marbotOwner = (scope: NativeScope) => ({ tenant_id: scope.tenantId, company_id: scope.companyId, user_id: scope.userId });
export function marbotAuthorityKey(scope: NativeScope): string {
  return createHash('sha256').update(canonicalJson({
    ...marbotOwner(scope), role: scope.roleCode,
    blockedReads: [...(scope.blockedReadModules ?? [])].sort(), blockedWrites: [...(scope.blockedWriteModules ?? [])].sort(),
    permissions: [...scope.permissions].sort(), modules: [...scope.enabledModules].sort(),
    projects: scope.projectScope.mode === 'ALL' ? 'ALL' : [...scope.projectScope.projectIds].sort(),
  })).digest('hex');
}

// Keep legacy authority hashes valid; new messages also retain the server-owned
// scope needed to distinguish an expansion from a revocation.
const snapshotSchema = z.object({
  version: z.literal(1), tenantId: z.string(), companyId: z.string(), userId: z.string(),
  roleId: z.string(), roleCode: z.string(), enabledModules: z.array(z.string()), permissions: z.array(z.string()),
  blockedReadModules: z.array(z.string()), blockedWriteModules: z.array(z.string()),
  projectScope: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('ALL'), projectIds: z.array(z.string()).length(0) }).strict(),
    z.object({ mode: z.literal('LIST'), projectIds: z.array(z.string()) }).strict(),
  ]),
}).strict();

export function marbotAuthoritySnapshot(scope: NativeScope) {
  return { version: 1 as const, tenantId: scope.tenantId, companyId: scope.companyId, userId: scope.userId,
    roleId: scope.roleId, roleCode: scope.roleCode, enabledModules: [...scope.enabledModules], permissions: [...scope.permissions],
    blockedReadModules: [...(scope.blockedReadModules ?? [])], blockedWriteModules: [...(scope.blockedWriteModules ?? [])],
    projectScope: { mode: scope.projectScope.mode, projectIds: [...scope.projectScope.projectIds] } };
}

export function marbotAuthorityBaseKey(scope: NativeScope): string {
  return createHash('sha256').update(canonicalJson({ roleId: scope.roleId,
    authority: marbotAuthorityKey({ ...scope, projectScope: { mode: 'ALL', projectIds: [] } }),
  })).digest('hex');
}

export function marbotMessageAuthority(scope: NativeScope) {
  return { authority: marbotAuthorityKey(scope), authorityBase: marbotAuthorityBaseKey(scope),
    authoritySnapshot: marbotAuthoritySnapshot(scope) };
}

/** Unknown/legacy scopes stay exact-match only. No permission or project loss may replay old data. */
export function canReadMarbotMessage(metadata: unknown, scope: NativeScope): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const record = metadata as Record<string, unknown>;
  if (record.authoritySnapshot === undefined) return record.authority === marbotAuthorityKey(scope);
  const parsed = snapshotSchema.safeParse(record.authoritySnapshot);
  if (!parsed.success) return false;
  const previous = parsed.data as NativeScope;
  if (record.authority !== marbotAuthorityKey(previous) || marbotAuthorityBaseKey(previous) !== marbotAuthorityBaseKey(scope)) return false;
  if (scope.projectScope.mode === 'ALL') return true;
  if (previous.projectScope.mode === 'ALL') return false;
  const projects = new Set(scope.projectScope.projectIds);
  return previous.projectScope.projectIds.every(id => projects.has(id));
}

export function visibleConversationTitle(messages: Array<{ role: string; content: string }>): string {
  return messages.find(message => message.role === 'user')?.content.slice(0, 80) || 'Percakapan';
}
