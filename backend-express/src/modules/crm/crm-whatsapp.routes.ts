import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { requireAdminForWrite, requireCompanyContextForWrite } from '../../middlewares/rbac.middleware';
import { ForbiddenError, ValidationError } from '../../utils/errors';
import { CRMIntegrationService, decryptIntegrationSecret, encryptIntegrationSecret } from './crm-integration.service';

export const crmWhatsAppAdminRouter = Router();
export const crmWhatsAppWebhookRouter = Router();
crmWhatsAppAdminRouter.use(requireAdminForWrite);

function currentCompany(req: Request) {
  if (!req.companyId) throw new ForbiddenError('Pilih company sebelum mengelola koneksi WhatsApp.');
  return req.companyId;
}

function safeConnection(row: any) {
  return {
    id: row.id,
    source_id: row.source_id,
    waba_id: row.waba_id,
    phone_number_id: row.phone_number_id,
    display_phone_number: row.display_phone_number,
    api_version: row.api_version,
    status: row.status,
    last_verified_at: row.last_verified_at,
    last_webhook_at: row.last_webhook_at,
    callback_path: '/api/v1/integrations/whatsapp/webhook',
    access_token_configured: Boolean(row.access_token_encrypted),
    app_secret_configured: Boolean(row.app_secret_encrypted),
    verify_token_configured: Boolean(row.verify_token_encrypted),
  };
}

crmWhatsAppAdminRouter.get('/connections', async (req, res, next) => {
  try {
    const rows = await prisma.crm_whatsapp_connection.findMany({ where: { company_id: currentCompany(req) }, orderBy: { created_at: 'desc' } });
    res.json({ rows: rows.map(safeConnection) });
  } catch (error) { next(error); }
});

crmWhatsAppAdminRouter.post('/connections', requireCompanyContextForWrite, async (req, res, next) => {
  try {
    if (!req.tenantId || !req.user?.id) throw new ForbiddenError('Tenant dan user context wajib tersedia.');
    const wabaId = String(req.body.waba_id ?? '').trim();
    const phoneNumberId = String(req.body.phone_number_id ?? '').trim();
    const accessToken = String(req.body.access_token ?? '').trim();
    const appSecret = String(req.body.app_secret ?? '').trim();
    const verifyToken = String(req.body.verify_token ?? '').trim();
    const apiVersionInput = String(req.body.api_version ?? 'v25.0').trim();
    const apiVersion = apiVersionInput.startsWith('v') ? apiVersionInput : `v${apiVersionInput}`;
    const displayPhone = String(req.body.display_phone_number ?? '').trim();
    if (!/^\d{5,30}$/.test(wabaId) || !/^\d{5,30}$/.test(phoneNumberId)) throw new ValidationError('WABA ID dan Phone Number ID harus berupa ID numerik dari Meta.');
    if (accessToken.length < 20 || appSecret.length < 16 || verifyToken.length < 16) throw new ValidationError('Access Token, App Secret, dan Verify Token wajib diisi dengan nilai yang valid.');
    if (!/^v\d+\.\d+$/.test(apiVersion)) throw new ValidationError('Versi Graph API harus berformat vX.Y.');
    const company = currentCompany(req);
    const existing = await prisma.crm_whatsapp_connection.findFirst({ where: { company_id: company, phone_number_id: phoneNumberId }, select: { id: true } });
    if (existing) throw new ValidationError('Nomor WhatsApp ini sudah terdaftar pada company. Gunakan Perbarui koneksi.');
    const source = await CRMIntegrationService.createSource({
      source_code: `WHATSAPP_${phoneNumberId}`,
      account_name: displayPhone || `WhatsApp ${phoneNumberId}`,
      external_account_id: phoneNumberId,
      allowed_event_types: ['message.received'],
    }, req.tenantId, company, req.user.id);
    const row = await prisma.$transaction(async (tx) => {
      await tx.core_integration_source.update({ where: { id: source.id }, data: { channel_type: 'WHATSAPP_CLOUD' } });
      if (source.channel_account_id) await tx.crm_channel_account.update({ where: { id: source.channel_account_id }, data: { channel_type: 'WHATSAPP_CLOUD', account_name: displayPhone || `WhatsApp ${phoneNumberId}`, external_account_id: phoneNumberId } });
      return tx.crm_whatsapp_connection.create({ data: {
        id: crypto.randomUUID(), tenant_id: req.tenantId!, company_id: company,
        source_id: source.id, waba_id: wabaId, phone_number_id: phoneNumberId,
        display_phone_number: displayPhone || null, api_version: apiVersion,
        access_token_encrypted: encryptIntegrationSecret(accessToken),
        app_secret_encrypted: encryptIntegrationSecret(appSecret),
        verify_token_encrypted: encryptIntegrationSecret(verifyToken),
        status: 'ACTIVE', created_by_id: req.user!.id,
      } });
    });
    res.status(201).json(safeConnection(row));
  } catch (error) { next(error); }
});

