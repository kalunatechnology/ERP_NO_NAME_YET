import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import { postStockMove } from './stock-posting.service';
import { emitInventoryOutboxEvent } from './inventory-event.service';

/**
 * Ensures a dedicated Virtual Transit Location exists for inter-warehouse transfers.
 */
async function ensureTransitLocation(
  companyId: string,
  tenantId: string | null | undefined,
  transferOrderId: string,
  transferNumber: string,
  sourceWarehouseId: string | null | undefined,
  tx: any,
): Promise<string> {
  const existing = await tx.master_warehouse_location.findFirst({
    where: {
      company_id: companyId,
      reference_transfer_id: transferOrderId,
    },
  });
  if (existing) return existing.id;

  const created = await tx.master_warehouse_location.create({
    data: {
      id: crypto.randomUUID(),
      tenant_id: tenantId ?? null,
      company_id: companyId,
      warehouse_id: sourceWarehouseId ?? null,
      location_code: `TRN-${transferNumber}`,
      location_name: `Virtual Transit (${transferNumber})`,
      location_type: 'VIRTUAL_TRANSIT',
      location_purpose: 'TRANSIT',
      is_virtual: true,
      is_allocatable: false,
      allow_negative_stock: false,
      reference_transfer_id: transferOrderId,
      quality_hold: false,
      active: true,
    },
  });
  return created.id;
}

export async function createTransferOrder(input: {
  companyId: string;
  tenantId?: string | null;
  userId: string;
  sourceLocationId: string;
  destinationLocationId: string;
  projectId?: string | null;
  notes?: string;
  lines: Array<{
    product_id: string;
    requested_quantity: number | string;
    uom_id?: string | null;
    lot_id?: string | null;
    serial_number_id?: string | null;
    notes?: string;
  }>;
}) {
  if (!input.sourceLocationId || !input.destinationLocationId) {
    throw new ValidationError('Lokasi asal dan lokasi tujuan wajib dipilih.');
  }
  if (input.sourceLocationId === input.destinationLocationId) {
    throw new ValidationError('Lokasi asal dan tujuan tidak boleh sama.');
  }
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new ValidationError('Minimal 1 baris barang harus diisi pada dokumen transfer.');
  }

  return prisma.$transaction(async (tx) => {
    const [srcLoc, dstLoc] = await Promise.all([
      tx.master_warehouse_location.findFirst({
        where: { id: input.sourceLocationId, company_id: input.companyId },
      }),
      tx.master_warehouse_location.findFirst({
        where: { id: input.destinationLocationId, company_id: input.companyId },
      }),
    ]);
    if (!srcLoc || !dstLoc) throw new ValidationError('Lokasi asal atau tujuan tidak ditemukan.');

    const transferNumber = `TRF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto
      .randomBytes(3)
      .toString('hex')
      .toUpperCase()}`;

    const order = await (tx as any).inv_transfer_order.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: input.tenantId ?? null,
        company_id: input.companyId,
        transfer_number: transferNumber,
        source_warehouse_id: srcLoc.warehouse_id,
        source_location_id: srcLoc.id,
        destination_warehouse_id: dstLoc.warehouse_id,
        destination_location_id: dstLoc.id,
        project_id: input.projectId ?? null,
        status: 'SUBMITTED',
        notes: input.notes ? String(input.notes).trim() : '',
        requested_by_id: input.userId,
        created_by_id: input.userId,
      },
    });

    const createdLines = [];
    for (const line of input.lines) {
      const reqQty = new Prisma.Decimal(line.requested_quantity ?? 0);
      if (reqQty.lte(0)) throw new ValidationError('Kuantitas permintaan transfer harus positif.');
      const createdLine = await (tx as any).inv_transfer_order_line.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: input.tenantId ?? null,
          company_id: input.companyId,
          transfer_order_id: order.id,
          product_id: line.product_id,
          uom_id: line.uom_id ?? null,
          lot_id: line.lot_id ?? null,
          serial_number_id: line.serial_number_id ?? null,
          requested_quantity: reqQty,
          notes: line.notes ? String(line.notes).trim() : '',
        },
      });
      createdLines.push(createdLine);
    }

    return { ...order, lines: createdLines };
  });
}

export async function approveTransferOrder(input: {
  id: string;
  companyId: string;
  userId: string;
}) {
  const order = await (prisma as any).inv_transfer_order.findFirst({
    where: { id: input.id, company_id: input.companyId },
  });
  if (!order) throw new NotFoundError('TransferOrder');
  if (!['DRAFT', 'SUBMITTED'].includes(order.status)) {
    throw new ValidationError(`Transfer berstatus ${order.status} tidak dapat di-approve.`);
  }
  return (prisma as any).inv_transfer_order.update({
    where: { id: order.id },
    data: {
      status: 'APPROVED',
      approved_by_id: input.userId,
      approved_at: new Date(),
    },
  });
}

