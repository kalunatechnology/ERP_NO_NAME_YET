import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { evaluateStockEligibility, resolveDefaultInventoryOwnerId } from './inventory-policy.service';
import { postStockMove } from './stock-posting.service';

/**
 * Stage 1 (Soft Lock): Reserve stock from Available(K)
 * reserved_quantity += Q, available_quantity -= Q
 */
export async function createStockReservation(input: {
  companyId: string;
  tenantId?: string | null;
  userId: string;
  productId: string;
  warehouseLocationId: string;
  quantity: number | string;
  sourceType?: string;
  sourceReferenceId?: string | null;
  projectId?: string | null;
  salesOrderLineId?: string | null;
  productionOrderId?: string | null;
  lotId?: string | null;
  serialNumberId?: string | null;
  requiredDate?: string | Date | null;
  expiresAt?: string | Date | null;
}) {
  return prisma.$transaction(async (tx) => {
    const qty = new Prisma.Decimal(input.quantity ?? 0);
    if (qty.lte(0)) throw new ValidationError('Kuantitas reservasi harus lebih dari 0.');

    const location = await tx.master_warehouse_location.findFirst({
      where: { id: input.warehouseLocationId, company_id: input.companyId, active: true },
    });
    if (!location) throw new ValidationError('Lokasi gudang tidak valid.');

    const balance = await (tx as any).inv_stock_balance.findFirst({
      where: {
        company_id: input.companyId,
        product_id: input.productId,
        warehouse_location_id: input.warehouseLocationId,
        lot_id: input.lotId ?? null,
        serial_number_id: input.serialNumberId ?? null,
        condition_status: 'GOOD',
      },
    });
    if (!balance) throw new ValidationError('Saldo stok produk pada lokasi tersebut tidak ditemukan.');

    const eligibility = evaluateStockEligibility({
      conditionStatus: balance.condition_status || 'GOOD',
      location: location as any,
    });
    if (!eligibility.eligible) {
      throw new ValidationError(`Stok pada lokasi ini berstatus ${eligibility.stockStatus} dan tidak dapat di-reserve.`);
    }

    const onHand = new Prisma.Decimal(balance.on_hand_quantity ?? 0);
    const reserved = new Prisma.Decimal(balance.reserved_quantity ?? 0);
    const allocated = new Prisma.Decimal(balance.allocated_quantity ?? 0);
    const blocked = new Prisma.Decimal(balance.blocked_quantity ?? 0);
    const available = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      onHand.minus(reserved).minus(allocated).minus(blocked),
    );

    if (available.lt(qty)) {
      throw new ValidationError(
        `Stok tersedia (${available.toString()}) tidak mencukupi untuk reservasi (${qty.toString()}).`,
      );
    }

    const newReserved = reserved.plus(qty);
    const newAvailable = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      onHand.minus(newReserved).minus(allocated).minus(blocked),
    );

    await (tx as any).inv_stock_balance.update({
      where: { id: balance.id },
      data: {
        reserved_quantity: newReserved,
        available_quantity: newAvailable,
        version: Number(balance.version ?? 1) + 1,
      },
    });

    const ownerId =
      balance.inventory_owner_id ||
      (await resolveDefaultInventoryOwnerId(input.companyId, input.tenantId, tx));

    const reservation = await (tx as any).inv_stock_reservation.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: input.tenantId ?? null,
        company_id: input.companyId,
        created_by_id: input.userId,
        product_id: input.productId,
        warehouse_location_id: input.warehouseLocationId,
        inventory_owner_id: ownerId,
        lot_id: input.lotId ?? null,
        serial_number_id: input.serialNumberId ?? null,
        project_id: input.projectId ?? null,
        sales_order_line_id: input.salesOrderLineId ?? null,
        production_order_id: input.productionOrderId ?? null,
        source_type: String(input.sourceType || 'INTERNAL_REQUEST').toUpperCase(),
        source_reference_id: input.sourceReferenceId ?? null,
        reserved_quantity: qty,
        allocated_quantity: new Prisma.Decimal(0),
        fulfilled_quantity: new Prisma.Decimal(0),
        required_date: input.requiredDate ? new Date(input.requiredDate) : new Date(),
        expires_at: input.expiresAt ? new Date(input.expiresAt) : null,
        status: 'RESERVED',
      },
    });

    return reservation;
  });
}

