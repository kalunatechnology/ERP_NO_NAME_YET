import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { normalizeExternalIdentity, normalizeOriginDomain, retryDelayMs } from './crm-integration.service';
import { processOutboundWebhookBatch, queueWebhookEvent } from './crm-outbound-webhook.service';
import { CRMService } from './crm.service';

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

function resolveEventOriginDomain(data: any, allowedDomains: string[]): string | null {
  if (data?.origin_domain === undefined || data?.origin_domain === null || data?.origin_domain === '') return null;
  if (typeof data.origin_domain !== 'string') throw new Error('INVALID_ORIGIN_DOMAIN');
  const normalized = normalizeOriginDomain(data.origin_domain);
  if (!allowedDomains.includes(normalized)) throw new Error('ORIGIN_DOMAIN_NOT_ALLOWED');
  return normalized;
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
  if (!envelope || Number(envelope.schema_version) !== 1) {
    throw new Error('UNSUPPORTED_EVENT_CONTRACT');
  }
  if (envelope.event_type !== 'message.received') return processOtherIntegrationEvent(event);
  const data = envelope.data;
  const threadId = typeof data?.thread_id === 'string' ? data.thread_id.trim() : '';
  const externalMessageId = typeof data?.message_id === 'string' ? data.message_id.trim() : '';
  const messageText = typeof data?.message?.text === 'string' ? data.message.text : '';
  const senderName = typeof data?.sender?.display_name === 'string' ? data.sender.display_name.trim() : '';
  const identity = data?.sender?.value
    ? normalizeExternalIdentity(String(data.sender.type ?? ''), String(data.sender.value))
    : null;
  const verification = data?.sender?.identity_verification ?? data?.sender?.channel_verification;
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
    const originDomain = resolveEventOriginDomain(data, source.allowed_origin_domains ?? []);

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
          assigned_user_id: source.default_assigned_user_id,
          external_conversation_id: threadId,
          business_unit_code: source.business_unit_code,
          business_unit_name: source.business_unit_name,
          subject: senderName || `${source.source_code} conversation`,
          opened_at: isoDate(envelope.occurred_at),
          closed_at: null,
          priority: 'NORMAL',
          status: 'OPEN',
          origin_domain: originDomain,
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

    if (identity) {
      const identityKey = {
        integration_source_id_channel_account_id_identity_type_normalized_value: {
          integration_source_id: source.id,
          channel_account_id: source.channel_account_id!,
          identity_type: identity.type,
          normalized_value: identity.value,
        },
      };
      // A source can attest that an identity was verified upstream. This is
      // deliberately independent of the originating messaging channel.
      const identityVerified = verification?.status === 'VERIFIED' && typeof verification.method === 'string';
      const externalIdentity = await tx.crm_external_identity.upsert({
        where: identityKey,
        create: {
          id: crypto.randomUUID(),
          tenant_id: source.tenant_id,
          company_id: source.company_id,
          integration_source_id: source.id,
          channel_account_id: source.channel_account_id!,
          identity_type: identity.type,
          normalized_value: identity.value,
          channel_verification_status: identityVerified ? 'VERIFIED' : 'UNVERIFIED',
          customer_match_status: 'UNMATCHED',
          verification_method: identityVerified ? String(verification.method) : null,
          verified_at: identityVerified ? isoDate(envelope.occurred_at) : null,
          party_id: null,
          contact_id: null,
        },
        update: identityVerified ? {
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
    }

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

    const currentConversation = await tx.crm_conversation.findFirst({
      where: { id: link.conversation_id, company_id: source.company_id },
      select: { inquiry_id: true, origin_domain: true },
    });
    await tx.crm_conversation.updateMany({
      where: { id: link.conversation_id, company_id: source.company_id },
      data: {
        updated_at: new Date(),
        // New inbound activity reopens an ignored thread, while an already
        // escalated thread stays linked to its Inquiry.
        status: currentConversation?.inquiry_id ? 'ESCALATED' : 'OPEN',
        closed_at: null,
        origin_domain: currentConversation?.origin_domain ? undefined : originDomain ?? undefined,
      },
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

async function processOtherIntegrationEvent(event: ClaimedEvent) {
  const envelope = event.payload;
  const data = envelope?.data;
  await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM crm_integration_event
      WHERE id = ${event.id} AND lock_token = ${event.lock_token} AND status = 'PROCESSING' FOR UPDATE
    `;
    if (!locked.length) return;
    const source = await tx.core_integration_source.findUnique({ where: { id: event.source_id } });
    if (!source) throw new Error('INTEGRATION_SOURCE_MISSING');
    const originDomain = resolveEventOriginDomain(data, source.allowed_origin_domains ?? []);
    if (envelope.event_type === 'inquiry.submitted') {
      const customer = data?.customer && typeof data.customer === 'object' && !Array.isArray(data.customer) ? data.customer : data;
      const requirements = data?.requirements && typeof data.requirements === 'object' && !Array.isArray(data.requirements) ? data.requirements : data;
      const subject = String(requirements?.subject ?? data?.subject ?? '').trim();
      const customerName = String(customer?.name ?? data?.customer_name ?? '').trim();
      const customerEmail = String(customer?.email ?? data?.customer_email ?? '').trim();
      if (!subject || !customerName || !customerEmail) throw new Error('INVALID_INQUIRY_EVENT');
      const customerPhone = String(customer?.phone ?? data?.customer_phone ?? '').trim();
      const targetBudget = requirements?.target_budget ?? data?.target_budget;
      const requestDescription = String(requirements?.description ?? data?.description ?? '').trim();
      const context = [requestDescription, customerPhone ? `Telepon eksternal: ${customerPhone}` : '', targetBudget !== undefined ? `Anggaran target: ${targetBudget}` : ''].filter(Boolean).join('\n\n');
      const now = new Date();
      await tx.crm_customer_inquiry.create({ data: {
        id: crypto.randomUUID(), tenant_id: source.tenant_id, company_id: source.company_id,
        owner_user_id: source.default_assigned_user_id, inquiry_number: `EXT-${crypto.randomUUID()}`,
        source_channel: `INTEGRATION:${source.source_code}`, subject,
        origin_domain: originDomain,
        description: context, customer_name: customerName,
        customer_email: customerEmail, status: 'NEW', created_at: now, updated_at: now,
      } });
    } else if (envelope.event_type === 'ticket.created') {
      const subject = String(data?.subject ?? '').trim();
      const description = String(data?.description ?? '').trim();
      if (!subject || !description) throw new Error('INVALID_TICKET_EVENT');
      const serial = typeof data?.serial_number === 'string' ? data.serial_number.trim() : '';
      const serialRow = serial ? await tx.inv_serial_number.findFirst({ where: { serial_number: serial, company_id: source.company_id }, select: { id: true, product_id: true } }) : null;
      if (serial && !serialRow) throw new Error('SERIAL_NUMBER_NOT_FOUND');
      const now = new Date();
      await tx.service_case.create({ data: {
        id: crypto.randomUUID(), tenant_id: source.tenant_id, company_id: source.company_id,
        assigned_user_id: source.default_assigned_user_id, product_id: serialRow?.product_id ?? null,
        serial_number_id: serialRow?.id ?? null, priority: 'NORMAL', subject, description,
        status: 'OPEN', created_at: now, updated_at: now,
        origin_domain: originDomain,
      } });
    } else if (envelope.event_type === 'feedback.submitted') {
      const customerCode = typeof data?.customer_code === 'string' ? data.customer_code.trim() : typeof data?.client_code === 'string' ? data.client_code.trim() : '';
      const partyId = String(data?.customer_party_id ?? '').trim();
      const rating = Number(data?.rating);
      const feedbackText = String(data?.feedback_text ?? '').trim();
      const feedbackType = String(data?.feedback_type ?? 'CUSTOMER_REVIEW').trim();
      if ((!customerCode && !partyId) || customerCode.length > 100 || !Number.isInteger(rating) || rating < 1 || rating > 5 || !feedbackText || feedbackText.length > 2000 || !feedbackType || feedbackType.length > 60) throw new Error('INVALID_FEEDBACK_EVENT');
      const party = await tx.master_party.findFirst({ where: { ...(customerCode ? { party_code: customerCode } : { id: partyId }), tenant_id: source.tenant_id, company_id: source.company_id, party_type: 'CUSTOMER', status: 'ACTIVE' }, select: { id: true } });
      if (!party) throw new Error('CUSTOMER_PARTY_NOT_FOUND');
      const salesOrderId = typeof data?.sales_order_id === 'string' ? data.sales_order_id.trim() : '';
      if (salesOrderId) {
        const order = await tx.sales_order.findFirst({ where: { id: salesOrderId, tenant_id: source.tenant_id, company_id: source.company_id, customer_party_id: party.id }, select: { id: true } });
        if (!order) throw new Error('FEEDBACK_SALES_ORDER_NOT_FOUND');
      }
      await tx.crm_feedback.create({ data: {
        id: crypto.randomUUID(), tenant_id: source.tenant_id, company_id: source.company_id,
        customer_party_id: party.id, sales_order_id: salesOrderId || null,
        feedback_type: feedbackType, rating_value: rating, feedback_text: feedbackText,
        submitted_at: isoDate(envelope.occurred_at), status: 'SUBMITTED', origin_domain: originDomain,
      } });
    } else if (envelope.event_type === 'quotation.decision' || envelope.event_type === 'quotation.accepted') {
      const quotationId = String(data?.quotation_id ?? '').trim();
      const decision = envelope.event_type === 'quotation.accepted' ? 'ACCEPTED' : String(data?.decision ?? '').toUpperCase();
      if (!quotationId || !['ACCEPTED', 'REJECTED'].includes(decision)) throw new Error('INVALID_QUOTATION_DECISION');
      const quotation = await tx.sales_quotation.findFirst({ where: { id: quotationId, company_id: source.company_id } });
      if (!quotation) throw new Error('QUOTATION_NOT_FOUND');
      if (quotation.status !== 'SENT') throw new Error('QUOTATION_NOT_DECIDABLE');
      await tx.sales_quotation.update({ where: { id: quotation.id }, data: { status: decision } });
      if (decision === 'ACCEPTED') {
        if (!quotation.opportunity_id) throw new Error('QUOTATION_OPPORTUNITY_MISSING');
        await CRMService.processDealWon(quotation.opportunity_id, { id: source.default_assigned_user_id }, source.company_id, tx);
        await queueWebhookEvent(tx, source.company_id, 'quotation.accepted', { quotation_id: quotation.id, opportunity_id: quotation.opportunity_id });
      } else await queueWebhookEvent(tx, source.company_id, 'quotation.rejected', { quotation_id: quotation.id, decision });
    } else {
      throw new Error('UNSUPPORTED_EVENT_CONTRACT');
    }
    await tx.crm_integration_event.updateMany({
      where: { id: event.id, lock_token: event.lock_token, status: 'PROCESSING' },
      data: { status: 'COMPLETED', payload: Prisma.DbNull, locked_by: null, lock_token: null, locked_until: null, last_error: null, processed_at: new Date(), updated_at: new Date() },
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
    void Promise.all([
      processCrmIntegrationBatch(),
      processOutboundWebhookBatch(),
    ]).catch((error) => {
      console.warn('CRM integration worker batch failed.', error instanceof Error ? error.name : 'unknown');
    }).finally(() => { active = false; });
  }, 2_000);
  timer.unref?.();
  return () => clearInterval(timer);
}
