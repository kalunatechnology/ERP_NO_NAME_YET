import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import type { NativeScope } from './marbot-native.service';
import type { MarbotAction } from './marbot-action.service';
import { proposeAction } from './marbot-action.service';
import { isProcedureQuestion } from './marbot-intent';

/** Resolve only explicitly quoted, unique names inside current authority. No defaults or fuzzy identities. */
export async function proposeNamedTaskAction(message: string, scope: NativeScope, db = prisma) {
  if (isProcedureQuestion(message)) return null;
  const daily = message.match(/^\s*(?:buat|buatkan|tambahkan)\s+tugas harian\s+["“]([^"”]+)["”]\s+untuk\s+target mingguan\s+["“]([^"”]+)["”]\s+jam\s+["“]([^"”]+)["”]\s+hasil\s+["“]([^"”]+)["”]\s*$/i);
  const update = message.match(/^\s*(?:ubah|update|perbarui)\s+(?:task|tugas)\s+["“]([^"”]+)["”]\s+(catatan|hasil|kendala|status)\s+["“]([^"”]+)["”]\s*$/i);
  if (!daily && !update) return null;
  const response = (content: string, action?: MarbotAction) => ({ content, tools: ['action.proposal'], sources: ['ERP:projects-api'], ...(action ? { action } : {}) });
  if (!scope.enabledModules.includes('PROJECTS') || !scope.permissions.includes('READ_TASK') ||
      scope.blockedReadModules?.includes('PROJECTS') || scope.blockedWriteModules?.includes('PROJECTS')) {
    return response('Akses task tidak tersedia untuk permintaan ini. Tidak ada data diubah.');
  }
  if (update && update[2].toLowerCase() === 'status' && !['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'].includes(update[3])) {
    return response('Status harus NOT_STARTED, IN_PROGRESS, COMPLETED, atau BLOCKED. Tidak ada data diubah.');
  }
  const projectFilter = scope.projectScope.mode === 'LIST'
    ? scope.projectScope.projectIds.length ? Prisma.sql`AND m.project_id IN (${Prisma.join(scope.projectScope.projectIds)})` : Prisma.sql`AND FALSE`
    : Prisma.empty;
  const named = daily ? daily[2] : update![1];
  // Daily creation must target the user's own Weekly Task. Updates likewise
  // resolve an owned Daily Task; canonical APIs perform the final write checks.
  const rows = daily ? await db.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
    SELECT w.id, w.status FROM project_weekly_task w
    JOIN project_main_task m ON m.id=w.main_task_id AND m.tenant_id=w.tenant_id AND m.company_id=w.company_id
    WHERE w.tenant_id=${scope.tenantId} AND w.company_id=${scope.companyId}
      AND w.assignee_id=${scope.userId} AND lower(w.target_description)=lower(${named}) ${projectFilter}
    ORDER BY w.id LIMIT 2
  `) : await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT d.id FROM project_daily_task d
    JOIN project_weekly_task w ON w.id=d.weekly_task_id AND w.tenant_id=d.tenant_id AND w.company_id=d.company_id
    JOIN project_main_task m ON m.id=w.main_task_id AND m.tenant_id=w.tenant_id AND m.company_id=w.company_id
    WHERE d.tenant_id=${scope.tenantId} AND d.company_id=${scope.companyId}
      AND d.owner_id=${scope.userId} AND lower(d.title)=lower(${named}) ${projectFilter}
    ORDER BY d.id LIMIT 2
  `);
  if (rows.length !== 1) return response(rows.length
    ? 'Nama tersebut cocok dengan lebih dari satu task dalam akses Anda. Gunakan identitas task yang spesifik; tidak ada perubahan disiapkan.'
    : 'Task milik Anda dengan nama tersebut tidak ditemukan dalam akses saat ini. Periksa nama lengkap atau assignment; tidak ada perubahan disiapkan.');
  if (daily) {
    const status = (rows[0] as { id: string; status?: string }).status;
    if (!status) return response('Status Weekly Task belum dapat diverifikasi. Tidak ada usulan Daily Task disiapkan.');
    if (status === 'PENDING_APPROVAL') return response('Weekly Task belum disetujui PM (Menunggu Approval). Daily Task baru dapat dibuat setelah approval. Tidak ada perubahan disiapkan.');
    if (status === 'REJECTED') return response('Weekly Task ditolak. Weekly tersebut tidak dapat digunakan untuk Daily Task. Tidak ada perubahan disiapkan.');
  }
  const fields: Record<string, string> = { catatan: 'notes', hasil: 'output_result', kendala: 'block_reason', status: 'status' };
  const payload = daily ? { weekly_task_id: rows[0].id, title: daily[1], time_slot: daily[3], output_target: daily[4] }
    : { id: rows[0].id, [fields[update![2].toLowerCase()]]: update![3] };
  return proposeAction(`${daily ? 'buat tugas harian' : 'ubah task'} ${JSON.stringify(payload)}`, scope);
}
