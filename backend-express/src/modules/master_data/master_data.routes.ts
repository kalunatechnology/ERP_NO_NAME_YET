/**
 * File: backend-express/src/modules/master_data/master_data.routes.ts
 *
 * Purpose: Implements Express API routing responsibilities for the master_data domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { createCrudRouter } from '../../utils/crud-factory';

export const masterDataRouter = Router();

// Custom action: set-credit-limit
/**
 * POST route handler: `/customer-profiles/set-credit-limit`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `master_customer_profile` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
masterDataRouter.post('/customer-profiles/set-credit-limit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { party_id, customer_profile_id, credit_limit, payment_term_id, credit_hold } = req.body;
    let profile = null;

    if (customer_profile_id) {
      profile = await prisma.master_customer_profile.update({
        where: { id: customer_profile_id },
        data: {
          credit_limit: credit_limit !== undefined ? credit_limit : undefined,
          payment_term_id: payment_term_id !== undefined ? payment_term_id : undefined,
          credit_hold: credit_hold !== undefined ? credit_hold : undefined,
        },
      });
    } else if (party_id) {
      const existing = await prisma.master_customer_profile.findFirst({
        where: { party_id },
      });
      if (existing) {
        profile = await prisma.master_customer_profile.update({
          where: { id: existing.id },
          data: {
            credit_limit: credit_limit !== undefined ? credit_limit : undefined,
            payment_term_id: payment_term_id !== undefined ? payment_term_id : undefined,
            credit_hold: credit_hold !== undefined ? credit_hold : undefined,
          },
        });
      } else {
        profile = await prisma.master_customer_profile.create({
          data: {
            id: crypto.randomUUID(),
            party_id,
            customer_code: `CUST-${String(party_id).slice(0, 6)}`,
            risk_category: 'LOW',
            credit_limit: credit_limit ?? 0,
            credit_hold: Boolean(credit_hold),
          },
        });
      }
    } else {
      res.status(400).json({ detail: 'party_id or customer_profile_id required.' });
      return;
    }

    res.json(profile);
  } catch (err) {
    next(err);
  }
});

// REST ViewSets
masterDataRouter.use('/parties', createCrudRouter({ modelName: 'master_party', searchFields: ['party_name', 'party_code', 'tax_id'] }));
masterDataRouter.use('/party-roles', createCrudRouter({ modelName: 'master_party_role' }));
masterDataRouter.use('/contacts', createCrudRouter({ modelName: 'master_contact', searchFields: ['contact_name', 'email', 'phone'] }));
masterDataRouter.use('/addresses', createCrudRouter({ modelName: 'master_address', searchFields: ['address_line1', 'city'] }));
masterDataRouter.use('/customer-profiles', createCrudRouter({ modelName: 'master_customer_profile' }));
masterDataRouter.use('/supplier-profiles', createCrudRouter({ modelName: 'master_supplier_profile' }));
masterDataRouter.use('/product-categories', createCrudRouter({ modelName: 'master_product_category', searchFields: ['category_name', 'category_code'] }));
masterDataRouter.use('/uoms', createCrudRouter({ modelName: 'master_uom', searchFields: ['uom_name', 'uom_code'] }));
masterDataRouter.use('/products', createCrudRouter({ modelName: 'master_product', searchFields: ['product_name', 'product_code', 'sku'] }));
masterDataRouter.use('/currencies', createCrudRouter({ modelName: 'master_currency', searchFields: ['currency_code', 'currency_name'] }));
masterDataRouter.use('/exchange-rates', createCrudRouter({ modelName: 'master_exchange_rate' }));
masterDataRouter.use('/payment-terms', createCrudRouter({ modelName: 'master_payment_term', searchFields: ['term_name', 'term_code'] }));
masterDataRouter.use('/tax-codes', createCrudRouter({ modelName: 'master_tax_code', searchFields: ['tax_name', 'tax_code'] }));
masterDataRouter.use('/cost-centers', createCrudRouter({ modelName: 'master_cost_center', searchFields: ['cost_center_name', 'cost_center_code'] }));
masterDataRouter.use('/departments', createCrudRouter({ modelName: 'master_department', searchFields: ['department_name', 'department_code'] }));
masterDataRouter.use('/employees', createCrudRouter({ modelName: 'master_employee', searchFields: ['employee_name', 'employee_number', 'email'] }));
masterDataRouter.use('/warehouses', createCrudRouter({ modelName: 'master_warehouse', searchFields: ['warehouse_name', 'warehouse_code'] }));
masterDataRouter.use('/warehouse-locations', createCrudRouter({ modelName: 'master_warehouse_location', searchFields: ['location_name', 'location_code'] }));
masterDataRouter.use('/work-centers', createCrudRouter({ modelName: 'master_work_center', searchFields: ['work_center_name', 'work_center_code'] }));
masterDataRouter.use('/machines', createCrudRouter({ modelName: 'master_machine', searchFields: ['machine_name', 'machine_code'] }));
