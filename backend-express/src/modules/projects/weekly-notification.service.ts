import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { RoleCode } from '../../types/roles';

type WeeklyEvent = 'CREATED' | 'APPROVED' | 'REJECTED';

/** Notifications share the weekly mutation's transaction and the sidebar feed. */
export class WeeklyNotificationService {
  static async emit(tx: Prisma.TransactionClient, weekly: any, actor: any, event: WeeklyEvent, options: { occurredAt?: Date; dryRun?: boolean } = {}) {
    const scope = { company_id: weekly.company_id, tenant_id: weekly.tenant_id };
    const main = await tx.project_main_task.findFirst({ where: { ...scope, id: weekly.main_task_id }, select: { project_id: true } });
    if (!main) throw new Error('Hierarchy weekly target tidak tersedia untuk notifikasi.');
    const project = await tx.project_project.findFirst({ where: { ...scope, id: main.project_id }, select: { id: true, project_name: true, created_by_id: true, project_manager_id: true } });
    if (!project) throw new Error('Proyek weekly target tidak tersedia untuk notifikasi.');
    const [members, mains, roles] = await Promise.all([
      tx.project_member.findMany({ where: { ...scope, project_id: project.id, status: 'ACTIVE' }, select: { user_id: true, project_role: true } }),
      tx.project_main_task.findMany({ where: { ...scope, project_id: project.id }, select: { id: true } }),
      tx.iam_role.findMany({ where: { tenant_id: weekly.tenant_id, role_code: RoleCode.SUPERVISOR, OR: [{ company_id: weekly.company_id }, { company_id: null }] }, select: { id: true } }),
    ]);
    const assignments = mains.length ? await tx.project_task_assignment.findMany({ where: { ...scope, main_task_id: { in: mains.map(row => row.id) } }, select: { assignee_id: true } }) : [];
    const relatedIds = [...new Set([...members.map(row => row.user_id), ...assignments.map(row => row.assignee_id)].filter((id): id is string => Boolean(id)))];
    const supervisors = relatedIds.length && roles.length ? await tx.iam_user_role.findMany({ where: { ...scope, user_id: { in: relatedIds }, role_id: { in: roles.map(row => row.id) } }, select: { user_id: true } }) : [];
    const recipients = new Set<string>([
      project.created_by_id,
      project.project_manager_id,
      ...members.filter(row => row.project_role === 'PROJECT_MANAGER').map(row => row.user_id),
      ...supervisors.map(row => row.user_id),
      ...members.filter(row => row.project_role === 'ACTING_PROJECT_MANAGER').map(row => row.user_id),
      ...(event !== 'CREATED' ? [weekly.created_by_id, weekly.assignee_id] : weekly.status !== 'PENDING_APPROVAL' ? [weekly.assignee_id] : []),
    ].filter((id): id is string => Boolean(id)));
    recipients.delete(actor.id);
    if (!recipients.size) return 0;
    const memberships = await tx.iam_user_company_membership.findMany({ where: { ...scope, status: 'ACTIVE', user_id: { in: [...recipients] } }, select: { user_id: true } });
    const users = memberships.length ? await tx.iam_user.findMany({ where: { tenant_id: weekly.tenant_id, id: { in: memberships.map(row => row.user_id) }, status: 'ACTIVE', is_active: true }, select: { id: true } }) : [];
    if (!users.length) return 0;
    const now = options.occurredAt ?? new Date();
    const actorName = actor.full_name || 'Pengguna';
    const category = event === 'CREATED' ? 'WEEKLY_TARGET_CREATED' : event === 'APPROVED' ? 'WEEKLY_TARGET_APPROVED' : 'WEEKLY_TARGET_REJECTED';
    const title = event === 'CREATED' ? weekly.status === 'PENDING_APPROVAL' ? 'Pengajuan weekly target baru' : 'Weekly target baru ditambahkan'
      : event === 'APPROVED' ? 'Weekly target disetujui' : 'Weekly target ditolak';
    const action = event === 'CREATED' ? weekly.status === 'PENDING_APPROVAL' ? 'mengajukan' : 'menambahkan' : event === 'APPROVED' ? 'menyetujui' : 'menolak';
    const targetUrl = `/projects?project=${encodeURIComponent(project.id)}&tab=TREE&weekly=${encodeURIComponent(weekly.id)}`;
    const data = users.map(user => {
      // Stable event/recipient IDs prevent duplicate delivery if an event is retried.
      const hash = crypto.createHash('sha256').update(`weekly:${weekly.id}:${event}:${user.id}`).digest('hex');
      const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
      return { ...scope, id, created_by_id: actor.id, actor_id: actor.id, recipient_id: user.id,
        category, title, description: `${actorName} ${action} target minggu #${weekly.week_number}: ${weekly.target_description}. Proyek: ${project.project_name}.${event === 'APPROVED' ? ' PIC dapat membuat Daily Task.' : ''}`,
        target_url: targetUrl, is_read: false, created_at: now, updated_at: now };
    });
    if (options.dryRun) {
      const existing = await tx.core_app_notification.findMany({ where: { ...scope, id: { in: data.map(row => row.id) } }, select: { id: true } });
      return data.length - existing.length;
    }
    return (await tx.core_app_notification.createMany({ data, skipDuplicates: true })).count;
  }
}
