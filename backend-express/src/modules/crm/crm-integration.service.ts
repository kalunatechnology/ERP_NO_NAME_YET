import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { env } from '../../config/env';
import { AppError, ValidationError } from '../../utils/errors';

const SUPPORTED_INBOUND_EVENTS = ['message.received', 'inquiry.submitted', 'ticket.created', 'feedback.submitted', 'quotation.decision', 'quotation.accepted'];
const DEFAULT_EVENTS = ['message.received'];
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

function encryptionKey(): Buffer {
  const encoded = env.CRM_INTEGRATION_ENCRYPTION_KEY;
  if (!encoded) {
    throw new AppError(
      'CRM belum siap membuat koneksi: administrator server harus mengatur CRM_INTEGRATION_ENCRYPTION_KEY.',
      503,
      'CRM_INTEGRATION_NOT_CONFIGURED',
    );
  }
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) {
    throw new AppError(
      'CRM belum siap membuat koneksi: CRM_INTEGRATION_ENCRYPTION_KEY harus Base64 dari tepat 32 byte acak.',
      503,
      'CRM_INTEGRATION_NOT_CONFIGURED',
    );
  }
  return key;
}

export function encryptIntegrationSecret(secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.');
}

export function decryptIntegrationSecret(value: string): string {
  const [ivPart, tagPart, ciphertextPart] = value.split('.');
  if (!ivPart || !tagPart || !ciphertextPart) throw new Error('Stored integration secret is malformed.');
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, encryptionKey(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export interface CreateIntegrationSourceInput {
  source_code: string;
  account_name?: string;
  external_account_id?: string;
  business_unit_code?: string;
  business_unit_name?: string;
  default_assigned_user_id?: string;
  allowed_event_types?: string[];
  allowed_origin_domains?: string[];
}

export function normalizeOriginDomain(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 300) throw new ValidationError('origin_domain kosong atau terlalu panjang.');
  let parsed: URL;
  try { parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`); }
  catch { throw new ValidationError('Domain asal harus berupa hostname atau URL http(s) yang valid.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash || (parsed.pathname !== '/' && parsed.pathname !== '')) {
    throw new ValidationError('Domain asal hanya boleh berisi hostname tanpa path, port, query, atau fragment.');
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (hostname.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostname)) {
    throw new ValidationError('Domain asal harus berupa hostname publik yang valid.');
  }
  return hostname;
}

export class CRMIntegrationService {
  static async createSource(input: CreateIntegrationSourceInput, tenantId: string, companyId: string, userId: string) {
    const crmEntitlement = await prisma.iam_company_module_access.findFirst({
      where: { tenant_id: tenantId, company_id: companyId, module_code: 'CRM', enabled: true },
      select: { id: true },
    });
    if (!crmEntitlement) throw new ValidationError('Company harus mengaktifkan modul CRM sebelum membuat integration source.');
    // Fail before opening a transaction or inserting the channel account.
    encryptionKey();
    const sourceCode = input.source_code.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(sourceCode)) {
      throw new ValidationError('source_code harus 2–64 karakter A–Z, angka, _ atau -.');
    }
    const businessUnitCode = input.business_unit_code?.trim().toUpperCase() || null;
    const businessUnitName = input.business_unit_name?.trim() || null;
    if (businessUnitCode && !/^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(businessUnitCode)) {
      throw new ValidationError('business_unit_code harus 2–64 karakter A–Z, angka, _ atau -.');
    }
    if (businessUnitName && businessUnitName.length > 120) throw new ValidationError('business_unit_name maksimal 120 karakter.');
    const defaultAssignedUserId = input.default_assigned_user_id?.trim() || null;
    if (defaultAssignedUserId) {
      const user = await prisma.iam_user.findFirst({
        where: { id: defaultAssignedUserId, tenant_id: tenantId, status: 'ACTIVE', is_active: true },
        select: { id: true },
      });
      const assignments = user ? await prisma.iam_user_role.findMany({
        // Scope by company; legacy role assignments may not have tenant_id set.
        where: { user_id: user.id, company_id: companyId, role_id: { not: null } },
        select: { role_id: true },
      }) : [];
      const roleIds = assignments.flatMap((assignment) => assignment.role_id ? [assignment.role_id] : []);
      const eligible = roleIds.length ? await prisma.iam_role.count({
        where: { id: { in: roleIds }, tenant_id: tenantId, role_code: { in: ['CRM_LEAD', 'SALES'] } },
      }) : 0;
      if (!user || !eligible) throw new ValidationError('default_assigned_user_id harus user aktif dengan role CRM Lead atau Sales pada company ini.');
    }
    const allowedEvents = [...new Set((input.allowed_event_types?.length ? input.allowed_event_types : DEFAULT_EVENTS).map((event) => event.trim()))];
    if (!allowedEvents.length || allowedEvents.some((event) => !SUPPORTED_INBOUND_EVENTS.includes(event))) {
      throw new ValidationError(`Event yang didukung: ${SUPPORTED_INBOUND_EVENTS.join(', ')}.`);
    }
    const allowedOriginDomains = [...new Set((input.allowed_origin_domains ?? []).map(normalizeOriginDomain))];
    const sourceId = crypto.randomUUID();
    const channelAccountId = crypto.randomUUID();
    const signingSecret = crypto.randomBytes(32).toString('base64url');
    const keyId = `k_${crypto.randomBytes(8).toString('hex')}`;

    const row = await prisma.$transaction(async (tx) => {
      const channel = await tx.crm_channel_account.create({
        data: {
          id: channelAccountId,
          tenant_id: tenantId,
          company_id: companyId,
          channel_type: 'INTERNAL_PIPELINE',
          account_name: input.account_name?.trim() || sourceCode,
          external_account_id: input.external_account_id?.trim() || sourceCode,
          credential_reference: `integration:${sourceId}`,
          active: true,
        },
      });
      const source = await tx.core_integration_source.create({
        data: {
          id: sourceId,
          source_code: sourceCode,
          tenant_id: tenantId,
          company_id: companyId,
          channel_type: 'INTERNAL_PIPELINE',
          channel_account_id: channel.id,
          business_unit_code: businessUnitCode,
          business_unit_name: businessUnitName,
          default_assigned_user_id: defaultAssignedUserId,
          secret_encrypted: encryptIntegrationSecret(signingSecret),
          key_id: keyId,
          allowed_event_types: allowedEvents,
          allowed_origin_domains: allowedOriginDomains,
          status: 'ACTIVE',
          created_by_id: userId,
        },
        select: {
          id: true, source_code: true, tenant_id: true, company_id: true,
          channel_type: true, channel_account_id: true, business_unit_code: true,
          business_unit_name: true, default_assigned_user_id: true, key_id: true,
          allowed_event_types: true, status: true, created_at: true,
          allowed_origin_domains: true,
        },
      });
      return source;
    });

    // This is the only response containing the clear signing secret.
    return { ...row, signing_secret: signingSecret };
  }

  static async listSources(companyId: string) {
    return prisma.core_integration_source.findMany({
      where: { company_id: companyId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true, source_code: true, tenant_id: true, company_id: true,
        channel_type: true, channel_account_id: true, business_unit_code: true,
        business_unit_name: true, default_assigned_user_id: true, key_id: true,
        previous_key_id: true, previous_valid_until: true,
        allowed_event_types: true, status: true, created_at: true, last_seen_at: true,
        allowed_origin_domains: true,
      },
    });
  }

  static async setSourceStatus(sourceId: string, companyId: string, status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED') {
    return prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM core_integration_source WHERE id = ${sourceId} AND company_id = ${companyId} FOR UPDATE
      `;
      if (!locked.length) return false;
      const current = await tx.core_integration_source.findUnique({ where: { id: sourceId }, select: { status: true } });
      if (!current) return false;
      if (current.status === 'REVOKED' && status !== 'REVOKED') {
        throw new ValidationError('Integration source yang sudah REVOKED bersifat terminal; buat source baru.');
      }
      await tx.core_integration_source.update({ where: { id: sourceId }, data: { status } });
      return true;
    }, { maxWait: 5_000, timeout: 15_000 });
  }

  static async updateSourceEvents(sourceId: string, companyId: string, eventTypes: string[]) {
    const allowedEvents = [...new Set(eventTypes.map((event) => event.trim()))];
    if (!allowedEvents.length || allowedEvents.some((event) => !SUPPORTED_INBOUND_EVENTS.includes(event))) {
      throw new ValidationError(`Pilih minimal satu event yang didukung: ${SUPPORTED_INBOUND_EVENTS.join(', ')}.`);
    }
    const updated = await prisma.core_integration_source.updateMany({
      where: { id: sourceId, company_id: companyId, status: { not: 'REVOKED' } },
      data: { allowed_event_types: allowedEvents },
    });
    return updated.count > 0;
  }

  static async rotateSecret(sourceId: string, companyId: string) {
    return prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM core_integration_source WHERE id = ${sourceId} AND company_id = ${companyId} FOR UPDATE
      `;
      if (!locked.length) return null;
      const current = await tx.core_integration_source.findUnique({
        where: { id: sourceId },
        select: { id: true, key_id: true, secret_encrypted: true, status: true },
      });
      if (!current) return null;
      if (current.status !== 'ACTIVE') throw new ValidationError('Aktifkan integration source sebelum merotasi secret.');
      const signingSecret = crypto.randomBytes(32).toString('base64url');
      const keyId = `k_${crypto.randomBytes(8).toString('hex')}`;
      const previousValidUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const updated = await tx.core_integration_source.update({
        where: { id: current.id },
        data: {
          previous_secret_encrypted: current.secret_encrypted,
          previous_key_id: current.key_id,
          previous_valid_until: previousValidUntil,
          secret_encrypted: encryptIntegrationSecret(signingSecret),
          key_id: keyId,
        },
        select: { id: true, source_code: true, key_id: true, previous_key_id: true, previous_valid_until: true },
      });
      return { ...updated, signing_secret: signingSecret };
    }, { maxWait: 5_000, timeout: 15_000 });
  }

  static async findForSignature(sourceId: string, keyId: string) {
    const source = await prisma.core_integration_source.findUnique({ where: { id: sourceId } });
    if (!source) return null;
    if (source.status !== 'ACTIVE') return { source, inactive: true as const };
    if (source.key_id === keyId) return { source, secret: decryptIntegrationSecret(source.secret_encrypted), inactive: false as const };
    if (source.previous_key_id === keyId && source.previous_valid_until && source.previous_valid_until > new Date() && source.previous_secret_encrypted) {
      return { source, secret: decryptIntegrationSecret(source.previous_secret_encrypted), inactive: false as const };
    }
    return null;
  }

  static async acceptEvent(input: {
    source: any;
    nonce: string;
    eventId: string;
    eventType: string;
    schemaVersion: number;
    payloadHash: string;
    payload: Record<string, unknown>;
  }) {
    const now = new Date();
    try {
      return await prisma.$transaction(async (tx) => {
        const activeSource = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM core_integration_source
          WHERE id = ${input.source.id} AND status = 'ACTIVE'
          FOR SHARE
        `;
        if (!activeSource.length) return { status: 'INACTIVE' } as const;
        await tx.crm_integration_nonce.deleteMany({ where: { expires_at: { lt: now } } });
        await tx.crm_integration_nonce.create({
          data: {
            id: crypto.randomUUID(),
            source_id: input.source.id,
            nonce: input.nonce,
            expires_at: new Date(now.getTime() + 10 * 60 * 1000),
          },
        });
        await tx.core_integration_source.update({
          where: { id: input.source.id },
          data: { last_seen_at: now },
        });
        const previous = await tx.crm_integration_event.findUnique({
          where: { source_id_event_id: { source_id: input.source.id, event_id: input.eventId } },
        });
        if (previous) {
          return { status: previous.payload_hash === input.payloadHash ? 'DUPLICATE' : 'CONFLICT' } as const;
        }
        await tx.crm_integration_event.create({
          data: {
            id: crypto.randomUUID(),
            source_id: input.source.id,
            event_id: input.eventId,
            event_type: input.eventType,
            schema_version: input.schemaVersion,
            payload_hash: input.payloadHash,
            payload: input.payload as Prisma.InputJsonValue,
            status: 'PENDING',
            max_attempts: 12,
            next_retry_at: now,
          },
        });
        return { status: 'ACCEPTED' } as const;
      }, { maxWait: 5_000, timeout: 15_000 });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const nonce = await prisma.crm_integration_nonce.findUnique({
          where: { source_id_nonce: { source_id: input.source.id, nonce: input.nonce } },
          select: { id: true },
        });
        if (nonce) return { status: 'REPLAY' } as const;
        const event = await prisma.crm_integration_event.findUnique({
          where: { source_id_event_id: { source_id: input.source.id, event_id: input.eventId } },
          select: { payload_hash: true },
        });
        if (event) return { status: event.payload_hash === input.payloadHash ? 'DUPLICATE' : 'CONFLICT' } as const;
      }
      throw error;
    }
  }
}

