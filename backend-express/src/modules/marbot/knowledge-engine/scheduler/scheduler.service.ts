import { env } from '../../../../config/env';
import { JobLockService } from './job-lock.service';
import { JobManagerService } from '../manager/job-manager.service';
import { RepositoryCrawler } from '../crawler/repository-crawler';
import { SnapshotManager } from '../publishing/snapshot-manager';
import { ScanCoordinatorService } from '../manager/scan-coordinator.service';

export class KnowledgeEngineScheduler {
  private static lastTriggeredDay = '';

  /**
   * Automatically checks on server startup whether the current Git commit
   * differs from the active snapshot. If so, triggers sync immediately without
   * needing any external curl commands.
   */
  static async checkStartupCommitSync(): Promise<void> {
    if (!env.MARBOT_KE_ENABLED) return;

    try {
      const currentCommit = RepositoryCrawler.resolveCommitSha();
      const activeSnapshot = await SnapshotManager.getActiveSnapshot();

      // If no active snapshot exists yet, or current commit is different from active snapshot
      if (!activeSnapshot || activeSnapshot.commit_sha !== currentCommit) {
        const workerId = `startup-sync-${process.pid}`;
        const lock = await JobLockService.acquireLock(
          'marbot_ke_startup_sync',
          workerId,
          900,
          currentCommit
        );

        if (lock.acquired) {
          console.log(
            `🚀 [MKIE] New commit detected (${currentCommit}). Auto-syncing knowledge engine without manual curl...`
          );
          if (env.MARBOT_KE_MODE !== 'observation') {
            await ScanCoordinatorService.runScan({
              commitSha: currentCommit,
              isFullReconcile: false,
            });
          } else {
            await JobManagerService.scheduleDeltaCrawl(currentCommit);
          }
        }
      }
    } catch (err) {
      console.warn(
        '[MKIE] Startup auto-sync check skipped:',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  /**
   * Evaluates the current Asia/Jakarta time and triggers daily or weekly jobs.
   */
  static async checkSchedule(): Promise<void> {
    if (!env.MARBOT_KE_ENABLED) return;

    const now = new Date();
    // Get Asia/Jakarta date and hour
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const year = parts.find((p) => p.type === 'year')?.value || '';
    const month = parts.find((p) => p.type === 'month')?.value || '';
    const day = parts.find((p) => p.type === 'day')?.value || '';
    const hour = parts.find((p) => p.type === 'hour')?.value || '';

    const todayStr = `${year}-${month}-${day}`;

    // Target: Midnight hour (00) in Asia/Jakarta once per day
    if (hour === '00' && this.lastTriggeredDay !== todayStr) {
      const workerId = `scheduler-${process.pid}`;
      const lock = await JobLockService.acquireLock(
        'marbot_ke_cron_trigger',
        workerId,
        1800
      );

      if (lock.acquired) {
        this.lastTriggeredDay = todayStr;

        // Check if Sunday (day of week 0) for full reconciliation
        const dayOfWeek = new Date(todayStr).getDay();
        if (dayOfWeek === 0) {
          await JobManagerService.scheduleFullReconciliation();
        } else {
          await JobManagerService.scheduleDeltaCrawl();
        }
      }
    }
  }

  /**
   * Starts the scheduler with an auto-sync check on boot, plus the recurring evaluation loop.
   */
  static startScheduler(isReady: () => boolean, intervalMs = 60000) {
    // 1. Run automatic commit diff check 3 seconds after server is ready
    const startupTimeout = setTimeout(() => {
      if (isReady()) {
        void this.checkStartupCommitSync();
      }
    }, 3000);
    startupTimeout.unref?.();

    // 2. Periodic cron evaluation loop
    const timer = setInterval(() => {
      if (!isReady()) return;
      this.checkSchedule().catch((err) => {
        console.warn('Knowledge engine scheduler tick error:', err);
      });
    }, intervalMs);

    timer.unref?.();

    return () => {
      clearTimeout(startupTimeout);
      clearInterval(timer);
    };
  }
}
