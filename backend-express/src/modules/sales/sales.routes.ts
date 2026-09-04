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
import { NotFoundError, ValidationError } from '../../utils/errors';

export const salesRouter = Router();

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
    const updated = await prisma.sales_quotation.update({
      where: { id: req.params.id },
      data: { status: 'PENDING_APPROVAL' },
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
    const updated = await prisma.sales_quotation.update({
      where: { id: req.params.id },
      data: { status: 'SENT' },
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
    const updated = await prisma.sales_quotation.update({
      where: { id: req.params.id },
      data: { status: decision },
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
    const updated = await prisma.sales_order.update({
      where: { id: req.params.id },
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
    const updated = await prisma.sales_order.update({
      where: { id: req.params.id },
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
    const order = await prisma.sales_order.findUnique({ where: { id: req.params.id } });
    if (!order) throw new NotFoundError('Order');

    const pmUser = await prisma.iam_user.findFirst({ where: { username: 'pm' } });
    const project = await prisma.project_project.create({
      data: {
        id: crypto.randomUUID(),
        customer_party_id: order.customer_party_id,
        customer_name: '',
        description: '',
        sales_order_id: order.id,
        project_manager_id: pmUser?.id,
        manager_name: pmUser?.full_name ?? pmUser?.username ?? '',
        project_code: `PRJ-SO-${order.id.slice(0, 6).toUpperCase()}`,
        project_name: `Project for Order #${order.id.slice(0, 6)}`,
        budget_amount: order.total_amount ?? 0,
        status: 'PLANNED',
        lifecycle_status: 'DRAFT',
        health_status: 'GOOD',
        source_type: 'SALES_ORDER',
      },
    });

    res.status(201).json(project);
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
    const updated = await prisma.sales_delivery.update({
      where: { id: req.params.id },
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
salesRouter.use('/orders', createCrudRouter({ modelName: 'sales_order', searchFields: ['status'] }));
salesRouter.use('/order-lines', createCrudRouter({ modelName: 'sales_order_line', searchFields: ['description'] }));
salesRouter.use('/deliveries', createCrudRouter({ modelName: 'sales_delivery', searchFields: ['delivery_status'] }));
salesRouter.use('/delivery-lines', createCrudRouter({ modelName: 'sales_delivery_line', searchFields: ['description'] }));
salesRouter.use('/demand-supply-links', createCrudRouter({ modelName: 'sales_demand_supply_link' }));
salesRouter.use('/order-change-requests', createCrudRouter({ modelName: 'sales_order_change_request' }));
salesRouter.use('/recurring-order-rules', createCrudRouter({ modelName: 'sales_recurring_order_rule' }));
salesRouter.use('/recurring-order-runs', createCrudRouter({ modelName: 'sales_recurring_order_run' }));
