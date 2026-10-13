import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { normalizeExternalIdentity, retryDelayMs } from './crm-integration.service';

type ClaimedEvent = {
  id: string;
  source_id: string;
  payload: any;
  attempt_count: number;
  max_attempts: number;
  lock_token: string;
};

function isoDate(value: unknown) {
  if (typeof value !== 'string') return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

async function claimEvents(workerId: string, limit: number): Promise<ClaimedEvent[]> {
  await prisma.$executeRaw`
    UPDATE crm_integration_event
    SET status = 'DEAD_LETTER', locked_by = NULL, lock_token = NULL, locked_until = NULL,
        last_error = COALESCE(last_error, 'Retry limit reached after worker lease expired.'), updated_at = NOW()
    WHERE status = 'PROCESSING' AND locked_until < NOW() AND attempt_count >= max_attempts
  `;
  return prisma.$queryRaw<ClaimedEvent[]>`
    WITH candidates AS (
      SELECT id
      FROM crm_integration_event
      WHERE attempt_count < max_attempts
        AND ((status = 'PENDING' AND next_retry_at <= NOW())
          OR (status = 'PROCESSING' AND locked_until < NOW()))
      ORDER BY received_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE crm_integration_event AS event
    SET status = 'PROCESSING', attempt_count = event.attempt_count + 1,
        locked_by = ${workerId}, lock_token = gen_random_uuid()::text,
        locked_until = NOW() + INTERVAL '90 seconds', updated_at = NOW()
    FROM candidates
    WHERE event.id = candidates.id
    RETURNING event.id, event.source_id, event.payload, event.attempt_count,
      event.max_attempts, event.lock_token
  `;
}

async function processMessageEvent(event: ClaimedEvent) {
  const envelope = event.payload;
  if (!envelope || envelope.event_type !== 'message.received' || Number(envelope.schema_version) !== 1) {
    throw new Error('UNSUPPORTED_EVENT_CONTRACT');
  }
  const data = envelope.data;
  const threadId = typeof data?.thread_id === 'string' ? data.thread_id.trim() : '';
  const externalMessageId = typeof data?.message_id === 'string' ? data.message_id.trim() : '';
  const messageText = typeof data?.message?.text === 'string' ? data.message.text : '';
  const senderName = typeof data?.sender?.display_name === 'string' ? data.sender.display_name.trim() : '';
  const identity = normalizeExternalIdentity(String(data?.sender?.type ?? ''), String(data?.sender?.value ?? ''));
  const verification = data?.sender?.channel_verification;
  if (!threadId || !externalMessageId || !messageText.trim()) throw new Error('INVALID_MESSAGE_EVENT');

  await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM crm_integration_event
      WHERE id = ${event.id} AND lock_token = ${event.lock_token} AND status = 'PROCESSING'
      FOR UPDATE
    `;
    if (!locked.length) return;

    const source = await tx.core_integration_source.findUnique({ where: { id: event.source_id } });
    if (!source?.channel_account_id) throw new Error('INTEGRATION_CHANNEL_ACCOUNT_MISSING');

    const threadKey = {
      integration_source_id_channel_account_id_external_thread_id: {
        integration_source_id: source.id,
        channel_account_id: source.channel_account_id,
        external_thread_id: threadId,
      },
    };
    let link = await tx.crm_external_thread.findUnique({ where: threadKey });
    if (!link) {
      const conversationId = crypto.randomUUID();
      const conversation = await tx.crm_conversation.create({
        data: {
          id: conversationId,
          tenant_id: source.tenant_id,
          company_id: source.company_id,
          channel_account_id: source.channel_account_id,
          customer_party_id: null,
          contact_id: null,
          opportunity_id: null,
          inquiry_id: null,
          assigned_user_id: null,
          external_conversation_id: threadId,
          subject: senderName || `${source.channel_type} conversation`,
          opened_at: isoDate(envelope.occurred_at),
          closed_at: null,
          priority: 'NORMAL',
          status: 'OPEN',
        },
      });
      link = await tx.crm_external_thread.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: source.tenant_id,
          company_id: source.company_id,
          integration_source_id: source.id,
          channel_account_id: source.channel_account_id,
          external_thread_id: threadId,
          conversation_id: conversation.id,
          link_method: 'SIGNED_WEBHOOK_THREAD_ID',
          link_evidence: String(envelope.event_id),
        },
      });
    }

    const identityKey = {
      integration_source_id_channel_account_id_identity_type_normalized_value: {
        integration_source_id: source.id,
        channel_account_id: source.channel_account_id,
        identity_type: identity.type,
        normalized_value: identity.value,
      },
    };
    const channelVerified = verification?.status === 'VERIFIED' && (
      (source.channel_type === 'WHATSAPP' && verification.method === 'WHATSAPP_PROVIDER_INBOUND') ||
      (source.channel_type === 'WEBSITE' && verification.method === 'WEBSITE_AUTHENTICATED_SESSION')
    );
    const externalIdentity = await tx.crm_external_identity.upsert({
      where: identityKey,
      create: {
        id: crypto.randomUUID(),
        tenant_id: source.tenant_id,
        company_id: source.company_id,
        integration_source_id: source.id,
        channel_account_id: source.channel_account_id,
        identity_type: identity.type,
        normalized_value: identity.value,
        channel_verification_status: channelVerified ? 'VERIFIED' : 'UNVERIFIED',
        customer_match_status: 'UNMATCHED',
        verification_method: channelVerified ? String(verification.method) : null,
        verified_at: channelVerified ? isoDate(envelope.occurred_at) : null,
        party_id: null,
        contact_id: null,
      },
      update: channelVerified ? {
        channel_verification_status: 'VERIFIED',
        verification_method: String(verification.method),
        verified_at: isoDate(envelope.occurred_at),
      } : {},
    });
    await tx.crm_external_thread_identity.upsert({
      where: { thread_link_id_external_identity_id: { thread_link_id: link.id, external_identity_id: externalIdentity.id } },
      create: {
        id: crypto.randomUUID(),
        tenant_id: source.tenant_id,
        company_id: source.company_id,
        thread_link_id: link.id,
        external_identity_id: externalIdentity.id,
        participant_role: 'CUSTOMER',
      },
      update: { participant_role: 'CUSTOMER' },
    });

    const messageKey = {
      integration_source_id_channel_account_id_external_message_id: {
        integration_source_id: source.id,
        channel_account_id: source.channel_account_id,
        external_message_id: externalMessageId,
      },
    };
    const existingMessage = await tx.crm_external_message.findUnique({ where: messageKey });
    if (!existingMessage) {
      const messageId = crypto.randomUUID();
      await tx.crm_message.create({
        data: {
          id: messageId,
          tenant_id: source.tenant_id,
          company_id: source.company_id,
          conversation_id: link.conversation_id,
          sender_user_id: null,
          sender_party_id: null,
          external_message_id: externalMessageId,
          direction: 'INBOUND',
          message_type: 'TEXT',
          message_text: messageText,
          sent_at: isoDate(envelope.occurred_at),
          received_at: new Date(),
          status: 'RECEIVED',
        },
      });
      await tx.crm_external_message.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: source.tenant_id,
          company_id: source.company_id,
          integration_source_id: source.id,
          channel_account_id: source.channel_account_id,
          external_message_id: externalMessageId,
          message_id: messageId,
        },
      });
    }

    await tx.crm_conversation.updateMany({
      where: { id: link.conversation_id, company_id: source.company_id },
      data: { updated_at: new Date(), status: 'OPEN' },
    });
    await tx.crm_integration_event.updateMany({
      where: { id: event.id, lock_token: event.lock_token, status: 'PROCESSING' },
      data: {
        status: 'COMPLETED', payload: Prisma.DbNull,
        locked_by: null, lock_token: null, locked_until: null,
        last_error: null, processed_at: new Date(), updated_at: new Date(),
      },
    });
  }, { maxWait: 10_000, timeout: 30_000, isolationLevel: 'Serializable' as Prisma.TransactionIsolationLevel });
}

async function failEvent(event: ClaimedEvent, error: unknown) {
  const errorCode = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : '';
  const code = (errorCode || (error instanceof Error ? error.name : 'PROCESSING_ERROR')).slice(0, 200);
  const exhausted = event.attempt_count >= event.max_attempts;
  const nextRetryAt = new Date(Date.now() + retryDelayMs(event.attempt_count));
  await prisma.crm_integration_event.updateMany({
    where: { id: event.id, lock_token: event.lock_token, status: 'PROCESSING' },
    data: {
      status: exhausted ? 'DEAD_LETTER' : 'PENDING',
      next_retry_at: nextRetryAt,
      locked_by: null,
      lock_token: null,
      locked_until: null,
      last_error: code,
      updated_at: new Date(),
    },
  });
  console.warn(`CRM integration event ${event.id} ${exhausted ? 'moved to DEAD_LETTER' : 'scheduled for retry'} (${code}).`);
}

export async function processCrmIntegrationBatch(workerId = `crm-worker-${process.pid}`, limit = 20) {
  const batch = await claimEvents(workerId, Math.min(Math.max(limit, 1), 100));
  let completed = 0;
  let retried = 0;
  for (const event of batch) {
    try {
      await processMessageEvent(event);
      completed += 1;
    } catch (error) {
      await failEvent(event, error);
      retried += 1;
    }
  }
  return { claimed: batch.length, completed, retried };
}

export function startCrmIntegrationWorker(isReady: () => boolean) {
  let active = false;
  const timer = setInterval(() => {
    if (!isReady() || active) return;
    active = true;
    void processCrmIntegrationBatch().catch((error) => {
      console.warn('CRM integration worker batch failed.', error instanceof Error ? error.name : 'unknown');
    }).finally(() => { active = false; });
  }, 2_000);
  timer.unref?.();
  return () => clearInterval(timer);
}
