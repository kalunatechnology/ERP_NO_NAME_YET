/**
 * File: backend-express/src/modules/master_data/master_data.routes.ts
 *
 * Purpose: Implements Express API routing responsibilities for the master_data domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { createCrudRouter } from '../../utils/crud-factory';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import { requireModuleAccess } from '../../middlewares/entitlement.middleware';
import { isCompanyAdmin, isSuperAdmin } from '../../types/roles';

export const masterDataRouter = Router();

export const DEFAULT_STANDARD_DEPARTMENTS: Array<{
  code: string;
  name: string;
  description: string;
  defaultModules: string[];
}> = [
  {
    code: 'SALES',
    name: 'Sales & Marketing',
    description: 'Departemen Penjualan, Kualifikasi Lead, dan Pemasaran',
    defaultModules: ['CRM', 'SALES', 'REQUESTS'],
  },
  {
    code: 'FIN',
    name: 'Finance & Accounting',
    description: 'Departemen Keuangan, Akuntansi, dan Pengendalian Anggaran',
    defaultModules: ['FINANCE', 'REPORTING', 'REQUESTS'],
  },
  {
    code: 'OPS',
    name: 'Project & Operations',
    description: 'Departemen Eksekusi Proyek, Pengadaan, dan Operasional',
    defaultModules: ['PROJECTS', 'PROCUREMENT', 'INVENTORY', 'LOGISTICS', 'REQUESTS'],
  },
  {
    code: 'IT',
    name: 'IT & Engineering',
    description: 'Departemen Teknologi Informasi, Sistem, dan Engineering',
    defaultModules: ['PROJECTS', 'SERVICE', 'ASSETS', 'REQUESTS'],
  },
];

/**
 * Ensures the 4 standard departments and cost centers exist for the given company,
 * and keeps `core_department`, `master_department`, and `master_cost_center` synchronized.
 */
