import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { createCrudRouter } from '../../utils/crud-factory';

export const logisticsRouter = Router();

// Custom action: proof of delivery
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
