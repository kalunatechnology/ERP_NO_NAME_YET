import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { ForbiddenError, ValidationError } from '../../utils/errors';
import { requireAdminForWrite, requireCompanyContextForWrite } from '../../middlewares/rbac.middleware';
import { CRMIntegrationService, makeWebhookSignature, normalizeExternalIdentity, safeSignatureEqual } from './crm-integration.service';
import { createWebhookSubscription, webhookEventTypes } from './crm-outbound-webhook.service';

export const crmIntegrationAdminRouter = Router();
export const crmIntegrationWebhookRouter = Router();

crmIntegrationAdminRouter.use(requireAdminForWrite);

crmIntegrationAdminRouter.get('/outbound-subscriptions', async (req, res, next) => {
  try {
    const rows = await prisma.core_webhook_subscription.findMany({
      where: { company_id: companyId(req) }, orderBy: { created_at: 'desc' },
      select: { id: true, name: true, target_url: true, events: true, status: true, created_at: true },
    });
    res.json({ rows, supported_events: webhookEventTypes() });
  } catch (error) { next(error); }
});

crmIntegrationAdminRouter.get('/outbound-subscriptions/:id/deliveries', async (req, res, next) => {
  try {
    const subscription = await prisma.core_webhook_subscription.findFirst({
      where: { id: req.params.id, company_id: companyId(req) }, select: { id: true },
    });
    if (!subscription) { res.status(404).json({ error: { message: 'Webhook subscription tidak ditemukan.' } }); return; }
    const rows = await prisma.core_webhook_delivery_log.findMany({
      where: { subscription_id: subscription.id, company_id: companyId(req) },
      orderBy: { created_at: 'desc' }, take: 100,
      select: { id: true, event_id: true, event_type: true, status: true, attempt_count: true, max_attempts: true, next_retry_at: true, http_status: true, last_error: true, created_at: true, delivered_at: true },
    });
    res.json({ rows });
  } catch (error) { next(error); }
});

crmIntegrationAdminRouter.post('/outbound-subscriptions/:id/deliveries/:deliveryId/retry', requireCompanyContextForWrite, async (req, res, next) => {
  try {
    const subscription = await prisma.core_webhook_subscription.findFirst({ where: { id: req.params.id, company_id: companyId(req) }, select: { id: true } });
    if (!subscription) { res.status(404).json({ error: { message: 'Webhook subscription tidak ditemukan.' } }); return; }
    const updated = await prisma.core_webhook_delivery_log.updateMany({
      where: { id: req.params.deliveryId, subscription_id: subscription.id, company_id: companyId(req), status: 'DEAD_LETTER' },
      data: { status: 'PENDING', attempt_count: 0, next_retry_at: new Date(), locked_by: null, lock_token: null, locked_until: null, http_status: null, last_error: null },
    });
    if (!updated.count) { res.status(409).json({ error: { message: 'Delivery tidak tersedia untuk retry.' } }); return; }
    res.status(202).json({ queued: true, delivery_id: req.params.deliveryId });
  } catch (error) { next(error); }
});

crmIntegrationAdminRouter.post('/outbound-subscriptions', requireCompanyContextForWrite, async (req, res, next) => {
  try {
    if (!req.tenantId || !req.user?.id) throw new ForbiddenError('Tenant dan user context wajib tersedia.');
    if (!Array.isArray(req.body.events) || req.body.events.some((event: unknown) => typeof event !== 'string')) throw new ValidationError('events harus berupa array string.');
    if (typeof req.body.name !== 'string' || typeof req.body.target_url !== 'string') throw new ValidationError('name dan target_url wajib berupa teks.');
    try {
      const result = await createWebhookSubscription({ tenantId: req.tenantId, companyId: companyId(req), createdById: req.user.id, name: req.body.name, targetUrl: req.body.target_url, events: req.body.events });
      res.status(201).json(result);
    } catch (error) { throw new ValidationError(error instanceof Error ? error.message : 'Webhook subscription tidak valid.'); }
  } catch (error) { next(error); }
});

