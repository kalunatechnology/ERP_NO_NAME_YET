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
import { ForbiddenError } from '../../utils/errors';
import prisma from '../../config/database';

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
      if (!req.companyId) throw new ForbiddenError('Pilih company sebelum menjalankan penyusutan aset.');
      const result = await AssetService.runMonthlyDepreciation(
        req.params.id,
        new Date(period_date),
        req.user?.id ?? 'system',
        req.companyId,
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
      if (!req.companyId) throw new ForbiddenError('Pilih company sebelum menjalankan penyusutan aset.');
      if (company_id && company_id !== req.companyId) {
        throw new ForbiddenError('Company pada payload tidak sesuai dengan company aktif.');
      }
      const companyId = req.companyId;
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
    if (!req.companyId) throw new ForbiddenError('Pilih company sebelum melihat jadwal penyusutan aset.');
    const result = await AssetService.getDepreciationSchedule(req.params.id, req.companyId);
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
      if (!req.companyId) throw new ForbiddenError('Pilih company sebelum melakukan disposal aset.');
      const result = await AssetService.disposeAsset(
        req.params.id,
        new Date(disposal_date),
        Number(proceeds_amount),
        req.user?.id ?? 'system',
        req.companyId,
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
assetsRouter.use('/assets', createCrudRouter({
  modelName: 'asset_asset',
  searchFields: ['asset_name', 'asset_code', 'serial_number'],
  beforeCreate: async (_req: Request, data: any) => {
    if (!data.status) data.status = 'ACTIVE';
    if (!data.useful_life_months) data.useful_life_months = 48;
    if (data.salvage_value === undefined || data.salvage_value === null) data.salvage_value = 0;
    return data;
  },
  afterCreate: async (_req: Request, record: any) => {
    try {
      const existingBook = await prisma.asset_book.findFirst({
        where: { asset_id: record.id },
      });
      if (!existingBook) {
        const costBasis = Number(record.acquisition_cost || 0);
        const salvage = Number(record.salvage_value || 0);
        const usefulMonths = Number(record.useful_life_months || 48);
        await prisma.asset_book.create({
          data: {
            tenant_id: record.tenant_id,
            company_id: record.company_id,
            asset_id: record.id,
            book_type: 'COMMERCIAL',
            depreciation_method: 'STRAIGHT_LINE',
            cost_basis: costBasis,
            salvage_value: salvage,
            useful_life_periods: usefulMonths,
            net_book_value: costBasis,
            accumulated_depreciation: 0,
            depreciation_start_date: record.available_for_use_date || record.acquisition_date || new Date(),
          },
        });
      }
    } catch (err) {
      console.error('[AssetsRouter] Auto-create asset_book error:', err);
    }
  },
}));
assetsRouter.use('/asset-categories',    createCrudRouter({
  modelName: 'asset_category',
  searchFields: ['category_name', 'category_code'],
  beforeCreate: async (req, data) => {
    const companyId = req.user?.company_id || (req.headers['x-company-id'] as string) || '10000000-0000-0000-0000-000000000001';
    let assetAccountId = data.asset_account_id;
    let accumDepAccountId = data.accumulated_depreciation_account_id;
    let depExpAccountId = data.depreciation_expense_account_id;

    if (!assetAccountId || !accumDepAccountId || !depExpAccountId) {
      const coaAccounts = await prisma.fin_account.findMany({
        where: { company_id: companyId, account_code: { in: ['1200', '1210', '6200', '6101'] } },
      });
      const acc1200 = coaAccounts.find(a => a.account_code === '1200')?.id;
      const acc1210 = coaAccounts.find(a => a.account_code === '1210')?.id;
      const acc6200 = coaAccounts.find(a => a.account_code === '6200' || a.account_code === '6101')?.id;

      assetAccountId = assetAccountId || acc1200 || null;
      accumDepAccountId = accumDepAccountId || acc1210 || null;
      depExpAccountId = depExpAccountId || acc6200 || null;
    }

    return {
      ...data,
      company_id: companyId,
      asset_account_id: assetAccountId,
      accumulated_depreciation_account_id: accumDepAccountId,
      depreciation_expense_account_id: depExpAccountId,
    };
  },
}));
assetsRouter.use('/books',               createCrudRouter({ modelName: 'asset_book' }));
assetsRouter.use('/depreciation-lines',  createCrudRouter({ modelName: 'asset_depreciation_line' }));
assetsRouter.use('/maintenances',        createCrudRouter({ modelName: 'asset_maintenance',       searchFields: ['description'] }));
assetsRouter.use('/disposals',           createCrudRouter({ modelName: 'asset_disposal' }));
