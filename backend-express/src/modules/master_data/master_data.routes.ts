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
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import { requireModuleAccess } from '../../middlewares/entitlement.middleware';

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
    if (!req.companyId) throw new ForbiddenError('Pilih company sebelum mengakses master data.');
    const companyId = req.companyId;
    const { party_id, customer_profile_id, credit_limit, payment_term_id, credit_hold } = req.body;
    let normalizedCreditLimit: number | undefined;
    if (credit_limit !== undefined) {
      normalizedCreditLimit = Number(credit_limit);
      if (!Number.isFinite(normalizedCreditLimit) || normalizedCreditLimit < 0) {
        throw new ValidationError('credit_limit harus berupa angka valid dan tidak boleh negatif.');
      }
    }
    let normalizedCreditHold: boolean | undefined;
    if (credit_hold !== undefined) {
      if (typeof credit_hold !== 'boolean') throw new ValidationError('credit_hold harus bernilai true atau false.');
      normalizedCreditHold = credit_hold;
    }
    let profile = null;

    if (customer_profile_id) {
      const existing = await prisma.master_customer_profile.findFirst({ where: { id: customer_profile_id, company_id: companyId }, select: { id: true } });
      if (!existing) throw new NotFoundError('CustomerProfile');
      profile = await prisma.master_customer_profile.update({
        where: { id: existing.id },
        data: {
          credit_limit: normalizedCreditLimit,
          payment_term_id: payment_term_id !== undefined ? payment_term_id : undefined,
          credit_hold: normalizedCreditHold,
        },
      });
    } else if (party_id) {
      const party = await prisma.master_party.findFirst({ where: { id: party_id, company_id: companyId } });
      if (!party) throw new NotFoundError('Party');
      const existing = await prisma.master_customer_profile.findFirst({
        where: { party_id, company_id: companyId },
      });
      if (existing) {
        profile = await prisma.master_customer_profile.update({
          where: { id: existing.id },
          data: {
            credit_limit: normalizedCreditLimit,
            payment_term_id: payment_term_id !== undefined ? payment_term_id : undefined,
            credit_hold: normalizedCreditHold,
          },
        });
      } else {
        profile = await prisma.master_customer_profile.create({
          data: {
            id: crypto.randomUUID(),
            tenant_id: party.tenant_id,
            company_id: companyId,
            created_by_id: req.user?.id,
            party_id,
            customer_code: `CUST-${String(party_id).slice(0, 6)}`,
            risk_category: 'LOW',
            credit_limit: normalizedCreditLimit ?? 0,
            credit_hold: normalizedCreditHold ?? false,
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
masterDataRouter.use('/product-categories', requireModuleAccess('INVENTORY'), createCrudRouter({
  modelName: 'master_product_category', searchFields: ['category_name', 'category_code'],
  beforeCreate: async (req, data) => {
    const code = typeof data.category_code === 'string' ? data.category_code.trim() : '';
    const name = typeof data.category_name === 'string' ? data.category_name.trim() : '';
    if (!code || code.length > 100 || !name || name.length > 150) throw new ValidationError('Kode kategori wajib (maksimal 100 karakter) dan nama kategori wajib (maksimal 150 karakter).');
    const duplicate = await prisma.master_product_category.findFirst({ where: { company_id: req.companyId, category_code: { equals: code, mode: 'insensitive' } }, select: { id: true } });
    if (duplicate) throw new ConflictError('Kode kategori sudah digunakan pada company ini.');
    return { ...data, category_code: code, category_name: name, status: data.status || 'ACTIVE' };
  },
  beforeUpdate: async (req, data, existing) => {
    const code = typeof data.category_code === 'string' ? data.category_code.trim() : existing.category_code;
    const name = typeof data.category_name === 'string' ? data.category_name.trim() : existing.category_name;
    if (!code || code.length > 100 || !name || name.length > 150) throw new ValidationError('Kode kategori wajib (maksimal 100 karakter) dan nama kategori wajib (maksimal 150 karakter).');
    const duplicate = await prisma.master_product_category.findFirst({ where: { company_id: req.companyId, id: { not: existing.id }, category_code: { equals: code, mode: 'insensitive' } }, select: { id: true } });
    if (duplicate) throw new ConflictError('Kode kategori sudah digunakan pada company ini.');
    return { ...data, category_code: code, category_name: name };
  },
  beforeDelete: async (req, existing) => {
    const count = await prisma.master_product.count({ where: { company_id: req.companyId, category_id: existing.id } });
    if (count) throw new ConflictError('Kategori masih digunakan produk. Ubah statusnya menjadi INACTIVE agar riwayat produk tetap utuh.');
  },
}));
masterDataRouter.use('/uoms', createCrudRouter({ modelName: 'master_uom', searchFields: ['uom_name', 'uom_code'] }));
masterDataRouter.use('/products', requireModuleAccess('INVENTORY'), createCrudRouter({
  modelName: 'master_product', searchFields: ['product_name', 'product_code'],
  beforeCreate: async (req, data) => {
    const code = typeof data.product_code === 'string' ? data.product_code.trim() : '';
    const name = typeof data.product_name === 'string' ? data.product_name.trim() : '';
    if (!code || code.length > 100 || !name || name.length > 200) throw new ValidationError('Kode produk wajib (maksimal 100 karakter) dan nama produk wajib (maksimal 200 karakter).');
    for (const field of ['stock_item', 'purchase_item', 'sales_item', 'manufactured_item', 'lot_controlled', 'serial_controlled']) {
      if (typeof data[field] !== 'boolean') throw new ValidationError(`Field ${field} harus bernilai true atau false.`);
    }
    const existing = await prisma.master_product.findFirst({ where: { company_id: req.companyId, product_code: { equals: code, mode: 'insensitive' } }, select: { id: true } });
    if (existing) throw new ConflictError('Kode produk sudah digunakan pada company ini.');
    if (data.category_id) {
      const category = await prisma.master_product_category.findFirst({ where: { id: data.category_id, company_id: req.companyId, status: 'ACTIVE' }, select: { id: true } });
      if (!category) throw new ValidationError('Kategori produk tidak ditemukan atau tidak aktif pada company ini.');
    }
    return { ...data, product_code: code, product_name: name };
  },
  beforeUpdate: async (req, data, existing) => {
    const code = typeof data.product_code === 'string' ? data.product_code.trim() : existing.product_code;
    const name = typeof data.product_name === 'string' ? data.product_name.trim() : existing.product_name;
    if (!code || code.length > 100 || !name || name.length > 200) throw new ValidationError('Kode produk wajib (maksimal 100 karakter) dan nama produk wajib (maksimal 200 karakter).');
    const duplicate = await prisma.master_product.findFirst({ where: { company_id: req.companyId, id: { not: existing.id }, product_code: { equals: code, mode: 'insensitive' } }, select: { id: true } });
    if (duplicate) throw new ConflictError('Kode produk sudah digunakan pada company ini.');
    if (data.category_id) {
      const category = await prisma.master_product_category.findFirst({ where: { id: data.category_id, company_id: req.companyId, status: 'ACTIVE' }, select: { id: true } });
      if (!category) throw new ValidationError('Kategori produk tidak ditemukan atau tidak aktif pada company ini.');
    }
    if (data.serial_controlled === false && existing.serial_controlled) {
      const serialCount = await prisma.inv_serial_number.count({ where: { company_id: req.companyId, product_id: existing.id } });
      if (serialCount) throw new ConflictError('Kontrol serial tidak dapat dinonaktifkan karena nomor seri sudah terdaftar.');
    }
    return { ...data, product_code: code, product_name: name };
  },
  beforeDelete: async () => {
    throw new ConflictError('Produk master tidak dapat dihapus permanen. Ubah statusnya menjadi INACTIVE agar riwayat transaksi tetap utuh.');
  },
}));
masterDataRouter.use('/currencies', createCrudRouter({ modelName: 'master_currency', searchFields: ['currency_code', 'currency_name'] }));
masterDataRouter.use('/exchange-rates', createCrudRouter({ modelName: 'master_exchange_rate' }));
masterDataRouter.use('/payment-terms', createCrudRouter({ modelName: 'master_payment_term', searchFields: ['term_name', 'term_code'] }));
masterDataRouter.use('/tax-codes', createCrudRouter({ modelName: 'master_tax_code', searchFields: ['tax_name', 'tax_code'] }));
masterDataRouter.use('/cost-centers', createCrudRouter({ modelName: 'master_cost_center', searchFields: ['cost_center_name', 'cost_center_code'] }));
masterDataRouter.use('/departments', createCrudRouter({ modelName: 'master_department', searchFields: ['department_name', 'department_code'] }));
masterDataRouter.use('/employees', createCrudRouter({ modelName: 'master_employee', searchFields: ['employee_name', 'employee_number', 'email'] }));
masterDataRouter.use('/warehouses', requireModuleAccess('INVENTORY'), createCrudRouter({
  modelName: 'master_warehouse', searchFields: ['warehouse_name', 'warehouse_code'],
  beforeCreate: async (req, data) => {
    const code = typeof data.warehouse_code === 'string' ? data.warehouse_code.trim() : '';
    const name = typeof data.warehouse_name === 'string' ? data.warehouse_name.trim() : '';
    if (!code || !name) throw new ValidationError('Kode dan nama gudang wajib diisi.');
    const duplicate = await prisma.master_warehouse.findFirst({ where: { company_id: req.companyId, warehouse_code: { equals: code, mode: 'insensitive' } }, select: { id: true } });
    if (duplicate) throw new ConflictError('Kode gudang sudah digunakan pada company ini.');
    return { ...data, warehouse_code: code, warehouse_name: name, warehouse_type: data.warehouse_type || 'STANDARD', status: data.status || 'ACTIVE' };
  },
  beforeUpdate: async (req, data, existing) => {
    const code = typeof data.warehouse_code === 'string' ? data.warehouse_code.trim() : existing.warehouse_code;
    const name = typeof data.warehouse_name === 'string' ? data.warehouse_name.trim() : existing.warehouse_name;
    const duplicate = await prisma.master_warehouse.findFirst({ where: { company_id: req.companyId, id: { not: existing.id }, warehouse_code: { equals: code, mode: 'insensitive' } }, select: { id: true } });
    if (duplicate) throw new ConflictError('Kode gudang sudah digunakan pada company ini.');
    return { ...data, warehouse_code: code, warehouse_name: name };
  },
  beforeDelete: async () => { throw new ConflictError('Gudang tidak dapat dihapus permanen. Ubah statusnya menjadi INACTIVE.'); },
}));
masterDataRouter.use('/warehouse-locations', requireModuleAccess('INVENTORY'), createCrudRouter({
  modelName: 'master_warehouse_location', searchFields: ['location_name', 'location_code'],
  beforeCreate: async (req, data) => {
    if (!data.warehouse_id) throw new ValidationError('Gudang wajib dipilih.');
    const warehouse = await prisma.master_warehouse.findFirst({ where: { id: data.warehouse_id, company_id: req.companyId, status: 'ACTIVE' }, select: { id: true } });
    if (!warehouse) throw new ValidationError('Gudang tidak ditemukan atau tidak aktif pada company ini.');
    const code = typeof data.location_code === 'string' ? data.location_code.trim() : '';
    const name = typeof data.location_name === 'string' ? data.location_name.trim() : '';
    if (!code || !name) throw new ValidationError('Kode dan nama lokasi wajib diisi.');
    if (typeof data.quality_hold !== 'boolean' || typeof data.active !== 'boolean') throw new ValidationError('Status quality_hold dan active harus bernilai true atau false.');
    const duplicate = await prisma.master_warehouse_location.findFirst({ where: { company_id: req.companyId, warehouse_id: warehouse.id, location_code: { equals: code, mode: 'insensitive' } }, select: { id: true } });
    if (duplicate) throw new ConflictError('Kode lokasi sudah digunakan pada gudang ini.');
    return { ...data, location_code: code, location_name: name, location_type: data.location_type || 'BIN' };
  },
  beforeUpdate: async (req, data, existing) => {
    const warehouseId = data.warehouse_id || existing.warehouse_id;
    const warehouse = await prisma.master_warehouse.findFirst({ where: { id: warehouseId, company_id: req.companyId }, select: { id: true } });
    if (!warehouse) throw new ValidationError('Gudang lokasi tidak valid pada company ini.');
    const code = typeof data.location_code === 'string' ? data.location_code.trim() : existing.location_code;
    const duplicate = await prisma.master_warehouse_location.findFirst({ where: { company_id: req.companyId, warehouse_id: warehouse.id, id: { not: existing.id }, location_code: { equals: code, mode: 'insensitive' } }, select: { id: true } });
    if (duplicate) throw new ConflictError('Kode lokasi sudah digunakan pada gudang ini.');
    return { ...data, location_code: code, warehouse_id: warehouse.id };
  },
  beforeDelete: async (req, existing) => {
    const serialCount = await prisma.inv_serial_number.count({ where: { company_id: req.companyId, current_location_id: existing.id } });
    if (serialCount) throw new ConflictError('Lokasi masih digunakan nomor seri. Nonaktifkan lokasi agar riwayat tetap utuh.');
  },
}));
masterDataRouter.use('/work-centers', createCrudRouter({ modelName: 'master_work_center', searchFields: ['work_center_name', 'work_center_code'] }));
masterDataRouter.use('/machines', createCrudRouter({ modelName: 'master_machine', searchFields: ['machine_name', 'machine_code'] }));