crmWhatsAppAdminRouter.patch('/connections/:id', requireCompanyContextForWrite, async (req, res, next) => {
  try {
    const company = currentCompany(req);
    const current = await prisma.crm_whatsapp_connection.findFirst({ where: { id: req.params.id, company_id: company } });
    if (!current) { res.status(404).json({ error: { message: 'Koneksi WhatsApp tidak ditemukan.' } }); return; }
    const status = req.body.status === undefined ? current.status : String(req.body.status).toUpperCase();
    if (!['ACTIVE', 'SUSPENDED'].includes(status)) throw new ValidationError('status harus ACTIVE atau SUSPENDED.');
    const data: Record<string, unknown> = { status };
    for (const [field, dbField] of [['access_token', 'access_token_encrypted'], ['app_secret', 'app_secret_encrypted'], ['verify_token', 'verify_token_encrypted']] as const) {
      if (req.body[field] !== undefined && String(req.body[field]).trim()) {
        const value = String(req.body[field]).trim();
        if (value.length < 16 || value.length > 4096) throw new ValidationError(`${field} tidak valid.`);
        data[dbField] = encryptIntegrationSecret(value);
      }
    }
    if (req.body.api_version !== undefined) {
      const raw = String(req.body.api_version).trim();
      const version = raw.startsWith('v') ? raw : `v${raw}`;
      if (!/^v\d+\.\d+$/.test(version)) throw new ValidationError('Versi Graph API harus berformat vX.Y.');
      data.api_version = version;
    }
    if (req.body.display_phone_number !== undefined) data.display_phone_number = String(req.body.display_phone_number).trim() || null;
    const updated = await prisma.crm_whatsapp_connection.update({ where: { id: current.id }, data });
    await prisma.core_integration_source.update({ where: { id: current.source_id }, data: { status } });
    res.json(safeConnection(updated));
  } catch (error) { next(error); }
});

crmWhatsAppAdminRouter.post('/connections/:id/test', async (req, res, next) => {
  try {
    const connection = await prisma.crm_whatsapp_connection.findFirst({ where: { id: req.params.id, company_id: currentCompany(req), status: 'ACTIVE' } });
    if (!connection) { res.status(404).json({ error: { message: 'Koneksi WhatsApp aktif tidak ditemukan.' } }); return; }
    const token = decryptIntegrationSecret(connection.access_token_encrypted);
    const url = `https://graph.facebook.com/${connection.api_version}/${connection.phone_number_id}?fields=id,display_phone_number,verified_name`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12_000) });
    const payload = await response.json().catch(() => ({})) as any;
    if (!response.ok) {
      res.status(422).json({ connected: false, message: String(payload?.error?.message || 'Meta menolak pemeriksaan koneksi; periksa token dan Phone Number ID.') });
      return;
    }
    const updated = await prisma.crm_whatsapp_connection.update({ where: { id: connection.id }, data: { display_phone_number: payload.display_phone_number || connection.display_phone_number, last_verified_at: new Date() } });
    res.json({ connected: true, phone_number_id: payload.id, display_phone_number: payload.display_phone_number ?? null, verified_name: payload.verified_name ?? null, connection: safeConnection(updated) });
  } catch (error) { next(error); }
});

crmWhatsAppWebhookRouter.get('/webhook', async (req, res) => {
  const mode = String(req.query['hub.mode'] ?? '');
  const token = String(req.query['hub.verify_token'] ?? '');
  const challenge = String(req.query['hub.challenge'] ?? '');
  if (mode !== 'subscribe' || !challenge || challenge.length > 2000) { res.sendStatus(400); return; }
  try {
    const supplied = Buffer.from(token);
    const connections = await prisma.crm_whatsapp_connection.findMany({ where: { status: 'ACTIVE' }, select: { verify_token_encrypted: true } });
    let verified = false;
    for (const connection of connections) {
      const wanted = Buffer.from(decryptIntegrationSecret(connection.verify_token_encrypted));
      if (supplied.length === wanted.length && crypto.timingSafeEqual(supplied, wanted)) verified = true;
    }
    if (!verified) { res.sendStatus(403); return; }
    res.status(200).type('text/plain').send(challenge);
  } catch { res.sendStatus(403); }
});

