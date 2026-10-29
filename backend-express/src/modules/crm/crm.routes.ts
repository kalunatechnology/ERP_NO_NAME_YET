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
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import { requireActiveRole, requireAdminForWrite } from '../../middlewares/rbac.middleware';
import { isSuperAdmin, RoleCode } from '../../types/roles';
import { queueWebhookEvent } from './crm-outbound-webhook.service';

export const crmRouter = Router();

crmRouter.get('/portal-tokens', async (req, res, next) => {
  try {
    const companyId = activeCompanyId(req);
    const rows = await prisma.core_portal_access_token.findMany({
      where: { company_id: companyId }, orderBy: { created_at: 'desc' }, take: 100,
      select: { id: true, party_id: true, scopes: true, expires_at: true, revoked_at: true, created_at: true, last_used_at: true },
    });
    res.json({ rows });
  } catch (error) { next(error); }
});

crmRouter.post('/portal-tokens', requireAdminForWrite, async (req, res, next) => {
  try {
    if (!req.tenantId || !req.user?.id) throw new ForbiddenError('Tenant dan user context wajib tersedia.');
    const companyId = activeCompanyId(req);
    const partyId = String(req.body.party_id ?? '').trim();
    const party = await prisma.master_party.findFirst({ where: { id: partyId, company_id: companyId, party_type: 'CUSTOMER' }, select: { id: true } });
    if (!party) throw new ValidationError('party_id harus customer terdaftar pada company aktif.');
    const allowedScopes = ['quotation:read', 'ticket:read'];
    const scopes: string[] = Array.isArray(req.body.scopes) ? [...new Set<string>(req.body.scopes.map((scope: unknown) => String(scope)))] : allowedScopes;
    if (!scopes.length || scopes.some((scope) => !allowedScopes.includes(scope))) throw new ValidationError('scopes hanya boleh quotation:read dan ticket:read.');
    const days = req.body.expires_in_days === undefined ? 90 : Number(req.body.expires_in_days);
    if (!Number.isInteger(days) || days < 1 || days > 365) throw new ValidationError('expires_in_days harus 1–365.');
    const token = `marka_portal_${crypto.randomBytes(32).toString('base64url')}`;
    const row = await prisma.core_portal_access_token.create({
      data: {
        id: crypto.randomUUID(), tenant_id: req.tenantId, company_id: companyId,
        party_id: party.id, token_hash: crypto.createHash('sha256').update(token).digest('hex'),
        scopes, expires_at: new Date(Date.now() + days * 24 * 60 * 60 * 1000), created_by_id: req.user.id,
      },
      select: { id: true, party_id: true, scopes: true, expires_at: true, created_at: true },
    });
    res.status(201).json({ ...row, api_key: token });
  } catch (error) { next(error); }
});

crmRouter.post('/portal-tokens/:id/revoke', requireAdminForWrite, async (req, res, next) => {
  try {
    const updated = await prisma.core_portal_access_token.updateMany({
      where: { id: req.params.id, company_id: activeCompanyId(req), revoked_at: null },
      data: { revoked_at: new Date() },
    });
    if (!updated.count) { res.status(404).json({ error: { message: 'Token portal tidak ditemukan atau sudah dicabut.' } }); return; }
    res.json({ id: req.params.id, revoked: true });
  } catch (error) { next(error); }
});

function activeCompanyId(req: Request): string {
  if (!req.companyId) throw new ForbiddenError('Pilih company sebelum menjalankan operasi CRM.');
  return req.companyId;
}

