import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { env } from '../../config/env';
import { ValidationError } from '../../utils/errors';

const DEFAULT_EVENTS = ['message.received'];
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

function encryptionKey(): Buffer {
  const encoded = env.CRM_INTEGRATION_ENCRYPTION_KEY;
  if (!encoded) throw new Error('CRM_INTEGRATION_ENCRYPTION_KEY is required to manage webhook secrets.');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('CRM_INTEGRATION_ENCRYPTION_KEY must be a base64 encoded 32-byte key.');
  return key;
}

function encryptSecret(secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.');
}

function decryptSecret(value: string): string {
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
  channel_type: 'WHATSAPP' | 'WEBSITE' | 'EMAIL' | 'OTHER';
  account_name?: string;
  external_account_id?: string;
  allowed_event_types?: string[];
}

export class CRMIntegrationService {
  static async createSource(input: CreateIntegrationSourceInput, tenantId: string, companyId: string, userId: string) {
    const crmEntitlement = await prisma.iam_company_module_access.findFirst({
      where: { tenant_id: tenantId, company_id: companyId, module_code: 'CRM', enabled: true },
      select: { id: true },
    });
    if (!crmEntitlement) throw new ValidationError('Company harus mengaktifkan modul CRM sebelum membuat integration source.');
    const sourceCode = input.source_code.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(sourceCode)) {
      throw new ValidationError('source_code harus 2–64 karakter A–Z, angka, _ atau -.');
    }
    const allowedEvents = [...new Set((input.allowed_event_types?.length ? input.allowed_event_types : DEFAULT_EVENTS).map((event) => event.trim()))];
    if (!allowedEvents.length || allowedEvents.some((event) => !DEFAULT_EVENTS.includes(event))) {
      throw new ValidationError('Saat ini hanya event message.received yang didukung.');
    }
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
          channel_type: input.channel_type,
          account_name: input.account_name?.trim() || `${sourceCode} inbound`,
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
          channel_type: input.channel_type,
          channel_account_id: channel.id,
          secret_encrypted: encryptSecret(signingSecret),
          key_id: keyId,
          allowed_event_types: allowedEvents,
          status: 'ACTIVE',
          created_by_id: userId,
        },
        select: {
          id: true, source_code: true, tenant_id: true, company_id: true,
          channel_type: true, channel_account_id: true, key_id: true,
          allowed_event_types: true, status: true, created_at: true,
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
        channel_type: true, channel_account_id: true, key_id: true,
        previous_key_id: true, previous_valid_until: true,
        allowed_event_types: true, status: true, created_at: true, last_seen_at: true,
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
          secret_encrypted: encryptSecret(signingSecret),
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
    if (source.key_id === keyId) return { source, secret: decryptSecret(source.secret_encrypted), inactive: false as const };
    if (source.previous_key_id === keyId && source.previous_valid_until && source.previous_valid_until > new Date() && source.previous_secret_encrypted) {
      return { source, secret: decryptSecret(source.previous_secret_encrypted), inactive: false as const };
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
