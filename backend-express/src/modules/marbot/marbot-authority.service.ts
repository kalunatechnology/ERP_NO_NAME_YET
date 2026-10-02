import { createHash } from 'node:crypto';
import type { NativeScope } from './marbot-native.service';
import { canonicalJson } from './marbot-signature.service';

export const marbotOwner = (scope: NativeScope) => ({ tenant_id: scope.tenantId, company_id: scope.companyId, user_id: scope.userId });
export function marbotAuthorityKey(scope: NativeScope): string {
  return createHash('sha256').update(canonicalJson({
    ...marbotOwner(scope), role: scope.roleCode,
    blockedReads: [...(scope.blockedReadModules ?? [])].sort(), blockedWrites: [...(scope.blockedWriteModules ?? [])].sort(),
    permissions: [...scope.permissions].sort(), modules: [...scope.enabledModules].sort(),
    projects: scope.projectScope.mode === 'ALL' ? 'ALL' : [...scope.projectScope.projectIds].sort(),
  })).digest('hex');
}

export function visibleConversationTitle(messages: Array<{ role: string; content: string }>): string {
  return messages.find(message => message.role === 'user')?.content.slice(0, 80) || 'Percakapan';
}