export async function ensureCompanyDepartmentsAndCostCenters(companyId: string, tenantId?: string | null): Promise<void> {
  if (!companyId) return;
  try {
    let resolvedTenantId = tenantId ?? null;
    if (!resolvedTenantId) {
      const company = await prisma.core_company.findUnique({
        where: { id: companyId },
        select: { tenant_id: true },
      });
      resolvedTenantId = company?.tenant_id ?? null;
    }

    const existingCoreCount = await (prisma as any).core_department.count({
      where: { company_id: companyId },
    });

    if (existingCoreCount === 0) {
      // First check if legacy master_department rows already exist
      const legacyDepts = await prisma.master_department.findMany({
        where: { company_id: companyId },
      });

      if (legacyDepts.length > 0) {
        for (const leg of legacyDepts) {
          const code = String(leg.department_code || '').trim().toUpperCase();
          const name = String(leg.department_name || code).trim();
          if (!code) continue;
          const stdMatch = DEFAULT_STANDARD_DEPARTMENTS.find((s) => s.code === code);
          await (prisma as any).core_department.upsert({
            where: { company_id_code: { company_id: companyId, code } },
            update: {},
            create: {
              id: leg.id,
              tenant_id: resolvedTenantId ?? leg.tenant_id,
              company_id: companyId,
              parent_id: leg.parent_id ?? null,
              unit_type: leg.parent_id ? 'DIVISION' : 'DEPARTMENT',
              code,
              name,
              description: stdMatch?.description ?? '',
              is_cost_center: true,
              is_active: String(leg.status || 'ACTIVE').toUpperCase() === 'ACTIVE',
            },
          });
        }
      }

      // Also ensure the 4 standard departments are present
      for (const std of DEFAULT_STANDARD_DEPARTMENTS) {
        const deterministicId = crypto
          .createHash('md5')
          .update(`${companyId}:DEPT:${std.code}`)
          .digest('hex');
        const dept = await (prisma as any).core_department.upsert({
          where: { company_id_code: { company_id: companyId, code: std.code } },
          update: {},
          create: {
            id: deterministicId,
            tenant_id: resolvedTenantId,
            company_id: companyId,
            unit_type: 'DEPARTMENT',
            code: std.code,
            name: std.name,
            description: std.description,
            is_cost_center: true,
            is_active: true,
          },
        });

        for (const modKey of std.defaultModules) {
          await (prisma as any).core_department_module_access.upsert({
            where: {
              department_id_module_key: {
                department_id: dept.id,
                module_key: modKey,
              },
            },
            update: {},
            create: {
              id: crypto.createHash('md5').update(`${dept.id}:MOD:${modKey}`).digest('hex'),
              company_id: companyId,
              department_id: dept.id,
              module_key: modKey,
              can_read: true,
              can_write: true,
              can_approve: false,
            },
          });
        }
      }
    }

    // Sync active core_department rows into master_department and master_cost_center
    const coreDepts = await (prisma as any).core_department.findMany({
      where: { company_id: companyId },
    });

    for (const d of coreDepts) {
      const existingMasterDept = await prisma.master_department.findFirst({
        where: {
          company_id: companyId,
          OR: [{ id: d.id }, { department_code: { equals: d.code, mode: 'insensitive' } }],
        },
        select: { id: true },
      });
      if (!existingMasterDept) {
        await prisma.master_department.create({
          data: {
            id: d.id,
            tenant_id: d.tenant_id ?? resolvedTenantId,
            company_id: companyId,
            parent_id: d.parent_id ?? null,
            department_code: d.code,
            department_name: d.name,
            status: d.is_active ? 'ACTIVE' : 'INACTIVE',
          },
        }).catch(() => undefined);
      }

      if (d.is_cost_center) {
        const existingMasterCc = await prisma.master_cost_center.findFirst({
          where: {
            company_id: companyId,
            OR: [{ id: d.id }, { cost_center_code: { equals: d.code, mode: 'insensitive' } }],
          },
          select: { id: true },
        });
        if (!existingMasterCc) {
          await prisma.master_cost_center.create({
            data: {
              id: d.id,
              tenant_id: d.tenant_id ?? resolvedTenantId,
              company_id: companyId,
              parent_id: d.parent_id ?? null,
              cost_center_code: d.code,
              cost_center_name: d.name,
              status: d.is_active ? 'ACTIVE' : 'INACTIVE',
            },
          }).catch(() => undefined);
        }
      }
    }
  } catch (err) {
    // Non-blocking fallback if migration has not yet run on the target database
    console.warn('[MasterData] Non-blocking department sync warning:', err);
  }
}

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
      res.status(400).json({ detail: 'Pilih pelanggan atau profil pelanggan sebelum melanjutkan.' });
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
// =============================================================================
// DYNAMIC DEPARTMENTS, DIVISIONS & COST CENTERS (core_department + master sync)
// =============================================================================