crmIntegrationAdminRouter.patch('/outbound-subscriptions/:id/status', requireCompanyContextForWrite, async (req, res, next) => {
  try {
    const status = String(req.body.status ?? '').toUpperCase();
    if (!['ACTIVE', 'SUSPENDED'].includes(status)) throw new ValidationError('status harus ACTIVE atau SUSPENDED.');
    const updated = await prisma.core_webhook_subscription.updateMany({ where: { id: req.params.id, company_id: companyId(req) }, data: { status } });
    if (!updated.count) { res.status(404).json({ error: { message: 'Webhook subscription tidak ditemukan.' } }); return; }
    res.json({ id: req.params.id, status });
  } catch (error) { next(error); }
});

function companyId(req: Request) {
  if (!req.companyId) throw new ForbiddenError('Pilih company sebelum mengelola integration source.');
  return req.companyId;
}

crmIntegrationAdminRouter.get('/', async (req, res, next) => {
  try {
    res.json(await CRMIntegrationService.listSources(companyId(req)));
  } catch (error) { next(error); }
});

crmIntegrationAdminRouter.get('/:id/events', async (req, res, next) => {
  try {
    const source = await prisma.core_integration_source.findFirst({ where: { id: req.params.id, company_id: companyId(req) }, select: { id: true } });
    if (!source) { res.status(404).json({ error: { message: 'Integration source tidak ditemukan.' } }); return; }
    const rows = await prisma.crm_integration_event.findMany({
      where: { source_id: source.id },
      orderBy: { received_at: 'desc' },
      take: 100,
      select: { id: true, event_id: true, event_type: true, status: true, attempt_count: true, max_attempts: true, next_retry_at: true, last_error: true, received_at: true, processed_at: true },
    });
    res.json({ rows });
  } catch (error) { next(error); }
});

crmIntegrationAdminRouter.post('/:id/events/:eventId/retry', requireCompanyContextForWrite, async (req, res, next) => {
  try {
    const source = await prisma.core_integration_source.findFirst({ where: { id: req.params.id, company_id: companyId(req) }, select: { id: true } });
    if (!source) { res.status(404).json({ error: { message: 'Integration source tidak ditemukan.' } }); return; }
    const deadLetter = await prisma.crm_integration_event.findFirst({
      where: { id: req.params.eventId, source_id: source.id, status: 'DEAD_LETTER' },
      select: { id: true, payload: true },
    });
    if (!deadLetter?.payload) { res.status(409).json({ error: { message: 'Event tidak tersedia untuk retry atau payload sudah dibersihkan.' } }); return; }
    const updated = await prisma.crm_integration_event.updateMany({
      where: { id: deadLetter.id, source_id: source.id, status: 'DEAD_LETTER' },
      data: { status: 'PENDING', attempt_count: 0, next_retry_at: new Date(), locked_by: null, lock_token: null, locked_until: null, last_error: null },
    });
    if (!updated.count) { res.status(409).json({ error: { message: 'Event berubah saat retry diminta; muat ulang status event.' } }); return; }
    res.status(202).json({ queued: true, event_id: req.params.eventId });
  } catch (error) { next(error); }
});

crmIntegrationAdminRouter.post('/', requireCompanyContextForWrite, async (req, res, next) => {
  try {
    if (!req.tenantId || !req.user?.id) throw new ForbiddenError('Tenant dan user context wajib tersedia.');
    if (req.body.allowed_event_types !== undefined && (!Array.isArray(req.body.allowed_event_types) || req.body.allowed_event_types.some((event: unknown) => typeof event !== 'string'))) {
      throw new ValidationError('allowed_event_types harus berupa array string.');
    }
    for (const field of ['account_name', 'external_account_id', 'business_unit_code', 'business_unit_name', 'default_assigned_user_id']) {
      if (req.body[field] !== undefined && typeof req.body[field] !== 'string') throw new ValidationError(`${field} harus berupa teks.`);
    }
    const result = await CRMIntegrationService.createSource({
      source_code: String(req.body.source_code ?? ''),
      account_name: req.body.account_name,
      external_account_id: req.body.external_account_id,
      business_unit_code: req.body.business_unit_code,
      business_unit_name: req.body.business_unit_name,
      default_assigned_user_id: req.body.default_assigned_user_id,
      allowed_event_types: req.body.allowed_event_types,
    }, req.tenantId, companyId(req), req.user.id);
    res.status(201).json(result);
  } catch (error) { next(error); }
});

