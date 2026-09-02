import { Router, Request, Response, NextFunction } from 'express';
import { createCrudRouter } from '../../utils/crud-factory';
import { AssetService } from './asset.service';
import { sendSuccess, sendError } from '../../utils/response';
import { requireFinanceRole } from '../../middleware/sod.middleware';

export const assetsRouter = Router();

// =============================================================================
// ASSET ACTIONS — Depreciation & Disposal
// =============================================================================

// Single asset monthly depreciation
assetsRouter.post(
  '/assets/:id/depreciate',
  requireFinanceRole(['FINANCE_STAFF', 'FINANCE_MANAGER', 'DIRECTOR']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { period_date } = req.body;
      if (!period_date) {
        return sendError(res, 'period_date wajib diisi (format: YYYY-MM-DD).', 400);
      }
      const result = await AssetService.runMonthlyDepreciation(
        req.params.id,
        new Date(period_date),
        req.user?.id ?? 'system',
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// Batch depreciation — chunked 50 aset/batch
assetsRouter.post(
  '/assets/batch-depreciate',
  requireFinanceRole(['FINANCE_MANAGER', 'DIRECTOR']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { period_date, company_id } = req.body;
      if (!period_date) {
        return sendError(res, 'period_date wajib diisi (format: YYYY-MM-DD).', 400);
      }
      const companyId = company_id ?? req.companyId ?? '';
      const result = await AssetService.runBatchDepreciation(
        new Date(period_date),
        companyId,
        req.user?.id ?? 'system',
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// Depreciation schedule preview
assetsRouter.get('/assets/:id/depreciation-schedule', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AssetService.getDepreciationSchedule(req.params.id);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// Asset disposal
assetsRouter.post(
  '/assets/:id/dispose',
  requireFinanceRole(['FINANCE_MANAGER', 'DIRECTOR']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { disposal_date, proceeds_amount } = req.body;
      if (!disposal_date || proceeds_amount === undefined) {
        return sendError(res, 'disposal_date dan proceeds_amount wajib diisi.', 400);
      }
      const result = await AssetService.disposeAsset(
        req.params.id,
        new Date(disposal_date),
        Number(proceeds_amount),
        req.user?.id ?? 'system',
      );
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

// =============================================================================
// REST CRUD VIEWSETS
// =============================================================================
assetsRouter.use('/assets',              createCrudRouter({ modelName: 'asset_asset',             searchFields: ['asset_name', 'asset_code', 'serial_number'] }));
assetsRouter.use('/asset-categories',    createCrudRouter({ modelName: 'asset_category',          searchFields: ['category_name', 'category_code'] }));
assetsRouter.use('/books',               createCrudRouter({ modelName: 'asset_book' }));
assetsRouter.use('/depreciation-lines',  createCrudRouter({ modelName: 'asset_depreciation_line' }));
assetsRouter.use('/maintenances',        createCrudRouter({ modelName: 'asset_maintenance',       searchFields: ['description'] }));
assetsRouter.use('/disposals',           createCrudRouter({ modelName: 'asset_disposal' }));
