import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { createCrudRouter } from '../../utils/crud-factory';

export const qualityRouter = Router();

// Custom action: complete inspection
qualityRouter.post('/inspections/:id/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await prisma.qa_inspection.update({
      where: { id: req.params.id },
      data: { status: 'COMPLETED' },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// REST ViewSets
qualityRouter.use('/quality-plans', createCrudRouter({ modelName: 'qa_quality_plan', searchFields: ['plan_name', 'plan_code'] }));
qualityRouter.use('/quality-plan-points', createCrudRouter({ modelName: 'qa_quality_plan_point' }));
qualityRouter.use('/inspections', createCrudRouter({ modelName: 'qa_inspection', searchFields: ['inspection_number'] }));
qualityRouter.use('/inspection-results', createCrudRouter({ modelName: 'qa_inspection_result' }));
qualityRouter.use('/nonconformances', createCrudRouter({ modelName: 'qa_nonconformance', searchFields: ['ncr_number', 'description'] }));
qualityRouter.use('/corrective-actions', createCrudRouter({ modelName: 'qa_corrective_action', searchFields: ['capa_number', 'description'] }));
