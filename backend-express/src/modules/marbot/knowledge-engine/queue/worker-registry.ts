import {
  KnowledgeQueueService,
  type ClaimedKnowledgeJob,
} from './queue.service';
import { ScanCoordinatorService } from '../manager/scan-coordinator.service';

export class WorkerRegistry {
  /**
   * Processes a single claimed job according to its job_type.
   */
  static async processJob(job: ClaimedKnowledgeJob): Promise<void> {
    const isFullReconcile = job.job_type === 'FULL_RECONCILIATION';

    switch (job.job_type) {
      case 'INCREMENTAL_CRAWL':
      case 'FULL_RECONCILIATION':
        await ScanCoordinatorService.runScan({
          commitSha: job.commit_sha ?? undefined,
          isFullReconcile,
        });
        break;

      default:
        console.warn(`Unknown knowledge job type: ${job.job_type}`);
        break;
    }

    await KnowledgeQueueService.completeJob(job.id, job.lock_token);
  }

  /**
   * Processes a batch of claimed knowledge engine jobs.
   */
  static async processBatch(
    workerId = `ke-worker-${process.pid}`,
    limit = 2
  ): Promise<{ claimed: number; completed: number; failed: number }> {
    const jobs = await KnowledgeQueueService.claimJobs(workerId, 'default', limit);
    let completed = 0;
    let failed = 0;

    for (const job of jobs) {
      try {
        await this.processJob(job);
        completed += 1;
      } catch (error) {
        failed += 1;
        await KnowledgeQueueService.failJob(
          job.id,
          job.lock_token,
          error,
          job.attempt_count,
          job.max_attempts
        );
      }
    }

    return { claimed: jobs.length, completed, failed };
  }

  /**
   * Starts the background worker interval for processing knowledge jobs.
   */
  static startWorker(isReady: () => boolean, intervalMs = 5000) {
    let active = false;
    const timer = setInterval(() => {
      if (!isReady() || active) return;
      active = true;
      this.processBatch()
        .catch((error) => {
          console.warn('Knowledge engine worker batch error:', error);
        })
        .finally(() => {
          active = false;
        });
    }, intervalMs);

    timer.unref?.();
    return () => clearInterval(timer);
  }
}