/**
 * Stage 2 (Hard Lock / Exclusive): Move quota from reserved_quantity -> allocated_quantity
 * Available(K) does NOT decrease a second time!
 */
export async function allocateStockReservation(input: {
  id: string;
  companyId: string;
  quantity?: number | string;
}) {
  return prisma.$transaction(async (tx) => {
    const resv = await (tx as any).inv_stock_reservation.findFirst({
      where: { id: input.id, company_id: input.companyId },
    });
    if (!resv) throw new NotFoundError('Reservation');
    if (!['RESERVED', 'PARTIALLY_ALLOCATED'].includes(resv.status)) {
      throw new ValidationError(`Reservasi berstatus ${resv.status} tidak dapat dialokasikan.`);
    }

    const reservedQty = new Prisma.Decimal(resv.reserved_quantity ?? 0);
    const currentAllocated = new Prisma.Decimal(resv.allocated_quantity ?? 0);
    const allocQty = input.quantity != null ? new Prisma.Decimal(input.quantity) : reservedQty;
    if (allocQty.lte(0) || allocQty.gt(reservedQty)) {
      throw new ValidationError('Kuantitas alokasi melebihi sisa reserved_quantity.');
    }

    const balance = await (tx as any).inv_stock_balance.findFirst({
      where: {
        company_id: input.companyId,
        product_id: resv.product_id,
        warehouse_location_id: resv.warehouse_location_id,
        lot_id: resv.lot_id ?? null,
        serial_number_id: resv.serial_number_id ?? null,
      },
    });
    if (!balance) throw new ValidationError('Saldo stok untuk reservasi ini tidak ditemukan.');

    const balReserved = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      new Prisma.Decimal(balance.reserved_quantity ?? 0).minus(allocQty),
    );
    const balAllocated = new Prisma.Decimal(balance.allocated_quantity ?? 0).plus(allocQty);

    await (tx as any).inv_stock_balance.update({
      where: { id: balance.id },
      data: {
        reserved_quantity: balReserved,
        allocated_quantity: balAllocated,
        version: Number(balance.version ?? 1) + 1,
      },
    });

    const newResvReserved = reservedQty.minus(allocQty);
    const newResvAllocated = currentAllocated.plus(allocQty);

    return (tx as any).inv_stock_reservation.update({
      where: { id: resv.id },
      data: {
        reserved_quantity: newResvReserved,
        allocated_quantity: newResvAllocated,
        status: newResvReserved.isZero() ? 'ALLOCATED' : 'PARTIALLY_ALLOCATED',
      },
    });
  });
}

/**
 * Release / Cancel Reservation: returns reserved + allocated back to Available(K)
 */
export async function releaseStockReservation(input: { id: string; companyId: string }) {
  return prisma.$transaction(async (tx) => {
    const resv = await (tx as any).inv_stock_reservation.findFirst({
      where: { id: input.id, company_id: input.companyId },
    });
    if (!resv) throw new NotFoundError('Reservation');
    if (['RELEASED', 'CANCELLED', 'FULFILLED'].includes(resv.status)) {
      throw new ValidationError(`Reservasi sudah berstatus ${resv.status}.`);
    }

    const reservedQty = new Prisma.Decimal(resv.reserved_quantity ?? 0);
    const allocatedQty = new Prisma.Decimal(resv.allocated_quantity ?? 0);

    const balance = await (tx as any).inv_stock_balance.findFirst({
      where: {
        company_id: input.companyId,
        product_id: resv.product_id,
        warehouse_location_id: resv.warehouse_location_id,
        lot_id: resv.lot_id ?? null,
        serial_number_id: resv.serial_number_id ?? null,
      },
    });

    if (balance) {
      const onHand = new Prisma.Decimal(balance.on_hand_quantity ?? 0);
      const newReserved = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        new Prisma.Decimal(balance.reserved_quantity ?? 0).minus(reservedQty),
      );
      const newAllocated = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        new Prisma.Decimal(balance.allocated_quantity ?? 0).minus(allocatedQty),
      );
      const blocked = new Prisma.Decimal(balance.blocked_quantity ?? 0);
      const newAvailable = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        onHand.minus(newReserved).minus(newAllocated).minus(blocked),
      );

      await (tx as any).inv_stock_balance.update({
        where: { id: balance.id },
        data: {
          reserved_quantity: newReserved,
          allocated_quantity: newAllocated,
          available_quantity: newAvailable,
          version: Number(balance.version ?? 1) + 1,
        },
      });
    }

    return (tx as any).inv_stock_reservation.update({
      where: { id: resv.id },
      data: {
        reserved_quantity: new Prisma.Decimal(0),
        allocated_quantity: new Prisma.Decimal(0),
        status: 'RELEASED',
      },
    });
  });
}

