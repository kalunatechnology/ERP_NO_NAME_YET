/**
 * File: backend-express/src/modules/assets/assets.routes.ts
 *
 * Purpose: Implements Express API routing responsibilities for the assets domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { createCrudRouter } from '../../utils/crud-factory';
import { AssetService } from './asset.service';
import { sendSuccess, sendError } from '../../utils/response';
import { requireFinanceRole } from '../../middleware/sod.middleware';
import { RoleCode } from '../../types/roles';

export const assetsRouter = Router();

// =============================================================================
// ASSET ACTIONS — Depreciation & Disposal
// =============================================================================

// Single asset monthly depreciation
/**
 * POST `/assets/:id/depreciate` handler registered on this router.
 *
 * Authentication/authorization: inherits the global authenticated tenant, module entitlement, RBAC, idempotency, and audit pipeline plus middleware supplied in this call.
 * Request/response: consumes the parameters/body referenced by the callback, preserves its current status/payload contract, and forwards unexpected errors through `next` where provided.
 * Persistence and state changes are limited to the Prisma/service operations visible in this handler; financial terminal-state and SoD rules remain authoritative.
 */
assetsRouter.post(
  '/assets/:id/depreciate',
  requireFinanceRole([RoleCode.FINANCE, RoleCode.DIRECTOR]),
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
/**
 * POST `/assets/batch-depreciate` handler registered on this router.
 *
 * Authentication/authorization: inherits the global authenticated tenant, module entitlement, RBAC, idempotency, and audit pipeline plus middleware supplied in this call.
 * Request/response: consumes the parameters/body referenced by the callback, preserves its current status/payload contract, and forwards unexpected errors through `next` where provided.
 * Persistence and state changes are limited to the Prisma/service operations visible in this handler; financial terminal-state and SoD rules remain authoritative.
 */
assetsRouter.post(
  '/assets/batch-depreciate',
  requireFinanceRole([RoleCode.FINANCE, RoleCode.DIRECTOR]),
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
/**
 * GET route handler: `/assets/:id/depreciation-schedule`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Delegates to the referenced service or performs the operation shown in the handler.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
assetsRouter.get('/assets/:id/depreciation-schedule', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AssetService.getDepreciationSchedule(req.params.id);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// Asset disposal
/**
 * POST `/assets/:id/dispose` handler registered on this router.
 *
 * Authentication/authorization: inherits the global authenticated tenant, module entitlement, RBAC, idempotency, and audit pipeline plus middleware supplied in this call.
 * Request/response: consumes the parameters/body referenced by the callback, preserves its current status/payload contract, and forwards unexpected errors through `next` where provided.
 * Persistence and state changes are limited to the Prisma/service operations visible in this handler; financial terminal-state and SoD rules remain authoritative.
 */
assetsRouter.post(
  '/assets/:id/dispose',
  requireFinanceRole([RoleCode.FINANCE, RoleCode.DIRECTOR]),
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
