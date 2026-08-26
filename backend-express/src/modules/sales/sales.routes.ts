import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { createCrudRouter } from '../../utils/crud-factory';
import { NotFoundError, ValidationError } from '../../utils/errors';

export const salesRouter = Router();

// =============================================================================
// QUOTATION ACTIONS
// =============================================================================

salesRouter.post('/quotations/:id/submit-approval', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await prisma.sales_quotation.update({
      where: { id: req.params.id },
      data: { status: 'PENDING_APPROVAL' },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

salesRouter.post('/quotations/:id/send', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await prisma.sales_quotation.update({
      where: { id: req.params.id },
      data: { status: 'SENT' },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

salesRouter.post('/quotations/:id/customer-decision', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const decision = String(req.body.decision ?? '').toUpperCase();
    if (!['ACCEPTED', 'REJECTED'].includes(decision)) {
      throw new ValidationError('Decision must be ACCEPTED or REJECTED.');
    }
    const updated = await prisma.sales_quotation.update({
      where: { id: req.params.id },
      data: { status: decision },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// ORDER ACTIONS
// =============================================================================

salesRouter.post('/orders/:id/confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await prisma.sales_order.update({
      where: { id: req.params.id },
      data: { status: 'CONFIRMED' },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

salesRouter.post('/orders/:id/allocate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await prisma.sales_order.update({
      where: { id: req.params.id },
      data: { status: 'ALLOCATED' },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

salesRouter.post('/orders/:id/convert-to-project', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await prisma.sales_order.findUnique({ where: { id: req.params.id } });
    if (!order) throw new NotFoundError('Order');

    const pmUser = await prisma.iam_user.findFirst({ where: { username: 'pm' } });
    const project = await prisma.project_project.create({
      data: {
        id: crypto.randomUUID(),
        customer_party_id: order.customer_party_id,
        customer_name: '',
        description: '',
        sales_order_id: order.id,
        project_manager_id: pmUser?.id,
        manager_name: pmUser?.full_name ?? pmUser?.username ?? '',
        project_code: `PRJ-SO-${order.id.slice(0, 6).toUpperCase()}`,
        project_name: `Project for Order #${order.id.slice(0, 6)}`,
        budget_amount: order.total_amount ?? 0,
        status: 'PLANNED',
        lifecycle_status: 'DRAFT',
        health_status: 'GOOD',
        source_type: 'SALES_ORDER',
      },
    });

    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// DELIVERY ACTIONS
// =============================================================================

salesRouter.post('/deliveries/:id/dispatch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await prisma.sales_delivery.update({
      where: { id: req.params.id },
      data: { delivery_status: 'DISPATCHED' },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// CRUD VIEWSETS
// =============================================================================

salesRouter.use('/quotations', createCrudRouter({ modelName: 'sales_quotation', searchFields: ['status'] }));
salesRouter.use('/quotation-lines', createCrudRouter({ modelName: 'sales_quotation_line', searchFields: ['description'] }));
salesRouter.use('/quotation-costs', createCrudRouter({ modelName: 'sales_quotation_cost', searchFields: ['cost_element'] }));
salesRouter.use('/contracts', createCrudRouter({ modelName: 'sales_contract', searchFields: ['contract_number'] }));
salesRouter.use('/contract-lines', createCrudRouter({ modelName: 'sales_contract_line', searchFields: ['description'] }));
salesRouter.use('/orders', createCrudRouter({ modelName: 'sales_order', searchFields: ['status'] }));
salesRouter.use('/order-lines', createCrudRouter({ modelName: 'sales_order_line', searchFields: ['description'] }));
salesRouter.use('/deliveries', createCrudRouter({ modelName: 'sales_delivery', searchFields: ['delivery_status'] }));
salesRouter.use('/delivery-lines', createCrudRouter({ modelName: 'sales_delivery_line', searchFields: ['description'] }));
salesRouter.use('/demand-supply-links', createCrudRouter({ modelName: 'sales_demand_supply_link' }));
salesRouter.use('/order-change-requests', createCrudRouter({ modelName: 'sales_order_change_request' }));
salesRouter.use('/recurring-order-rules', createCrudRouter({ modelName: 'sales_recurring_order_rule' }));
salesRouter.use('/recurring-order-runs', createCrudRouter({ modelName: 'sales_recurring_order_run' }));
