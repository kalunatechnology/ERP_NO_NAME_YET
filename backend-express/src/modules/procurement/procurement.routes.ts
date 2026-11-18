/**
 * File: backend-express/src/modules/procurement/procurement.routes.ts
 *
 * Purpose: Implements Express API routing responsibilities for the procurement domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { createCrudRouter } from '../../utils/crud-factory';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import { matchPurchaseOrder } from './three-way-match.service';
import { postStockMove } from '../inventory/stock-posting.service';

export const procurementRouter = Router();

// Custom action: convert-to-rfq
/**
 * POST route handler: `/purchase-requisitions/:id/convert-to-rfq`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `proc_rfq` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
procurementRouter.post('/purchase-requisitions/:id/convert-to-rfq', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.companyId) throw new ForbiddenError('Pilih company sebelum mengakses procurement.');
    const requisition = await prisma.proc_purchase_requisition.findFirst({ where: { id: req.params.id, company_id: req.companyId } });
    if (!requisition) throw new NotFoundError('PurchaseRequisition');
    const existing = await prisma.proc_rfq.findFirst({ where: { requisition_id: requisition.id, company_id: req.companyId } });
    if (existing) {
      res.json(existing);
      return;
    }
    const rfq = await prisma.proc_rfq.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: requisition.tenant_id,
        company_id: req.companyId,
        created_by_id: req.user?.id,
        requisition_id: requisition.id,
        status: 'DRAFT',
        issue_date: new Date(),
      },
    });
    res.status(201).json(rfq);
  } catch (err) {
    next(err);
  }
});

// Custom action: three-way-match
/**
 * POST route handler: `/purchase-orders/:id/three-way-match`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `proc_three_way_match` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
procurementRouter.post('/purchase-orders/:id/three-way-match', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.companyId) throw new ForbiddenError('Pilih company sebelum mengakses procurement.');
    const match = await matchPurchaseOrder(req.params.id, String(req.body.goods_receipt_id ?? ''), String(req.body.supplier_invoice_id ?? ''), req.companyId, req.user!.id);
    res.json(match);
  } catch (err) {
    next(err);
  }
});

// REST ViewSets
procurementRouter.use('/purchase-requisitions', createCrudRouter({ modelName: 'proc_purchase_requisition', searchFields: ['requisition_number'] }));
procurementRouter.use('/purchase-requisition-lines', createCrudRouter({ modelName: 'proc_purchase_requisition_line', searchFields: ['description'] }));
procurementRouter.use('/rfqs', createCrudRouter({ modelName: 'proc_rfq' }));
procurementRouter.use('/supplier-quotations', createCrudRouter({ modelName: 'proc_supplier_quotation', searchFields: ['quotation_reference'] }));
procurementRouter.use('/purchase-orders', createCrudRouter({ modelName: 'proc_purchase_order', searchFields: ['po_number'] }));
procurementRouter.use('/purchase-order-lines', createCrudRouter({ modelName: 'proc_purchase_order_line', searchFields: ['description'] }));
procurementRouter.post('/goods-receipts/:id/post', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.companyId || String(req.header('X-Company-ID') || '').trim();
    if (!companyId) throw new ForbiddenError('Company ID wajib diisi.');
    const userId = req.user!.id;

    const result = await prisma.$transaction(async (tx) => {
      const receipt = await tx.proc_goods_receipt.findFirst({
        where: { id: req.params.id, company_id: companyId },
      });
      if (!receipt) throw new NotFoundError('GoodsReceipt');
      if (receipt.status === 'POSTED' || receipt.status === 'COMPLETED') {
        const existingMove = await tx.inv_stock_move.findFirst({
          where: { company_id: companyId, document_id: receipt.id, status: 'COMPLETED' },
        });
        if (existingMove) return { receipt, stock_move: existingMove, already_posted: true };
      }

      const grLines = await tx.proc_goods_receipt_line.findMany({
        where: { goods_receipt_id: receipt.id, company_id: companyId },
      });
      if (!grLines.length) throw new ValidationError('Goods Receipt tidak memiliki baris item.');

      let destLocationId = String(req.body?.destination_location_id || '').trim() || null;
      if (!destLocationId) {
        const defaultLoc = await tx.master_warehouse_location.findFirst({
          where: {
            company_id: companyId,
            active: true,
            is_virtual: false,
            ...(receipt.warehouse_id ? { warehouse_id: receipt.warehouse_id } : {}),
          },
          orderBy: { created_at: 'asc' },
        });
        destLocationId = defaultLoc?.id ?? null;
      }
      if (!destLocationId) {
        throw new ValidationError('Lokasi gudang tujuan penerimaan barang tidak ditemukan.');
      }

      const move = await tx.inv_stock_move.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: receipt.tenant_id,
          company_id: companyId,
          created_by_id: userId,
          document_id: receipt.id,
          move_type: 'RECEIPT',
          source_location_id: null,
          destination_location_id: destLocationId,
          scheduled_at: receipt.receipt_date ?? new Date(),
          status: 'READY',
        },
      });

      for (const line of grLines) {
        const qty = Number(line.accepted_quantity ?? line.received_quantity ?? 0);
        if (!line.product_id || qty <= 0) continue;
        const poLine = line.purchase_order_line_id
          ? await tx.proc_purchase_order_line.findFirst({
              where: { id: line.purchase_order_line_id, company_id: companyId },
            })
          : null;
        await tx.inv_stock_move_line.create({
          data: {
            id: crypto.randomUUID(),
            tenant_id: receipt.tenant_id,
            company_id: companyId,
            created_by_id: userId,
            stock_move_id: move.id,
            product_id: line.product_id,
            lot_id: line.lot_id ?? null,
            serial_number_id: line.serial_number_id ?? null,
            quantity: qty,
            uom_id: line.uom_id ?? poLine?.uom_id ?? null,
            unit_cost: poLine?.unit_price ?? 0,
          },
        });
      }

      const postedMove = await postStockMove(move.id, companyId, userId, tx, {
        counterpartKind: 'VENDOR',
        idempotencyKeyPrefix: `GR_${receipt.id}`,
      });
      const updatedReceipt = await tx.proc_goods_receipt.update({
        where: { id: receipt.id },
        data: { status: 'POSTED' },
      });
      return { receipt: updatedReceipt, stock_move: postedMove, already_posted: false };
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

procurementRouter.use('/goods-receipts', createCrudRouter({ modelName: 'proc_goods_receipt', searchFields: ['receipt_number'] }));
procurementRouter.use('/goods-receipt-lines', createCrudRouter({ modelName: 'proc_goods_receipt_line', searchFields: ['description'] }));
procurementRouter.use('/three-way-matches', createCrudRouter({ modelName: 'proc_three_way_match', readOnly: true }));