/**
 * Fulfill / Issue Reservation: consumes allocated_quantity and posts ISSUE stock move
 */
export async function fulfillStockReservation(input: {
  id: string;
  companyId: string;
  userId: string;
}) {
  return prisma.$transaction(
    async (tx) => {
      const resv = await (tx as any).inv_stock_reservation.findFirst({
        where: { id: input.id, company_id: input.companyId },
      });
      if (!resv) throw new NotFoundError('Reservation');
      if (!['RESERVED', 'PARTIALLY_ALLOCATED', 'ALLOCATED'].includes(resv.status)) {
        throw new ValidationError(`Reservasi berstatus ${resv.status} tidak dapat di-fulfill.`);
      }

      const reservedQty = new Prisma.Decimal(resv.reserved_quantity ?? 0);
      const allocatedQty = new Prisma.Decimal(resv.allocated_quantity ?? 0);
      const totalToIssue = reservedQty.plus(allocatedQty);
      if (totalToIssue.lte(0)) {
        throw new ValidationError('Tidak ada kuantitas reservasi/alokasi yang tersisa untuk dikeluarkan.');
      }

      const product = await tx.master_product.findFirst({
        where: { id: resv.product_id, company_id: input.companyId },
      });
      if (!product) throw new NotFoundError('Product');

      const balance = await (tx as any).inv_stock_balance.findFirst({
        where: {
          company_id: input.companyId,
          product_id: resv.product_id,
          warehouse_location_id: resv.warehouse_location_id,
          lot_id: resv.lot_id ?? null,
          serial_number_id: resv.serial_number_id ?? null,
        },
      });
      if (balance) {
        const newReserved = Prisma.Decimal.max(
          new Prisma.Decimal(0),
          new Prisma.Decimal(balance.reserved_quantity ?? 0).minus(reservedQty),
        );
        const newAllocated = Prisma.Decimal.max(
          new Prisma.Decimal(0),
          new Prisma.Decimal(balance.allocated_quantity ?? 0).minus(allocatedQty),
        );
        await (tx as any).inv_stock_balance.update({
          where: { id: balance.id },
          data: {
            reserved_quantity: newReserved,
            allocated_quantity: newAllocated,
          },
        });
      }

      const move = await tx.inv_stock_move.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: resv.tenant_id,
          company_id: input.companyId,
          created_by_id: input.userId,
          document_id: resv.id,
          move_type: 'ISSUE',
          source_location_id: resv.warehouse_location_id,
          destination_location_id: null,
          project_id: resv.project_id,
          production_order_id: resv.production_order_id,
          scheduled_at: new Date(),
          status: 'READY',
        },
      });

      await tx.inv_stock_move_line.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: resv.tenant_id,
          company_id: input.companyId,
          created_by_id: input.userId,
          stock_move_id: move.id,
          product_id: product.id,
          lot_id: resv.lot_id ?? null,
          serial_number_id: resv.serial_number_id ?? null,
          quantity: totalToIssue,
          uom_id: product.base_uom_id,
        },
      });

      await postStockMove(move.id, input.companyId, input.userId, tx, {
        idempotencyKeyPrefix: 'RESV_FULFILL',
      });

      return (tx as any).inv_stock_reservation.update({
        where: { id: resv.id },
        data: {
          reserved_quantity: new Prisma.Decimal(0),
          allocated_quantity: new Prisma.Decimal(0),
          fulfilled_quantity: new Prisma.Decimal(resv.fulfilled_quantity ?? 0).plus(totalToIssue),
          status: 'FULFILLED',
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

