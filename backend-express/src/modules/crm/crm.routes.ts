/**
 * File: backend-express/src/modules/crm/crm.routes.ts
 *
 * Purpose: Implements Express API routing responsibilities for the crm domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { CRMService } from './crm.service';
import { createCrudRouter } from '../../utils/crud-factory';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import { requireActiveRole } from '../../middlewares/rbac.middleware';
import { RoleCode } from '../../types/roles';

export const crmRouter = Router();

function activeCompanyId(req: Request): string {
  if (!req.companyId) throw new ForbiddenError('Pilih company sebelum menjalankan operasi CRM.');
  return req.companyId;
}

async function decideExecutiveApproval(req: Request, decision: 'APPROVED' | 'REJECTED') {
  const companyId = activeCompanyId(req);
  return prisma.$transaction(async (tx) => {
    const approval = await tx.crm_executive_approval.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: { id: true },
    });
    if (!approval) throw new NotFoundError('ExecutiveApproval');
    return tx.crm_executive_approval.update({
      where: { id: approval.id },
      data: {
        decision,
        remarks: req.body.remarks ?? '',
        approver_user_id: req.user?.id,
        decided_at: new Date(),
      },
    });
  });
}

// =============================================================================
// CUSTOM ACTIONS ON INQUIRIES
// =============================================================================

/**
 * POST route handler: `/customer-inquiries/:id/qualify`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
crmRouter.post('/customer-inquiries/:id/qualify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CRMService.qualifyInquiry(req.params.id, req.user?.id ?? 'system', activeCompanyId(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// CUSTOM ACTIONS ON COST ESTIMATES
// =============================================================================

/**
 * POST route handler: `/cost-estimates/:id/calculate`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
crmRouter.post('/cost-estimates/:id/calculate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CRMService.calculateEstimate(req.params.id, req.user?.id ?? 'system', activeCompanyId(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST route handler: `/cost-estimates/:id/create-quotation`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
crmRouter.post('/cost-estimates/:id/create-quotation', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CRMService.createQuotationFromEstimate(req.params.id, req.user?.id ?? 'system', activeCompanyId(req));
    res.status(result.created ? 201 : 200).json(result);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// CUSTOM ACTIONS ON CREDIT SNAPSHOTS
// =============================================================================

/**
 * POST route handler: `/credit-status-snapshots/calculate`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
crmRouter.post('/credit-status-snapshots/calculate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerPartyId = req.body.customer_party ?? req.body.customer_party_id;
    if (!customerPartyId) throw new ValidationError('customer_party_id is required');
    const result = await CRMService.calculateCreditSnapshot(customerPartyId, activeCompanyId(req));
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// CUSTOM ACTIONS ON OPPORTUNITIES
// =============================================================================

/**
 * POST route handler: `/opportunities/:id/process-deal-won`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
crmRouter.post('/opportunities/:id/process-deal-won', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CRMService.processDealWon(req.params.id, req.user, activeCompanyId(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST route handler: `/opportunities/:id/executive-override`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
crmRouter.post('/opportunities/:id/executive-override', requireActiveRole(RoleCode.DIRECTOR), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CRMService.executiveOverride(req.params.id, req.user, activeCompanyId(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET route handler: `/opportunities/:id/customer-360`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `crm_opportunity`, `master_party`, `sales_quotation`, `sales_order`, `project_project` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
crmRouter.get('/opportunities/:id/customer-360', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = activeCompanyId(req);
    const opp = await prisma.crm_opportunity.findFirst({ where: { id: req.params.id, company_id: companyId } });
    if (!opp) throw new NotFoundError('Opportunity');

    const customer = opp.customer_party_id
      ? await prisma.master_party.findFirst({ where: { id: opp.customer_party_id, company_id: companyId } })
      : null;

    const [quotationsCount, ordersCount, projectsCount] = await Promise.all([
      customer ? prisma.sales_quotation.count({ where: { customer_party_id: customer.id, company_id: companyId } }) : 0,
      customer ? prisma.sales_order.count({ where: { customer_party_id: customer.id, company_id: companyId } }) : 0,
      customer ? prisma.project_project.count({ where: { customer_party_id: customer.id, company_id: companyId } }) : 0,
    ]);

    res.json({
      customer: {
        id: customer?.id ?? null,
        name: customer?.display_name ?? customer?.legal_name ?? 'No Customer',
        party_code: customer?.party_code ?? '-',
      },
      quotations: quotationsCount,
      orders: ordersCount,
      projects: projectsCount,
      contracts: 0,
      deliveries: 0,
      outstanding_ar: '0',
      feedback_count: 0,
    });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// CUSTOM ACTIONS ON EXECUTIVE APPROVALS
// =============================================================================

/**
 * POST route handler: `/executive-approvals/:id/decide`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `crm_executive_approval` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
crmRouter.post('/executive-approvals/:id/decide', requireActiveRole(RoleCode.DIRECTOR), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const decision = String(req.body.decision ?? '').toUpperCase();
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      throw new ValidationError('Gunakan APPROVED atau REJECTED.');
    }
    const updated = await decideExecutiveApproval(req, decision as 'APPROVED' | 'REJECTED');
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * POST route handler: `/executive-approvals/:id/approve`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `crm_executive_approval` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
crmRouter.post('/executive-approvals/:id/approve', requireActiveRole(RoleCode.DIRECTOR), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await decideExecutiveApproval(req, 'APPROVED');
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * POST route handler: `/executive-approvals/:id/reject`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `crm_executive_approval` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
crmRouter.post('/executive-approvals/:id/reject', requireActiveRole(RoleCode.DIRECTOR), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await decideExecutiveApproval(req, 'REJECTED');
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Read-only first-phase inbox. External identity data is intentionally not
// joined to master_party here; a verified phone number is not proof of a
// customer relationship.
crmRouter.get('/inbox', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const company = activeCompanyId(req);
    const requestedSize = Number(req.query.page_size ?? 50);
    const pageSize = Number.isFinite(requestedSize) ? Math.min(Math.max(Math.trunc(requestedSize), 1), 100) : 50;
    const conversations = await prisma.crm_conversation.findMany({
      where: { company_id: company },
      orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }],
      take: pageSize,
    });
    const conversationIds = conversations.map((conversation) => conversation.id);
    const [messages, links, inquiries, assignees] = await Promise.all([
      conversationIds.length ? prisma.crm_message.findMany({
        where: { company_id: company, conversation_id: { in: conversationIds } },
        orderBy: [{ received_at: 'desc' }, { sent_at: 'desc' }],
        take: pageSize * 12,
      }) : Promise.resolve([]),
      conversationIds.length ? prisma.crm_external_thread.findMany({
        where: { company_id: company, conversation_id: { in: conversationIds } },
        select: { id: true, conversation_id: true, external_thread_id: true, link_method: true },
      }) : Promise.resolve([]),
      conversationIds.length ? prisma.crm_customer_inquiry.findMany({
        where: { company_id: company, id: { in: conversations.flatMap((item) => item.inquiry_id ? [item.inquiry_id] : []) } },
        select: { id: true, inquiry_number: true, status: true },
      }) : Promise.resolve([]),
      conversationIds.length ? prisma.iam_user.findMany({
        where: { id: { in: conversations.flatMap((item) => item.assigned_user_id ? [item.assigned_user_id] : []) }, tenant_id: req.tenantId ?? undefined },
        select: { id: true, full_name: true },
      }) : Promise.resolve([]),
    ]);
    const linkIds = links.map((link) => link.id);
    const threadIdentityLinks = linkIds.length ? await prisma.crm_external_thread_identity.findMany({
      where: { company_id: company, thread_link_id: { in: linkIds } },
      select: { thread_link_id: true, external_identity_id: true },
    }) : [];
    const externalIdentityIds = [...new Set(threadIdentityLinks.map((item) => item.external_identity_id))];
    const externalIdentities = externalIdentityIds.length ? await prisma.crm_external_identity.findMany({
      where: { company_id: company, id: { in: externalIdentityIds } },
      select: { id: true, identity_type: true, normalized_value: true, channel_verification_status: true, customer_match_status: true, party_id: true },
    }) : [];
    const latest = new Map<string, typeof messages[number]>();
    const grouped = new Map<string, typeof messages>();
    for (const message of messages) {
      if (!message.conversation_id) continue;
      if (!latest.has(message.conversation_id)) latest.set(message.conversation_id, message);
      const history = grouped.get(message.conversation_id) ?? [];
      if (history.length < 20) history.push(message);
      grouped.set(message.conversation_id, history);
    }
    const linkByConversation = new Map(links.map((link) => [link.conversation_id, link]));
    const inquiryById = new Map(inquiries.map((inquiry) => [inquiry.id, inquiry]));
    const assigneeById = new Map(assignees.map((assignee) => [assignee.id, assignee]));
    const identitiesById = new Map(externalIdentities.map((identity) => [identity.id, identity]));
    const identitiesByThread = new Map<string, Array<{ id: string; type: string; masked_value: string; channel_verification_status: string; customer_match_status: string; party_id: string | null }>>();
    for (const mapping of threadIdentityLinks) {
      const identity = identitiesById.get(mapping.external_identity_id);
      if (!identity) continue;
      const value = identity.normalized_value;
      const masked = identity.identity_type === 'PHONE'
        ? `${value.slice(0, 3)}••••${value.slice(-3)}`
        : identity.identity_type === 'EMAIL' && value.includes('@')
          ? `${value.slice(0, 1)}•••@${value.split('@')[1]}`
          : 'External identity';
      const identities = identitiesByThread.get(mapping.thread_link_id) ?? [];
      identities.push({ id: identity.id, type: identity.identity_type, masked_value: masked, channel_verification_status: identity.channel_verification_status, customer_match_status: identity.customer_match_status, party_id: identity.party_id });
      identitiesByThread.set(mapping.thread_link_id, identities);
    }
    res.json({ rows: conversations.map((conversation) => ({
      ...conversation,
      latest_message: latest.get(conversation.id) ?? null,
      messages: (grouped.get(conversation.id) ?? []).slice().reverse(),
      external_thread: linkByConversation.get(conversation.id) ?? null,
      inquiry: conversation.inquiry_id ? inquiryById.get(conversation.inquiry_id) ?? null : null,
      assigned_user: conversation.assigned_user_id ? assigneeById.get(conversation.assigned_user_id) ?? null : null,
      external_identities: (linkByConversation.get(conversation.id)?.id ? identitiesByThread.get(linkByConversation.get(conversation.id)!.id) : []) ?? [],
    })), page_size: pageSize });
  } catch (error) { next(error); }
});

crmRouter.post('/external-identities/:id/confirm-customer', requireActiveRole(RoleCode.CRM_LEAD, RoleCode.SALES), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const company = activeCompanyId(req);
    const partyId = String(req.body.party_id ?? '').trim();
    if (!partyId) throw new ValidationError('party_id wajib dipilih secara eksplisit.');
    const identity = await prisma.crm_external_identity.findFirst({
      where: { id: req.params.id, company_id: company, channel_verification_status: 'VERIFIED' },
    });
    if (!identity) throw new NotFoundError('Verified external identity');
    const party = await prisma.master_party.findFirst({ where: { id: partyId, company_id: company, status: 'ACTIVE' } });
    if (!party) throw new ValidationError('Customer tidak aktif atau tidak ditemukan di company ini.');
    const mapping = await prisma.$transaction(async (tx) => {
      const updatedIdentity = await tx.crm_external_identity.update({
        where: { id: identity.id },
        data: { customer_match_status: 'CONFIRMED', party_id: party.id, verified_at: new Date(), verified_by_id: req.user?.id },
      });
      const threadLinks = await tx.crm_external_thread_identity.findMany({
        where: { external_identity_id: identity.id, company_id: company },
        select: { thread_link_id: true },
      });
      const threadIds = [...new Set(threadLinks.map((item) => item.thread_link_id))];
      if (threadIds.length) {
        const allThreadIdentities = await tx.crm_external_thread_identity.findMany({
          where: { thread_link_id: { in: threadIds }, company_id: company },
          select: { thread_link_id: true, external_identity_id: true },
        });
        const threadCounts = new Map<string, Set<string>>();
        for (const item of allThreadIdentities) {
          const ids = threadCounts.get(item.thread_link_id) ?? new Set<string>();
          ids.add(item.external_identity_id);
          threadCounts.set(item.thread_link_id, ids);
        }
        const safeThreadIds = threadIds.filter((id) => threadCounts.get(id)?.size === 1);
        const threads = safeThreadIds.length ? await tx.crm_external_thread.findMany({
          where: { id: { in: safeThreadIds }, company_id: company },
          select: { conversation_id: true },
        }) : [];
        const conversationIds = threads.map((thread) => thread.conversation_id);
        if (conversationIds.length) {
          await tx.crm_conversation.updateMany({ where: { id: { in: conversationIds }, company_id: company }, data: { customer_party_id: party.id } });
          await tx.crm_customer_inquiry.updateMany({ where: { company_id: company, id: { in: (await tx.crm_conversation.findMany({ where: { id: { in: conversationIds }, company_id: company }, select: { inquiry_id: true } })).flatMap((item) => item.inquiry_id ? [item.inquiry_id] : []) } }, data: { customer_party_id: party.id, customer_name: party.display_name ?? party.legal_name ?? 'Customer' } });
        }
      }
      return updatedIdentity;
    }, { maxWait: 5_000, timeout: 20_000 });
    res.json({ id: mapping.id, customer_match_status: mapping.customer_match_status, party_id: mapping.party_id, customer_name: party.display_name ?? party.legal_name });
  } catch (error) { next(error); }
});

crmRouter.post('/conversations/:id/assign', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const company = activeCompanyId(req);
    const assignedUserId = String(req.body.assigned_user_id ?? '').trim();
    if (!assignedUserId) throw new ValidationError('assigned_user_id wajib diisi.');
    const user = await prisma.iam_user.findFirst({
      where: { id: assignedUserId, tenant_id: req.tenantId ?? undefined, status: 'ACTIVE', is_active: true },
      select: { id: true },
    });
    if (!user) throw new ValidationError('PIC CRM tidak ditemukan atau tidak aktif dalam tenant ini.');
    const assignments = await prisma.iam_user_role.findMany({
      where: { user_id: user.id, tenant_id: req.tenantId ?? undefined, company_id: company },
      select: { role_id: true },
    });
    const roleIds = assignments.flatMap((assignment) => assignment.role_id ? [assignment.role_id] : []);
    const eligible = roleIds.length ? await prisma.iam_role.count({
      where: { id: { in: roleIds }, role_code: { in: [RoleCode.CRM_LEAD, RoleCode.SALES, RoleCode.PROJECT_MANAGER] } },
    }) : 0;
    if (!eligible) throw new ValidationError('PIC harus memiliki role CRM Lead, Sales, atau Project Manager pada company aktif.');
    const update = await prisma.crm_conversation.updateMany({
      where: { id: req.params.id, company_id: company },
      data: { assigned_user_id: user.id },
    });
    if (!update.count) throw new NotFoundError('Conversation');
    res.json({ id: req.params.id, assigned_user_id: user.id });
  } catch (error) { next(error); }
});

crmRouter.post('/conversations/:id/create-inquiry', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const company = activeCompanyId(req);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM crm_conversation WHERE id = ${req.params.id} AND company_id = ${company} FOR UPDATE
      `;
      const conversation = await tx.crm_conversation.findFirst({ where: { id: req.params.id, company_id: company } });
      if (!conversation) throw new NotFoundError('Conversation');
      if (conversation.inquiry_id) {
        const inquiry = await tx.crm_customer_inquiry.findFirst({ where: { id: conversation.inquiry_id, company_id: company } });
        if (inquiry) return { inquiry, created: false };
      }
      const channel = conversation.channel_account_id
        ? await tx.crm_channel_account.findFirst({ where: { id: conversation.channel_account_id, company_id: company } })
        : null;
      const messages = await tx.crm_message.findMany({
        where: { conversation_id: conversation.id, company_id: company },
        orderBy: [{ received_at: 'desc' }, { sent_at: 'desc' }],
        take: 20,
      });
      const description = messages.reverse().map((message) => `${message.direction === 'INBOUND' ? 'Customer' : 'CS'}: ${message.message_text}`).join('\n');
      const now = new Date();
      const inquiry = await tx.crm_customer_inquiry.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: conversation.tenant_id ?? req.tenantId,
          company_id: company,
          created_by_id: req.user?.id,
          customer_party_id: null,
          contact_id: null,
          owner_user_id: conversation.assigned_user_id ?? req.user?.id,
          inquiry_number: `INQ-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
          source_channel: `ARSALYNK_${String(channel?.channel_type ?? 'INBOUND').toUpperCase()}`,
          subject: conversation.subject || 'Inquiry dari Customer Inbox',
          description: description || `Dibuat dari conversation ${conversation.id}.`,
          customer_name: conversation.subject || 'Belum teridentifikasi',
          customer_email: '',
          status: 'NEW',
          created_at: now,
          updated_at: now,
        },
      });
      await tx.crm_conversation.update({ where: { id: conversation.id }, data: { inquiry_id: inquiry.id } });
      return { inquiry, created: true };
    }, { maxWait: 5_000, timeout: 20_000, isolationLevel: 'Serializable' });
    res.status(result.created ? 201 : 200).json(result);
  } catch (error) { next(error); }
});

// =============================================================================
// CRUD VIEWSETS
// =============================================================================

crmRouter.use('/customer-inquiries', createCrudRouter({ modelName: 'crm_customer_inquiry', searchFields: ['inquiry_number', 'subject', 'customer_name'] }));
crmRouter.use('/inquiry-requirements', createCrudRouter({ modelName: 'crm_inquiry_requirement', searchFields: ['description'] }));
crmRouter.use('/cost-estimates', createCrudRouter({ modelName: 'crm_cost_estimate', searchFields: ['estimate_number'] }));
crmRouter.use('/cost-estimate-lines', createCrudRouter({ modelName: 'crm_cost_estimate_line', searchFields: ['description', 'cost_element'] }));
crmRouter.use('/opportunities', createCrudRouter({ modelName: 'crm_opportunity', searchFields: ['opportunity_name', 'pipeline_stage'] }));
crmRouter.use('/opportunity-products', createCrudRouter({ modelName: 'crm_opportunity_product' }));
crmRouter.use('/activities', createCrudRouter({ modelName: 'crm_activity', searchFields: ['subject', 'activity_type'] }));
crmRouter.use('/pipelines', createCrudRouter({ modelName: 'crm_pipeline', searchFields: ['pipeline_name', 'pipeline_code'] }));
crmRouter.use('/pipeline-stages', createCrudRouter({ modelName: 'crm_pipeline_stage', searchFields: ['stage_name', 'stage_code'] }));
crmRouter.use('/opportunity-stage-histories', createCrudRouter({ modelName: 'crm_opportunity_stage_history' }));
// Decisions must go through the Director-only commands above. Data Explorer
// may inspect approval rows but must not mutate them through generic CRUD.
crmRouter.use('/executive-approvals', createCrudRouter({ modelName: 'crm_executive_approval', readOnly: true }));
crmRouter.use('/credit-status-snapshots', createCrudRouter({ modelName: 'crm_credit_status_snapshot' }));
crmRouter.use('/channel-accounts', createCrudRouter({ modelName: 'crm_channel_account' }));
crmRouter.use('/conversations', createCrudRouter({ modelName: 'crm_conversation' }));
crmRouter.use('/conversation-participants', createCrudRouter({ modelName: 'crm_conversation_participant' }));
crmRouter.use('/messages', createCrudRouter({ modelName: 'crm_message' }));
crmRouter.use('/message-attachments', createCrudRouter({ modelName: 'crm_message_attachment' }));
crmRouter.use('/message-delivery-statuses', createCrudRouter({ modelName: 'crm_message_delivery_status' }));
crmRouter.use('/feedbacks', createCrudRouter({ modelName: 'crm_feedback', searchFields: ['subject', 'feedback_text'] }));
crmRouter.use('/surveys', createCrudRouter({ modelName: 'crm_survey', searchFields: ['title'] }));
crmRouter.use('/survey-questions', createCrudRouter({ modelName: 'crm_survey_question' }));
crmRouter.use('/survey-responses', createCrudRouter({ modelName: 'crm_survey_response' }));
crmRouter.use('/survey-answers', createCrudRouter({ modelName: 'crm_survey_answer' }));
crmRouter.use('/quotation-versions', createCrudRouter({ modelName: 'crm_quotation_version' }));
crmRouter.use('/quotation-deliveries', createCrudRouter({ modelName: 'crm_quotation_delivery' }));
crmRouter.use('/workflow-events', createCrudRouter({ modelName: 'crm_workflow_event' }));
crmRouter.use('/customer-feedbacks', createCrudRouter({ modelName: 'crm_customer_feedback' }));