masterDataRouter.get('/departments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.companyId || (req.headers['x-company-id'] as string) || '';
    if (!companyId) {
      res.json({ success: true, count: 0, results: [], data: [] });
      return;
    }

    await ensureCompanyDepartmentsAndCostCenters(companyId, req.tenantId);

    const onlyCostCenter = req.query.is_cost_center === 'true';
    const includeInactive = req.query.include_inactive === 'true';
    const unitType = typeof req.query.unit_type === 'string' ? req.query.unit_type.trim().toUpperCase() : '';

    const departments = await (prisma as any).core_department.findMany({
      where: {
        company_id: companyId,
        ...(!includeInactive ? { is_active: true } : {}),
        ...(onlyCostCenter ? { is_cost_center: true } : {}),
        ...(unitType ? { unit_type: unitType } : {}),
      },
      include: {
        module_access: true,
        parent: {
          select: { id: true, code: true, name: true, unit_type: true },
        },
      },
      orderBy: [{ unit_type: 'asc' }, { name: 'asc' }],
    });

    const managerIds = [...new Set(departments.map((d: any) => d.manager_user_id).filter(Boolean))] as string[];
    const deptIds = departments.map((d: any) => d.id) as string[];

    const [managers, memberCounts] = await Promise.all([
      managerIds.length
        ? prisma.iam_user.findMany({
            where: { id: { in: managerIds } },
            select: { id: true, full_name: true, email: true },
          })
        : Promise.resolve([]),
      deptIds.length
        ? (prisma.iam_user as any).groupBy({
            by: ['department_id'],
            where: { department_id: { in: deptIds }, is_active: true },
            _count: { id: true },
          }).catch(() => [])
        : Promise.resolve([]),
    ]);

    const managerMap = new Map(managers.map((m) => [m.id, m]));
    const countMap = new Map((memberCounts as any[]).map((c: any) => [c.department_id, Number(c._count?.id ?? 0)]));

    const mapped = departments.map((d: any) => {
      const manager = d.manager_user_id ? managerMap.get(d.manager_user_id) : null;
      const modAccess = Array.isArray(d.module_access) ? d.module_access : [];
      return {
        id: d.id,
        company_id: d.company_id,
        parent_id: d.parent_id ?? null,
        parent_code: d.parent?.code ?? null,
        parent_name: d.parent?.name ?? null,
        unit_type: d.unit_type || (d.parent_id ? 'DIVISION' : 'DEPARTMENT'),
        code: d.code,
        department_code: d.code,
        cost_center_code: d.code,
        name: d.name,
        department_name: d.name,
        cost_center_name: d.name,
        description: d.description ?? '',
        is_cost_center: d.is_cost_center,
        is_active: d.is_active,
        status: d.is_active ? 'ACTIVE' : 'INACTIVE',
        manager_user_id: d.manager_user_id ?? null,
        manager_name: manager?.full_name || manager?.email || null,
        member_count: countMap.get(d.id) ?? 0,
        modules: modAccess.filter((m: any) => m.can_read !== false).map((m: any) => String(m.module_key).toUpperCase()),
        module_access: modAccess.map((m: any) => ({
          id: m.id,
          module_key: String(m.module_key).toUpperCase(),
          can_read: Boolean(m.can_read),
          can_write: Boolean(m.can_write),
          can_approve: Boolean(m.can_approve),
        })),
        created_at: d.created_at,
        updated_at: d.updated_at,
      };
    });

    res.json({
      success: true,
      count: mapped.length,
      results: mapped,
      data: mapped,
    });
  } catch (err) {
    next(err);
  }
});

