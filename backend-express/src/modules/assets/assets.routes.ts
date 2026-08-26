import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { createCrudRouter } from '../../utils/crud-factory';

export const assetsRouter = Router();

// Custom action: run depreciation
assetsRouter.post('/assets/:id/run-depreciation', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await prisma.asset_asset.update({
      where: { id: req.params.id },
      data: { status: 'DEPRECIATING' },
    });
    res.json({ success: true, asset_id: updated.id, status: 'DEPRECIATION_RUN' });
  } catch (err) {
    next(err);
  }
});

// REST ViewSets
assetsRouter.use('/assets', createCrudRouter({ modelName: 'asset_asset', searchFields: ['asset_name', 'asset_code', 'serial_number'] }));
assetsRouter.use('/asset-categories', createCrudRouter({ modelName: 'asset_category', searchFields: ['category_name', 'category_code'] }));
assetsRouter.use('/books', createCrudRouter({ modelName: 'asset_book' }));
assetsRouter.use('/depreciation-lines', createCrudRouter({ modelName: 'asset_depreciation_line' }));
assetsRouter.use('/maintenances', createCrudRouter({ modelName: 'asset_maintenance', searchFields: ['description'] }));
assetsRouter.use('/disposals', createCrudRouter({ modelName: 'asset_disposal' }));
