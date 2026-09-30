import { Prisma, RoleCode } from '@prisma/client';
import prisma from '../../config/database';
import { ForbiddenError, ValidationError } from '../../utils/errors';
import { MarbotRuntimeAuthority } from './marbot.types';
import { helperAnswer } from './marbot-knowledge';

export type NativeScope = MarbotRuntimeAuthority & { tenantId: string; companyId: string; userId: string };
export const dashboardRoles: RoleCode[] = [RoleCode.DIRECTOR, RoleCode.OPERATIONAL_MANAGER, RoleCode.PROJECT_MANAGER];
export type AssistantMode = 'HELPER' | 'DASHBOARD';
export function canUseDashboard(scope: MarbotRuntimeAuthority) {
  return dashboardRoles.includes(scope.roleCode) && scope.permissions.some(p => ['READ_PROJECT', 'READ_TASK'].includes(p));
}
export function detectTools(message: string): string[] {
  const tools: string[] = [];
  if (/proyek|project|portfolio|portofolio|progress|progres/i.test(message)) tools.push('projects');
  if (/tugas|task|tim|team|minggu|pekerjaan|kerjakan|overdue|terlambat/i.test(message)) tools.push('tasks');
  if (/biaya|expense|keuangan|pengeluaran|anggaran/i.test(message)) tools.push('finance');
  if (/tiket|ticket|support|aduan/i.test(message)) tools.push('tickets');
  if (/kpi|target/i.test(message)) tools.push('kpi');
  return tools;
}

// Business periods follow Asia/Jakarta, independent of the server timezone.
export function queryPeriod(message: string, now = new Date()) {
  const jakarta = new Date(now.getTime() + 7 * 3600000);
  const explicit = message.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  let start: Date;
  let end: Date;
  if (/minggu|week/i.test(message) && !explicit) {
    const offset = (jakarta.getUTCDay() + 6) % 7 + (/lalu|last/i.test(message) ? 7 : 0);
    start = new Date(Date.UTC(jakarta.getUTCFullYear(), jakarta.getUTCMonth(), jakarta.getUTCDate() - offset) - 7 * 3600000);
    end = new Date(start.getTime() + 7 * 86400000);
  } else {
    const year = explicit ? Number(explicit[1]) : jakarta.getUTCFullYear();
    const month = explicit ? Number(explicit[2]) - 1 : jakarta.getUTCMonth() - (/bulan lalu|last month/i.test(message) ? 1 : 0);
    start = new Date(Date.UTC(year, month, 1) - 7 * 3600000);
    end = new Date(Date.UTC(year, month + 1, 1) - 7 * 3600000);
  }
  return { start, end };
}