export function makeWebhookSignature(secret: string, method: string, path: string, timestamp: string, nonce: string, rawBody: Buffer) {
  const prefix = Buffer.from(`v1\n${method.toUpperCase()}\n${path}\n${timestamp}\n${nonce}\n`, 'utf8');
  return crypto.createHmac('sha256', secret).update(prefix).update(rawBody).digest('hex');
}

export function safeSignatureEqual(expectedHex: string, receivedHex: string) {
  if (!/^[a-f0-9]{64}$/i.test(receivedHex)) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const received = Buffer.from(receivedHex, 'hex');
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

export function normalizeExternalIdentity(type: string, value: string) {
  const normalizedType = type.trim().toUpperCase();
  if (!['PHONE', 'EMAIL', 'EXTERNAL'].includes(normalizedType)) throw new ValidationError('identity.type harus PHONE, EMAIL, atau EXTERNAL.');
  const normalized = normalizedType === 'EMAIL' ? value.trim().toLowerCase() : value.trim().replace(/[\s().-]/g, '');
  if (!normalized || normalized.length > 320) throw new ValidationError('identity.value tidak valid.');
  if (normalizedType === 'PHONE' && !/^\+?[1-9]\d{5,14}$/.test(normalized)) throw new ValidationError('identity.value PHONE harus berupa nomor internasional yang valid.');
  if (normalizedType === 'EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new ValidationError('identity.value EMAIL tidak valid.');
  return { type: normalizedType, value: normalized };
}

export function retryDelayMs(attempt: number) {
  const ceiling = Math.min(60 * 60 * 1000, 1000 * 2 ** Math.min(Math.max(attempt - 1, 0), 12));
  return Math.round(ceiling * (0.75 + Math.random() * 0.5));
}
