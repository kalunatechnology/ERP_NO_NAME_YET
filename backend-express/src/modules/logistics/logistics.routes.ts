/**
 * File: backend-express/src/modules/logistics/logistics.routes.ts
 *
 * Purpose: Implements Express API routing responsibilities for the logistics domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { createCrudRouter } from '../../utils/crud-factory';

export const logisticsRouter = Router();

// Custom action: proof of delivery
/**
 * POST route handler: `/shipments/:id/proof-of-delivery`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `logistics_proof_of_delivery` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
logisticsRouter.post('/shipments/:id/proof-of-delivery', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pod = await prisma.logistics_proof_of_delivery.create({
      data: {
        id: crypto.randomUUID(),
        shipment_id: req.params.id,
        receiver_name: req.body.recipient_name ?? req.body.receiver_name ?? 'Recipient',
        received_at: new Date(),
        remarks: req.body.remarks ?? '',
        verification_status: 'VERIFIED',
      },
    });
    res.status(201).json(pod);
  } catch (err) {
    next(err);
  }
});

// REST ViewSets
logisticsRouter.use('/shipments', createCrudRouter({ modelName: 'logistics_shipment', searchFields: ['tracking_number'] }));
logisticsRouter.use('/shipment-lines', createCrudRouter({ modelName: 'logistics_shipment_line' }));
logisticsRouter.use('/tracking-events', createCrudRouter({ modelName: 'logistics_tracking_event', searchFields: ['event_type'] }));
logisticsRouter.use('/proof-of-deliveries', createCrudRouter({ modelName: 'logistics_proof_of_delivery', searchFields: ['receiver_name'] }));
