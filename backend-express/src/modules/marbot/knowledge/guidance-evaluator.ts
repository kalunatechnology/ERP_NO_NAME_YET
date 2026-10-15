import type { ProcedureRule, HelpContext } from './schemas/procedure.schema';
import type { ProcedureOperation } from '../brain/reasoning/intent';

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

export function formatReference(title: string, content: string, path?: string, version = '2026-10-07'): string {
  return `${title}\n\n${content}${path ? `\n\n[Buka ${title}](${path})` : ''}\n\nSumber: panduan ERP • versi ${version}.`;
}

export function formatUnavailable(topicName: string, operation?: ProcedureOperation): string {
  const actionText = operation ? operationNames[operation] : 'menggunakan';
  return `Panduan untuk ${actionText} ${topicName} belum dapat dipastikan dari referensi yang tersedia. Saya tidak akan menggantinya dengan panduan tindakan lain. Perjelas tujuan dan status dokumennya; belum ada data diubah.`;
}

export function evaluateGuidance(rule: ProcedureRule, context?: HelpContext): string {
  let authNotice = '';

  if (rule.authorization) {
    const auth = rule.authorization;
    const role = context?.roleCode ? context.roleCode.replace(/^ROLE-/, '') : undefined;

    if (role && auth.allowedRoles && auth.allowedRoles.length > 0) {
      const allowedRole = auth.allowedRoles.includes(role);
      const accessBlocked = context && (!context.enabledModules?.includes('REQUESTS') || context.blockedWriteModules?.includes('REQUESTS'));

      if (!allowedRole) {
        authNotice = auth.roleDeniedMessage ? auth.roleDeniedMessage(role) : (auth.denialMessage || `Peran aktif Anda ${role} tidak diizinkan untuk tindakan ini.`);
      } else if (accessBlocked) {
        authNotice = auth.moduleBlockedMessage ? auth.moduleBlockedMessage(role, 'REQUESTS') : `Peran aktif Anda ${role} memenuhi syarat role, tetapi akses perubahan modul dibatasi.`;
      } else {
        authNotice = auth.roleMatchMessage ? auth.roleMatchMessage(role) : `Peran aktif Anda ${role} memenuhi syarat role untuk tindakan ini.`;
      }
    } else {
      authNotice = auth.denialMessage || '';
    }
  }

  const body = rule.content.body || rule.content.summary || '';
  const fullContent = authNotice ? `${authNotice}\n\n${body}` : body;
  const version = rule.version || '2026-10-07';

  return formatReference(rule.title, fullContent, rule.targetPath, version);
}
