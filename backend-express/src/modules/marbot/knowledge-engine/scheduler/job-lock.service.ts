import crypto from 'node:crypto';
import prisma from '../../../../config/database';

export interface LockAcquisitionResult {
  acquired: boolean;
  token?: string;
  expiresAt?: Date;
  reason?: string;
}

export class JobLockService {
  /**
   * Attempts to acquire a distributed lock using PostgreSQL atomic lease.
   */
  static async acquireLock(
    lockKey: string,
    workerId: string,
    ttlSeconds = 1800,
    commitSha?: string
  ): Promise<LockAcquisitionResult> {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    try {
      // Clean up expired lock or insert new
      const result = await prisma.$executeRaw`
        INSERT INTO marbot_knowledge_lock (lock_key, owner_worker_id, lock_token, commit_sha, acquired_at, expires_at)
        VALUES (${lockKey}, ${workerId}, ${token}, ${commitSha ?? null}, NOW(), ${expiresAt})
        ON CONFLICT (lock_key) DO UPDATE
        SET owner_worker_id = ${workerId},
            lock_token = ${token},
            commit_sha = COALESCE(${commitSha ?? null}, marbot_knowledge_lock.commit_sha),
            acquired_at = NOW(),
            expires_at = ${expiresAt}
        WHERE marbot_knowledge_lock.expires_at < NOW()
      `;

      if (result > 0) {
        return {
          acquired: true,
          token,
          expiresAt,
        };
      }

      return {
        acquired: false,
        reason: 'LOCK_HELD_BY_ANOTHER_WORKER',
      };
    } catch (error) {
      return {
        acquired: false,
        reason: error instanceof Error ? error.message : 'LOCK_ERROR',
      };
    }
  }

  /**
   * Renews an existing lock lease if still owned by the worker.
   */
  static async renewLock(
    lockKey: string,
    workerId: string,
    lockToken: string,
    ttlSeconds = 1800
  ): Promise<boolean> {
    const newExpiresAt = new Date(Date.now() + ttlSeconds * 1000);
    try {
      const result = await prisma.$executeRaw`
        UPDATE marbot_knowledge_lock
        SET expires_at = ${newExpiresAt}
        WHERE lock_key = ${lockKey}
          AND owner_worker_id = ${workerId}
          AND lock_token = ${lockToken}
      `;
      return result > 0;
    } catch {
      return false;
    }
  }

  /**
   * Releases the lock.
   */
  static async releaseLock(
    lockKey: string,
    workerId: string,
    lockToken: string
  ): Promise<boolean> {
    try {
      const result = await prisma.$executeRaw`
        DELETE FROM marbot_knowledge_lock
        WHERE lock_key = ${lockKey}
          AND owner_worker_id = ${workerId}
          AND lock_token = ${lockToken}
      `;
      return result > 0;
    } catch {
      return false;
    }
  }

  /**
   * Verifies that the worker still holds the valid, non-expired lock lease.
   * Used as a fencing check before critical state mutations (e.g. snapshot promotion).
   * Prevents zombie workers from promoting stale snapshots after lease expiration.
   */
  static async verifyLockOwnership(
    lockKey: string,
    workerId: string,
    lockToken: string
  ): Promise<boolean> {
    try {
      const rows = await prisma.$queryRaw<any[]>`
        SELECT lock_token FROM marbot_knowledge_lock
        WHERE lock_key = ${lockKey}
          AND owner_worker_id = ${workerId}
          AND lock_token = ${lockToken}
          AND expires_at > NOW()
        LIMIT 1
      `;
      return rows.length > 0;
    } catch {
      return false;
    }
  }
}