function requireTool(scope: NativeScope, module: string, permissions: string[]) {
  if (!scope.enabledModules.includes(module) || !permissions.some(p => scope.permissions.includes(p))) {
    throw new ForbiddenError('Anda tidak memiliki akses untuk data ini.');
  }
}
const safe = (value: unknown) => String(value ?? '').replace(/[\r\n\[\]<>`*_]/g, ' ').slice(0, 160);
const number = (value: unknown) => Number(value || 0).toLocaleString('id-ID');

export function followUpQuestion(message: string, previous?: string): string {
  if (!previous || !/^(dan|kalau|bagaimana dengan|lalu|yang)\b/i.test(message)) return message;
  // Reuse only the topic; dates are parsed from the new question, never stale results.
  if (detectTools(message).length) return message;
  const topics = detectTools(previous).map(t => ({ projects: 'proyek', tasks: 'tugas', finance: 'biaya', tickets: 'tiket', kpi: 'KPI' }[t]));
  const project = previous.match(/(?:proyek|project)\s+["“]([^"”]+)["”]/i)?.[0] || '';
  return `${message} ${topics.join(' ')} ${project}`.trim();
}

export async function answerNative(message: string, mode: AssistantMode, scope: NativeScope, db = prisma) {
  if (mode === 'DASHBOARD' && !canUseDashboard(scope)) throw new ForbiddenError('Dashboard Assistant hanya tersedia untuk pimpinan dengan akses data proyek.');
  if (/\b(cara|bagaimana|panduan|dimana|di mana|how)\b/i.test(message) && !/progres|progress|kinerja|kpi|target/i.test(message)) {
    return { content: helperAnswer(message), tools: ['help.procedure'], sources: ['Panduan ERP 2026-09-30'] };
  }
  if (/^\s*(buatkan|buat|hapus|ubah|setujui|approve|delete|update|tambahkan)\b/i.test(message) && !/ringkasan|laporan|summary/i.test(message)) {
    return { content: `Chat ini menyediakan panduan dan pembacaan data. Untuk melakukan perubahan, gunakan formulir ERP.\n\n${helperAnswer(message)}`, tools: [], sources: [] };
  }
  const tools = detectTools(message);
  if (!tools.length) return { content: helperAnswer(message), tools: ['help.procedure'], sources: ['Panduan ERP 2026-09-30'] };
  const base = { tenant_id: scope.tenantId, company_id: scope.companyId };
  let projectIds = scope.projectScope.mode === 'LIST' ? scope.projectScope.projectIds : undefined;
  const namedTeam = message.match(/\b(?:tim|team)\s+["“]?([^"”,?.]+?)["”]?(?=\s+(?:minggu|bulan|sudah|telah|mengerjakan|kerjakan|progres|progress|ini|lalu)\b|[,.?]|$)/iu)?.[1]?.trim();
  let team: { name: string; userIds: string[]; employeeIds: string[] } | null = null;
  if (namedTeam && !/^(saya|kami|ini|yang)$/i.test(namedTeam)) {
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
      select: { id: true, user_id: true }, take: 500,
    });
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
  const period = queryPeriod(message, now);
  const results: string[] = [];
  const used: string[] = [];
  for (const tool of tools) {
    try {
      if (tool === 'projects') {
        requireTool(scope, 'PROJECTS', ['READ_PROJECT']);
        const where = { ...base, ...(projectIds ? { id: { in: projectIds } } : {}) };
        const [count, rows] = await Promise.all([
          db.project_project.count({ where }),
          db.project_project.findMany({ where, select: { project_name: true, status: true, progress_percent: true, planned_end_date: true }, orderBy: { project_name: 'asc' }, take: 20 }),
        ]);
        results.push(`Proyek dalam akses Anda: ${count}. Menampilkan maksimal 20.\n${rows.map(r => `- ${safe(r.project_name)}: ${safe(r.status)}, progres ${number(r.progress_percent)}%.${r.planned_end_date && r.planned_end_date < now && Number(r.progress_percent) < 100 ? ' Melewati rencana selesai; periksa blocker dan jadwal.' : ''}`).join('\n')}`);
      } else if (tool === 'tasks') {
        requireTool(scope, 'PROJECTS', ['READ_TASK']);
        const self = !canUseDashboard(scope);
        const employee = self ? await db.master_employee.findFirst({ where: { ...base, user_id: scope.userId }, select: { id: true } }) : null;
        const assigneeIds = team ? [...team.userIds, ...team.employeeIds] : self ? [scope.userId, employee?.id].filter((id): id is string => Boolean(id)) : null;
        const where: Prisma.project_taskWhereInput = { ...base, ...projectFilter, ...(assigneeIds ? { assigned_to_id: { in: assigneeIds } } : {}) };
        const weekly = /minggu|week/i.test(message);
        const changed = weekly ? { ...where, updated_at: { gte: period.start, lt: period.end } } : where;
        const [total, done, overdue, rows] = await Promise.all([
          db.project_task.count({ where: changed }),
          db.project_task.count({ where: { ...where, status: 'DONE', ...(weekly ? { actual_end_at: { gte: period.start, lt: period.end } } : {}) } }),
          db.project_task.count({ where: { ...where, status: { notIn: ['DONE', 'CANCELLED'] }, planned_end_at: { lt: now } } }),
          db.project_task.findMany({ where: changed, select: { task_name: true, status: true, progress_percent: true }, orderBy: { updated_at: 'desc' }, take: 15 }),
        ]);
        results.push(`${team ? `Tugas tim ${safe(team.name)}` : self ? 'Tugas saya' : 'Tugas pada proyek yang dapat Anda akses'}: ${total}${weekly ? ' task diperbarui pada periode ini' : ' task'}. Selesai${weekly ? ' berdasarkan tanggal selesai aktual' : ''}: ${done}. Terlambat saat ini: ${overdue}.\n${rows.map(r => `- ${safe(r.task_name)}: ${safe(r.status)} (${number(r.progress_percent)}%).`).join('\n')}\n${overdue ? 'Saran: periksa task terlambat, konfirmasi kendala dengan penanggung jawab, dan tinjau ulang jadwal.' : 'Tidak ada task terlambat berdasarkan tenggat yang tercatat.'}\nDaftar maksimal 15 task; pembaruan task bukan bukti seluruh aktivitas kerja tim.`);
        if (weekly) {
          const daily = await db.$queryRaw<Array<{ title: string; output_result: string; status: string; is_blocked: boolean; block_reason: string; total: bigint; blocked: bigint }>>(Prisma.sql`
            SELECT d.title, d.output_result, d.status, d.is_blocked, d.block_reason,
              count(*) OVER () AS total,
              count(*) FILTER (WHERE d.is_blocked) OVER () AS blocked
            FROM project_daily_task d
            JOIN project_weekly_task w ON w.id = d.weekly_task_id AND w.tenant_id = d.tenant_id AND w.company_id = d.company_id
            JOIN project_main_task m ON m.id = w.main_task_id AND m.tenant_id = d.tenant_id AND m.company_id = d.company_id
            WHERE d.tenant_id = ${scope.tenantId} AND d.company_id = ${scope.companyId}
              AND d.planned_date >= ${period.start} AND d.planned_date < ${period.end}
              ${projectIds ? (projectIds.length ? Prisma.sql`AND m.project_id IN (${Prisma.join(projectIds)})` : Prisma.sql`AND FALSE`) : Prisma.empty}
              ${team ? (team.userIds.length ? Prisma.sql`AND d.owner_id IN (${Prisma.join(team.userIds)})` : Prisma.sql`AND FALSE`) : self ? Prisma.sql`AND d.owner_id = ${scope.userId}` : Prisma.empty}
            ORDER BY d.planned_date DESC, d.id ASC LIMIT 20
          `);
          results.push(daily.length ? `Catatan kerja harian pada minggu tersebut: ${daily[0].total.toString()}; terhambat: ${daily[0].blocked.toString()}. Menampilkan maksimal 20 catatan berdasarkan tanggal rencana.\n${daily.map(d => `- ${safe(d.title)} (${safe(d.status)}): ${safe(d.output_result) || 'hasil belum diisi'}${d.is_blocked ? `; kendala: ${safe(d.block_reason)}` : ''}.`).join('\n')}` : 'Belum ada catatan kerja harian terjadwal pada minggu tersebut dalam cakupan akses Anda.');
        }
      } else if (tool === 'finance') {
        requireTool(scope, 'FINANCE', ['READ_PROJECT_FINANCE', 'READ_COMPANY_FINANCE', 'READ_FINANCE_SUMMARY']);
        const sum = await db.fin_project_cost_entry.aggregate({ where: { ...base, ...projectFilter, status: 'POSTED', transaction_date: { gte: period.start, lt: period.end } }, _sum: { total_cost: true } });
        results.push(`Biaya proyek berstatus POSTED pada periode ini: ${number(sum._sum.total_cost)} (nilai mata uang pembukuan perusahaan). Cakupan hanya biaya proyek yang dapat Anda akses, bukan seluruh laporan keuangan perusahaan.`);
      } else if (tool === 'tickets') {
        requireTool(scope, 'CRM', ['READ_TICKET']);
        if (![RoleCode.DIRECTOR, RoleCode.CRM_LEAD, RoleCode.SALES].includes(scope.roleCode as any)) throw new ForbiddenError();
        const where = { ...base, status: { notIn: ['CLOSED', 'RESOLVED'] }, ...(scope.roleCode === RoleCode.SALES ? { assigned_user_id: scope.userId } : {}) };
        const [total, urgent] = await Promise.all([db.service_case.count({ where }), db.service_case.count({ where: { ...where, priority: 'URGENT' } })]);
        results.push(`Tiket support terbuka: ${total}. Prioritas URGENT: ${urgent}.${urgent ? ' Saran: tangani tiket urgent terlebih dahulu.' : ''}`);
      } else if (tool === 'kpi') {
        // Company KPI includes HR/finance: restrict each definition to an authorized domain.
        if (!canUseDashboard(scope)) throw new ForbiddenError();
        const allowed = [];
        if (scope.enabledModules.includes('PROJECTS') && scope.permissions.includes('READ_PROJECT')) allowed.push('PROJECTS');
        if (scope.enabledModules.includes('FINANCE') && scope.permissions.includes('READ_COMPANY_FINANCE') && scope.projectScope.mode === 'ALL') allowed.push('FINANCE');
        const definitions = await db.analytics_kpi_definition.findMany({ where: { ...base, active: true, module_code: { in: allowed } }, select: { id: true, kpi_name: true, measurement_unit: true }, take: 100 });
        const rows = await db.analytics_kpi_result.findMany({ where: { ...base, ...projectFilter, kpi_definition_id: { in: definitions.map(d => d.id) }, measured_at: { gte: period.start, lt: period.end } }, select: { kpi_definition_id: true, actual_value: true, target_value: true, health_status: true, measured_at: true }, orderBy: { measured_at: 'desc' }, take: 20 });
        const unhealthy = rows.filter(r => !/^(HEALTHY|ON_TRACK|ACHIEVED|MET|GREEN)$/i.test(String(r.health_status)));
        results.push(rows.length ? `Hasil KPI tercatat (maksimal 20 pengukuran, tidak dijumlahkan lintas dimensi):\n${rows.map(r => `- ${safe(definitions.find(d => d.id === r.kpi_definition_id)?.kpi_name)}: aktual ${number(r.actual_value)}, target ${r.target_value === null ? 'belum ditetapkan' : number(r.target_value)}, status ${safe(r.health_status)}, diukur ${r.measured_at?.toISOString()}.`).join('\n')}${unhealthy.length ? `\nSaran: tinjau ${unhealthy.length} hasil yang belum berstatus sehat/tercapai, pastikan target dan dimensinya benar, lalu tetapkan penanggung jawab tindak lanjut.` : '\nSemua hasil yang ditampilkan berstatus sehat atau tercapai menurut status KPI yang tersimpan.'}` : 'Belum ada hasil KPI tercatat pada periode dan cakupan akses ini. Pencapaian target belum dapat disimpulkan.');
      }
      used.push(tool);
    } catch (error) {
      if (error instanceof ForbiddenError) results.push(`Data ${tool}: tidak tersedia untuk hak akses Anda.`);
      else throw error;
    }
  }
  const date = (d: Date) => d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
  return { content: `${results.join('\n\n')}\n\nPeriode mingguan/bulanan: ${date(period.start)}–${date(new Date(period.end.getTime() - 1))}.\nSumber: data ERP sesuai akses Anda • ${now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB.`, tools: used, sources: used.map(t => `ERP:${t}`) };
}