masterDataRouter.post('/departments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.companyId || (req.headers['x-company-id'] as string) || '';
    if (!companyId) throw new ForbiddenError('Pilih company terlebih dahulu untuk membuat Departemen / Divisi.');

    const rawCode = String(req.body.code ?? req.body.department_code ?? '').trim().toUpperCase();
    const rawName = String(req.body.name ?? req.body.department_name ?? '').trim();
    const description = String(req.body.description ?? '').trim();
    const parentId = req.body.parent_id ? String(req.body.parent_id).trim() : null;
    const unitType = req.body.unit_type
      ? String(req.body.unit_type).trim().toUpperCase()
      : parentId
        ? 'DIVISION'
        : 'DEPARTMENT';
    const managerUserId = req.body.manager_user_id ? String(req.body.manager_user_id).trim() : null;
    const isCostCenter = req.body.is_cost_center !== undefined ? Boolean(req.body.is_cost_center) : true;
    const isActive = req.body.is_active !== undefined ? Boolean(req.body.is_active) : String(req.body.status ?? 'ACTIVE').toUpperCase() !== 'INACTIVE';

    if (!rawCode || rawCode.length > 50) throw new ValidationError('Kode Departemen/Divisi wajib diisi (maksimal 50 karakter).');
    if (!rawName || rawName.length > 150) throw new ValidationError('Nama Departemen/Divisi wajib diisi (maksimal 150 karakter).');
    if (!['DEPARTMENT', 'DIVISION'].includes(unitType)) throw new ValidationError('Tipe unit harus DEPARTMENT atau DIVISION.');

    const duplicate = await (prisma as any).core_department.findFirst({
      where: { company_id: companyId, code: { equals: rawCode, mode: 'insensitive' } },
      select: { id: true },
    });
    if (duplicate) throw new ConflictError(`Kode Departemen/Divisi "${rawCode}" sudah digunakan pada company ini.`);

    if (parentId) {
      const parentDept = await (prisma as any).core_department.findFirst({
        where: { id: parentId, company_id: companyId },
        select: { id: true },
      });
      if (!parentDept) throw new ValidationError('Departemen induk tidak ditemukan pada company ini.');
    }

    const moduleKeys: string[] = Array.isArray(req.body.module_keys)
      ? req.body.module_keys.map((k: unknown) => String(k).trim().toUpperCase()).filter(Boolean)
      : [];
    const moduleAccessList: Array<{ module_key: string; can_read?: boolean; can_write?: boolean; can_approve?: boolean }> =
      Array.isArray(req.body.module_access)
        ? req.body.module_access
        : moduleKeys.map((key) => ({ module_key: key, can_read: true, can_write: true, can_approve: false }));

    const dept = await prisma.$transaction(async (tx) => {
      const deptId = crypto.randomUUID();
      const created = await (tx as any).core_department.create({
        data: {
          id: deptId,
          tenant_id: req.tenantId ?? null,
          company_id: companyId,
          parent_id: parentId,
          unit_type: unitType,
          code: rawCode,
          name: rawName,
          description,
          manager_user_id: managerUserId,
          is_cost_center: isCostCenter,
          is_active: isActive,
        },
      });

      const uniqueModules = new Map<string, { can_read: boolean; can_write: boolean; can_approve: boolean }>();
      for (const item of moduleAccessList) {
        const key = String(item.module_key || '').trim().toUpperCase();
        if (!key) continue;
        uniqueModules.set(key, {
          can_read: item.can_read !== false,
          can_write: item.can_write !== false,
          can_approve: Boolean(item.can_approve),
        });
      }

      if (uniqueModules.size > 0) {
        await (tx as any).core_department_module_access.createMany({
          data: Array.from(uniqueModules.entries()).map(([module_key, flags]) => ({
            id: crypto.randomUUID(),
            company_id: companyId,
            department_id: created.id,
            module_key,
            can_read: flags.can_read,
            can_write: flags.can_write,
            can_approve: flags.can_approve,
          })),
        });
      }

      // Sync with master_department & master_cost_center
      await tx.master_department.create({
        data: {
          id: created.id,
          tenant_id: req.tenantId ?? null,
          company_id: companyId,
          parent_id: parentId,
          created_by_id: req.user?.id ?? null,
          department_code: rawCode,
          department_name: rawName,
          status: isActive ? 'ACTIVE' : 'INACTIVE',
        },
      });

      if (isCostCenter) {
        await tx.master_cost_center.create({
          data: {
            id: created.id,
            tenant_id: req.tenantId ?? null,
            company_id: companyId,
            parent_id: parentId,
            created_by_id: req.user?.id ?? null,
            cost_center_code: rawCode,
            cost_center_name: rawName,
            status: isActive ? 'ACTIVE' : 'INACTIVE',
          },
        });
      }

      return created;
    });

    res.status(201).json({
      success: true,
      data: {
        ...dept,
        department_code: dept.code,
        department_name: dept.name,
        status: dept.is_active ? 'ACTIVE' : 'INACTIVE',
        modules: Array.from(new Set(moduleAccessList.map((m) => String(m.module_key).toUpperCase()))),
      },
    });
  } catch (err) {
    next(err);
  }
});

const updateDepartmentHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.companyId || (req.headers['x-company-id'] as string) || '';
    if (!companyId) throw new ForbiddenError('Pilih company terlebih dahulu.');

    const existing = await (prisma as any).core_department.findFirst({
      where: { id: req.params.id, company_id: companyId },
    });
    if (!existing) throw new NotFoundError('Departemen / Divisi');

    const rawCode = req.body.code !== undefined || req.body.department_code !== undefined
      ? String(req.body.code ?? req.body.department_code ?? '').trim().toUpperCase()
      : existing.code;
    const rawName = req.body.name !== undefined || req.body.department_name !== undefined
      ? String(req.body.name ?? req.body.department_name ?? '').trim()
      : existing.name;
    const description = req.body.description !== undefined ? String(req.body.description ?? '').trim() : existing.description;
    const parentId = req.body.parent_id !== undefined ? (req.body.parent_id ? String(req.body.parent_id).trim() : null) : existing.parent_id;
    const unitType = req.body.unit_type !== undefined
      ? String(req.body.unit_type).trim().toUpperCase()
      : parentId
        ? 'DIVISION'
        : existing.unit_type || 'DEPARTMENT';
    const managerUserId = req.body.manager_user_id !== undefined
      ? (req.body.manager_user_id ? String(req.body.manager_user_id).trim() : null)
      : existing.manager_user_id;
    const isCostCenter = req.body.is_cost_center !== undefined ? Boolean(req.body.is_cost_center) : existing.is_cost_center;
    const isActive = req.body.is_active !== undefined
      ? Boolean(req.body.is_active)
      : req.body.status !== undefined
        ? String(req.body.status).toUpperCase() === 'ACTIVE'
        : existing.is_active;

    if (!rawCode || !rawName) throw new ValidationError('Kode dan nama Departemen/Divisi wajib diisi.');
    if (parentId === existing.id) throw new ValidationError('Departemen/Divisi tidak dapat menjadi induk bagi dirinya sendiri.');

    const duplicate = await (prisma as any).core_department.findFirst({
      where: { company_id: companyId, id: { not: existing.id }, code: { equals: rawCode, mode: 'insensitive' } },
      select: { id: true },
    });
    if (duplicate) throw new ConflictError(`Kode Departemen/Divisi "${rawCode}" sudah digunakan pada company ini.`);

    const updated = await prisma.$transaction(async (tx) => {
      const row = await (tx as any).core_department.update({
        where: { id: existing.id },
        data: {
          parent_id: parentId,
          unit_type: unitType,
          code: rawCode,
          name: rawName,
          description,
          manager_user_id: managerUserId,
          is_cost_center: isCostCenter,
          is_active: isActive,
        },
      });

      if (Array.isArray(req.body.module_keys) || Array.isArray(req.body.module_access)) {
        await (tx as any).core_department_module_access.deleteMany({
          where: { department_id: existing.id, company_id: companyId },
        });

        const rawList: Array<{ module_key: string; can_read?: boolean; can_write?: boolean; can_approve?: boolean }> =
          Array.isArray(req.body.module_access)
            ? req.body.module_access
            : (req.body.module_keys as unknown[]).map((k) => ({
                module_key: String(k).trim().toUpperCase(),
                can_read: true,
                can_write: true,
                can_approve: false,
              }));

        const uniqueModules = new Map<string, { can_read: boolean; can_write: boolean; can_approve: boolean }>();
        for (const item of rawList) {
          const key = String(item.module_key || '').trim().toUpperCase();
          if (!key) continue;
          uniqueModules.set(key, {
            can_read: item.can_read !== false,
            can_write: item.can_write !== false,
            can_approve: Boolean(item.can_approve),
          });
        }

        if (uniqueModules.size > 0) {
          await (tx as any).core_department_module_access.createMany({
            data: Array.from(uniqueModules.entries()).map(([module_key, flags]) => ({
              id: crypto.randomUUID(),
              company_id: companyId,
              department_id: existing.id,
              module_key,
              can_read: flags.can_read,
              can_write: flags.can_write,
              can_approve: flags.can_approve,
            })),
          });
        }
      }

      // Sync master_department & master_cost_center
      await tx.master_department.updateMany({
        where: { company_id: companyId, OR: [{ id: existing.id }, { department_code: existing.code }] },
        data: {
          parent_id: parentId,
          department_code: rawCode,
          department_name: rawName,
          status: isActive ? 'ACTIVE' : 'INACTIVE',
        },
      });

      if (isCostCenter) {
        const existingCc = await tx.master_cost_center.findFirst({
          where: { company_id: companyId, OR: [{ id: existing.id }, { cost_center_code: existing.code }] },
          select: { id: true },
        });
        if (existingCc) {
          await tx.master_cost_center.update({
            where: { id: existingCc.id },
            data: {
              parent_id: parentId,
              cost_center_code: rawCode,
              cost_center_name: rawName,
              status: isActive ? 'ACTIVE' : 'INACTIVE',
            },
          });
        } else {
          await tx.master_cost_center.create({
            data: {
              id: existing.id,
              tenant_id: existing.tenant_id ?? req.tenantId ?? null,
              company_id: companyId,
              parent_id: parentId,
              cost_center_code: rawCode,
              cost_center_name: rawName,
              status: isActive ? 'ACTIVE' : 'INACTIVE',
            },
          });
        }
      } else {
        await tx.master_cost_center.updateMany({
          where: { company_id: companyId, OR: [{ id: existing.id }, { cost_center_code: existing.code }] },
          data: { status: 'INACTIVE' },
        });
      }

      return row;
    });

    res.json({
      success: true,
      data: {
        ...updated,
        department_code: updated.code,
        department_name: updated.name,
        status: updated.is_active ? 'ACTIVE' : 'INACTIVE',
      },
    });
  } catch (err) {
    next(err);
  }
};

