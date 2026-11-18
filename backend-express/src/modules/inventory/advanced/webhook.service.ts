/**
 * File: backend-express/src/modules/inventory/advanced/webhook.service.ts
 *
 * Purpose: Phase 4 — Outbound Webhooks over Transactional Outbox (`inv_outbox_event`).
 * Signs JSON payloads using HMAC-SHA256 (`X-Arsalynt-Signature`) and delivers
 * pending inventory events to active `inv_webhook_subscription` endpoints.
 */
import crypto from 'crypto';
import prisma from '../../../config/database';

export async function dispatchPendingOutboxWebhooks(companyId: string, limit = 25) {
  const subs: any[] = await (prisma as any).inv_webhook_subscription
    ?.findMany?.({ where: { company_id: companyId, is_active: true } })
    .catch(() => []) ?? [];

  const events: any[] = await (prisma as any).inv_outbox_event
    ?.findMany?.({
      where: { company_id: companyId, status: 'PENDING' },
      orderBy: { created_at: 'asc' },
      take: limit,
    })
    .catch(() => []) ?? [];

  if (!events.length) {
    return { dispatched: 0, failed: 0, skipped: 0, message: 'Tidak ada outbox event PENDING.' };
  }

  let dispatched = 0;
  let failed = 0;
  let skipped = 0;

  for (const evt of events) {
    const matchingSubs = subs.filter((s) => {
      const types = String(s.event_types || '*')
        .split(',')
        .map((t: string) => t.trim())
        .filter(Boolean);
      return types.includes('*') || types.includes(evt.event_type);
    });

    if (!matchingSubs.length) {
      await (prisma as any).inv_outbox_event.update({
        where: { id: evt.id },
        data: { status: 'PROCESSED', processed_at: new Date(), last_error: 'No matching webhook subscriber' },
      });
      skipped += 1;
      continue;
    }

    const body = JSON.stringify({
      id: evt.id,
      event_type: evt.event_type,
      aggregate_type: evt.aggregate_type,
      aggregate_id: evt.aggregate_id,
      idempotency_key: evt.idempotency_key,
      created_at: evt.created_at,
      payload: JSON.parse(evt.payload_json || '{}'),
    });

    let allOk = true;
    const errors: string[] = [];
    for (const sub of matchingSubs) {
      try {
        const sig = sub.secret_hmac
          ? crypto.createHmac('sha256', String(sub.secret_hmac)).update(body).digest('hex')
          : '';
        const res = await fetch(String(sub.target_url), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Arsalynt-Event': String(evt.event_type),
            'X-Arsalynt-Delivery-Id': String(evt.id),
            ...(sig ? { 'X-Arsalynt-Signature': `sha256=${sig}` } : {}),
          },
          body,
        });
        if (!res.ok) {
          allOk = false;
          errors.push(`${sub.name}: HTTP ${res.status}`);
        }
      } catch (err: any) {
        allOk = false;
        errors.push(`${sub.name}: ${err?.message || 'Network error'}`);
      }
    }

    if (allOk) {
      await (prisma as any).inv_outbox_event.update({
        where: { id: evt.id },
        data: { status: 'PROCESSED', processed_at: new Date(), attempt_count: Number(evt.attempt_count ?? 0) + 1, last_error: null },
      });
      dispatched += 1;
    } else {
      await (prisma as any).inv_outbox_event.update({
        where: { id: evt.id },
        data: { attempt_count: Number(evt.attempt_count ?? 0) + 1, last_error: errors.join('; ').slice(0, 500) },
      });
      failed += 1;
    }
  }

  return { dispatched, failed, skipped };
}

