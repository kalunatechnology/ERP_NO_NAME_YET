import { env } from '../src/config/env';
import { createPrismaClient } from './prisma_client';
import { NotificationMaintenanceService } from '../src/modules/core/notification-maintenance.service';
import { ValidationError } from '../src/utils/errors';

async function main() {
  const argument = (flag: string) => {
    const index = process.argv.indexOf(flag);
    if (index === -1) return undefined;
    const value = process.argv[index + 1];
    if (!value || value.startsWith('--')) throw new ValidationError(`Nilai ${flag} wajib diberikan.`);
    return value;
  };
  const apply = process.argv.includes('--apply');
  const companyId = argument('--company');
  const day = argument('--day');
  const db = createPrismaClient(env.DATABASE_URL);
  try {
    const now = new Date();
    // Validate/backfill first so an invalid day never triggers cleanup.
    const backfill = day
      ? await NotificationMaintenanceService.backfillWeeklyDay(db, { now, day, companyId, dryRun: !apply })
      : await NotificationMaintenanceService.reconcileWeeklyNotifications(db, { now, companyId, dryRun: !apply });
    const expired = await NotificationMaintenanceService.cleanup(db, now, companyId, !apply);
    console.log(JSON.stringify({ mode: apply ? 'APPLIED' : 'DRY_RUN', scope: companyId ?? 'configured_database', backfill, expired_notifications: expired }, null, 2));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error('[notifications] maintenance failed', { code: error.code ?? 'MAINTENANCE_FAILED', detail: error instanceof Error && error.name === 'ValidationError' ? error.message : 'Periksa koneksi database; kredensial tidak ditampilkan.' }); process.exitCode = 1; });