crmWhatsAppWebhookRouter.post('/webhook', async (req: Request, res: Response) => {
  try {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) { res.sendStatus(400); return; }
    const signature = String(req.header('x-hub-signature-256') || '');
    const receivedBuffer = Buffer.from(signature);
    const connections = await prisma.crm_whatsapp_connection.findMany({ where: { status: 'ACTIVE' } });
    const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
    const wabaIds = new Set(entries.map((entry: any) => String(entry?.id || '')).filter(Boolean));
    const candidates = connections.filter((connection) => wabaIds.has(connection.waba_id));
    const signatureValidConnections = new Set<string>();
    for (const connection of candidates) {
      const appSecret = decryptIntegrationSecret(connection.app_secret_encrypted);
      const expectedBuffer = Buffer.from(`sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`);
      if (receivedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) signatureValidConnections.add(connection.id);
    }
    if (!signatureValidConnections.size) { res.sendStatus(401); return; }
    const connectionByWabaAndPhone = new Map<string, typeof connections[number]>();
    for (const connection of candidates) {
      if (signatureValidConnections.has(connection.id)) connectionByWabaAndPhone.set(`${connection.waba_id}:${connection.phone_number_id}`, connection);
    }
    const activeSources = await prisma.core_integration_source.findMany({
      where: { id: { in: [...connectionByWabaAndPhone.values()].map((connection) => connection.source_id) }, status: 'ACTIVE' },
    });
    const sourceIds = new Set(activeSources.map((source) => source.id));
    const events: Array<{ id: string; source_id: string; payload: object; hash: string }> = [];
    const receivedConnectionIds = new Set<string>();
    for (const entry of entries) {
      const wabaId = String(entry?.id || '');
      for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
        const value = change?.value;
        const phoneNumberId = String(value?.metadata?.phone_number_id || '');
        const connection = connectionByWabaAndPhone.get(`${wabaId}:${phoneNumberId}`);
        if (!connection || !sourceIds.has(connection.source_id)) continue;
        receivedConnectionIds.add(connection.id);
        const contacts = new Map<string, string>();
        for (const contact of Array.isArray(value?.contacts) ? value.contacts : []) {
          const phone = String(contact?.wa_id || '').trim();
          const name = String(contact?.profile?.name || '').trim();
          if (phone) contacts.set(phone, name);
        }
        for (const message of Array.isArray(value?.messages) ? value.messages : []) {
          if (message?.type !== 'text' || typeof message?.text?.body !== 'string') continue;
          const waId = String(message?.from || '').trim();
          const messageId = String(message?.id || '').trim();
          const body = String(message?.text?.body || '').trim();
          if (!waId || !messageId || !body || body.length > 100_000) continue;
          const occurredAt = Number(message.timestamp) > 0 ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString();
          const envelope = {
            event_id: messageId, event_type: 'message.received', schema_version: 1,
            timestamp: Math.floor(Date.now() / 1000), occurred_at: occurredAt,
            data: { thread_id: waId, message_id: messageId, sender: { display_name: contacts.get(waId) || waId, value: waId, type: 'PHONE', channel_verification: { status: 'VERIFIED', method: 'WHATSAPP_CLOUD_API' } }, message: { type: 'TEXT', text: body } },
          };
          events.push({ id: messageId, source_id: connection.source_id, payload: envelope, hash: crypto.createHash('sha256').update(JSON.stringify(envelope)).digest('hex') });
        }
      }
    }
    if (events.length) {
      await prisma.crm_integration_event.createMany({ data: events.map((event) => ({
        id: crypto.randomUUID(), source_id: event.source_id, event_id: event.id, event_type: 'message.received',
        schema_version: 1, payload_hash: event.hash, payload: event.payload,
        status: 'PENDING', attempt_count: 0, max_attempts: 12, next_retry_at: new Date(), received_at: new Date(), updated_at: new Date(),
      })), skipDuplicates: true });
    }
    if (receivedConnectionIds.size) await prisma.crm_whatsapp_connection.updateMany({ where: { id: { in: [...receivedConnectionIds] } }, data: { last_webhook_at: new Date() } });
    res.sendStatus(200);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : error instanceof Error ? error.name : 'unknown';
    console.error('WhatsApp Cloud webhook acceptance failed:', code.slice(0, 80));
    res.sendStatus(503);
  }
});
