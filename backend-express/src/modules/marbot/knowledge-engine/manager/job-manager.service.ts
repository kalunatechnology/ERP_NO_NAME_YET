import prisma from '../../../../config/database';
import { KnowledgeQueueService, type EnqueueJobInput } from '../queue/queue.service';

export class JobManagerService {
  /**
   * Enqueues a job while coalescing with any currently pending jobs of the same type.
   */
  static async enqueueCoalesced(input: EnqueueJobInput): Promise<string> {
    const existing = await prisma.marbot_knowledge_job.findFirst({
      where: {
        job_type: input.jobType,
        queue_name: input.queueName || 'default',
        status: 'PENDING',
      },
    });

    if (existing) {
      return existing.id;
    }

    return KnowledgeQueueService.enqueueJob(input);
  }

  /**
   * Schedules a delta crawl job.
   */
  static async scheduleDeltaCrawl(commitSha?: string): Promise<string> {
    return this.enqueueCoalesced({
      jobType: 'INCREMENTAL_CRAWL',
      priority: 5,
      commitSha,
    });
  }

  /**
   * Schedules a full weekly reconciliation scan job.
   */
  static async scheduleFullReconciliation(commitSha?: string): Promise<string> {
    return this.enqueueCoalesced({
      jobType: 'FULL_RECONCILIATION',
      priority: 1,
      commitSha,
    });
  }
}
