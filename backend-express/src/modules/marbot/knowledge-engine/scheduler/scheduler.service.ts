import { env } from '../../../../config/env';
import { JobLockService } from './job-lock.service';
import { JobManagerService } from '../manager/job-manager.service';

export class KnowledgeEngineScheduler {
  private static lastTriggeredDay = '';

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
   * Starts the cron evaluation loop.
   */
  static startScheduler(isReady: () => boolean, intervalMs = 60000) {
    const timer = setInterval(() => {
      if (!isReady()) return;
      this.checkSchedule().catch((err) => {
        console.warn('Knowledge engine scheduler tick error:', err);
      });
    }, intervalMs);

    timer.unref?.();
    return () => clearInterval(timer);
  }
}