masterDataRouter.put('/departments/:id', updateDepartmentHandler);
masterDataRouter.patch('/departments/:id', updateDepartmentHandler);

masterDataRouter.delete('/departments/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.companyId || (req.headers['x-company-id'] as string) || '';
    if (!companyId) throw new ForbiddenError('Pilih company terlebih dahulu.');

    const existing = await (prisma as any).core_department.findFirst({
      where: { id: req.params.id, company_id: companyId },
    });
    if (!existing) throw new NotFoundError('Departemen / Divisi');

    const [childCount, budgetLineCount] = await Promise.all([
      (prisma as any).core_department.count({ where: { parent_id: existing.id, company_id: companyId } }),
      prisma.fin_budget_line.count({
        where: { company_id: companyId, OR: [{ department_id: existing.id }, { cost_center_id: existing.id }] },
      }),
    ]);

    if (childCount > 0) {
      throw new ConflictError('Departemen ini masih memiliki Divisi/Sub-unit di bawahnya. Pindahkan atau hapus divisi terlebih dahulu.');
    }

    if (budgetLineCount > 0) {
      // Soft-deactivate if already referenced by budget lines
      await prisma.$transaction([
        (prisma as any).core_department.update({ where: { id: existing.id }, data: { is_active: false } }),
        prisma.master_department.updateMany({ where: { id: existing.id, company_id: companyId }, data: { status: 'INACTIVE' } }),
        prisma.master_cost_center.updateMany({ where: { id: existing.id, company_id: companyId }, data: { status: 'INACTIVE' } }),
      ]);
      res.json({ success: true, soft_deactivated: true, detail: 'Departemen dinonaktifkan karena sudah memiliki riwayat alokasi anggaran.' });
      return;
    }

    await prisma.$transaction([
      (prisma.iam_user as any).updateMany({ where: { department_id: existing.id }, data: { department_id: null } }),
      (prisma as any).core_department.delete({ where: { id: existing.id } }),
      prisma.master_department.deleteMany({ where: { id: existing.id, company_id: companyId } }),
      prisma.master_cost_center.deleteMany({ where: { id: existing.id, company_id: companyId } }),
    ]);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

masterDataRouter.get('/cost-centers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.companyId || (req.headers['x-company-id'] as string) || '';
    if (companyId) {
      await ensureCompanyDepartmentsAndCostCenters(companyId, req.tenantId);
    }
    next();
  } catch (err) {
    next(err);
  }
});

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