async function validateOpportunityCustomer(req: Request, data: Record<string, any>, existing?: { customer_party_id?: string | null }) {
  const hasCustomerInput = data.customer_party_id !== undefined || data.customer_party !== undefined;
  if (!hasCustomerInput && existing) return data;

  const customerPartyId = String(data.customer_party_id ?? data.customer_party ?? '').trim();
  if (!customerPartyId) throw new ValidationError('Pilih pelanggan/customer sebelum menyimpan opportunity.');
  if (!req.tenantId) throw new ForbiddenError('Tenant context wajib tersedia untuk memvalidasi customer opportunity.');

  const party = await prisma.master_party.findFirst({
    where: {
      id: customerPartyId,
      tenant_id: req.tenantId,
      company_id: activeCompanyId(req),
      party_type: 'CUSTOMER',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  if (!party) throw new ValidationError('Pelanggan tidak ditemukan, tidak aktif, atau bukan milik company yang dipilih.');
  return { ...data, customer_party_id: party.id };
}

async function assertProjectModuleAccess(req: Request, mode: 'read' | 'write') {
  const companyId = activeCompanyId(req);
  if (!req.user) throw new ForbiddenError();
  if (isSuperAdmin(req.user.roles)) return;
  const access = await prisma.iam_company_module_access.findUnique({
    where: { company_id_module_code: { company_id: companyId, module_code: 'PROJECTS' } },
  });
  const now = new Date();
  if (!access?.enabled || (access.effective_from && access.effective_from > now) || (access.effective_until && access.effective_until < now)) {
    throw new ForbiddenError('Modul Proyek harus aktif untuk menghubungkan rekanan dengan proyek.');
  }
  if (mode === 'read' && !access.allow_read) throw new ForbiddenError('Akses baca modul Proyek dinonaktifkan.');
  if (mode === 'write' && !access.allow_write) throw new ForbiddenError('Akses tulis modul Proyek dinonaktifkan.');
  const override = await prisma.iam_user_module_access.findUnique({
    where: { user_id_module_code: { user_id: req.user.id, module_code: 'PROJECTS' } },
  });
  if (!override) return;
  if (override.company_id !== companyId || override.tenant_id !== req.user.tenant_id) {
    throw new ForbiddenError('Konfigurasi akses personal Proyek tidak sesuai company.');
  }
  if (mode === 'read' && !override.allow_read) throw new ForbiddenError('Akses baca personal modul Proyek dinonaktifkan.');
  if (mode === 'write' && !override.allow_write) throw new ForbiddenError('Akses tulis personal modul Proyek dinonaktifkan.');
}

function relatedPartyProjectType(partyType: string | null | undefined): 'VENDOR_SUPPLIER' | 'PARTNER' {
  const normalized = String(partyType ?? '').toUpperCase();
  if (['SUPPLIER', 'VENDOR'].includes(normalized)) return 'VENDOR_SUPPLIER';
  if (normalized === 'PARTNER') return 'PARTNER';
  throw new ValidationError('Relasi proyek hanya tersedia untuk Vendor/Supplier atau Partner.');
}

crmRouter.get('/parties/:partyId/projects', async (req, res, next) => {
  try {
    const companyId = activeCompanyId(req);
    await assertProjectModuleAccess(req, 'read');
    const party = await prisma.master_party.findFirst({
      where: { id: req.params.partyId, company_id: companyId },
      select: { id: true, party_type: true, status: true },
    });
    if (!party) throw new NotFoundError('Rekanan');
    relatedPartyProjectType(party.party_type);
    const [projects, relations] = await Promise.all([
      prisma.project_project.findMany({
        where: { company_id: companyId },
        orderBy: [{ project_name: 'asc' }],
        select: { id: true, project_code: true, project_name: true, status: true, lifecycle_status: true },
      }),
      prisma.project_project_party.findMany({
        where: { party_id: party.id, company_id: companyId },
        select: { project_id: true, relationship_type: true },
      }),
    ]);
    res.json({ projects, project_ids: relations.map((relation) => relation.project_id) });
  } catch (error) { next(error); }
});

crmRouter.put('/parties/:partyId/projects', async (req, res, next) => {
  try {
    const companyId = activeCompanyId(req);
    await assertProjectModuleAccess(req, 'write');
    const tenantId = req.tenantId;
    const userId = req.user?.id;
    if (!tenantId || !userId) throw new ForbiddenError('Tenant dan user context wajib tersedia.');
    const party = await prisma.master_party.findFirst({
      where: { id: req.params.partyId, company_id: companyId, status: 'ACTIVE' },
      select: { id: true, party_type: true },
    });
    if (!party) throw new NotFoundError('Rekanan aktif');
    const relationshipType = relatedPartyProjectType(party.party_type);
    const rawProjectIds = req.body?.project_ids;
    if (!Array.isArray(rawProjectIds) || rawProjectIds.some((id: unknown) => typeof id !== 'string')) {
      throw new ValidationError('project_ids harus berupa daftar ID proyek.');
    }
    const projectIds = [...new Set<string>(rawProjectIds.map((id: string) => id.trim()).filter(Boolean))];
    const projects = projectIds.length ? await prisma.project_project.findMany({
      where: { id: { in: projectIds }, company_id: companyId },
      select: { id: true },
    }) : [];
    if (projects.length !== projectIds.length) throw new ValidationError('Semua proyek harus berasal dari company aktif.');

    await prisma.$transaction(async (tx) => {
      await tx.project_project_party.deleteMany({
        where: { party_id: party.id, company_id: companyId, relationship_type: { in: ['VENDOR_SUPPLIER', 'PARTNER'] } },
      });
      if (projectIds.length) await tx.project_project_party.createMany({
        data: projectIds.map((projectId) => ({
          id: crypto.randomUUID(), tenant_id: tenantId, company_id: companyId,
          project_id: projectId, party_id: party.id, relationship_type: relationshipType,
          created_by_id: userId,
        })),
      });
    });
    res.json({ party_id: party.id, project_ids: projectIds });
  } catch (error) { next(error); }
});

async function decideExecutiveApproval(req: Request, decision: 'APPROVED' | 'REJECTED') {
  const companyId = activeCompanyId(req);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM crm_executive_approval WHERE id = ${req.params.id} AND company_id = ${companyId} FOR UPDATE`;
    const approval = await tx.crm_executive_approval.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: { id: true, tenant_id: true, company_id: true, quotation_id: true, opportunity_id: true, approval_type: true, decision: true },
    });
    if (!approval) throw new NotFoundError('ExecutiveApproval');
    const updated = await tx.crm_executive_approval.update({
      where: { id: approval.id },
      data: {
        decision,
        remarks: req.body.remarks ?? '',
        approver_user_id: req.user?.id,
        decided_at: new Date(),
      },
    });
    if (approval.quotation_id) {
      await tx.sales_quotation.updateMany({
        where: { id: approval.quotation_id, company_id: companyId, status: 'PENDING_APPROVAL' },
        data: { status: decision === 'APPROVED' ? 'APPROVED' : 'REJECTED' },
      });
    }
    if (approval.decision !== decision) await queueWebhookEvent(tx, companyId, 'crm.executive_approval.decided', {
        approval_id: approval.id, decision, approval_type: approval.approval_type,
        quotation_id: approval.quotation_id, opportunity_id: approval.opportunity_id,
        decided_at: updated.decided_at?.toISOString() ?? null,
      });
    return updated;
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

crmRouter.post('/cost-estimates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await CRMService.createCostEstimate(req.body ?? {}, req.user?.id ?? 'system', activeCompanyId(req));
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

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

crmRouter.post('/quotations/:id/convert-to-order', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = activeCompanyId(req);
    const quotation = await prisma.sales_quotation.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: { id: true, opportunity_id: true },
    });
    if (!quotation) throw new NotFoundError('Quotation');
    if (!quotation.opportunity_id) throw new ValidationError('Quotation belum terhubung ke Opportunity.');
    const result = await CRMService.processDealWon(quotation.opportunity_id, req.user, companyId);
    res.status(result.handoff?.sales_order_id ? 200 : 202).json(result);
  } catch (err) {
    next(err);
  }
});

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
    const result = await CRMService.executiveOverride(req.params.id, req.user, activeCompanyId(req), String(req.body.remarks ?? ''));
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

    const [quotationsCount, ordersCount, orderTotals, projectsCount, activeProjectsCount, contractsCount, deliveriesCount, outstandingDocs, overdueDocs] = await Promise.all([
      customer ? prisma.sales_quotation.count({ where: { customer_party_id: customer.id, company_id: companyId } }) : 0,
      customer ? prisma.sales_order.count({ where: { customer_party_id: customer.id, company_id: companyId } }) : 0,
      customer ? prisma.sales_order.aggregate({ where: { customer_party_id: customer.id, company_id: companyId, status: { in: ['CONFIRMED', 'ALLOCATED', 'FULFILLED'] } }, _sum: { total_amount: true } }) : { _sum: { total_amount: null } },
      customer ? prisma.project_project.count({ where: { customer_party_id: customer.id, company_id: companyId } }) : 0,
      customer ? prisma.project_project.count({ where: { customer_party_id: customer.id, company_id: companyId, status: { notIn: ['CLOSED', 'COMPLETED', 'CANCELLED'] } } }) : 0,
      customer ? prisma.sales_contract.count({ where: { customer_party_id: customer.id, company_id: companyId } }) : 0,
      customer ? prisma.sales_delivery.count({ where: { customer_party_id: customer.id, company_id: companyId } }) : 0,
      customer ? prisma.fin_billing_document.aggregate({ where: { party_id: customer.id, company_id: companyId, billing_type: 'CUSTOMER_INVOICE', outstanding_amount: { gt: 0 }, status: 'POSTED' }, _sum: { outstanding_amount: true } }) : { _sum: { outstanding_amount: null } },
      customer ? prisma.fin_billing_document.count({ where: { party_id: customer.id, company_id: companyId, billing_type: 'CUSTOMER_INVOICE', outstanding_amount: { gt: 0 }, status: 'POSTED', due_date: { lt: new Date() } } }) : 0,
    ]);

    const activityCount = customer ? await prisma.crm_activity.count({ where: { party_id: customer.id, company_id: companyId } }) : 0;

    res.json({
      customer: {
        id: customer?.id ?? null,
        name: customer?.display_name ?? customer?.legal_name ?? 'No Customer',
        party_code: customer?.party_code ?? '-',
      },
      quotations: quotationsCount,
      orders: ordersCount,
      lifetime_value: orderTotals._sum.total_amount?.toString() ?? '0',
      projects: projectsCount,
      active_projects: activeProjectsCount,
      contracts: contractsCount,
      deliveries: deliveriesCount,
      outstanding_ar: outstandingDocs._sum.outstanding_amount?.toString() ?? '0',
      payment_reputation: overdueDocs > 0 ? 'AT_RISK' : 'GOOD',
      overdue_invoice_count: overdueDocs,
      activity_count: activityCount,
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
        orderBy: [{ received_at: 'desc' }, { sent_at: 'desc' }, { created_at: 'desc' }],
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

crmRouter.post('/conversations/:id/reply', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const company = activeCompanyId(req);
    const text = String(req.body.message_text ?? '').trim();
    const clientMessageId = String(req.body.client_message_id ?? '').trim();
    if (!text || text.length > 10_000) throw new ValidationError('Balasan harus berisi 1–10.000 karakter.');
    if (!/^[A-Za-z0-9._:-]{8,100}$/.test(clientMessageId)) throw new ValidationError('client_message_id wajib unik dan valid.');
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenError('User CRM wajib login untuk membalas conversation.');

    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM crm_conversation WHERE id = ${req.params.id} AND company_id = ${company} FOR UPDATE
      `;
      if (!locked.length) throw new NotFoundError('Conversation');
      const conversation = await tx.crm_conversation.findFirst({ where: { id: req.params.id, company_id: company } });
      if (!conversation) throw new NotFoundError('Conversation');
      if (conversation.status === 'IGNORED') throw new ConflictError('Pulihkan conversation sebelum mengirim balasan.');
      const thread = await tx.crm_external_thread.findFirst({
        where: { conversation_id: conversation.id, company_id: company },
        select: { id: true, external_thread_id: true, integration_source_id: true, channel_account_id: true },
      });
      if (!thread) throw new ValidationError('Conversation ini tidak memiliki thread eksternal untuk menerima balasan.');
      const source = await tx.core_integration_source.findFirst({
        where: { id: thread.integration_source_id, company_id: company, status: 'ACTIVE' },
        select: { id: true, source_code: true },
      });
      if (!source) throw new ConflictError('Sumber integrasi conversation sedang tidak aktif.');

      const externalMessageId = `marka-reply:${clientMessageId}`;
      const existing = await tx.crm_message.findFirst({ where: { conversation_id: conversation.id, external_message_id: externalMessageId } });
      if (existing) return { message: existing, created: false };
      const now = new Date();
      const message = await tx.crm_message.create({ data: {
        id: crypto.randomUUID(), tenant_id: req.tenantId, company_id: company,
        created_by_id: userId, conversation_id: conversation.id, sender_user_id: userId,
        external_message_id: externalMessageId, direction: 'OUTBOUND', message_type: 'TEXT',
        message_text: text, status: 'QUEUED', created_at: now,
      } });
      const queuedSubscriptions = await queueWebhookEvent(tx, company, 'message.reply_requested', {
        conversation_id: conversation.id, message_id: message.id, client_message_id: clientMessageId,
        integration_source_id: source.id, source_code: source.source_code,
        channel_account_id: thread.channel_account_id, external_thread_id: thread.external_thread_id,
        message: { type: 'TEXT', text }, requested_at: now.toISOString(), requested_by: userId,
      });
      if (!queuedSubscriptions) throw new ValidationError('Belum ada outbound subscription aktif untuk event message.reply_requested.');
      await tx.crm_conversation.update({ where: { id: conversation.id }, data: { updated_at: now } });
      return { message, created: true };
    }, { maxWait: 5_000, timeout: 20_000, isolationLevel: 'Serializable' });
    res.status(result.created ? 202 : 200).json(result);
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

crmRouter.post('/csat/responses', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.tenantId || !req.user?.id) throw new ForbiddenError('Tenant dan user context wajib tersedia.');
    const company = activeCompanyId(req);
    const orderId = String(req.body.sales_order_id ?? '').trim();
    const rating = Number(req.body.rating);
    const comments = typeof req.body.comments === 'string' ? req.body.comments.trim() : '';
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new ValidationError('Pilih Sales Order yang valid.');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ValidationError('Rating harus bernilai 1 sampai 5.');
    if (comments.length > 2000) throw new ValidationError('Catatan CSAT maksimal 2.000 karakter.');

    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM sales_order
        WHERE id = ${orderId} AND company_id = ${company} AND UPPER(status) = 'FULFILLED'
        FOR UPDATE
      `;
      if (!locked.length) throw new ValidationError('CSAT hanya dapat dicatat untuk Sales Order berstatus FULFILLED.');
      const order = await tx.sales_order.findFirst({ where: { id: orderId, company_id: company, status: 'FULFILLED' } });
      if (!order) throw new ValidationError('Sales Order tidak tersedia untuk company aktif.');

      const surveyCode = `CSAT_ORDER_${company.replace(/[^a-z0-9]/gi, '').toUpperCase()}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${surveyCode}))`;
      let survey = await tx.crm_survey.findFirst({ where: { company_id: company, survey_code: surveyCode } });
      if (!survey) {
        survey = await tx.crm_survey.create({ data: {
          id: crypto.randomUUID(), tenant_id: req.tenantId, company_id: company, created_by_id: req.user!.id,
          survey_code: surveyCode, survey_name: 'CSAT Pasca Transaksi', survey_type: 'CSAT',
          active_from: new Date(), active_to: null, status: 'ACTIVE',
        } });
      }
      let ratingQuestion = await tx.crm_survey_question.findFirst({ where: { survey_id: survey.id, position_order: 1 } });
      if (!ratingQuestion) ratingQuestion = await tx.crm_survey_question.create({ data: {
        id: crypto.randomUUID(), tenant_id: req.tenantId, company_id: company, created_by_id: req.user!.id,
        survey_id: survey.id, question_text: 'Seberapa puas Anda terhadap transaksi ini?',
        answer_type: 'RATING_1_5', required: true, position_order: 1, option_json: { min: 1, max: 5 },
      } });
      let commentQuestion = await tx.crm_survey_question.findFirst({ where: { survey_id: survey.id, position_order: 2 } });
      if (!commentQuestion) commentQuestion = await tx.crm_survey_question.create({ data: {
        id: crypto.randomUUID(), tenant_id: req.tenantId, company_id: company, created_by_id: req.user!.id,
        survey_id: survey.id, question_text: 'Apa masukan Anda untuk kami?',
        answer_type: 'TEXT', required: false, position_order: 2, option_json: {},
      } });

      const existing = await tx.crm_survey_response.findFirst({ where: { company_id: company, survey_id: survey.id, sales_order_id: order.id, response_status: 'SUBMITTED' }, select: { id: true } });
      if (existing) throw new ConflictError('CSAT untuk Sales Order ini sudah pernah dicatat.');

      let originDomain: string | null = null;
      if (order.quotation_id) {
        const quotation = await tx.sales_quotation.findFirst({ where: { id: order.quotation_id, company_id: company }, select: { opportunity_id: true } });
        if (quotation?.opportunity_id) {
          const opportunity = await tx.crm_opportunity.findFirst({ where: { id: quotation.opportunity_id, company_id: company }, select: { source_inquiry_id: true } });
          if (opportunity?.source_inquiry_id) {
            const inquiry = await tx.crm_customer_inquiry.findFirst({ where: { id: opportunity.source_inquiry_id, company_id: company }, select: { origin_domain: true } });
            originDomain = inquiry?.origin_domain ?? null;
          }
        }
      }
      const now = new Date();
      const response = await tx.crm_survey_response.create({ data: {
        id: crypto.randomUUID(), tenant_id: req.tenantId, company_id: company, created_by_id: req.user!.id,
        survey_id: survey.id, customer_party_id: order.customer_party_id, sales_order_id: order.id,
        started_at: now, submitted_at: now, response_status: 'SUBMITTED', origin_domain: originDomain,
      } });
      await tx.crm_survey_answer.create({ data: {
        id: crypto.randomUUID(), tenant_id: req.tenantId, company_id: company, created_by_id: req.user!.id,
        response_id: response.id, question_id: ratingQuestion.id, numeric_answer: rating, text_answer: '', option_answer: {},
      } });
      if (comments) await tx.crm_survey_answer.create({ data: {
        id: crypto.randomUUID(), tenant_id: req.tenantId, company_id: company, created_by_id: req.user!.id,
        response_id: response.id, question_id: commentQuestion.id, numeric_answer: null, text_answer: comments, option_answer: {},
      } });
      return { response, survey_name: survey.survey_name, rating, comments };
    }, { maxWait: 10_000, timeout: 30_000, isolationLevel: 'Serializable' });
    res.status(201).json(result);
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

crmRouter.post('/conversations/:id/decision', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const company = activeCompanyId(req);
    const decision = String(req.body.decision ?? '').trim().toUpperCase();
    if (!['IGNORE', 'REOPEN'].includes(decision)) throw new ValidationError('decision harus IGNORE atau REOPEN.');
    await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM crm_conversation WHERE id = ${req.params.id} AND company_id = ${company} FOR UPDATE
      `;
      if (!locked.length) throw new NotFoundError('Conversation');
      const conversation = await tx.crm_conversation.findFirst({ where: { id: req.params.id, company_id: company } });
      if (!conversation) throw new NotFoundError('Conversation');
      if (decision === 'IGNORE' && conversation.inquiry_id) throw new ConflictError('Conversation yang sudah dieskalasi menjadi Inquiry tidak dapat diabaikan.');
      if (decision === 'REOPEN' && conversation.status !== 'IGNORED') throw new ConflictError('Hanya conversation berstatus IGNORED yang dapat dipulihkan.');
      await tx.crm_conversation.update({
        where: { id: conversation.id },
        data: { status: decision === 'IGNORE' ? 'IGNORED' : 'OPEN', closed_at: decision === 'IGNORE' ? new Date() : null },
      });
    }, { maxWait: 5_000, timeout: 15_000 });
    res.json({ id: req.params.id, status: decision === 'IGNORE' ? 'IGNORED' : 'OPEN' });
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
      const confirmedCustomer = conversation.customer_party_id
        ? await tx.master_party.findFirst({ where: { id: conversation.customer_party_id, company_id: company, status: 'ACTIVE' }, select: { id: true, display_name: true, legal_name: true } })
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
          customer_party_id: confirmedCustomer?.id ?? null,
          contact_id: null,
          owner_user_id: conversation.assigned_user_id ?? req.user?.id,
          inquiry_number: `INQ-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
          source_channel: 'INTERNAL_PIPELINE',
          subject: conversation.subject || 'Inquiry dari Customer Inbox',
          description: description || `Dibuat dari conversation ${conversation.id}.`,
          customer_name: confirmedCustomer?.display_name || confirmedCustomer?.legal_name || conversation.subject || 'Belum teridentifikasi',
          customer_email: '',
          origin_domain: conversation.origin_domain ?? null,
          status: 'NEW',
          created_at: now,
          updated_at: now,
        },
      });
      await tx.crm_conversation.update({ where: { id: conversation.id }, data: { inquiry_id: inquiry.id, status: 'ESCALATED', closed_at: null } });
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
crmRouter.use('/cost-estimates', createCrudRouter({
  modelName: 'crm_cost_estimate',
  searchFields: ['estimate_number'],
  beforeUpdate: async (_req, _data, existing) => {
    if (String(existing.status || '').toUpperCase() === 'QUOTED') throw new ConflictError('Estimate yang sudah menjadi quotation tidak dapat diubah. Buat revisi baru.');
  },
  beforeDelete: async (_req, existing) => {
    const version = await prisma.crm_quotation_version.findFirst({ where: { estimate_id: existing.id, company_id: existing.company_id }, select: { id: true } });
    if (version) throw new ConflictError('Estimate sudah terhubung ke quotation dan tidak dapat dihapus.');
  },
  afterDelete: async (_req, existing) => {
    await prisma.crm_cost_estimate_line.deleteMany({ where: { estimate_id: existing.id, company_id: existing.company_id } });
  },
}));
crmRouter.use('/cost-estimate-lines', createCrudRouter({
  modelName: 'crm_cost_estimate_line',
  searchFields: ['description', 'cost_element'],
  beforeCreate: async (req, data) => {
    const companyId = activeCompanyId(req);
    const estimate = await prisma.crm_cost_estimate.findFirst({ where: { id: data.estimate_id, company_id: companyId } });
    if (!estimate) throw new NotFoundError('CostEstimate');
    if (String(estimate.status || '').toUpperCase() !== 'DRAFT') throw new ConflictError('Baris biaya hanya dapat diubah saat estimate berstatus DRAFT.');
    const quantity = Number(data.quantity);
    const unitCost = Number(data.unit_cost);
    const amount = Number(data.amount);
    if (![quantity, unitCost, amount].every(Number.isFinite) || quantity <= 0 || unitCost < 0 || amount < 0) throw new ValidationError('Quantity harus lebih dari nol; biaya dan amount tidak boleh negatif.');
    return data;
  },
  beforeUpdate: async (req, data, existing) => {
    const estimate = await prisma.crm_cost_estimate.findFirst({ where: { id: existing.estimate_id, company_id: activeCompanyId(req) } });
    if (!estimate) throw new NotFoundError('CostEstimate');
    if (String(estimate.status || '').toUpperCase() !== 'DRAFT') throw new ConflictError('Baris biaya hanya dapat diubah saat estimate berstatus DRAFT.');
    if (data.estimate_id && data.estimate_id !== existing.estimate_id) throw new ValidationError('Baris biaya tidak dapat dipindahkan ke estimate lain.');
    const quantity = Number(data.quantity ?? existing.quantity);
    const unitCost = Number(data.unit_cost ?? existing.unit_cost);
    const amount = Number(data.amount ?? existing.amount);
    if (![quantity, unitCost, amount].every(Number.isFinite) || quantity <= 0 || unitCost < 0 || amount < 0) throw new ValidationError('Quantity harus lebih dari nol; biaya dan amount tidak boleh negatif.');
    return data;
  },
  beforeDelete: async (req, existing) => {
    const estimate = await prisma.crm_cost_estimate.findFirst({ where: { id: existing.estimate_id, company_id: activeCompanyId(req) } });
    if (!estimate) throw new NotFoundError('CostEstimate');
    if (String(estimate.status || '').toUpperCase() !== 'DRAFT') throw new ConflictError('Baris biaya hanya dapat dihapus saat estimate berstatus DRAFT.');
  },
}));
crmRouter.post('/opportunities/:id/mark-lost', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reason = String(req.body.lost_reason ?? '').trim().toUpperCase();
    const allowed = ['PRICE_TOO_HIGH', 'LOST_FEATURES', 'BUDGET_CANCELLED', 'COMPETITOR', 'NO_RESPONSE', 'OTHER'];
    if (!allowed.includes(reason)) throw new ValidationError('Pilih alasan deal kalah yang tersedia.');
    const companyId = activeCompanyId(req);
    const detail = String(req.body.lost_reason_detail ?? '').trim();
    if (detail.length > 2000) throw new ValidationError('Catatan alasan kalah maksimal 2.000 karakter.');
    if (reason === 'OTHER' && !detail) throw new ValidationError('Jelaskan alasan lain untuk deal kalah.');
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM crm_opportunity WHERE id = ${req.params.id} AND company_id = ${companyId} FOR UPDATE`;
      const opportunity = await tx.crm_opportunity.findFirst({ where: { id: req.params.id, company_id: companyId } });
      if (!opportunity) throw new NotFoundError('Opportunity');
      const status = String(opportunity.status || '').toUpperCase();
      const stage = String(opportunity.pipeline_stage || '').toUpperCase();
      if (['WON', 'CLOSED_WON'].includes(status) || ['WON', 'CLOSED_WON'].includes(stage)) {
        throw new ConflictError('Opportunity yang sudah menang tidak dapat ditandai kalah.');
      }
      if (['LOST', 'CLOSED_LOST', 'CANCELLED', 'CANCEL', 'BATAL'].includes(status) || ['LOST', 'CLOSED_LOST', 'CANCELLED', 'CANCEL', 'BATAL'].includes(stage)) {
        throw new ConflictError('Opportunity ini sudah ditutup.');
      }

      const quotations = await tx.sales_quotation.findMany({
        where: { opportunity_id: opportunity.id, company_id: companyId },
        select: { id: true, status: true },
      });
      const activeQuotationIds = quotations
        .filter((quotation) => ['PENDING_APPROVAL', 'SENT', 'ACCEPTED', 'CONVERTED'].includes(String(quotation.status || '').toUpperCase()))
        .map((quotation) => quotation.id);
      if (activeQuotationIds.length) {
        throw new ConflictError('Opportunity memiliki quotation yang sudah dikirim/diterima. Selesaikan atau batalkan quotation terlebih dahulu.');
      }
      const orders = await tx.sales_order.findMany({ where: { quotation_id: { in: quotations.map((quotation) => quotation.id) }, company_id: companyId }, select: { id: true } });
      if (orders.length) throw new ConflictError('Opportunity sudah memiliki Sales Order dan tidak dapat ditandai kalah.');

      const now = new Date();
      const [fromStage, toStage] = await Promise.all([
        opportunity.stage_id ? tx.crm_pipeline_stage.findFirst({ where: { id: opportunity.stage_id, company_id: companyId }, select: { id: true } }) : null,
        tx.crm_pipeline_stage.findFirst({ where: { stage_code: 'LOST', company_id: companyId }, select: { id: true } }),
      ]);
      const result = await tx.crm_opportunity.update({
        where: { id: opportunity.id },
        data: {
          lost_reason: reason,
          lost_reason_detail: detail,
          status: 'LOST',
          pipeline_stage: 'LOST',
          ...(toStage?.id ? { stage_id: toStage.id } : {}),
          probability_percent: 0,
          closed_at: now,
        },
      });
      await tx.crm_opportunity_stage_history.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: opportunity.tenant_id,
          company_id: companyId,
          opportunity_id: opportunity.id,
          from_stage_id: fromStage?.id ?? null,
          to_stage_id: toStage?.id ?? null,
          changed_by: req.user?.id ?? null,
          changed_at: now,
          change_reason: detail ? `${reason}: ${detail}` : reason,
        },
      });
      return result;
    });
    res.json(updated);
  } catch (error) { next(error); }
});
crmRouter.use('/opportunities', createCrudRouter({
  modelName: 'crm_opportunity',
  searchFields: ['opportunity_name', 'pipeline_stage'],
  beforeCreate: async (req, data) => validateOpportunityCustomer(req, data),
  beforeUpdate: async (req, data, existing) => validateOpportunityCustomer(req, data, existing),
  beforeDelete: async (_req, existing) => {
    if (['WON', 'CLOSED_WON', 'LOST', 'CLOSED_LOST'].includes(String(existing.status || '').toUpperCase())
      || ['WON', 'CLOSED_WON', 'LOST', 'CLOSED_LOST'].includes(String(existing.pipeline_stage || '').toUpperCase())) {
      throw new ConflictError('Opportunity yang sudah ditutup tidak dapat dihapus.');
    }
  },
}));
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
crmRouter.post('/feedbacks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.tenantId || !req.user?.id) throw new ForbiddenError('Tenant dan user context wajib tersedia.');
    const company = activeCompanyId(req);
    const partyId = String(req.body.customer_party_id ?? req.body.customer_party ?? '').trim();
    const rating = Number(req.body.rating_value ?? req.body.rating_score);
    const feedbackText = typeof req.body.feedback_text === 'string' ? req.body.feedback_text.trim() : '';
    const feedbackType = typeof req.body.feedback_type === 'string' ? req.body.feedback_type.trim() : 'CUSTOMER_REVIEW';
    if (!/^[0-9a-f-]{36}$/i.test(partyId)) throw new ValidationError('Pilih customer yang valid.');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ValidationError('Rating harus bernilai 1 sampai 5.');
    if (!feedbackText || feedbackText.length > 2000) throw new ValidationError('Catatan feedback wajib diisi dan maksimal 2.000 karakter.');
    if (!feedbackType || feedbackType.length > 60) throw new ValidationError('Tipe feedback tidak valid.');
    const party = await prisma.master_party.findFirst({
      where: { id: partyId, tenant_id: req.tenantId, company_id: company, party_type: 'CUSTOMER', status: 'ACTIVE' },
      select: { id: true },
    });
    if (!party) throw new ValidationError('Customer harus aktif dan terdaftar pada company yang dipilih.');
    const originDomain = typeof req.body.origin_domain === 'string' && req.body.origin_domain.trim() ? req.body.origin_domain.trim() : null;
    const feedback = await prisma.crm_feedback.create({
      data: {
        id: crypto.randomUUID(), tenant_id: req.tenantId, company_id: company, created_by_id: req.user.id,
        customer_party_id: party.id, feedback_type: feedbackType, rating_value: rating,
        feedback_text: feedbackText, submitted_at: new Date(), status: 'SUBMITTED', origin_domain: originDomain,
      },
    });
    res.status(201).json(feedback);
  } catch (error) { next(error); }
});
crmRouter.use('/feedbacks', createCrudRouter({ modelName: 'crm_feedback', searchFields: ['subject', 'feedback_text'] }));
crmRouter.use('/surveys', createCrudRouter({ modelName: 'crm_survey', searchFields: ['title'] }));
crmRouter.use('/survey-questions', createCrudRouter({ modelName: 'crm_survey_question' }));
crmRouter.use('/survey-responses', createCrudRouter({ modelName: 'crm_survey_response' }));
crmRouter.use('/survey-answers', createCrudRouter({ modelName: 'crm_survey_answer' }));
crmRouter.use('/quotation-versions', createCrudRouter({ modelName: 'crm_quotation_version' }));
crmRouter.use('/quotation-deliveries', createCrudRouter({ modelName: 'crm_quotation_delivery' }));
crmRouter.use('/workflow-events', createCrudRouter({ modelName: 'crm_workflow_event' }));
crmRouter.use('/customer-feedbacks', createCrudRouter({ modelName: 'crm_customer_feedback' }));