/**
 * Event 1 — Dispatch: Moves stock from Source Warehouse -> Virtual Transit Location
 * Sets remaining_transit_qty = shipped_quantity
 */
export async function dispatchTransferOrder(input: {
  id: string;
  companyId: string;
  userId: string;
}) {
  return prisma.$transaction(
    async (tx) => {
      const order = await (tx as any).inv_transfer_order.findFirst({
        where: { id: input.id, company_id: input.companyId },
      });
      if (!order) throw new NotFoundError('TransferOrder');
      if (!['SUBMITTED', 'APPROVED'].includes(order.status)) {
        throw new ValidationError(`Transfer berstatus ${order.status} belum siap di-dispatch.`);
      }

      const lines = await (tx as any).inv_transfer_order_line.findMany({
        where: { transfer_order_id: order.id, company_id: input.companyId },
      });
      if (!lines.length) throw new ValidationError('Baris transfer tidak ditemukan.');

      const transitLocId = await ensureTransitLocation(
        input.companyId,
        order.tenant_id,
        order.id,
        order.transfer_number,
        order.source_warehouse_id,
        tx,
      );

      const move = await tx.inv_stock_move.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: order.tenant_id,
          company_id: input.companyId,
          created_by_id: input.userId,
          document_id: order.id,
          move_type: 'TRANSFER',
          source_location_id: order.source_location_id,
          destination_location_id: transitLocId,
          project_id: order.project_id,
          scheduled_at: new Date(),
          status: 'READY',
        },
      });

      for (const line of lines) {
        const shipQty = new Prisma.Decimal(line.requested_quantity ?? 0);
        const product = await tx.master_product.findFirst({
          where: { id: line.product_id, company_id: input.companyId },
        });
        await tx.inv_stock_move_line.create({
          data: {
            id: crypto.randomUUID(),
            tenant_id: order.tenant_id,
            company_id: input.companyId,
            created_by_id: input.userId,
            stock_move_id: move.id,
            product_id: line.product_id,
            lot_id: line.lot_id,
            serial_number_id: line.serial_number_id,
            quantity: shipQty,
            uom_id: line.uom_id || product?.base_uom_id,
          },
        });

        await (tx as any).inv_transfer_order_line.update({
          where: { id: line.id },
          data: {
            shipped_quantity: shipQty,
            remaining_transit_qty: shipQty,
          },
        });
      }

      await postStockMove(move.id, input.companyId, input.userId, tx, {
        idempotencyKeyPrefix: 'TRF_DISPATCH',
      });

      return (tx as any).inv_transfer_order.update({
        where: { id: order.id },
        data: {
          transit_location_id: transitLocId,
          status: 'IN_TRANSIT',
          dispatched_by_id: input.userId,
          dispatched_at: new Date(),
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/**
 * Event 2 — Receive & Inspect: Moves stock from Virtual Transit -> Destination Location
 * Supports partial receive and split between GOOD and DAMAGED condition.
 * Enforces Conservation Equation:
 * Q_shipped = Q_received_good + Q_received_damaged + Q_written_off + Q_remaining_transit
 */
export async function receiveTransferOrder(input: {
  id: string;
  companyId: string;
  userId: string;
  receiptLines?: Array<{
    line_id: string;
    received_good_quantity: number | string;
    received_damaged_quantity?: number | string;
  }>;
}) {
  return prisma.$transaction(
    async (tx) => {
      const order = await (tx as any).inv_transfer_order.findFirst({
        where: { id: input.id, company_id: input.companyId },
      });
      if (!order) throw new NotFoundError('TransferOrder');
      if (!['IN_TRANSIT', 'PARTIALLY_RECEIVED', 'DISCREPANCY_REVIEW'].includes(order.status)) {
        throw new ValidationError(`Transfer berstatus ${order.status} tidak dapat diterima.`);
      }
      if (!order.transit_location_id) {
        throw new ValidationError('Lokasi transit tidak ditemukan pada dokumen transfer ini.');
      }

      const lines: any[] = await (tx as any).inv_transfer_order_line.findMany({
        where: { transfer_order_id: order.id, company_id: input.companyId },
      });

      const receiptMap = new Map<
        string,
        { good: Prisma.Decimal; damaged: Prisma.Decimal }
      >();
      if (Array.isArray(input.receiptLines) && input.receiptLines.length > 0) {
        for (const rl of input.receiptLines) {
          receiptMap.set(rl.line_id, {
            good: new Prisma.Decimal(rl.received_good_quantity ?? 0),
            damaged: new Prisma.Decimal(rl.received_damaged_quantity ?? 0),
          });
        }
      } else {
        // Default: full good receipt of remaining_transit_qty
        for (const l of lines) {
          receiptMap.set(l.id, {
            good: new Prisma.Decimal(l.remaining_transit_qty ?? 0),
            damaged: new Prisma.Decimal(0),
          });
        }
      }

      let totalRemainingAcrossOrder = new Prisma.Decimal(0);

      for (const line of lines) {
        const rec = receiptMap.get(line.id);
        const goodDelta = rec ? rec.good : new Prisma.Decimal(0);
        const damagedDelta = rec ? rec.damaged : new Prisma.Decimal(0);
        const totalDelta = goodDelta.plus(damagedDelta);
        const currentRemaining = new Prisma.Decimal(line.remaining_transit_qty ?? 0);

        if (goodDelta.lt(0) || damagedDelta.lt(0)) {
          throw new ValidationError('Kuantitas penerimaan tidak boleh negatif.');
        }
        if (totalDelta.gt(currentRemaining)) {
          throw new ValidationError(
            `Total diterima (${totalDelta.toString()}) melebihi sisa stok di transit (${currentRemaining.toString()}).`,
          );
        }

        const product = await tx.master_product.findFirst({
          where: { id: line.product_id, company_id: input.companyId },
        });

        if (goodDelta.gt(0)) {
          const goodMove = await tx.inv_stock_move.create({
            data: {
              id: crypto.randomUUID(),
              tenant_id: order.tenant_id,
              company_id: input.companyId,
              created_by_id: input.userId,
              document_id: order.id,
              move_type: 'TRANSFER',
              source_location_id: order.transit_location_id,
              destination_location_id: order.destination_location_id,
              project_id: order.project_id,
              scheduled_at: new Date(),
              status: 'READY',
            },
          });
          await tx.inv_stock_move_line.create({
            data: {
              id: crypto.randomUUID(),
              tenant_id: order.tenant_id,
              company_id: input.companyId,
              created_by_id: input.userId,
              stock_move_id: goodMove.id,
              product_id: line.product_id,
              lot_id: line.lot_id,
              serial_number_id: line.serial_number_id,
              quantity: goodDelta,
              uom_id: line.uom_id || product?.base_uom_id,
            },
          });
          await postStockMove(goodMove.id, input.companyId, input.userId, tx, {
            conditionStatus: 'GOOD',
            idempotencyKeyPrefix: `TRF_RCV_GOOD_${Date.now()}`,
          });
        }

        if (damagedDelta.gt(0)) {
          // Move from transit (GOOD) -> issue from transit and receipt as DAMAGED at destination
          const outTransitMove = await tx.inv_stock_move.create({
            data: {
              id: crypto.randomUUID(),
              tenant_id: order.tenant_id,
              company_id: input.companyId,
              created_by_id: input.userId,
              document_id: order.id,
              move_type: 'ISSUE',
              source_location_id: order.transit_location_id,
              destination_location_id: null,
              project_id: order.project_id,
              scheduled_at: new Date(),
              status: 'READY',
            },
          });
          await tx.inv_stock_move_line.create({
            data: {
              id: crypto.randomUUID(),
              tenant_id: order.tenant_id,
              company_id: input.companyId,
              created_by_id: input.userId,
              stock_move_id: outTransitMove.id,
              product_id: line.product_id,
              lot_id: line.lot_id,
              serial_number_id: line.serial_number_id,
              quantity: damagedDelta,
              uom_id: line.uom_id || product?.base_uom_id,
            },
          });
          await postStockMove(outTransitMove.id, input.companyId, input.userId, tx, {
            conditionStatus: 'GOOD',
            idempotencyKeyPrefix: `TRF_DMG_OUT_${Date.now()}`,
          });

          const inDamagedMove = await tx.inv_stock_move.create({
            data: {
              id: crypto.randomUUID(),
              tenant_id: order.tenant_id,
              company_id: input.companyId,
              created_by_id: input.userId,
              document_id: order.id,
              move_type: 'RECEIPT',
              source_location_id: null,
              destination_location_id: order.destination_location_id,
              project_id: order.project_id,
              scheduled_at: new Date(),
              status: 'READY',
            },
          });
          await tx.inv_stock_move_line.create({
            data: {
              id: crypto.randomUUID(),
              tenant_id: order.tenant_id,
              company_id: input.companyId,
              created_by_id: input.userId,
              stock_move_id: inDamagedMove.id,
              product_id: line.product_id,
              lot_id: line.lot_id,
              serial_number_id: line.serial_number_id,
              quantity: damagedDelta,
              uom_id: line.uom_id || product?.base_uom_id,
              unit_cost: line.unit_cost ?? 0,
            },
          });
          await postStockMove(inDamagedMove.id, input.companyId, input.userId, tx, {
            conditionStatus: 'DAMAGED',
            idempotencyKeyPrefix: `TRF_DMG_IN_${Date.now()}`,
          });
        }

        const newGood = new Prisma.Decimal(line.received_good_quantity ?? 0).plus(goodDelta);
        const newDamaged = new Prisma.Decimal(line.received_damaged_quantity ?? 0).plus(damagedDelta);
        const writtenOff = new Prisma.Decimal(line.written_off_quantity ?? 0);
        const shipped = new Prisma.Decimal(line.shipped_quantity ?? 0);
        const newRemaining = shipped.minus(newGood).minus(newDamaged).minus(writtenOff);

        totalRemainingAcrossOrder = totalRemainingAcrossOrder.plus(newRemaining);

        await (tx as any).inv_transfer_order_line.update({
          where: { id: line.id },
          data: {
            received_good_quantity: newGood,
            received_damaged_quantity: newDamaged,
            remaining_transit_qty: newRemaining,
          },
        });
      }

      const nextStatus = totalRemainingAcrossOrder.isZero()
        ? 'COMPLETED'
        : 'PARTIALLY_RECEIVED';

      return (tx as any).inv_transfer_order.update({
        where: { id: order.id },
        data: {
          status: nextStatus,
          received_by_id: input.userId,
          received_at: new Date(),
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/**
 * Event 3 — Discrepancy Write-Off: Resolves remaining transit shortage via SoD approval
 */
export async function resolveTransferDiscrepancy(input: {
  id: string;
  companyId: string;
  userId: string;
  notes?: string;
}) {
  return prisma.$transaction(
    async (tx) => {
      const order = await (tx as any).inv_transfer_order.findFirst({
        where: { id: input.id, company_id: input.companyId },
      });
      if (!order) throw new NotFoundError('TransferOrder');
      if (order.dispatched_by_id === input.userId) {
        throw new ForbiddenError(
          'Segregation of Duties (SoD): Petugas Dispatch tidak boleh menyetujui penghapusan selisih transit sendiri.',
        );
      }

      const lines: any[] = await (tx as any).inv_transfer_order_line.findMany({
        where: { transfer_order_id: order.id, company_id: input.companyId },
      });

      for (const line of lines) {
        const rem = new Prisma.Decimal(line.remaining_transit_qty ?? 0);
        if (rem.lte(0)) continue;

        const product = await tx.master_product.findFirst({
          where: { id: line.product_id, company_id: input.companyId },
        });

        const writeOffMove = await tx.inv_stock_move.create({
          data: {
            id: crypto.randomUUID(),
            tenant_id: order.tenant_id,
            company_id: input.companyId,
            created_by_id: input.userId,
            document_id: order.id,
            move_type: 'ISSUE',
            source_location_id: order.transit_location_id,
            destination_location_id: null,
            project_id: order.project_id,
            scheduled_at: new Date(),
            status: 'READY',
          },
        });
        await tx.inv_stock_move_line.create({
          data: {
            id: crypto.randomUUID(),
            tenant_id: order.tenant_id,
            company_id: input.companyId,
            created_by_id: input.userId,
            stock_move_id: writeOffMove.id,
            product_id: line.product_id,
            lot_id: line.lot_id,
            serial_number_id: line.serial_number_id,
            quantity: rem,
            uom_id: line.uom_id || product?.base_uom_id,
          },
        });
        await postStockMove(writeOffMove.id, input.companyId, input.userId, tx, {
          conditionStatus: 'GOOD',
          idempotencyKeyPrefix: `TRF_WRITEOFF_${Date.now()}`,
        });

        const newWrittenOff = new Prisma.Decimal(line.written_off_quantity ?? 0).plus(rem);
        await (tx as any).inv_transfer_order_line.update({
          where: { id: line.id },
          data: {
            written_off_quantity: newWrittenOff,
            remaining_transit_qty: new Prisma.Decimal(0),
          },
        });
      }

      await emitInventoryOutboxEvent(
        {
          tenantId: order.tenant_id,
          companyId: input.companyId,
          aggregateType: 'TRANSFER_ORDER',
          aggregateId: order.id,
          eventType: 'inventory.stock.written_off',
          payload: {
            transfer_order_id: order.id,
            transfer_number: order.transfer_number,
            resolved_by_id: input.userId,
            notes: input.notes ?? '',
          },
        },
        tx,
      );

      return (tx as any).inv_transfer_order.update({
        where: { id: order.id },
        data: {
          status: 'COMPLETED',
          resolved_by_id: input.userId,
          resolved_at: new Date(),
          notes: input.notes ? `${order.notes || ''}\n[Resolved]: ${input.notes}`.trim() : order.notes,
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
