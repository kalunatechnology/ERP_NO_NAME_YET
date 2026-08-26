import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { createCrudRouter } from '../../utils/crud-factory';

export const inventoryRouter = Router();

// Custom action: complete stock-move
inventoryRouter.post('/stock-moves/:id/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await prisma.inv_stock_move.update({
      where: { id: req.params.id },
      data: { status: 'COMPLETED' },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// REST ViewSets
inventoryRouter.use('/stock-moves', createCrudRouter({ modelName: 'inv_stock_move', searchFields: ['movement_number', 'movement_type'] }));
inventoryRouter.use('/stock-movements', createCrudRouter({ modelName: 'inv_stock_move', searchFields: ['movement_number', 'movement_type'] }));
inventoryRouter.use('/stock-reservations', createCrudRouter({ modelName: 'inv_stock_reservation' }));
inventoryRouter.use('/reservations', createCrudRouter({ modelName: 'inv_stock_reservation' }));
inventoryRouter.use('/stock-ledgers', createCrudRouter({ modelName: 'inv_stock_ledger_entry' }));
inventoryRouter.use('/stock-balances', createCrudRouter({ modelName: 'inv_stock_balance' }));
inventoryRouter.use('/stock-counts', createCrudRouter({ modelName: 'inv_stock_count', searchFields: ['count_number'] }));
inventoryRouter.use('/stock-count-lines', createCrudRouter({ modelName: 'inv_stock_count_line' }));
inventoryRouter.use('/valuation-layers', createCrudRouter({ modelName: 'inv_valuation_layer' }));
inventoryRouter.use('/lots', createCrudRouter({ modelName: 'inv_lot', searchFields: ['lot_number'] }));
inventoryRouter.use('/serial-numbers', createCrudRouter({ modelName: 'inv_serial_number', searchFields: ['serial_number'] }));
