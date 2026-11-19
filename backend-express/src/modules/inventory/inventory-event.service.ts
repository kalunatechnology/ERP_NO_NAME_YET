import crypto from 'crypto';
import prisma from '../../config/database';

export interface EmitOutboxEventInput {
  tenantId?: string | null;
  companyId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  idempotencyKey?: string;
  payload: Record<string, unknown>;
}

/**
 * Writes an idempotent Transactional Outbox event inside the active DB transaction.
 */
export async function emitInventoryOutboxEvent(
  input: EmitOutboxEventInput,
  tx: any = prisma,
): Promise<any> {
  const idempotencyKey =
    input.idempotencyKey ||
    crypto
      .createHash('sha256')
      .update(`${input.companyId}:${input.aggregateType}:${input.aggregateId}:${input.eventType}`)
      .digest('hex');

  const existing = await tx.inv_outbox_event
    ?.findUnique?.({ where: { idempotency_key: idempotencyKey } })
    .catch(() => null);
  if (existing) return existing;

  return tx.inv_outbox_event
    ?.create?.({
      data: {
        id: crypto.randomUUID(),
        tenant_id: input.tenantId ?? null,
        company_id: input.companyId,
        aggregate_type: input.aggregateType,
        aggregate_id: input.aggregateId,
        event_type: input.eventType,
        idempotency_key: idempotencyKey,
        payload_json: JSON.stringify(input.payload ?? {}),
        status: 'PENDING',
      },
    })
    .catch(() => null);
}

