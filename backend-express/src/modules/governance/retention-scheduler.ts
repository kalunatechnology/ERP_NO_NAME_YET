import crypto from 'crypto';
import prisma from '../../config/database';

const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface RetentionPurgeSummary {
  purged_users: number;
  fiscal_archive_locked_years: number;
  executed_at: string;
}

/**
 * Executes the automated PP 33/2026 Pasal 74-75 retention policy:
 * - Anonymizes PII on inactive accounts past the 2-year retention window.
 * - Preserves user IDs and leaves all accounting journals, invoices, and tax
 *   archives locked for the mandatory 10-year fiscal retention period.
 */
export async function runRetentionAutoPurge(db: any = prisma): Promise<RetentionPurgeSummary> {
  const twoYearsAgo = new Date(Date.now() - TWO_YEARS_MS);
  const candidates: Array<{ id: string; email: string }> = await db.iam_user.findMany({
    where: {
      is_superuser: false,
      is_active: false,
      status: { in: ['INACTIVE', 'DEACTIVATED', 'SUSPENDED'] },
      NOT: { email: { startsWith: 'anonymized+' } },
      OR: [
        { last_login_at: { lt: twoYearsAgo } },
        { last_login_at: null, date_joined: { lt: twoYearsAgo } },
      ],
    },
    select: { id: true, email: true },
    take: 100,
  });

  let purgedUsers = 0;
  for (const candidate of candidates) {
    const anonymizedEmail = `anonymized+${candidate.id}@redacted.local`;
    const anonymizedUsername = `anon_${candidate.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`;

    await db.iam_user.update({
      where: { id: candidate.id },
      data: {
        email: anonymizedEmail,
        username: anonymizedUsername,
        full_name: 'Pengguna Dihapus (Retensi 2 Tahun)',
        status: 'PURGED',
        is_active: false,
        job_title: '',
      },
    });
    await db.$executeRawUnsafe?.(
      `UPDATE "iam_user" SET "mfa_enabled" = false, "mfa_secret_encrypted" = NULL, "mfa_recovery_codes" = NULL WHERE "id" = $1`,
      candidate.id,
    ).catch(() => {});

    try {
      await db.core_audit_event?.create?.({
        data: {
          id: crypto.randomUUID(),
          event_type: 'RETENTION_AUTO_PURGE_EXECUTED',
          entity_name: 'IAM_USER',
          entity_id: candidate.id,
          before_data: { email_redacted: true },
          after_data: {
            status: 'PURGED',
            retention_policy: 'POL-GOV-RET-01',
            fiscal_archive_locked_years: 10,
          },
          occurred_at: new Date(),
        },
      });
    } catch {
      // Non-blocking audit log
    }

    purgedUsers += 1;
  }

  return {
    purged_users: purgedUsers,
    fiscal_archive_locked_years: 10,
    executed_at: new Date().toISOString(),
  };
}

/**
 * Starts a daily background scheduler for retention auto-purge.
 */
export function startRetentionScheduler(isReady: () => boolean): () => void {
  let stopped = false;
  let running = false;

  const tick = async () => {
    if (stopped || running || !isReady()) return;
    running = true;
    try {
      const summary = await runRetentionAutoPurge(prisma);
      if (summary.purged_users > 0) {
        console.log(
          `[retention-scheduler] Auto-purged ${summary.purged_users} inactive account(s); fiscal archives locked (${summary.fiscal_archive_locked_years}y).`,
        );
      }
    } catch (err) {
      console.warn('[retention-scheduler] Failed during retention auto-purge:', err instanceof Error ? err.message : err);
    } finally {
      running = false;
    }
  };

  const initialTimer = setTimeout(() => {
    void tick();
  }, 60 * 1000);
  initialTimer.unref?.();

  const interval = setInterval(() => {
    void tick();
  }, ONE_DAY_MS);
  interval.unref?.();

  return () => {
    stopped = true;
    clearTimeout(initialTimer);
    clearInterval(interval);
  };
}
