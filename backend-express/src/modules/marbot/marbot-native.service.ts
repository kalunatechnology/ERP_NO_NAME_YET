import { Prisma, RoleCode } from '@prisma/client';
import prisma from '../../config/database';
import { ForbiddenError, ValidationError } from '../../utils/errors';
import { MarbotRuntimeAuthority } from './marbot.types';
import { helperAnswer, systemKnowledgeAnswer } from './marbot-knowledge';
import { proposeAction } from './marbot-action.service';
import { proposeNamedTaskAction } from './marbot-named-action.service';
import { isIntentCorrection, isProcedureQuestion, procedureOperation, procedureTopic } from './marbot-intent';

export type NativeScope = MarbotRuntimeAuthority & { tenantId: string; companyId: string; userId: string; blockedReadModules?: string[]; blockedWriteModules?: string[] };
export const dashboardRoles: RoleCode[] = [RoleCode.DIRECTOR, RoleCode.OPERATIONAL_MANAGER, RoleCode.PROJECT_MANAGER];
export type AssistantMode = 'HELPER' | 'DASHBOARD';
const WEEKLY_TASK_ENTITY = /\b(?:weekly\s+(?:tasks?|targets?)|(?:tugas|target)\s+mingguan|(?:pengajuan|ajuan)\s+(?:(?:target|tugas|task)\s+)?mingguan|mingguan\s+(?:task|tugas))\b/i;
export function isWeeklyTaskQuestion(message: string) { return WEEKLY_TASK_ENTITY.test(message); }
export function canUseDashboard(scope: MarbotRuntimeAuthority) {
  return dashboardRoles.includes(scope.roleCode) && !(scope as NativeScope).blockedReadModules?.includes('PROJECTS') && scope.permissions.some(p => ['READ_PROJECT', 'READ_TASK'].includes(p));
}
export function detectTools(message: string): string[] {
  const tools: string[] = [];
  const weeklyTaskRequest = isWeeklyTaskQuestion(message);
  const taskRequest = weeklyTaskRequest || /tugas|task|tim|team|pekerjaan|kerjakan|overdue|terlambat/i.test(message);
  const financeRequest = /biaya|expense|keuangan|pengeluaran|anggaran/i.test(message);
  if (/proyek|project|portfolio|portofolio|progress|progres/i.test(message) && (!taskRequest && !financeRequest || /(?:proyek|project)\s+dan\s+(?:task|tugas|biaya|KPI|tiket)/i.test(message))) tools.push('projects');
  if (taskRequest || /minggu|week/i.test(message) && !financeRequest && !/kpi|target|tiket|ticket/i.test(message)) tools.push('tasks');
  if (/biaya|expense|keuangan|pengeluaran|anggaran/i.test(message)) tools.push('finance');
  if (/tiket|ticket|support|aduan/i.test(message)) tools.push('tickets');
  if (/kpi/i.test(message) || /target/i.test(message) && !weeklyTaskRequest) tools.push('kpi');
  return tools;
}

// Keep supported task reads deterministic: a provider must not add a date or
// drop an explicit owner from these questions. Structured resource requests and
// write/procedure requests continue through their existing handlers.
export function isNativeTaskReadQuestion(message: string) {
  return (/\b(task|tasks|tugas)\b/i.test(message) || isWeeklyTaskQuestion(message))
    && detectTools(message).join(',') === 'tasks'
    && !procedureOperation(message)
    && !/\b(cara|caranya|bagaimana(?!\s+dengan)|gimana|gmn|panduan|dimana|di mana|how to|how do|how can|fitur|modul|workflow|alur|fungsi|sistem|schema|skema|resource|permission|role|peran)\b/i.test(message)
    && !/[{}]/.test(message);
}

