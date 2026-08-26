import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { createCrudRouter } from '../../utils/crud-factory';

export const serviceRouter = Router();

// Custom action: resolve case
serviceRouter.post('/cases/:id/resolve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await prisma.service_case.update({
      where: { id: req.params.id },
      data: { status: 'RESOLVED', resolved_at: new Date() },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// REST ViewSets
serviceRouter.use('/cases', createCrudRouter({ modelName: 'service_case', searchFields: ['case_number', 'subject', 'status'] }));
serviceRouter.use('/case-messages', createCrudRouter({ modelName: 'service_case_message', searchFields: ['message_text'] }));
serviceRouter.use('/case-approvals', createCrudRouter({ modelName: 'service_case_approval' }));
serviceRouter.use('/resolutions', createCrudRouter({ modelName: 'service_resolution', searchFields: ['resolution_summary'] }));
