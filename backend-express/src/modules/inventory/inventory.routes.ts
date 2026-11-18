/**
 * File: backend-express/src/modules/inventory/inventory.routes.ts
 *
 * Purpose: Implements Express API routing responsibilities for the inventory domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import prisma from '../../config/database';
import { createCrudRouter } from '../../utils/crud-factory';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import { requireModulePermission, requireModuleTier } from '../../middlewares/rbac.middleware';
import { postStockMove, reverseStockMove } from './stock-posting.service';
import { getInventoryOverviewAndBalances } from './stock-query.service';
import { verifyInventoryReconciliation } from './inventory-reconciliation.service';
import {
  allocateStockReservation,
  createStockReservation,
  fulfillStockReservation,
  releaseStockReservation,
} from './reservation.service';
import {
  approveTransferOrder,
  createTransferOrder,
  dispatchTransferOrder,
  receiveTransferOrder,
  resolveTransferDiscrepancy,
} from './transfer.service';
import { approveStockCount } from './stock-opname.service';
import { assignAssetCustodian, capitalizeAssetIdempotent } from './asset-bridge.service';
import { ensureAllVirtualLocations, VIRTUAL_COUNTERPART_PURPOSE } from './virtual-location.service';
import {
  approveIntercompanySto,
  createIntercompanySto,
  dispatchIntercompanySto,
  receiveIntercompanySto,
} from './intercompany-sto.service';

export const inventoryRouter = Router();

function requireCompany(req: Request): string {
  const cid = req.companyId || String(req.header('X-Company-ID') || '').trim();
  if (!cid) throw new ForbiddenError('Pilih company sebelum mengakses inventory.');
  return cid;
}

// =============================================================================
// UNIVERSAL INVENTORY V2 OVERVIEW & CANONICAL BALANCES
// =============================================================================

inventoryRouter.get('/overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const data = await getInventoryOverviewAndBalances(companyId, req.user?.tenant_id);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get('/balances', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const data = await getInventoryOverviewAndBalances(companyId, req.user?.tenant_id);
    res.json({ results: data.balances, kpis: data.kpis });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// STOCK MOVEMENTS POST & REVERSAL
// =============================================================================

inventoryRouter.post('/movements/:id/post', requireModulePermission('INVENTORY', 'write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const updated = await postStockMove(req.params.id, companyId, req.user!.id, undefined, {
      inventoryOwnerId: req.body?.inventory_owner_id,
      conditionStatus: req.body?.condition_status,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/movements/:id/reverse', requireModulePermission('INVENTORY', 'approve'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const result = await reverseStockMove(req.params.id, companyId, req.user!.id, req.body?.reason);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/stock-moves/:id/reverse', requireModulePermission('INVENTORY', 'approve'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const result = await reverseStockMove(req.params.id, companyId, req.user!.id, req.body?.reason);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// 2-STAGE EXCLUSIVE RESERVATIONS (RESERVE -> ALLOCATE -> FULFILL / RELEASE)
// =============================================================================

inventoryRouter.post('/reservations/reserve', requireModulePermission('INVENTORY', 'write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const result = await createStockReservation({
      companyId,
      tenantId: req.user?.tenant_id,
      userId: req.user!.id,
      productId: String(req.body.product_id || '').trim(),
      warehouseLocationId: String(req.body.warehouse_location_id || '').trim(),
      quantity: req.body.quantity ?? req.body.reserved_quantity ?? 0,
      sourceType: req.body.source_type,
      sourceReferenceId: req.body.source_reference_id,
      projectId: req.body.project_id,
      salesOrderLineId: req.body.sales_order_line_id,
      productionOrderId: req.body.production_order_id,
      lotId: req.body.lot_id,
      serialNumberId: req.body.serial_number_id,
      requiredDate: req.body.required_date,
      expiresAt: req.body.expires_at,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/reservations/:id/allocate', requireModulePermission('INVENTORY', 'write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const result = await allocateStockReservation({
      id: req.params.id,
      companyId,
      quantity: req.body?.quantity,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/reservations/:id/fulfill', requireModulePermission('INVENTORY', 'write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const result = await fulfillStockReservation({
      id: req.params.id,
      companyId,
      userId: req.user!.id,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/reservations/:id/release', requireModulePermission('INVENTORY', 'write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const result = await releaseStockReservation({
      id: req.params.id,
      companyId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// 3-EVENT INTER-WAREHOUSE TRANSFERS (DISPATCH -> RECEIVE -> DISCREPANCY)
// =============================================================================

inventoryRouter.get('/transfers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const data = await getInventoryOverviewAndBalances(companyId, req.user?.tenant_id);
    res.json({ results: data.transfers });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/transfers', requireModulePermission('INVENTORY', 'write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const result = await createTransferOrder({
      companyId,
      tenantId: req.user?.tenant_id,
      userId: req.user!.id,
      sourceLocationId: String(req.body.source_location_id || '').trim(),
      destinationLocationId: String(req.body.destination_location_id || '').trim(),
      projectId: req.body.project_id,
      notes: req.body.notes,
      lines: Array.isArray(req.body.lines) ? req.body.lines : [],
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/transfers/:id/approve', requireModulePermission('INVENTORY', 'approve'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const result = await approveTransferOrder({
      id: req.params.id,
      companyId,
      userId: req.user!.id,
      actorUser: req.user,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/transfers/:id/dispatch', requireModulePermission('INVENTORY', 'write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const result = await dispatchTransferOrder({
      id: req.params.id,
      companyId,
      userId: req.user!.id,
      actorUser: req.user,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/transfers/:id/receive', requireModulePermission('INVENTORY', 'write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const result = await receiveTransferOrder({
      id: req.params.id,
      companyId,
      userId: req.user!.id,
      actorUser: req.user,
      receiptLines: req.body?.receipt_lines,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/transfers/:id/resolve-discrepancy', requireModulePermission('INVENTORY', 'approve'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const result = await resolveTransferDiscrepancy({
      id: req.params.id,
      companyId,
      userId: req.user!.id,
      notes: req.body?.notes,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// STOCK OPNAME APPROVAL (WITH SOD) & ASSET CAPITALIZATION / CUSTODIAN BRIDGE
// =============================================================================

inventoryRouter.post('/opname/:id/approve', requireModulePermission('INVENTORY', 'approve'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const result = await approveStockCount({
      id: req.params.id,
      companyId,
      userId: req.user!.id,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/stock-counts/:id/approve', requireModulePermission('INVENTORY', 'approve'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const result = await approveStockCount({
      id: req.params.id,
      companyId,
      userId: req.user!.id,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/assets/capitalize', requireModulePermission('INVENTORY', 'write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const result = await capitalizeAssetIdempotent({
      companyId,
      tenantId: req.user?.tenant_id,
      userId: req.user!.id,
      productId: String(req.body.product_id || '').trim(),
      serialNumberId: req.body.serial_number_id,
      serialNumberText: req.body.serial_number,
      sourceGoodsReceiptId: req.body.source_goods_receipt_id,
      sourceGoodsReceiptLineId: req.body.source_goods_receipt_line_id,
      warehouseLocationId: req.body.warehouse_location_id,
      departmentId: req.body.department_id,
      projectId: req.body.project_id,
      acquisitionCost: req.body.acquisition_cost ?? 0,
      usefulLifeMonths: req.body.useful_life_months ? Number(req.body.useful_life_months) : undefined,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/assets/:id/assign-custodian', requireModulePermission('INVENTORY', 'write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const result = await assignAssetCustodian({
      assetId: req.params.id,
      companyId,
      tenantId: req.user?.tenant_id,
      actorUserId: req.user!.id,
      assignmentType: req.body.assignment_type,
      custodianUserId: req.body.custodian_user_id,
      custodianEmpId: req.body.custodian_emp_id,
      departmentId: req.body.department_id,
      projectId: req.body.project_id,
      locationId: req.body.location_id,
      conditionStatus: req.body.condition_status,
      notes: req.body.notes,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get('/reconcile/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const result = await verifyInventoryReconciliation(companyId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/reconcile/verify', requireModuleTier('INVENTORY', 1), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const result = await verifyInventoryReconciliation(companyId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

inventoryRouter.use('/uom-conversions', createCrudRouter({ modelName: 'master_uom_conversion' }));
inventoryRouter.use('/product-variants', createCrudRouter({
  modelName: 'master_product_variant',
  searchFields: ['variant_sku', 'variant_name', 'barcode'],
}));
inventoryRouter.get('/locations/virtual', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const locations = await ensureAllVirtualLocations(prisma, companyId, req.user?.tenant_id);
    res.json({ results: locations, purpose: VIRTUAL_COUNTERPART_PURPOSE });
  } catch (err) {
    next(err);
  }
});
inventoryRouter.post('/locations/ensure-virtual', requireModulePermission('INVENTORY', 'write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const locations = await ensureAllVirtualLocations(prisma, companyId, req.user?.tenant_id);
    res.json({ results: locations });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// PHASE 2: CONFIGURABLE WORKFLOW RULES, WAREHOUSE ABAC SCOPES & INTERCOMPANY STO
// =============================================================================

inventoryRouter.use('/workflow-rules', createCrudRouter({
  modelName: 'inv_workflow_rule',
  searchFields: ['document_type', 'from_status', 'to_status', 'action_name'],
}));
inventoryRouter.use('/warehouse-scopes', createCrudRouter({
  modelName: 'inv_warehouse_user_scope',
}));

inventoryRouter.get('/intercompany-stos', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const rows = await (prisma as any).inv_intercompany_sto.findMany({
      where: {
        OR: [{ requesting_company_id: companyId }, { supplying_company_id: companyId }],
      },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    res.json({ results: rows });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/intercompany-stos', requireModulePermission('INVENTORY', 'write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const result = await createIntercompanySto({
      tenantId: req.user?.tenant_id,
      userId: req.user!.id,
      requestingCompanyId: String(req.body?.requesting_company_id || companyId),
      requestingLocationId: String(req.body?.requesting_location_id || ''),
      supplyingCompanyId: String(req.body?.supplying_company_id || ''),
      supplyingLocationId: String(req.body?.supplying_location_id || ''),
      notes: req.body?.notes,
      lines: Array.isArray(req.body?.lines) ? req.body.lines : [],
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/intercompany-stos/:id/approve', requireModulePermission('INVENTORY', 'approve'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const result = await approveIntercompanySto(req.params.id, companyId, req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/intercompany-stos/:id/dispatch', requireModulePermission('INVENTORY', 'write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const result = await dispatchIntercompanySto(req.params.id, companyId, req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/intercompany-stos/:id/receive', requireModulePermission('INVENTORY', 'write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = requireCompany(req);
    const result = await receiveIntercompanySto(req.params.id, companyId, req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
inventoryRouter.use('/inventory-owners', createCrudRouter({ modelName: 'inv_inventory_owner', searchFields: ['owner_code', 'owner_name'] }));
inventoryRouter.use(
  '/costing-policies',
  (req, res, next) =>
    ['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())
      ? next()
      : requireModuleTier('INVENTORY', 1)(req, res, next),
  createCrudRouter({ modelName: 'inv_costing_policy' }),
);
inventoryRouter.use('/outbox-events', createCrudRouter({ modelName: 'inv_outbox_event', readOnly: true }));

inventoryRouter.get('/internal-documents', async (req, res, next) => {
  try {
    if (!req.companyId) throw new ForbiddenError('Pilih company sebelum mengakses dokumen internal.');
    const rows = await prisma.inv_internal_document.findMany({
      where: { company_id: req.companyId },
      orderBy: { created_at: 'desc' },
      take: 200,
      select: { id: true, title: true, category: true, description: true, file_name: true, mime_type: true, file_size: true, checksum: true, created_at: true, created_by_id: true },
    });
    res.json(rows);
  } catch (error) { next(error); }
});

inventoryRouter.post('/internal-documents', async (req, res, next) => {
  try {
    if (!req.companyId || !req.user?.id) throw new ForbiddenError('Pilih company dan user aktif sebelum mengunggah dokumen.');
    const { title, category, description, file_name, mime_type, content_base64 } = req.body ?? {};
    const safeName = typeof file_name === 'string' ? file_name.trim().replace(/[\\/\\r\\n\u0000]/g, '_') : '';
    const normalizedMime = typeof mime_type === 'string' ? mime_type.trim().toLowerCase() : '';
    const allowedMime = new Set([
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/csv', 'text/plain', 'application/zip',
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime', 'audio/mpeg', 'audio/wav', 'audio/ogg',
    ]);
    if (!safeName || safeName.length > 255 || !allowedMime.has(normalizedMime) || typeof content_base64 !== 'string' || !content_base64 || content_base64.length > 9_900_000) throw new ValidationError('File tidak valid. Format yang didukung: dokumen, spreadsheet, gambar, audio, video, dan ZIP; ukuran maksimum 7 MB.');
    const content = Buffer.from(content_base64, 'base64');
    if (!content.length || content.length > 7 * 1024 * 1024 || content.toString('base64') !== content_base64) throw new ValidationError('Konten file tidak valid atau ukuran melebihi 7 MB.');
    const normalizedTitle = typeof title === 'string' ? title.trim() : '';
    if (!normalizedTitle || normalizedTitle.length > 200) throw new ValidationError('Judul dokumen wajib diisi dan maksimal 200 karakter.');
    const normalizedCategory = typeof category === 'string' ? category.trim().toUpperCase() : 'GENERAL';
    if (!normalizedCategory || normalizedCategory.length > 60) throw new ValidationError('Kategori dokumen tidak valid.');
    const saved = await prisma.inv_internal_document.create({ data: {
      id: crypto.randomUUID(), tenant_id: req.user.tenant_id, company_id: req.companyId, created_by_id: req.user.id,
      title: normalizedTitle, category: normalizedCategory,
      description: typeof description === 'string' ? description.trim().slice(0, 2000) : '',
      file_name: safeName, mime_type: normalizedMime, file_size: content.length,
      checksum: crypto.createHash('sha256').update(content).digest('hex'), content,
    }, select: { id: true, title: true, category: true, description: true, file_name: true, mime_type: true, file_size: true, checksum: true, created_at: true, created_by_id: true } });
    res.status(201).json(saved);
  } catch (error) { next(error); }
});

inventoryRouter.get('/internal-documents/:id/download', async (req, res, next) => {
  try {
    if (!req.companyId) throw new ForbiddenError('Pilih company sebelum mengakses dokumen internal.');
    const document = await prisma.inv_internal_document.findFirst({ where: { id: req.params.id, company_id: req.companyId } });
    if (!document) throw new NotFoundError('Internal Document');
    const encodedName = encodeURIComponent(document.file_name).replace(/['()]/g, escape);
    res.setHeader('Content-Type', document.mime_type);
    res.setHeader('Content-Length', String(document.file_size));
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(Buffer.from(document.content));
  } catch (error) { next(error); }
});

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
inventoryRouter.post('/stock-moves/:id/complete', requireModulePermission('INVENTORY', 'write'), async (req: Request, res: Response, next: NextFunction) => {
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