crmIntegrationAdminRouter.post('/:id/rotate-secret', requireCompanyContextForWrite, async (req, res, next) => {
  try {
    const result = await CRMIntegrationService.rotateSecret(req.params.id, companyId(req));
    if (!result) { res.status(404).json({ error: { message: 'Integration source tidak ditemukan.' } }); return; }
    res.json(result);
  } catch (error) { next(error); }
});

crmIntegrationAdminRouter.patch('/:id/status', requireCompanyContextForWrite, async (req, res, next) => {
  try {
    const status = String(req.body.status ?? '').toUpperCase();
    if (!['ACTIVE', 'SUSPENDED', 'REVOKED'].includes(status)) throw new ValidationError('status harus ACTIVE, SUSPENDED, atau REVOKED.');
    const updated = await CRMIntegrationService.setSourceStatus(req.params.id, companyId(req), status as 'ACTIVE' | 'SUSPENDED' | 'REVOKED');
    if (!updated) { res.status(404).json({ error: { message: 'Integration source tidak ditemukan.' } }); return; }
    res.json({ id: req.params.id, status });
  } catch (error) { next(error); }
});

crmIntegrationWebhookRouter.post('/events', async (req: Request, res: Response) => {
  try {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const sourceId = String(req.header('X-Integration-Id') ?? '');
    const keyId = String(req.header('X-Integration-Key-Id') ?? '');
    const timestamp = String(req.header('X-Integration-Timestamp') ?? '');
    const nonce = String(req.header('X-Integration-Nonce') ?? '');
    const signature = String(req.header('X-Integration-Signature') ?? '');
    if (!rawBody || rawBody.length > 1024 * 1024) return res.status(400).json({ error: 'INVALID_BODY' });
    if (!/^[0-9a-f-]{36}$/i.test(sourceId) || !/^k_[a-f0-9]{16}$/.test(keyId)) return res.status(401).json({ error: 'INVALID_SIGNATURE' });
    if (!/^\d{10}$/.test(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) {
      return res.status(401).json({ error: 'STALE_TIMESTAMP' });
    }
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) return res.status(401).json({ error: 'INVALID_NONCE' });
    let envelope: any;
    try { envelope = req.body; } catch { return res.status(400).json({ error: 'INVALID_JSON' }); }
    const eventId = typeof envelope?.event_id === 'string' ? envelope.event_id.trim() : '';
    const eventType = typeof envelope?.event_type === 'string' ? envelope.event_type.trim() : '';
    const schemaVersion = envelope?.schema_version;
    if (!eventId || eventId.length > 200 || !eventType || eventType.length > 100 || schemaVersion !== 1 || !envelope?.data || typeof envelope.data !== 'object' || Array.isArray(envelope.data)) {
      return res.status(400).json({ error: 'INVALID_EVENT_ENVELOPE' });
    }
    if (typeof envelope.occurred_at !== 'string' || Number.isNaN(new Date(envelope.occurred_at).getTime())) {
      return res.status(400).json({ error: 'INVALID_OCCURRED_AT' });
    }
    const signatureConfig = await CRMIntegrationService.findForSignature(sourceId, keyId);
    if (!signatureConfig) return res.status(401).json({ error: 'INVALID_SIGNATURE' });
    if (signatureConfig.inactive) return res.status(403).json({ error: 'INTEGRATION_SUSPENDED' });
    const path = '/api/v1/integrations/webhooks/events';
    if (req.originalUrl !== path) return res.status(404).json({ error: 'WEBHOOK_PATH_NOT_FOUND' });
    const expected = makeWebhookSignature(signatureConfig.secret, req.method, path, timestamp, nonce, rawBody);
    if (!safeSignatureEqual(expected, signature)) return res.status(401).json({ error: 'INVALID_SIGNATURE' });
    if (!signatureConfig.source.allowed_event_types.includes(eventType)) return res.status(400).json({ error: 'EVENT_TYPE_NOT_ALLOWED' });

    const data = envelope.data;
    if (eventType === 'inquiry.submitted') {
      if (typeof data.subject !== 'string' || !data.subject.trim() || data.subject.length > 300 || typeof data.customer_name !== 'string' || !data.customer_name.trim() || data.customer_name.length > 200 || typeof data.customer_email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.customer_email) || data.customer_email.length > 320 || (data.description !== undefined && (typeof data.description !== 'string' || data.description.length > 20_000))) return res.status(400).json({ error: 'INVALID_INQUIRY_EVENT' });
    } else if (eventType === 'ticket.created') {
      if (typeof data.subject !== 'string' || !data.subject.trim() || data.subject.length > 300 || typeof data.description !== 'string' || !data.description.trim() || data.description.length > 20_000 || (data.serial_number !== undefined && (typeof data.serial_number !== 'string' || !data.serial_number.trim() || data.serial_number.length > 200))) return res.status(400).json({ error: 'INVALID_TICKET_EVENT' });
    } else if (eventType === 'quotation.decision') {
      if (typeof data.quotation_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(data.quotation_id) || !['ACCEPTED', 'REJECTED'].includes(String(data.decision).toUpperCase())) return res.status(400).json({ error: 'INVALID_QUOTATION_DECISION' });
    } else if (eventType !== 'message.received') return res.status(422).json({ error: 'EVENT_TYPE_NOT_IMPLEMENTED' });
    if (eventType === 'message.received') {
    const threadId = typeof data.thread_id === 'string' ? data.thread_id.trim() : '';
    const messageId = typeof data.message_id === 'string' ? data.message_id.trim() : '';
    const text = typeof data.message?.text === 'string' ? data.message.text : '';
    const sender = data.sender;
    if (!threadId || threadId.length > 300 || !messageId || messageId.length > 300 || !text.trim() || text.length > 100_000 || (sender !== undefined && (!sender || typeof sender !== 'object' || Array.isArray(sender))) || !data.message || typeof data.message !== 'object' || Array.isArray(data.message)) {
      return res.status(400).json({ error: 'INVALID_MESSAGE_EVENT' });
    }
    if (sender !== undefined) {
      const identityValue = typeof sender.value === 'string' ? sender.value : '';
      try { normalizeExternalIdentity(String(sender.type ?? ''), identityValue); }
      catch { return res.status(400).json({ error: 'INVALID_SENDER_IDENTITY' }); }
    }
    const verification = sender?.identity_verification ?? sender?.channel_verification;
    if (verification?.status && !['VERIFIED', 'UNVERIFIED'].includes(String(verification.status))) return res.status(400).json({ error: 'INVALID_IDENTITY_VERIFICATION' });
    if (verification?.status === 'VERIFIED' && (typeof verification.method !== 'string' || !verification.method.trim() || verification.method.length > 100)) {
      return res.status(400).json({ error: 'INVALID_IDENTITY_VERIFICATION_METHOD' });
    }
    if (String(data.message?.type ?? '').toUpperCase() !== 'TEXT') {
      return res.status(422).json({ error: 'UNSUPPORTED_MESSAGE_TYPE' });
    }
    }
    const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');
    const outcome = await CRMIntegrationService.acceptEvent({
      source: signatureConfig.source,
      nonce,
      eventId,
      eventType,
      schemaVersion,
      payloadHash,
      payload: envelope,
    });
    if (outcome.status === 'INACTIVE') return res.status(403).json({ error: 'INTEGRATION_SUSPENDED' });
    if (outcome.status === 'REPLAY') return res.status(401).json({ error: 'NONCE_REPLAY' });
    if (outcome.status === 'CONFLICT') return res.status(409).json({ error: 'EVENT_ID_PAYLOAD_MISMATCH' });
    if (outcome.status === 'DUPLICATE') return res.status(200).json({ accepted: true, duplicate: true, event_id: eventId });
    return res.status(202).json({ accepted: true, duplicate: false, event_id: eventId });
  } catch (error) {
    // Avoid leaking internal DB/config details across an unauthenticated boundary.
    const errorCode = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : error instanceof Error ? error.name : 'unknown';
    console.error('CRM integration webhook acceptance failed:', errorCode.slice(0, 80));
    return res.status(503).json({ error: 'EVENT_NOT_DURABLY_ACCEPTED' });
  }
});

export function normalizeWebhookIdentity(type: string, value: string) {
  return normalizeExternalIdentity(type, value);
}
