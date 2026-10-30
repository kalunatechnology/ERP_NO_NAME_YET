/**
 * File: backend-express/src/modules/sales/sales.routes.ts
 *
 * Purpose: Implements Express API routing responsibilities for the sales domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { createCrudRouter } from '../../utils/crud-factory';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import { queueWebhookEvent } from '../crm/crm-outbound-webhook.service';
import { RoleCode } from '../../types/roles';

export const salesRouter = Router();

function activeCompanyId(req: Request): string {
  if (!req.companyId) throw new ForbiddenError('Pilih company sebelum mengakses data sales.');
  return req.companyId;
}

salesRouter.get('/quotations/with-codes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = activeCompanyId(req);
    const quotations = await prisma.sales_quotation.findMany({
      where: { company_id: companyId },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    const documentIds = [...new Set(quotations.flatMap((row) => row.document_id ? [row.document_id] : []))];
    const documents = documentIds.length ? await prisma.core_business_document.findMany({
      where: { id: { in: documentIds }, company_id: companyId, document_type: 'SALES_QUOTATION' },
      select: { id: true, document_number: true },
    }) : [];
    const codeByDocumentId = new Map(documents.map((document) => [document.id, document.document_number]));
    res.json(quotations.map((quotation) => ({
      ...quotation,
      quotation_code: quotation.document_id ? codeByDocumentId.get(quotation.document_id) ?? null : null,
      quotation_number: quotation.document_id ? codeByDocumentId.get(quotation.document_id) ?? null : null,
    })));
  } catch (error) { next(error); }
});

// =============================================================================
// QUOTATION ACTIONS
// =============================================================================

/**
 * POST route handler: `/quotations/:id/submit-approval`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `sales_quotation` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
salesRouter.post('/quotations/:id/submit-approval', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = activeCompanyId(req);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM sales_quotation WHERE id = ${req.params.id} AND company_id = ${companyId} FOR UPDATE`;
      const quotation = await tx.sales_quotation.findFirst({ where: { id: req.params.id, company_id: companyId } });
      if (!quotation) throw new NotFoundError('Quotation');

      if (!['DRAFT', 'PENDING_APPROVAL'].includes(quotation.status)) {
        throw new ValidationError('Hanya quotation DRAFT yang dapat diajukan untuk approval.');
      }

      const existingApproval = await tx.crm_executive_approval.findFirst({
        where: { quotation_id: quotation.id, company_id: companyId, decision: 'PENDING' },
      });
      if (!existingApproval) {
        await tx.crm_executive_approval.create({
          data: {
            tenant_id: quotation.tenant_id,
            company_id: companyId,
            quotation_id: quotation.id,
            opportunity_id: quotation.opportunity_id,
            requested_by: req.user?.id ?? null,
            approval_type: 'SALES_QUOTATION',
            requested_amount: quotation.total_amount,
            decision: 'PENDING',
            remarks: '',
            requested_at: new Date(),
          },
        });
      }

      if (quotation.status === 'PENDING_APPROVAL') return quotation;
      return tx.sales_quotation.update({
        where: { id: quotation.id },
        data: { status: 'PENDING_APPROVAL' },
      });
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * POST route handler: `/quotations/:id/send`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `sales_quotation` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
salesRouter.post('/quotations/:id/send', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = activeCompanyId(req);
    const quotation = await prisma.sales_quotation.findFirst({ where: { id: req.params.id, company_id: companyId } });
    if (!quotation) throw new NotFoundError('Quotation');
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM sales_quotation WHERE id = ${quotation.id} AND company_id = ${companyId} FOR UPDATE`;
      const current = await tx.sales_quotation.findFirst({ where: { id: quotation.id, company_id: companyId } });
      if (!current) throw new NotFoundError('Quotation');
      if (current.status === 'SENT') return current;
      if (!current.opportunity_id) throw new ValidationError('Hubungkan quotation ke opportunity sebelum mengirim penawaran.');
      const opportunity = await tx.crm_opportunity.findFirst({
        where: { id: current.opportunity_id, company_id: companyId },
        select: { customer_party_id: true, status: true, pipeline_stage: true },
      });
      if (!opportunity?.customer_party_id) throw new ValidationError('Opportunity harus memiliki customer party sebelum quotation dikirim.');
      if (['LOST', 'CLOSED_LOST', 'CANCELLED', 'CANCEL', 'BATAL'].includes(String(opportunity.status || '').toUpperCase())
        || ['LOST', 'CLOSED_LOST', 'CANCELLED', 'CANCEL', 'BATAL'].includes(String(opportunity.pipeline_stage || '').toUpperCase())) {
        throw new ConflictError('Quotation dari Opportunity yang sudah ditutup tidak dapat dikirim.');
      }
      const customer = await tx.master_party.findFirst({
        where: { id: opportunity.customer_party_id, company_id: companyId, party_type: 'CUSTOMER', status: 'ACTIVE' },
        select: { id: true },
      });
      if (!customer) throw new ValidationError('Customer pada opportunity tidak aktif atau bukan milik company ini.');
      const row = await tx.sales_quotation.update({
        where: { id: quotation.id },
        data: { status: 'SENT' },
      });
      const document = row.document_id ? await tx.core_business_document.findFirst({
        where: { id: row.document_id, company_id: companyId, document_type: 'SALES_QUOTATION' },
        select: { document_number: true },
      }) : null;
      await queueWebhookEvent(tx, companyId, 'quotation.ready', {
        quotation_id: row.id, quotation_code: document?.document_number ?? null, opportunity_id: row.opportunity_id,
        status: row.status, total_amount: row.total_amount?.toString() ?? null,
        currency_id: row.currency_id, valid_until: row.valid_until?.toISOString() ?? null,
      });
      return row;
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * POST route handler: `/quotations/:id/customer-decision`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `sales_quotation` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
salesRouter.post('/quotations/:id/customer-decision', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const decision = String(req.body.decision ?? '').toUpperCase();
    if (!['ACCEPTED', 'REJECTED'].includes(decision)) {
      throw new ValidationError('Decision must be ACCEPTED or REJECTED.');
    }
    const companyId = activeCompanyId(req);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM sales_quotation WHERE id = ${req.params.id} AND company_id = ${companyId} FOR UPDATE`;
      const quotation = await tx.sales_quotation.findFirst({
        where: { id: req.params.id, company_id: companyId },
        select: { id: true, status: true, opportunity_id: true },
      });
      if (!quotation) throw new NotFoundError('Quotation');
      if (quotation.status !== 'SENT') throw new ConflictError(`Quotation harus berstatus SENT sebelum diberi keputusan (status saat ini: ${quotation.status}).`);

      if (decision === 'ACCEPTED') {
        if (!quotation.opportunity_id) throw new ValidationError('Quotation harus terhubung ke opportunity sebelum diterima.');
        const opportunity = await tx.crm_opportunity.findFirst({
          where: { id: quotation.opportunity_id, company_id: companyId },
          select: { customer_party_id: true, status: true, pipeline_stage: true },
        });
        if (!opportunity?.customer_party_id) throw new ValidationError('Opportunity harus memiliki customer party sebelum quotation diterima.');
        if (['LOST', 'CLOSED_LOST', 'CANCELLED', 'CANCEL', 'BATAL'].includes(String(opportunity.status || '').toUpperCase())
          || ['LOST', 'CLOSED_LOST', 'CANCELLED', 'CANCEL', 'BATAL'].includes(String(opportunity.pipeline_stage || '').toUpperCase())) {
          throw new ConflictError('Quotation dari Opportunity yang sudah ditutup tidak dapat diterima.');
        }
        const customer = await tx.master_party.findFirst({
          where: { id: opportunity.customer_party_id, company_id: companyId, party_type: 'CUSTOMER', status: 'ACTIVE' },
          select: { id: true },
        });
        if (!customer) throw new ValidationError('Customer pada opportunity tidak aktif atau bukan milik company ini.');
      }

      return tx.sales_quotation.update({ where: { id: quotation.id }, data: { status: decision } });
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// ORDER ACTIONS
// =============================================================================

/**
 * POST route handler: `/orders/:id/confirm`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `sales_order` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
salesRouter.post('/orders/:id/confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await prisma.sales_order.findFirst({ where: { id: req.params.id, company_id: activeCompanyId(req) }, select: { id: true } });
    if (!order) throw new NotFoundError('Order');
    const updated = await prisma.sales_order.update({
      where: { id: order.id },
      data: { status: 'CONFIRMED' },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * POST route handler: `/orders/:id/allocate`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `sales_order` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
salesRouter.post('/orders/:id/allocate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await prisma.sales_order.findFirst({ where: { id: req.params.id, company_id: activeCompanyId(req) }, select: { id: true } });
    if (!order) throw new NotFoundError('Order');
    const updated = await prisma.sales_order.update({
      where: { id: order.id },
      data: { status: 'ALLOCATED' },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * POST route handler: `/orders/:id/convert-to-project`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `sales_order`, `iam_user`, `project_project` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
salesRouter.post('/orders/:id/convert-to-project', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = activeCompanyId(req);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM sales_order WHERE id = ${req.params.id} AND company_id = ${companyId} FOR UPDATE`;
      const order = await tx.sales_order.findFirst({ where: { id: req.params.id, company_id: companyId } });
      if (!order) throw new NotFoundError('Order');
      const existing = await tx.project_project.findFirst({ where: { sales_order_id: order.id, company_id: companyId } });
      if (existing) return { project: existing, created: false };
      if (!['CONFIRMED', 'ALLOCATED'].includes(String(order.status || '').toUpperCase())) {
        throw new ConflictError('Hanya Sales Order CONFIRMED atau ALLOCATED yang dapat ditransfer ke project.');
      }
      if (!order.tenant_id || !order.customer_party_id) throw new ValidationError('Sales Order harus memiliki tenant dan customer.');
      const customer = await tx.master_party.findFirst({
        where: { id: order.customer_party_id, company_id: companyId, party_type: 'CUSTOMER', status: 'ACTIVE' },
      });
      if (!customer) throw new ValidationError('Customer pada Sales Order tidak aktif atau bukan milik company ini.');

      let projectName = `Project Order ${order.id.slice(0, 8)}`;
      let projectDescription = '';
      if (order.quotation_id) {
        const quotation = await tx.sales_quotation.findFirst({ where: { id: order.quotation_id, company_id: companyId } });
        if (quotation?.opportunity_id) {
          const opportunity = await tx.crm_opportunity.findFirst({ where: { id: quotation.opportunity_id, company_id: companyId } });
          if (opportunity?.opportunity_name) projectName = opportunity.opportunity_name;
          if (opportunity?.source_inquiry_id) {
            const inquiry = await tx.crm_customer_inquiry.findFirst({ where: { id: opportunity.source_inquiry_id, company_id: companyId } });
            if (inquiry?.subject) projectName = inquiry.subject;
            if (inquiry?.description) projectDescription = inquiry.description;
          }
        }
      }

      const pmRoles = await tx.iam_role.findMany({ where: { tenant_id: order.tenant_id, company_id: companyId, role_code: RoleCode.PROJECT_MANAGER }, select: { id: true } });
      const pmAssignments = pmRoles.length ? await tx.iam_user_role.findMany({ where: { tenant_id: order.tenant_id, company_id: companyId, role_id: { in: pmRoles.map((role) => role.id) } }, select: { user_id: true } }) : [];
      const pmIds = [...new Set(pmAssignments.flatMap((assignment) => assignment.user_id ? [assignment.user_id] : []))];
      const pmUser = pmIds.length ? await tx.iam_user.findFirst({ where: { id: { in: pmIds }, tenant_id: order.tenant_id, status: 'ACTIVE', is_active: true }, orderBy: { date_joined: 'asc' } }) : null;
      const created = await tx.project_project.create({
        data: {
          id: crypto.randomUUID(), tenant_id: order.tenant_id, company_id: companyId,
          created_by_id: req.user?.id, customer_party_id: customer.id,
          customer_name: customer.display_name || customer.legal_name || '', description: projectDescription,
          sales_order_id: order.id, project_manager_id: pmUser?.id,
          manager_name: pmUser?.full_name ?? pmUser?.username ?? '',
          project_code: `PRJ-SO-${order.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
          project_name: projectName, budget_amount: order.total_amount ?? 0,
          contract_amount: order.total_amount ?? 0, status: 'PLANNED', lifecycle_status: 'INCOMING',
          stage_entered_at: new Date(), verified_at: null, verified_by: null,
          health_status: 'GOOD', source_type: 'SALES_ORDER',
        },
      });
      if (pmUser) await tx.project_member.create({
        data: {
          id: crypto.randomUUID(), tenant_id: order.tenant_id, company_id: companyId,
          created_by_id: req.user?.id, project_id: created.id, user_id: pmUser.id,
          project_role: 'PROJECT_MANAGER', status: 'ACTIVE', permissions_json: '{}',
        },
      });
      return { project: created, created: true };
    }, { maxWait: 5_000, timeout: 30_000 });

    res.status(result.created ? 201 : 200).json(result.project);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// DELIVERY ACTIONS
// =============================================================================

/**
 * POST route handler: `/deliveries/:id/dispatch`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `sales_delivery` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
salesRouter.post('/deliveries/:id/dispatch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const delivery = await prisma.sales_delivery.findFirst({ where: { id: req.params.id, company_id: activeCompanyId(req) }, select: { id: true } });
    if (!delivery) throw new NotFoundError('Delivery');
    const updated = await prisma.sales_delivery.update({
      where: { id: delivery.id },
      data: { delivery_status: 'DISPATCHED' },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// CRUD VIEWSETS
// =============================================================================

salesRouter.use('/quotations', createCrudRouter({ modelName: 'sales_quotation', searchFields: ['status'] }));
salesRouter.use('/quotation-lines', createCrudRouter({ modelName: 'sales_quotation_line', searchFields: ['description'] }));
salesRouter.use('/quotation-costs', createCrudRouter({ modelName: 'sales_quotation_cost', searchFields: ['cost_element'] }));
salesRouter.use('/contracts', createCrudRouter({ modelName: 'sales_contract', searchFields: ['contract_number'] }));
salesRouter.use('/contract-lines', createCrudRouter({ modelName: 'sales_contract_line', searchFields: ['description'] }));
salesRouter.use('/orders', createCrudRouter({
  modelName: 'sales_order',
  searchFields: ['status'],
  afterUpdate: async (_req, order) => {
    if (order.total_amount === undefined) return;
    await prisma.project_project.updateMany({
      where: {
        sales_order_id: order.id,
        company_id: order.company_id,
        source_type: { in: ['CRM', 'SALES_ORDER'] },
      },
      data: {
        budget_amount: order.total_amount ?? 0,
        contract_amount: order.total_amount ?? 0,
      },
    });
  },
}));
salesRouter.use('/order-lines', createCrudRouter({ modelName: 'sales_order_line', searchFields: ['description'] }));
salesRouter.use('/deliveries', createCrudRouter({ modelName: 'sales_delivery', searchFields: ['delivery_status'] }));
salesRouter.use('/delivery-lines', createCrudRouter({ modelName: 'sales_delivery_line', searchFields: ['description'] }));
salesRouter.use('/demand-supply-links', createCrudRouter({ modelName: 'sales_demand_supply_link' }));
salesRouter.use('/order-change-requests', createCrudRouter({ modelName: 'sales_order_change_request' }));
salesRouter.use('/recurring-order-rules', createCrudRouter({ modelName: 'sales_recurring_order_rule' }));
salesRouter.use('/recurring-order-runs', createCrudRouter({ modelName: 'sales_recurring_order_run' }));
