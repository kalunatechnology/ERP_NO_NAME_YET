import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { AppError } from '../../utils/errors';

type RequestRecord = {
  tenant_id: string; company_id: string; user_id: string;
  tool_name: string; nonce: string; request_id: string; outcome: string;
};

/** Reserve before expensive work. The transaction lock serializes every instance
 * for this identity/tool; ReadCommitted makes the next count see committed reservations.
 * Database/lock failures propagate: there is no in-memory or unlocked fallback. */
export async function reserveMarbotRequest(data: RequestRecord, limit: number, db: any = prisma) {
  const key = createHash('sha256').update(JSON.stringify([
    'marbot-rate-v1', data.tenant_id, data.company_id, data.user_id, data.tool_name,
  ])).digest().readBigInt64BE(0);
  return db.$transaction(async (tx: any) => {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(${key}::bigint)::text`);
    // Obtain database time after acquiring the lock (not transaction-start NOW()).
    const [clock] = await tx.$queryRaw(Prisma.sql`SELECT clock_timestamp() AS current_time`);
    const recent = await tx.marbot_request.count({ where: {
      tenant_id: data.tenant_id, company_id: data.company_id, user_id: data.user_id,
      tool_name: data.tool_name, created_at: { gte: new Date(clock.current_time.getTime() - 60000) },
    } });
    if (recent >= limit) throw new AppError('Terlalu banyak permintaan. Coba lagi dalam satu menit.', 429, 'MARBOT_RATE_LIMIT');
    return tx.marbot_request.create({ data: { ...data, created_at: clock.current_time } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 10000 });
}
