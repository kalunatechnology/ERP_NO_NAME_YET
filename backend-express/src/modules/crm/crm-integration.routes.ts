import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { ForbiddenError, ValidationError } from '../../utils/errors';
import { requireAdminForWrite, requireCompanyContextForWrite } from '../../middlewares/rbac.middleware';
import { CRMIntegrationService, makeWebhookSignature, normalizeExternalIdentity, safeSignatureEqual } from './crm-integration.service';

export const crmIntegrationAdminRouter = Router();
export const crmIntegrationWebhookRouter = Router();

crmIntegrationAdminRouter.use(requireAdminForWrite);

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
    const channelType = String(req.body.channel_type ?? '').toUpperCase();
    if (!['WHATSAPP', 'WEBSITE', 'EMAIL', 'OTHER'].includes(channelType)) throw new ValidationError('channel_type tidak valid.');
    if (req.body.allowed_event_types !== undefined && (!Array.isArray(req.body.allowed_event_types) || req.body.allowed_event_types.some((event: unknown) => typeof event !== 'string'))) {
      throw new ValidationError('allowed_event_types harus berupa array string.');
    }
    if (req.body.account_name !== undefined && typeof req.body.account_name !== 'string') throw new ValidationError('account_name harus berupa teks.');
    if (req.body.external_account_id !== undefined && typeof req.body.external_account_id !== 'string') throw new ValidationError('external_account_id harus berupa teks.');
    const result = await CRMIntegrationService.createSource({
      source_code: String(req.body.source_code ?? ''),
      channel_type: channelType as 'WHATSAPP' | 'WEBSITE' | 'EMAIL' | 'OTHER',
      account_name: req.body.account_name,
      external_account_id: req.body.external_account_id,
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

    if (eventType !== 'message.received') return res.status(422).json({ error: 'EVENT_TYPE_NOT_IMPLEMENTED' });
    const data = envelope.data;
    const threadId = typeof data.thread_id === 'string' ? data.thread_id.trim() : '';
    const messageId = typeof data.message_id === 'string' ? data.message_id.trim() : '';
    const text = typeof data.message?.text === 'string' ? data.message.text : '';
    const identityValue = typeof data.sender?.value === 'string' ? data.sender.value : '';
    if (!threadId || threadId.length > 300 || !messageId || messageId.length > 300 || !text.trim() || text.length > 100_000 || !identityValue || !data.sender || typeof data.sender !== 'object' || Array.isArray(data.sender) || !data.message || typeof data.message !== 'object' || Array.isArray(data.message)) {
      return res.status(400).json({ error: 'INVALID_MESSAGE_EVENT' });
    }
    try { normalizeExternalIdentity(String(data.sender?.type ?? ''), identityValue); }
    catch { return res.status(400).json({ error: 'INVALID_SENDER_IDENTITY' }); }
    const verification = data.sender?.channel_verification;
    if (verification?.status && !['VERIFIED', 'UNVERIFIED'].includes(String(verification.status))) return res.status(400).json({ error: 'INVALID_CHANNEL_VERIFICATION' });
    if (verification?.status === 'VERIFIED') {
      const method = String(verification.method ?? '');
      const allowedMethod = signatureConfig.source.channel_type === 'WHATSAPP'
        ? method === 'WHATSAPP_PROVIDER_INBOUND'
        : signatureConfig.source.channel_type === 'WEBSITE'
          ? method === 'WEBSITE_AUTHENTICATED_SESSION'
          : false;
      if (!allowedMethod) return res.status(400).json({ error: 'UNSUPPORTED_CHANNEL_VERIFICATION_METHOD' });
    }
    if (String(data.message?.type ?? '').toUpperCase() !== 'TEXT') {
      return res.status(422).json({ error: 'UNSUPPORTED_MESSAGE_TYPE' });
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
