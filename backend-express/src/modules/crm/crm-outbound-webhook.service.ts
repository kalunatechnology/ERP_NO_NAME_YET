import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { encryptIntegrationSecret, decryptIntegrationSecret, retryDelayMs } from './crm-integration.service';

const OUTBOUND_EVENTS = [
  'message.reply_requested',
  'quotation.ready', 'quotation.approved', 'quotation.accepted', 'quotation.rejected',
  'ticket.status_updated', 'ticket.resolved', 'deal.won', 'crm.executive_approval.decided',
];

function validateTargetUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('target_url harus berupa URL HTTPS yang valid.'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || !host || !host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localdomain') || /^\[?[0-9a-f:.]+\]?$/i.test(host) || host.startsWith('127.') || host.startsWith('10.') || host.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    throw new Error('target_url harus HTTPS dan tidak boleh mengarah ke host lokal atau jaringan privat.');
  }
  return url.toString();
}

export async function createWebhookSubscription(input: {
  tenantId: string; companyId: string; createdById?: string; name: string; targetUrl: string; events: string[];
}) {
  const name = input.name.trim();
  if (!name || name.length > 120) throw new Error('name wajib diisi dan maksimal 120 karakter.');
  const events = [...new Set(input.events.map((event) => event.trim()))];
  if (!events.length || events.some((event) => !OUTBOUND_EVENTS.includes(event))) throw new Error(`events hanya boleh berisi: ${OUTBOUND_EVENTS.join(', ')}.`);
  const targetUrl = validateTargetUrl(input.targetUrl);
  const secret = crypto.randomBytes(32).toString('base64url');
  const row = await prisma.core_webhook_subscription.create({
    data: {
      id: crypto.randomUUID(), tenant_id: input.tenantId, company_id: input.companyId,
      created_by_id: input.createdById, name, target_url: targetUrl,
      secret_encrypted: encryptIntegrationSecret(secret), events, status: 'ACTIVE',
    },
    select: { id: true, name: true, target_url: true, events: true, status: true, created_at: true },
  });
  return { ...row, signing_secret: secret };
}

export async function queueWebhookEvent(tx: Prisma.TransactionClient, companyId: string, eventType: string, data: Record<string, unknown>) {
  if (!OUTBOUND_EVENTS.includes(eventType)) throw new Error(`Unsupported outbound event: ${eventType}`);
  const subscriptions = await tx.core_webhook_subscription.findMany({
    where: { company_id: companyId, status: 'ACTIVE', events: { has: eventType } },
    select: { id: true },
  });
  if (!subscriptions.length) return 0;
  const eventId = crypto.randomUUID();
  const occurredAt = new Date();
  const payload = { event_id: eventId, event_type: eventType, schema_version: 1, occurred_at: occurredAt.toISOString(), timestamp: Math.floor(occurredAt.getTime() / 1000), company_id: companyId, data } as Prisma.InputJsonValue;
  await tx.core_webhook_delivery_log.createMany({
    data: subscriptions.map((subscription) => ({
      id: crypto.randomUUID(), subscription_id: subscription.id, company_id: companyId,
      event_id: eventId, event_type: eventType, payload, status: 'PENDING', max_attempts: 5,
      next_retry_at: new Date(),
    })),
    skipDuplicates: true,
  });
  return subscriptions.length;
}

type ClaimedDelivery = { id: string; subscription_id: string; payload: Prisma.JsonValue; attempt_count: number; max_attempts: number; lock_token: string };

