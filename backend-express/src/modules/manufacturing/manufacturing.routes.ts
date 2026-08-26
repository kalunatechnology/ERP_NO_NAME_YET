import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { createCrudRouter } from '../../utils/crud-factory';

export const manufacturingRouter = Router();

// Custom actions on production orders
manufacturingRouter.post('/production-orders/:id/release', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await prisma.mfg_production_order.update({
      where: { id: req.params.id },
      data: { status: 'RELEASED' },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

manufacturingRouter.post('/production-orders/:id/issue-materials', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await prisma.mfg_production_order.update({
      where: { id: req.params.id },
      data: { status: 'IN_PROGRESS' },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

manufacturingRouter.post('/work-orders/:id/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await prisma.mfg_work_order.update({
      where: { id: req.params.id },
      data: { status: 'IN_PROGRESS', actual_start_at: new Date() },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

manufacturingRouter.post('/work-orders/:id/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await prisma.mfg_work_order.update({
      where: { id: req.params.id },
      data: { status: 'COMPLETED', actual_end_at: new Date() },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// REST ViewSets
manufacturingRouter.use('/boms', createCrudRouter({ modelName: 'mfg_bom', searchFields: ['bom_name', 'bom_code'] }));
manufacturingRouter.use('/bom-versions', createCrudRouter({ modelName: 'mfg_bom_version' }));
manufacturingRouter.use('/bom-lines', createCrudRouter({ modelName: 'mfg_bom_line', searchFields: ['description'] }));
manufacturingRouter.use('/routings', createCrudRouter({ modelName: 'mfg_routing', searchFields: ['routing_name', 'routing_code'] }));
manufacturingRouter.use('/routing-operations', createCrudRouter({ modelName: 'mfg_routing_operation' }));
manufacturingRouter.use('/production-orders', createCrudRouter({ modelName: 'mfg_production_order', searchFields: ['order_number'] }));
manufacturingRouter.use('/production-materials', createCrudRouter({ modelName: 'mfg_production_material' }));
manufacturingRouter.use('/work-orders', createCrudRouter({ modelName: 'mfg_work_order', searchFields: ['work_order_number'] }));
manufacturingRouter.use('/labor-logs', createCrudRouter({ modelName: 'mfg_labor_log' }));
manufacturingRouter.use('/machine-logs', createCrudRouter({ modelName: 'mfg_machine_log' }));
manufacturingRouter.use('/production-outputs', createCrudRouter({ modelName: 'mfg_production_output' }));
manufacturingRouter.use('/scraps', createCrudRouter({ modelName: 'mfg_scrap' }));
manufacturingRouter.use('/cost-ledger-entries', createCrudRouter({ modelName: 'mfg_cost_ledger_entry' }));
