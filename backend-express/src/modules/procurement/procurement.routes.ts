/**
 * File: backend-express/src/modules/procurement/procurement.routes.ts
 *
 * Purpose: Implements Express API routing responsibilities for the procurement domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { createCrudRouter } from '../../utils/crud-factory';

export const procurementRouter = Router();

// Custom action: convert-to-rfq
/**
 * POST route handler: `/purchase-requisitions/:id/convert-to-rfq`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `proc_rfq` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
procurementRouter.post('/purchase-requisitions/:id/convert-to-rfq', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rfq = await prisma.proc_rfq.create({
      data: {
        id: crypto.randomUUID(),
        status: 'DRAFT',
        issue_date: new Date(),
      },
    });
    res.status(201).json(rfq);
  } catch (err) {
    next(err);
  }
});

// Custom action: three-way-match
/**
 * POST route handler: `/purchase-orders/:id/three-way-match`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `proc_three_way_match` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
procurementRouter.post('/purchase-orders/:id/three-way-match', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const match = await prisma.proc_three_way_match.create({
      data: {
        id: crypto.randomUUID(),
        purchase_order_id: req.params.id,
        match_status: 'MATCHED',
        reviewed_at: new Date(),
      },
    });
    res.json(match);
  } catch (err) {
    next(err);
  }
});

// REST ViewSets
procurementRouter.use('/purchase-requisitions', createCrudRouter({ modelName: 'proc_purchase_requisition', searchFields: ['requisition_number'] }));
procurementRouter.use('/purchase-requisition-lines', createCrudRouter({ modelName: 'proc_purchase_requisition_line', searchFields: ['description'] }));
procurementRouter.use('/rfqs', createCrudRouter({ modelName: 'proc_rfq' }));
procurementRouter.use('/supplier-quotations', createCrudRouter({ modelName: 'proc_supplier_quotation', searchFields: ['quotation_reference'] }));
procurementRouter.use('/purchase-orders', createCrudRouter({ modelName: 'proc_purchase_order', searchFields: ['po_number'] }));
procurementRouter.use('/purchase-order-lines', createCrudRouter({ modelName: 'proc_purchase_order_line', searchFields: ['description'] }));
procurementRouter.use('/goods-receipts', createCrudRouter({ modelName: 'proc_goods_receipt', searchFields: ['receipt_number'] }));
procurementRouter.use('/goods-receipt-lines', createCrudRouter({ modelName: 'proc_goods_receipt_line', searchFields: ['description'] }));
procurementRouter.use('/three-way-matches', createCrudRouter({ modelName: 'proc_three_way_match' }));