async function claimDeliveries(workerId: string, limit: number) {
  await prisma.$executeRaw`
    UPDATE core_webhook_delivery_log
    SET status = 'DEAD_LETTER', locked_by = NULL, lock_token = NULL, locked_until = NULL,
        last_error = COALESCE(last_error, 'Retry limit reached after worker lease expired.'), updated_at = NOW()
    WHERE status = 'PROCESSING' AND locked_until < NOW() AND attempt_count >= max_attempts
  `;
  return prisma.$queryRaw<ClaimedDelivery[]>`
    WITH candidates AS (
      SELECT id FROM core_webhook_delivery_log
      WHERE attempt_count < max_attempts
        AND ((status = 'PENDING' AND next_retry_at <= NOW()) OR (status = 'PROCESSING' AND locked_until < NOW()))
        AND EXISTS (
          SELECT 1 FROM core_webhook_subscription subscription
          WHERE subscription.id = core_webhook_delivery_log.subscription_id AND subscription.status = 'ACTIVE'
        )
      ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT ${limit}
    )
    UPDATE core_webhook_delivery_log AS delivery
    SET status = 'PROCESSING', attempt_count = delivery.attempt_count + 1,
        locked_by = ${workerId}, lock_token = gen_random_uuid()::text,
        locked_until = NOW() + INTERVAL '45 seconds', updated_at = NOW()
    FROM candidates WHERE delivery.id = candidates.id
    RETURNING delivery.id, delivery.subscription_id, delivery.payload, delivery.attempt_count,
      delivery.max_attempts, delivery.lock_token
  `;
}

async function deliver(delivery: ClaimedDelivery) {
  const subscription = await prisma.core_webhook_subscription.findUnique({ where: { id: delivery.subscription_id } });
  if (!subscription || subscription.status !== 'ACTIVE') throw new Error('SUBSCRIPTION_INACTIVE');
  // Revalidate the stored destination before every request; redirects are never followed.
  const targetUrl = validateTargetUrl(subscription.target_url);
  const body = JSON.stringify(delivery.payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto.createHmac('sha256', decryptIntegrationSecret(subscription.secret_encrypted))
    .update(`v1\nPOST\n${timestamp}\n${body}`, 'utf8').digest('hex');
  const response = await fetch(targetUrl, {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10_000),
    headers: { 'content-type': 'application/json', 'x-marka-event-id': String((delivery.payload as any).event_id), 'x-marka-timestamp': timestamp, 'x-marka-signature': `sha256=${signature}` },
    body,
  });
  if (response.status < 200 || response.status >= 300) {
    const error: any = new Error(`HTTP_${response.status}`); error.httpStatus = response.status; throw error;
  }
  await prisma.core_webhook_delivery_log.updateMany({
    where: { id: delivery.id, lock_token: delivery.lock_token, status: 'PROCESSING' },
    data: { status: 'DELIVERED', http_status: response.status, delivered_at: new Date(), locked_by: null, lock_token: null, locked_until: null, last_error: null },
  });
}

async function failDelivery(delivery: ClaimedDelivery, error: unknown) {
  const exhausted = delivery.attempt_count >= delivery.max_attempts;
  const httpStatus = error && typeof error === 'object' && 'httpStatus' in error ? Number((error as any).httpStatus) : null;
  const code = (error instanceof Error ? error.message : 'DELIVERY_FAILED').slice(0, 200);
  await prisma.core_webhook_delivery_log.updateMany({
    where: { id: delivery.id, lock_token: delivery.lock_token, status: 'PROCESSING' },
    data: {
      status: exhausted ? 'DEAD_LETTER' : 'PENDING', http_status: httpStatus,
      next_retry_at: new Date(Date.now() + retryDelayMs(delivery.attempt_count)),
      locked_by: null, lock_token: null, locked_until: null, last_error: code,
    },
  });
}

export async function processOutboundWebhookBatch(workerId = `webhook-worker-${process.pid}`, limit = 20) {
  const deliveries = await claimDeliveries(workerId, Math.min(Math.max(limit, 1), 100));
  let delivered = 0; let retried = 0;
  for (const delivery of deliveries) {
    try { await deliver(delivery); delivered += 1; }
    catch (error) { await failDelivery(delivery, error); retried += 1; }
  }
  return { claimed: deliveries.length, delivered, retried };
}

export function webhookEventTypes() { return [...OUTBOUND_EVENTS]; }
