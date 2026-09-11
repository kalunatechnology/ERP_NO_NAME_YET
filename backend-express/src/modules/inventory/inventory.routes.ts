/**
 * File: backend-express/src/modules/inventory/inventory.routes.ts
 *
 * Purpose: Implements Express API routing responsibilities for the inventory domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { createCrudRouter } from '../../utils/crud-factory';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import { postStockMove } from './stock-posting.service';

export const inventoryRouter = Router();
async function assertDraftMove(req: Request, id: string) {
  const move = await prisma.inv_stock_move.findFirst({ where: { id, company_id: req.companyId } });
  if (!move || move.status === 'COMPLETED') throw new ValidationError('Movement tidak valid atau sudah diposting.');
}

// Custom action: complete stock-move
/**
 * POST route handler: `/stock-moves/:id/complete`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `inv_stock_move` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
inventoryRouter.post('/stock-moves/:id/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.companyId) throw new ForbiddenError('Pilih company sebelum mengakses inventory.');
    const updated = await postStockMove(req.params.id, req.companyId, req.user!.id);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// REST ViewSets
inventoryRouter.use('/stock-move-lines', createCrudRouter({ modelName: 'inv_stock_move_line',
  beforeCreate: async (req, data) => { await assertDraftMove(req, data.stock_move_id); return data; },
  beforeUpdate: async (req, data, existing) => { await assertDraftMove(req, existing.stock_move_id); if (data.stock_move_id) await assertDraftMove(req, data.stock_move_id); return data; },
  beforeDelete: async (req, existing) => { await assertDraftMove(req, existing.stock_move_id); },
}));
inventoryRouter.use('/stock-moves', createCrudRouter({ modelName: 'inv_stock_move', searchFields: ['movement_number', 'movement_type'] }));
inventoryRouter.use('/stock-movements', createCrudRouter({ modelName: 'inv_stock_move', searchFields: ['movement_number', 'movement_type'] }));
inventoryRouter.use('/stock-reservations', createCrudRouter({ modelName: 'inv_stock_reservation' }));
inventoryRouter.use('/reservations', createCrudRouter({ modelName: 'inv_stock_reservation' }));
inventoryRouter.use('/stock-ledgers', createCrudRouter({ modelName: 'inv_stock_ledger_entry', readOnly: true }));
inventoryRouter.use('/stock-balances', createCrudRouter({ modelName: 'inv_stock_balance', readOnly: true }));
inventoryRouter.use('/stock-counts', createCrudRouter({ modelName: 'inv_stock_count', searchFields: ['count_number'] }));
inventoryRouter.use('/stock-count-lines', createCrudRouter({ modelName: 'inv_stock_count_line' }));
inventoryRouter.use('/valuation-layers', createCrudRouter({ modelName: 'inv_valuation_layer', readOnly: true }));
inventoryRouter.use('/lots', createCrudRouter({ modelName: 'inv_lot', searchFields: ['lot_number'] }));
inventoryRouter.use('/serial-numbers', createCrudRouter({ modelName: 'inv_serial_number', searchFields: ['serial_number'] }));