export function taskDateIntent(message: string, now = new Date()) {
  const unquoted = message.replace(/["“][^"”]*["”]/g, '').replace(new RegExp(WEEKLY_TASK_ENTITY.source, 'gi'), '');
  const exclusion = /\b(?:bukan|selain|kecuali|di luar|not|except)\s+(?:hari ini|today)\b/gi;
  const excludeToday = exclusion.test(unquoted);
  const periodText = unquoted.replace(exclusion, '');
  const hasPeriod = /hari ini|today|kemarin|yesterday|besok|tomorrow|minggu|week|bulan|month|\b20\d{2}-\d{2}(?:-\d{2})?\b/i.test(periodText);
  return { excludeToday, hasPeriod, period: queryPeriod(periodText, now) };
}

// Business periods follow Asia/Jakarta, independent of the server timezone.
export function queryPeriod(message: string, now = new Date()) {
  const jakarta = new Date(now.getTime() + 7 * 3600000);
  const explicitDay = message.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (explicitDay) {
    const day = new Date(`${explicitDay[0]}T00:00:00+07:00`);
    if (!Number.isFinite(day.getTime()) || new Date(day.getTime() + 7 * 3600000).toISOString().slice(0, 10) !== explicitDay[0]) throw new ValidationError('Tanggal query tidak valid.');
    return { start: day, end: new Date(day.getTime() + 86400000) };
  }
  if (/\b20\d{2}-(?:00|1[3-9]|[2-9]\d)\b/.test(message)) throw new ValidationError('Bulan query tidak valid.');
  const explicit = message.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  let start: Date;
  let end: Date;
  if (/hari ini|today|kemarin|yesterday|besok|tomorrow/i.test(message) && !explicit) {
    const offset = /kemarin|yesterday/i.test(message) ? -1 : /besok|tomorrow/i.test(message) ? 1 : 0;
    start = new Date(Date.UTC(jakarta.getUTCFullYear(), jakarta.getUTCMonth(), jakarta.getUTCDate() + offset) - 7 * 3600000);
    end = new Date(start.getTime() + 86400000);
  } else if (/minggu|week/i.test(message) && !explicit) {
    const offset = (jakarta.getUTCDay() + 6) % 7 + (/lalu|last/i.test(message) ? 7 : /depan|next/i.test(message) ? -7 : 0);
    start = new Date(Date.UTC(jakarta.getUTCFullYear(), jakarta.getUTCMonth(), jakarta.getUTCDate() - offset) - 7 * 3600000);
    end = new Date(start.getTime() + 7 * 86400000);
  } else {
    const year = explicit ? Number(explicit[1]) : jakarta.getUTCFullYear();
    const month = explicit ? Number(explicit[2]) - 1 : jakarta.getUTCMonth() + (/bulan lalu|last month/i.test(message) ? -1 : /bulan depan|next month/i.test(message) ? 1 : 0);
    start = new Date(Date.UTC(year, month, 1) - 7 * 3600000);
    end = new Date(Date.UTC(year, month + 1, 1) - 7 * 3600000);
  }
  return { start, end };
}

function requireTool(scope: NativeScope, module: string, permissions: string[]) {
  if (scope.blockedReadModules?.includes(module)) throw new ForbiddenError('Kebijakan field/data scope khusus belum dapat dievaluasi aman oleh asisten.');
  if (!scope.enabledModules.includes(module) || !permissions.some(p => scope.permissions.includes(p))) {
    throw new ForbiddenError('Anda tidak memiliki akses untuk data ini.');
  }
}
const safe = (value: unknown) => String(value ?? '').replace(/[\r\n\[\]<>`*_]/g, ' ').slice(0, 160);
const number = (value: unknown) => Number(value || 0).toLocaleString('id-ID');

export function followUpQuestion(message: string, previous?: string): string {
  if (previous && isIntentCorrection(message) && !procedureTopic(message) && !procedureOperation(message)
      && isProcedureQuestion(previous) && procedureTopic(previous)) return previous;
  if (!previous || !/^(dan|kalau|bagaimana dengan|lalu|yang)\b/i.test(message)) return message;
  const previousTopic = procedureTopic(previous);
  if (previousTopic && isProcedureQuestion(previous) && !procedureTopic(message) && !detectTools(message).length) {
    return `${message} ${previousTopic.name}`;
  }
  // Reuse only the topic; dates are parsed from the new question, never stale results.
  const currentTools = detectTools(message);
  if (currentTools.length) {
    const personalTaskFollowUp = currentTools.join(',') === 'tasks' && detectTools(previous).includes('tasks')
      && /\b(saya|my|mine)\b/i.test(previous.replace(/["“][^"”]*["”]/g, ''))
      && !/\b(saya|my|mine|tim|team|kami|kita|semua|seluruh|all|milik|punya|owner|assignee|penanggung|PIC|proyek|project)\b/i.test(message.replace(/["“][^"”]*["”]/g, ''));
    return personalTaskFollowUp ? `${message} saya` : message;
  }
  const topics = detectTools(previous).map(t => ({ projects: 'proyek', tasks: isWeeklyTaskQuestion(previous) ? 'weekly task' : 'tugas', finance: 'biaya', tickets: 'tiket', kpi: 'KPI' }[t]));
  const owner = topics.some(topic => topic === 'tugas' || topic === 'weekly task') && /\b(saya|my|mine)\b/i.test(previous.replace(/["“][^"”]*["”]/g, '')) ? 'saya' : '';
  const project = previous.match(/(?:proyek|project)\s+["“]([^"”]+)["”]/i)?.[0] || '';
  return `${message} ${topics.join(' ')} ${owner} ${project}`.trim();
}

export async function answerNative(message: string, mode: AssistantMode, scope: NativeScope, db = prisma) {
  if (mode === 'DASHBOARD' && !canUseDashboard(scope)) throw new ForbiddenError('Dashboard Assistant hanya tersedia untuk pimpinan dengan akses data proyek.');
  if ((isProcedureQuestion(message) || (procedureTopic(message)?.id === 'weekly' && procedureOperation(message) === 'approve')) && !isNativeTaskReadQuestion(message)
      && (procedureOperation(message) || !/\b(fitur|modul|workflow|alur|fungsi|sistem|role|peran|permission|hak akses|izin akses)\b/i.test(message))) {
    return { content: helperAnswer(message, scope), tools: ['help.procedure'], sources: ['ERP:procedure-knowledge:2026-10-07'] };
  }
  const namedProposal = await proposeNamedTaskAction(message, scope, db);
  if (namedProposal) return namedProposal;
  const proposal = proposeAction(message, scope);
  if (proposal) return proposal;
  if (/\b(fitur|modul|workflow|alur|fungsi|sistem)\b/i.test(message) && !/berapa|jumlah|total|tampilkan/i.test(message)) {
    return { content: systemKnowledgeAnswer(message, scope.enabledModules), tools: ['help.procedure'], sources: ['ERP:code-knowledge:2026-10-07'] };
  }
  if (/\b(role|peran|permission|hak akses|izin akses)\b/i.test(message)) {
    return { content: `Peran aktif: ${scope.roleCode}.\nModul aktif: ${scope.enabledModules.join(', ')}.\nPermission efektif untuk asisten: ${scope.permissions.join(', ')}.\nCakupan proyek: ${scope.projectScope.mode === 'ALL' ? 'seluruh proyek company aktif' : `${scope.projectScope.projectIds.length} proyek yang diizinkan`}.\nHak operasi tetap divalidasi backend pada setiap permintaan.`, tools: ['access.context'], sources: ['ERP:authority'] };
  }
  if (/\b(cara|bagaimana|panduan|dimana|di mana|how)\b/i.test(message) && !isNativeTaskReadQuestion(message) && (!/progres|progress|kinerja|kpi|target/i.test(message) || isWeeklyTaskQuestion(message))) {
    return { content: helperAnswer(message, scope), tools: ['help.procedure'], sources: ['ERP:procedure-knowledge'] };
  }
  if (/^\s*(buatkan|buat|hapus|ubah|setujui|approve|delete|update|tambahkan)\b/i.test(message) && !/ringkasan|laporan|summary/i.test(message)) {
    return { content: `Operasi tersebut belum dapat dipetakan ke input yang valid. Saya dapat menyiapkan usulan Project, Main/Weekly/Daily Task, assignment, dan pembaruan task dengan field serta identitas yang jelas. Perubahan memerlukan konfirmasi dan verifikasi backend. Sebutkan record dan perubahan yang diminta.`, tools: [], sources: [] };
  }
  const tools = detectTools(message);
  if (!tools.length) return { content: helperAnswer(message, scope), tools: ['help.procedure'], sources: ['ERP:procedure-knowledge'] };
  const unquotedTaskIntent = message.replace(/["“][^"”]*["”]/g, '');
  if (isWeeklyTaskQuestion(unquotedTaskIntent) && /daily\s+tasks?|(?:tugas|task)\s+harian/i.test(unquotedTaskIntent) && isNativeTaskReadQuestion(message)) {
    return { content: 'Weekly Task dan Daily Task adalah record berbeda. Tanyakan jumlah atau daftar masing-masing secara terpisah agar hasil tidak mencampurkan kedua jenis task. Tidak ada query dijalankan.', tools: [], sources: [] };
  }
  const requestsPeriod = /hari ini|today|kemarin|yesterday|besok|tomorrow|minggu|week|bulan|month|tahun|year|kuartal|quarter|\b20\d{2}-\d{2}(?:-\d{2})?\b/i.test(message);
  if (tools.includes('projects') && requestsPeriod) return {
    content: 'Periode proyek perlu diperjelas: apakah berdasarkan tanggal dibuat, jadwal pelaksanaan, atau status historis? Ringkasan proyek saat ini membaca status terkini dan belum menyediakan snapshot status masa lalu. Untuk aktivitas pada periode tertentu, tanyakan tugas atau biaya proyek; untuk status saat ini, tanyakan "Berapa proyek yang sedang berjalan?". Tidak ada query proyek dijalankan.',
    tools: [], sources: [],
  };
  if (/tahun|year|kuartal|quarter/i.test(message)) return { content: 'Rentang tahunan/kuartalan belum didukung pada query ini. Sebutkan tanggal YYYY-MM-DD, bulan YYYY-MM, hari ini, minggu ini/lalu/depan, atau bulan ini/lalu/depan. Tidak ada query dijalankan.', tools: [], sources: [] };
  if ((message.match(/\b20\d{2}-\d{2}(?:-\d{2})?\b/g) || []).length > 1) return { content: 'Query rentang beberapa tanggal belum didukung. Sebutkan satu tanggal, satu bulan, atau periode mingguan. Tidak ada query dijalankan.', tools: [], sources: [] };
  if (/\b(?:task|tugas) ini\b/i.test(message) && !/(?:task|tugas)\s+["“]/i.test(message)) return { content: 'Task yang dimaksud belum teridentifikasi. Tulis nama lengkap dalam tanda kutip, misalnya tugas "Nama task". Tidak ada data task diasumsikan.', tools: [], sources: [] };
  const base = { tenant_id: scope.tenantId, company_id: scope.companyId };
  let projectIds = scope.projectScope.mode === 'LIST' ? scope.projectScope.projectIds : undefined;
  const namedTeam = message.match(/\b(?:tim|team)\s+["“]?([^"”,?.]+?)["”]?(?=\s+(?:minggu|bulan|sudah|telah|mengerjakan|kerjakan|progres|progress|ini|lalu)\b|[,.?]|$)/iu)?.[1]?.trim();
  let team: { name: string; userIds: string[]; employeeIds: string[] } | null = null;
  if (namedTeam && !/^(saya|kami|ini|yang)$/i.test(namedTeam)) {
    requireTool(scope, 'PROJECTS', ['READ_TASK']);
    if (!canUseDashboard(scope)) throw new ForbiddenError('Ringkasan tim hanya tersedia untuk pimpinan dengan akses proyek.');
    const organizations = await db.core_organization.findMany({
      where: { ...base, status: 'ACTIVE', OR: [
        { organization_name: { equals: namedTeam, mode: 'insensitive' } },
        { organization_code: { equals: namedTeam, mode: 'insensitive' } },
      ] },
      select: { id: true, organization_name: true }, take: 2,
    });
    if (organizations.length !== 1) {
      return { content: `Tim “${safe(namedTeam)}” belum dapat dicocokkan secara unik dengan unit organisasi aktif. Gunakan nama atau kode unit yang lengkap, atau sebutkan proyek dengan format proyek "Nama Proyek".`, tools: [], sources: [] };
    }
    const employees = await db.master_employee.findMany({
      where: { ...base, department_id: organizations[0].id, employment_status: { notIn: ['INACTIVE', 'TERMINATED'] } },
      select: { id: true, user_id: true }, take: 501,
    });
    if (employees.length > 500) return { content: 'Tim ini memiliki lebih dari 500 anggota. Persempit permintaan ke proyek tertentu agar hasil tidak terpotong.', tools: ['tasks'], sources: [] };
    team = {
      name: organizations[0].organization_name,
      userIds: employees.map((item: { user_id: string | null }) => item.user_id).filter((id: string | null): id is string => Boolean(id)),
      employeeIds: employees.map((item: { id: string }) => item.id),
    };
  }
  const namedProject = message.match(/(?:proyek|project)\s+["“]([^"”]+)["”]/i)?.[1];
  if (!namedProject && /(?:proyek|project)\s+(?!yang\b|saya\b|kami\b|dan\b|bulan\b|minggu\b|aktif\b|terlambat\b|untuk\b|berjalan\b|selesai\b|sudah\b)([\p{L}\d_-]+)/iu.test(message)) {
    return { content: 'Untuk proyek tertentu, tulis nama lengkap dalam tanda kutip, misalnya proyek "Nama Proyek". Untuk seluruh proyek yang dapat diakses, tanyakan "Ringkas progres proyek saya".', tools: [], sources: [] };
  }
  if (namedProject) {
    requireTool(scope, 'PROJECTS', ['READ_PROJECT', 'READ_TASK']);
    const matches = await db.project_project.findMany({ where: { ...base, ...(projectIds ? { id: { in: projectIds } } : {}), project_name: { equals: namedProject, mode: 'insensitive' } }, select: { id: true }, take: 2 });
    if (matches.length !== 1) return { content: 'Nama proyek belum dapat dipastikan dalam akses Anda. Gunakan nama proyek lengkap dan unik di dalam tanda kutip.', tools: [], sources: [] };
    projectIds = [matches[0].id];
  }
  const projectFilter = projectIds ? { project_id: { in: projectIds } } : {};
  const now = new Date();
  const taskDates = taskDateIntent(message, now);
  const period = tools.some(tool => tool === 'finance' || tool === 'kpi') ? queryPeriod(message, now) : taskDates.period;
  const explicitStatus = message.match(/status\s+["“]([A-Z_]+)["”]/i)?.[1]?.toUpperCase();
  if (explicitStatus && !['DRAFT', 'PLANNED', 'PENDING_APPROVAL', 'REJECTED', 'VERIFIED', 'RESERVED', 'STARTED', 'ACTIVE', 'NOT_STARTED', 'IN_PROGRESS', 'ON_PROGRESS', 'COMPLETED', 'DONE', 'BLOCKED', 'CLOSED', 'RESOLVED', 'OPEN'].includes(explicitStatus)) return { content: 'Status tersebut belum didukung pada query ini. Sebutkan status aktual yang valid. Tidak ada query dijalankan.', tools: [], sources: [] };
  const results: string[] = [];
  const used: string[] = [];
  const periodDomains: string[] = [];
  for (const tool of tools) {
    try {
      if (tool === 'projects') {
        requireTool(scope, 'PROJECTS', ['READ_PROJECT']);
        const status = explicitStatus ? [explicitStatus] : /berjalan|in[ _-]?progress|aktif/i.test(message) ? ['IN_PROGRESS', 'STARTED', 'ACTIVE']
          : /selesai|completed|done/i.test(message) ? ['COMPLETED', 'CLOSED', 'DONE'] : undefined;
        const where = { ...base, ...(projectIds ? { id: { in: projectIds } } : {}), ...(status ? { status: { in: status } } : {}) };
        if (/berdasarkan status|per status|by status/i.test(message)) {
          const groups = await db.project_project.groupBy({ by: ['status'], where, _count: { _all: true }, orderBy: { status: 'asc' } });
          results.push(groups.length ? `Jumlah proyek berdasarkan status dalam akses Anda:\n${groups.map(g => `- ${safe(g.status)}: ${g._count._all}`).join('\n')}` : 'Belum ada proyek dalam akses Anda.');
          used.push(tool);
          continue;
        }
        const [count, rows] = await Promise.all([
          db.project_project.count({ where }),
          db.project_project.findMany({ where, select: { project_name: true, status: true, progress_percent: true, planned_end_date: true }, orderBy: { project_name: 'asc' }, take: 20 }),
        ]);
        results.push(`Proyek dalam akses Anda${status ? ` dengan status ${status.join('/')}` : ''}: ${count}. Menampilkan maksimal 20.\n${rows.map(r => `- ${safe(r.project_name)}: ${safe(r.status)}, progres ${number(r.progress_percent)}%.${r.planned_end_date && r.planned_end_date < now && Number(r.progress_percent) < 100 ? ' Melewati rencana selesai; periksa blocker dan jadwal.' : ''}`).join('\n')}`);
      } else if (tool === 'tasks') {
        requireTool(scope, 'PROJECTS', ['READ_TASK']);
        const self = !canUseDashboard(scope) || /\b(saya|my|mine)\b/i.test(message.replace(/["“][^"”]*["”]/g, ''));
        if (isWeeklyTaskQuestion(message)) {
          const status = explicitStatus || (/menunggu(?: approval| persetujuan)?|pending/i.test(message) ? 'PENDING_APPROVAL'
            : /ditolak|rejected/i.test(message) ? 'REJECTED' : /selesai|completed/i.test(message) ? 'COMPLETED'
            : /berjalan|in[ _-]?progress/i.test(message) ? 'IN_PROGRESS' : /planned|direncanakan/i.test(message) ? 'PLANNED' : undefined);
          const taskName = message.match(/(?:weekly\s+(?:task|target)|(?:tugas|target)\s+mingguan)\s+["“]([^"”]+)["”]/i)?.[1];
          const today = queryPeriod('hari ini', now);
          const rows = await db.$queryRaw<Array<{ target_description: string; status: string; progress: Prisma.Decimal; start_date: Date | null; end_date: Date | null; total: bigint }>>(Prisma.sql`
            SELECT w.target_description, w.status, w.progress, w.start_date, w.end_date, count(*) OVER () AS total
            FROM project_weekly_task w
            JOIN project_main_task m ON m.id = w.main_task_id AND m.tenant_id = w.tenant_id AND m.company_id = w.company_id
            WHERE w.tenant_id = ${scope.tenantId} AND w.company_id = ${scope.companyId}
              ${projectIds ? (projectIds.length ? Prisma.sql`AND m.project_id IN (${Prisma.join(projectIds)})` : Prisma.sql`AND FALSE`) : Prisma.empty}
              ${team ? (team.userIds.length ? Prisma.sql`AND w.assignee_id IN (${Prisma.join(team.userIds)})` : Prisma.sql`AND FALSE`) : self ? Prisma.sql`AND w.assignee_id = ${scope.userId}` : Prisma.empty}
              ${taskDates.hasPeriod ? Prisma.sql`AND w.start_date < ${taskDates.period.end} AND w.end_date >= ${taskDates.period.start}` : Prisma.empty}
              ${taskDates.excludeToday ? Prisma.sql`AND (w.start_date IS NULL OR w.end_date IS NULL OR w.end_date < ${today.start} OR w.start_date >= ${today.end})` : Prisma.empty}
              ${status ? Prisma.sql`AND w.status = ${status}` : Prisma.empty}
              ${taskName ? Prisma.sql`AND lower(w.target_description) = lower(${taskName})` : Prisma.empty}
            ORDER BY w.start_date ASC NULLS LAST, w.id ASC LIMIT 20
          `);
          const label = (value: string) => value === 'PENDING_APPROVAL' ? 'Menunggu Approval (PENDING_APPROVAL)' : value === 'REJECTED' ? 'Ditolak (REJECTED)' : safe(value);
          results.push(rows.length ? `Weekly Task${self ? ' saya' : team ? ` tim ${safe(team.name)}` : ' dalam akses Anda'}: ${rows[0].total.toString()}. Menampilkan maksimal 20.\n${rows.map(row => `- ${safe(row.target_description)} — ${label(row.status)} (${number(row.progress)}%).`).join('\n')}\nWeekly pending/rejected belum dapat digunakan untuk Daily Task.` : 'Belum ada Weekly Task yang sesuai dalam cakupan akses Anda.');
          used.push(tool);
          continue;
        }
        const weekly = taskDates.hasPeriod && /minggu|week/i.test(message);
        const overdueOnly = /terlambat|overdue|carry[ -]?over/i.test(message);
        const statuses = explicitStatus ? [explicitStatus] : /in[ _-]?progress|berjalan|sedang dikerjakan/i.test(message) ? ['IN_PROGRESS', 'ON_PROGRESS']
          : /belum mulai|not[ _-]?started/i.test(message) ? ['NOT_STARTED']
          : /selesai|completed|done/i.test(message) ? ['COMPLETED', 'DONE']
          : /blocked|terkendala/i.test(message) ? ['BLOCKED'] : undefined;
        const taskName = message.match(/(?:task|tugas)\s+["“]([^"”]+)["”]/i)?.[1];
        const jakartaNow = new Date(now.getTime() + 7 * 3600000);
        const todayStart = new Date(Date.UTC(jakartaNow.getUTCFullYear(), jakartaNow.getUTCMonth(), jakartaNow.getUTCDate()) - 7 * 3600000);
        const daily = await db.$queryRaw<Array<{
          title: string; owner_id: string; output_result: string; status: string; progress: Prisma.Decimal;
          planned_date: Date | null; is_blocked: boolean; block_reason: string;
          total: bigint; completed: bigint; overdue: bigint; blocked: bigint;
        }>>(Prisma.sql`
            SELECT d.title, d.owner_id, d.output_result, d.status, d.progress, d.planned_date,
              d.is_blocked, d.block_reason,
              count(*) OVER () AS total,
              count(*) FILTER (WHERE d.status IN ('COMPLETED', 'DONE')) OVER () AS completed,
              count(*) FILTER (
                WHERE d.planned_date < ${todayStart}
                  AND d.status NOT IN ('COMPLETED', 'DONE')
              ) OVER () AS overdue,
              count(*) FILTER (WHERE d.is_blocked OR d.status = 'BLOCKED') OVER () AS blocked
            FROM project_daily_task d
            JOIN project_weekly_task w ON w.id = d.weekly_task_id AND w.tenant_id = d.tenant_id AND w.company_id = d.company_id
            JOIN project_main_task m ON m.id = w.main_task_id AND m.tenant_id = d.tenant_id AND m.company_id = d.company_id
            WHERE d.tenant_id = ${scope.tenantId} AND d.company_id = ${scope.companyId}
              ${projectIds ? (projectIds.length ? Prisma.sql`AND m.project_id IN (${Prisma.join(projectIds)})` : Prisma.sql`AND FALSE`) : Prisma.empty}
              ${team ? (team.userIds.length ? Prisma.sql`AND d.owner_id IN (${Prisma.join(team.userIds)})` : Prisma.sql`AND FALSE`) : self ? Prisma.sql`AND d.owner_id = ${scope.userId}` : Prisma.empty}
              ${taskDates.hasPeriod ? Prisma.sql`AND d.planned_date >= ${taskDates.period.start} AND d.planned_date < ${taskDates.period.end}` : Prisma.empty}
              ${taskDates.excludeToday ? Prisma.sql`AND (d.planned_date IS NULL OR d.planned_date < ${todayStart} OR d.planned_date >= ${new Date(todayStart.getTime() + 86400000)})` : Prisma.empty}
              ${statuses ? Prisma.sql`AND d.status IN (${Prisma.join(statuses)})` : Prisma.empty}
              ${taskName ? Prisma.sql`AND lower(d.title) = lower(${taskName})` : Prisma.empty}
              ${overdueOnly ? Prisma.sql`AND d.planned_date < ${todayStart} AND d.status NOT IN ('COMPLETED', 'DONE')` : Prisma.empty}
            ORDER BY d.planned_date ASC NULLS LAST, d.id ASC LIMIT 20
        `);
        const total = daily[0]?.total ?? 0n;
        const done = daily[0]?.completed ?? 0n;
        const overdue = daily[0]?.overdue ?? 0n;
        const blocked = daily[0]?.blocked ?? 0n;
        const owners = /siapa|owner|penanggung jawab|assignee/i.test(message) && daily.length && !scope.blockedReadModules?.some(m => ['IAM', 'ACCOUNTS', 'MASTER_DATA', 'HR'].includes(m))
          ? await db.iam_user.findMany({ where: { tenant_id: scope.tenantId, id: { in: [...new Set(daily.map(d => d.owner_id))] } }, select: { id: true, full_name: true }, take: 20 }) : [];
        results.push(daily.length
          ? `${team ? `Task harian tim ${safe(team.name)}` : self ? 'Task harian saya' : 'Task harian pada proyek yang dapat Anda akses'}: ${total.toString()}${weekly ? ' pada minggu tersebut' : ''}. Selesai: ${done.toString()}. Terlambat: ${overdue.toString()}. Terkendala: ${blocked.toString()}.\n${daily.map(d => `- ${safe(d.title)}${owners.length ? `; penanggung jawab: ${safe(owners.find(u => u.id === d.owner_id)?.full_name) || 'tidak tersedia'}` : ''} — ${d.planned_date ? d.planned_date.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }) : 'tanpa tanggal'} — ${safe(d.status)} (${number(d.progress)}%)${safe(d.output_result) ? `; hasil: ${safe(d.output_result)}` : '; hasil belum diisi'}${d.is_blocked || d.status === 'BLOCKED' ? `; kendala: ${safe(d.block_reason) || 'belum dijelaskan'}` : ''}.`).join('\n')}\n${Number(overdue) > 0 ? 'Saran: buka filter Terlambat di Tugas Harian, lengkapi output hasil atau kendala, lalu perbarui status task.' : 'Tidak ada task terlambat berdasarkan tanggal rencana yang tercatat.'}\nDaftar maksimal 20 task dari sumber yang sama dengan layar Tugas Harian.`
          : `${overdueOnly ? 'Tidak ada task harian terlambat' : 'Belum ada task harian'} dalam cakupan akses Anda${weekly ? ' pada minggu tersebut' : ''}.`);
      } else if (tool === 'finance') {
        requireTool(scope, 'FINANCE', ['READ_PROJECT_FINANCE', 'READ_COMPANY_FINANCE', 'READ_FINANCE_SUMMARY']);
        periodDomains.push('finance');
        // Match ProjectsService.getFinancialSummary, which is the source used by the ERP
        // financial-summary screen. DRAFT/REJECTED entries must never inflate actual cost.
        const recognizedStatuses = ['VALIDATED', 'APPROVED', 'POSTED_TO_WIP'];
        const sum = await db.fin_project_cost_entry.aggregate({
          where: {
            ...base,
            ...projectFilter,
            status: { in: recognizedStatuses },
            transaction_date: { gte: period.start, lt: period.end },
          },
          _sum: { total_cost: true },
        });
        results.push(sum._sum.total_cost === null ? 'Belum ada biaya proyek berstatus VALIDATED, APPROVED, atau POSTED_TO_WIP pada periode dan cakupan akses ini.' : `Biaya aktual proyek yang diakui pada periode ini: ${number(sum._sum.total_cost)} (status VALIDATED, APPROVED, atau POSTED_TO_WIP; nilai mata uang pembukuan perusahaan). Cakupan hanya proyek yang dapat Anda akses, bukan seluruh laporan keuangan perusahaan.`);
      } else if (tool === 'tickets') {
        requireTool(scope, 'CRM', ['READ_TICKET']);
        if (![RoleCode.DIRECTOR, RoleCode.CRM_LEAD, RoleCode.SALES].includes(scope.roleCode as any)) throw new ForbiddenError();
        const closed = /selesai|resolved|closed|ditutup/i.test(message);
        const where = { ...base, status: explicitStatus ? { in: [explicitStatus] } : closed ? { in: ['CLOSED', 'RESOLVED'] } : { notIn: ['CLOSED', 'RESOLVED'] }, ...(scope.roleCode === RoleCode.SALES ? { assigned_user_id: scope.userId } : {}) };
        const [total, urgent] = await Promise.all([db.service_case.count({ where }), db.service_case.count({ where: { ...where, priority: 'URGENT' } })]);
        results.push(`Tiket support ${explicitStatus ? `berstatus ${explicitStatus}` : closed ? 'selesai/ditutup' : 'terbuka'}: ${total}. Prioritas URGENT: ${urgent}.${urgent && !closed ? ' Saran: tinjau tiket urgent terlebih dahulu.' : ''}`);
      } else if (tool === 'kpi') {
        periodDomains.push('kpi');
        // Company KPI includes HR/finance: restrict each definition to an authorized domain.
        if (!canUseDashboard(scope)) throw new ForbiddenError();
        const allowed = [];
        if (scope.enabledModules.includes('PROJECTS') && scope.permissions.includes('READ_PROJECT') && !scope.blockedReadModules?.includes('PROJECTS')) allowed.push('PROJECTS');
        if (scope.enabledModules.includes('FINANCE') && scope.permissions.includes('READ_COMPANY_FINANCE') && scope.projectScope.mode === 'ALL' && !scope.blockedReadModules?.includes('FINANCE')) allowed.push('FINANCE');
        const definitions = await db.analytics_kpi_definition.findMany({ where: { ...base, active: true, module_code: { in: allowed } }, select: { id: true, kpi_name: true, measurement_unit: true }, take: 100 });
        const rows = await db.analytics_kpi_result.findMany({ where: { ...base, ...projectFilter, kpi_definition_id: { in: definitions.map(d => d.id) }, measured_at: { gte: period.start, lt: period.end } }, select: { kpi_definition_id: true, actual_value: true, target_value: true, health_status: true, measured_at: true }, orderBy: { measured_at: 'desc' }, take: 20 });
        const unhealthy = rows.filter(r => !/^(HEALTHY|ON_TRACK|ACHIEVED|MET|GREEN)$/i.test(String(r.health_status)));
        results.push(rows.length ? `Hasil KPI tercatat (maksimal 20 pengukuran, tidak dijumlahkan lintas dimensi):\n${rows.map(r => `- ${safe(definitions.find(d => d.id === r.kpi_definition_id)?.kpi_name)}: aktual ${number(r.actual_value)}, target ${r.target_value === null ? 'belum ditetapkan' : number(r.target_value)}, status ${safe(r.health_status)}, diukur ${r.measured_at?.toISOString()}.`).join('\n')}${unhealthy.length ? `\nSaran: tinjau ${unhealthy.length} hasil yang belum berstatus sehat/tercapai, pastikan target dan dimensinya benar, lalu tetapkan penanggung jawab tindak lanjut.` : '\nSemua hasil yang ditampilkan berstatus sehat atau tercapai menurut status KPI yang tersimpan.'}` : 'Belum ada hasil KPI tercatat pada periode dan cakupan akses ini. Pencapaian target belum dapat disimpulkan.');
      }
      used.push(tool);
    } catch (error) {
      if (error instanceof ForbiddenError) results.push(`Data ${tool}: tidak tersedia untuk hak akses Anda.`);
      else results.push(`Data ${tool}: query database gagal. Hasil bagian ini tidak tersedia; tidak dapat disimpulkan sebagai nol atau operasi berhasil.`);
    }
  }
  const date = (d: Date) => d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
  const filteredDomains = periodDomains.filter(domain => used.includes(domain));
  const periodLabel = filteredDomains.length ? `Periode filter waktu (${filteredDomains.join(', ')}): ${date(period.start)}–${date(new Date(period.end.getTime() - 1))}.\n` : '';
  const taskPeriodLabel = used.includes('tasks') ? `${taskDates.hasPeriod ? `Periode filter waktu (tasks): ${date(taskDates.period.start)}–${date(new Date(taskDates.period.end.getTime() - 1))}.` : 'Periode tugas: seluruh tanggal, termasuk tugas tanpa tanggal.'}${taskDates.excludeToday ? ' Tugas bertanggal hari ini dikecualikan (Asia/Jakarta).' : ''}\n` : '';
  return { content: `${results.join('\n\n')}\n\n${periodLabel}${taskPeriodLabel}Sumber: data ERP sesuai akses Anda • ${now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB.`, tools: used, sources: used.map(t => `ERP:${t}`) };
}
