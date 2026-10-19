import type { ProcedureRule, HelpContext } from './schemas/procedure.schema';
import type { ProcedureOperation } from '../brain/reasoning/intent';
import { checkAbstention } from '../knowledge-engine/gateway/abstention-guard';

export const operationNames: Record<ProcedureOperation, string> = {
  delete: 'menghapus',
  cancel: 'membatalkan',
  edit: 'mengedit',
  publish: 'mempublikasikan/menerbitkan',
  approve: 'menyetujui/menolak',
  submit: 'mengajukan',
  stop: 'menghentikan',
  start: 'memulai',
  pay: 'membayar/mencairkan',
  export: 'mengekspor',
  restore: 'memulihkan',
  transfer: 'memindahkan',
  archive: 'mengarsipkan',
  create: 'membuat',
};

export function formatReference(
  title: string,
  content: string,
  path?: string,
  version = '2026-10-07',
  provenanceCommit?: string
): string {
  const provenanceSuffix = provenanceCommit
    ? ` • commit ${provenanceCommit.slice(0, 7)}`
    : '';
  return `${title}\n\n${content}${path ? `\n\n[Buka ${title}](${path})` : ''}\n\nSumber: panduan ERP • versi ${version}${provenanceSuffix}.`;
}

export function formatUnavailable(topicName: string, operation?: ProcedureOperation | string): string {
  const actionText = operation
    ? (operation in operationNames ? operationNames[operation as ProcedureOperation] : operation)
    : 'menggunakan';
  return `Panduan untuk ${actionText} ${topicName} belum dapat dipastikan dari referensi yang tersedia. Saya tidak akan menggantinya dengan panduan tindakan lain. Perjelas tujuan dan status dokumennya; belum ada data diubah.`;
}

export function evaluateGuidance(rule: ProcedureRule, context?: HelpContext): string {
  // 1. Check abstention guard (RETIRED, QUARANTINED, CONFLICT, UNVERIFIED)
  const abstention = checkAbstention(rule, rule.title, rule.operation);
  if (abstention.shouldAbstain && abstention.message) {
    return abstention.message;
  }

  let authNotice = '';

  // 2. Evaluate backend authorization and UI visibility
  if (rule.authorization) {
    const auth = rule.authorization;
    const role = context?.roleCode ? context.roleCode.replace(/^ROLE-/, '') : undefined;

    if (role && auth.allowedRoles && auth.allowedRoles.length > 0) {
      const allowedRole = auth.allowedRoles.includes(role);
      const accessBlocked =
        context &&
        (!context.enabledModules?.includes('REQUESTS') ||
          context.blockedWriteModules?.includes('REQUESTS'));

      if (!allowedRole) {
        authNotice =
          typeof auth.roleDeniedMessage === 'function'
            ? auth.roleDeniedMessage(role)
            : typeof auth.roleDeniedMessage === 'string'
            ? auth.roleDeniedMessage
            : auth.denialMessage || `Peran aktif Anda ${role} tidak diizinkan untuk tindakan ini.`;
      } else if (accessBlocked) {
        authNotice =
          typeof auth.moduleBlockedMessage === 'function'
            ? auth.moduleBlockedMessage(role, 'REQUESTS')
            : typeof auth.moduleBlockedMessage === 'string'
            ? auth.moduleBlockedMessage
            : `Peran aktif Anda ${role} memenuhi syarat role, tetapi akses perubahan modul dibatasi.`;
      } else {
        authNotice =
          typeof auth.roleMatchMessage === 'function'
            ? auth.roleMatchMessage(role)
            : typeof auth.roleMatchMessage === 'string'
            ? auth.roleMatchMessage
            : `Peran aktif Anda ${role} memenuhi syarat role untuk tindakan ini.`;
      }
    } else {
      authNotice = auth.denialMessage || '';
    }
  }

  const body = rule.content.body || rule.content.summary || '';
  const fullContent = authNotice ? `${authNotice}\n\n${body}` : body;
  const version = rule.version || '2026-10-07';
  const provenanceCommit = rule.provenance?.commitSha;

  return formatReference(rule.title, fullContent, rule.targetPath, version, provenanceCommit);
}
