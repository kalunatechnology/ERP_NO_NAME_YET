import { PrismaClient } from '@prisma/client';
import { WeeklyNotificationService } from '../projects/weekly-notification.service';
import { ValidationError } from '../../utils/errors';

export const NOTIFICATION_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
export const notificationCutoff = (now = new Date()) => new Date(now.getTime() - NOTIFICATION_RETENTION_MS);

export function jakartaDayWindow(now: Date, day?: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (name: string) => parts.find(item => item.type === name)!.value;
  const date = day ?? `${part('year')}-${part('month')}-${part('day')}`;
  const start = new Date(`${date}T00:00:00+07:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(start.getTime()) || new Date(start.getTime() + 7 * 3600000).toISOString().slice(0, 10) !== date) {
    throw new ValidationError('Tanggal harus valid dengan format YYYY-MM-DD.');
  }
  const end = new Date(Math.min(start.getTime() + 24 * 3600000, now.getTime()));
  if (start < notificationCutoff(now) || start >= end) throw new ValidationError('Tanggal pengisian harus berada dalam masa simpan 3 hari dan tidak di masa depan.');
  return { day: date, start, end };
}

export class NotificationMaintenanceService {
  static async cleanup(db: PrismaClient, now = new Date(), companyId?: string, dryRun = false) {
    const where = { created_at: { lte: notificationCutoff(now) }, ...(companyId ? { company_id: companyId } : {}) };
    return dryRun ? db.core_app_notification.count({ where }) : (await db.core_app_notification.deleteMany({ where })).count;
  }

  /** Reconcile all retained events, including changes missed before midnight/restart. */
  static async reconcileWeeklyNotifications(db: PrismaClient, options: { now?: Date; companyId?: string; dryRun?: boolean } = {}) {
    const now = options.now ?? new Date();
    return this.reconcileWeeklyRange(db, { ...options, start: new Date(notificationCutoff(now).getTime() + 1), end: now });
  }

  /** Optional day-limited preview/apply uses the same reconciliation as the runtime. */
  static async backfillWeeklyDay(db: PrismaClient, options: { now?: Date; day?: string; companyId?: string; dryRun?: boolean } = {}) {
    const now = options.now ?? new Date();
    const window = jakartaDayWindow(now, options.day);
    return { day: window.day, ...await this.reconcileWeeklyRange(db, { ...options, start: window.start, end: window.end }) };
  }

  /** Recover only evidenced events; never infer approval from updated_at/current status. */
  private static async reconcileWeeklyRange(db: PrismaClient, options: { start: Date; end: Date; companyId?: string; dryRun?: boolean }) {
    const scope = options.companyId ? { company_id: options.companyId } : {};
    const [created, decisions] = await Promise.all([
      db.project_weekly_task.findMany({ where: { ...scope, created_at: { gte: options.start, lt: options.end } }, orderBy: { created_at: 'asc' } }),
      db.project_task_activity_log.findMany({ where: { ...scope, task_level: 'WEEKLY', action: { in: ['WEEKLY_APPROVED', 'WEEKLY_REJECTED'] }, created_at: { gte: options.start, lt: options.end } }, orderBy: { created_at: 'asc' } }),
    ]);
    let inserted = 0, skipped = 0;
    const deliver = async (weekly: any, actorId: string | null, event: 'CREATED' | 'APPROVED' | 'REJECTED', occurredAt: Date) => {
      if (!weekly?.tenant_id || !weekly?.company_id || !actorId) { skipped++; return; }
      inserted += await db.$transaction(async tx => {
        const current = await tx.project_weekly_task.findFirst({ where: { id: weekly.id, tenant_id: weekly.tenant_id, company_id: weekly.company_id }, select: { id: true } });
        if (!current) { skipped++; return 0; }
        const actor = await tx.iam_user.findFirst({ where: { id: actorId, tenant_id: weekly.tenant_id }, select: { id: true, full_name: true } });
        const main = await tx.project_main_task.findFirst({ where: { id: weekly.main_task_id, tenant_id: weekly.tenant_id, company_id: weekly.company_id }, select: { project_id: true } });
        if (!actor || !main) { skipped++; return 0; }
        const project = await tx.project_project.findFirst({ where: { id: main.project_id, tenant_id: weekly.tenant_id, company_id: weekly.company_id }, select: { id: true } });
        if (!project) { skipped++; return 0; }
        return WeeklyNotificationService.emit(tx, weekly, actor, event, { occurredAt, dryRun: options.dryRun });
      }, { maxWait: 5000, timeout: 30000 });
    };
    for (const weekly of created) {
      const wasReviewed = decisions.some(row => row.task_id === weekly.id && row.company_id === weekly.company_id && row.tenant_id === weekly.tenant_id);
      await deliver(wasReviewed ? { ...weekly, status: 'PENDING_APPROVAL' } : weekly, weekly.created_by_id, 'CREATED', weekly.created_at);
    }
    for (const log of decisions) {
      const weekly = log.task_id && log.tenant_id && log.company_id ? await db.project_weekly_task.findFirst({ where: { id: log.task_id, tenant_id: log.tenant_id, company_id: log.company_id } }) : null;
      await deliver(weekly ? { ...weekly, target_description: log.task_title || weekly.target_description } : null, log.actor_id, log.action === 'WEEKLY_APPROVED' ? 'APPROVED' : 'REJECTED', log.created_at);
    }
    return { from: options.start.toISOString(), until: options.end.toISOString(), created_events: created.length, decision_events: decisions.length, inserted, skipped, dry_run: Boolean(options.dryRun) };
  }
}

/** Runs after DB readiness and hourly; timers never delay shutdown or overlap. */
export function startNotificationMaintenance(db: PrismaClient, isReady: () => boolean) {
  let running = false, stopped = false;
  const run = async () => {
    if (running || stopped || !isReady()) return;
    running = true;
    try {
      const removed = await NotificationMaintenanceService.cleanup(db);
      if (stopped || !isReady()) return;
      const backfill = await NotificationMaintenanceService.reconcileWeeklyNotifications(db);
      if (removed || backfill.inserted) console.log('[notifications] maintenance', { removed, inserted: backfill.inserted, skipped: backfill.skipped });
    } catch (error) {
      // Driver errors can include connection credentials. Log only the code.
      console.warn('[notifications] maintenance failed; retrying next hour', { code: (error as { code?: string }).code ?? 'MAINTENANCE_FAILED' });
    } finally { running = false; }
  };
  const timer = setInterval(() => void run(), 3600000);
  timer.unref();
  void run();
  return () => { stopped = true; clearInterval(timer); };
}
