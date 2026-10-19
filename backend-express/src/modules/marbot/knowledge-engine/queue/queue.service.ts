import prisma from '../../../../config/database';

export interface ClaimedKnowledgeJob {
  id: string;
  job_type: string;
  queue_name: string;
  priority: number;
  payload_json: string | null;
  checkpoint_json: string | null;
  attempt_count: number;
  max_attempts: number;
  lock_token: string;
  commit_sha: string | null;
}

export interface EnqueueJobInput {
  jobType: string;
  queueName?: string;
  priority?: number;
  payload?: unknown;
  commitSha?: string;
  maxAttempts?: number;
}

export class KnowledgeQueueService {
  /**
   * Enqueues a new knowledge engine job.
   */
  static async enqueueJob(input: EnqueueJobInput): Promise<string> {
    const queueName = input.queueName || 'default';
    const priority = input.priority ?? 10;
    const maxAttempts = input.maxAttempts ?? 5;
    const payloadJson = input.payload ? JSON.stringify(input.payload) : null;

    const job = await prisma.marbot_knowledge_job.create({
      data: {
        job_type: input.jobType,
        queue_name: queueName,
        priority,
        payload_json: payloadJson,
        status: 'PENDING',
        max_attempts: maxAttempts,
        commit_sha: input.commitSha ?? null,
      },
    });

    return job.id;
  }

  /**
   * Claims up to `limit` jobs for a worker using PostgreSQL lease and FOR UPDATE SKIP LOCKED.
   */
  static async claimJobs(
    workerId: string,
    queueName = 'default',
    limit = 5
  ): Promise<ClaimedKnowledgeJob[]> {
    // 1. Move expired processing jobs that exhausted attempts to DEAD_LETTER
    await prisma.$executeRaw`
      UPDATE marbot_knowledge_job
      SET status = 'DEAD_LETTER',
          locked_by = NULL,
          lock_token = NULL,
          locked_until = NULL,
          last_error = COALESCE(last_error, 'Retry limit reached after lease expiration.'),
          updated_at = NOW()
      WHERE status = 'PROCESSING'
        AND locked_until < NOW()
        AND attempt_count >= max_attempts
    `;

    // 2. Claim available candidates
    return prisma.$queryRaw<ClaimedKnowledgeJob[]>`
      WITH candidates AS (
        SELECT id
        FROM marbot_knowledge_job
        WHERE queue_name = ${queueName}
          AND attempt_count < max_attempts
          AND (
            (status = 'PENDING' AND next_retry_at <= NOW())
            OR (status = 'PROCESSING' AND locked_until < NOW())
          )
        ORDER BY priority ASC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      UPDATE marbot_knowledge_job AS job
      SET status = 'PROCESSING',
          attempt_count = job.attempt_count + 1,
          locked_by = ${workerId},
          lock_token = gen_random_uuid()::text,
          locked_until = NOW() + INTERVAL '120 seconds',
          updated_at = NOW()
      FROM candidates
      WHERE job.id = candidates.id
      RETURNING job.id, job.job_type, job.queue_name, job.priority,
        job.payload_json, job.checkpoint_json, job.attempt_count,
        job.max_attempts, job.lock_token, job.commit_sha
    `;
  }

  /**
   * Marks a claimed job as COMPLETED.
   */
  static async completeJob(jobId: string, lockToken: string): Promise<boolean> {
    const result = await prisma.marbot_knowledge_job.updateMany({
      where: {
        id: jobId,
        lock_token: lockToken,
        status: 'PROCESSING',
      },
      data: {
        status: 'COMPLETED',
        locked_by: null,
        lock_token: null,
        locked_until: null,
        last_error: null,
        updated_at: new Date(),
      },
    });

    return result.count > 0;
  }

  /**
   * Fails a claimed job and schedules retry or marks as DEAD_LETTER.
   */
  static async failJob(
    jobId: string,
    lockToken: string,
    error: unknown,
    attemptCount: number,
    maxAttempts: number
  ): Promise<void> {
    const errorMessage =
      error instanceof Error ? error.message : String(error).slice(0, 255);
    const exhausted = attemptCount >= maxAttempts;
    const delayMs = Math.min(1000 * Math.pow(2, attemptCount), 60000);
    const nextRetryAt = new Date(Date.now() + delayMs);

    await prisma.marbot_knowledge_job.updateMany({
      where: {
        id: jobId,
        lock_token: lockToken,
        status: 'PROCESSING',
      },
      data: {
        status: exhausted ? 'DEAD_LETTER' : 'PENDING',
        next_retry_at: nextRetryAt,
        locked_by: null,
        lock_token: null,
        locked_until: null,
        last_error: errorMessage,
        updated_at: new Date(),
      },
    });
  }

  /**
   * Retrieves summary statistics of the queue.
   */
  static async getQueueStats(): Promise<Record<string, number>> {
    const stats: Record<string, number> = {
      PENDING: 0,
      PROCESSING: 0,
      COMPLETED: 0,
      FAILED: 0,
      DEAD_LETTER: 0,
    };

    const grouped = await prisma.marbot_knowledge_job.groupBy({
      by: ['status'],
      _count: { id: true },
    });

    for (const row of grouped) {
      stats[row.status] = row._count.id;
    }

    return stats;
  }
}
