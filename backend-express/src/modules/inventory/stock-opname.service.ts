import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import { postStockMove } from './stock-posting.service';
import { emitInventoryOutboxEvent } from './inventory-event.service';

export async function approveStockCount(input: {
  id: string;
  companyId: string;
  userId: string;
}) {
  return prisma.$transaction(
    async (tx) => {
      const countDoc = await tx.inv_stock_count.findFirst({
        where: { id: input.id, company_id: input.companyId },
      });
      if (!countDoc) throw new NotFoundError('StockCount');
      if (countDoc.status === 'COMPLETED' || countDoc.status === 'APPROVED') {
        throw new ValidationError('Dokumen Stock Opname ini sudah disetujui dan diposting.');
      }
      if (countDoc.created_by_id && countDoc.created_by_id === input.userId) {
        throw new ForbiddenError(
          'Segregation of Duties (SoD): Pembuat / penghitung Stock Opname tidak dapat menyetujui penyesuaian stoknya sendiri.',
        );
      }

      const lines = await tx.inv_stock_count_line.findMany({
        where: { stock_count_id: countDoc.id, company_id: input.companyId },
      });
      if (!lines.length) {
        throw new ValidationError('Dokumen Stock Opname belum memiliki baris perhitungan.');
      }

      for (const line of lines) {
        if (!line.product_id || !line.location_id) continue;
        const sysQty = new Prisma.Decimal(line.system_quantity ?? 0);
        const countedQty = new Prisma.Decimal(line.counted_quantity ?? sysQty);
        const variance = countedQty.minus(sysQty);

        await tx.inv_stock_count_line.update({
          where: { id: line.id },
          data: { variance_quantity: variance },
        });

        if (variance.isZero()) continue;

        const product = await tx.master_product.findFirst({
          where: { id: line.product_id, company_id: input.companyId },
        });
        if (!product) continue;

        const isGain = variance.gt(0);
        const absVariance = variance.abs();

        const adjMove = await tx.inv_stock_move.create({
          data: {
            id: crypto.randomUUID(),
            tenant_id: countDoc.tenant_id,
            company_id: input.companyId,
            created_by_id: input.userId,
            document_id: countDoc.id,
            move_type: isGain ? 'RECEIPT' : 'ISSUE',
            source_location_id: isGain ? null : line.location_id,
            destination_location_id: isGain ? line.location_id : null,
            scheduled_at: new Date(),
            status: 'READY',
          },
        });

        const unitCost = new Prisma.Decimal((product as any).standard_cost ?? 0);
        await tx.inv_stock_move_line.create({
          data: {
            id: crypto.randomUUID(),
            tenant_id: countDoc.tenant_id,
            company_id: input.companyId,
            created_by_id: input.userId,
            stock_move_id: adjMove.id,
            product_id: product.id,
            lot_id: line.lot_id ?? null,
            quantity: absVariance,
            uom_id: product.base_uom_id,
            unit_cost: unitCost,
          },
        });

        await postStockMove(adjMove.id, input.companyId, input.userId, tx, {
          idempotencyKeyPrefix: `OPNAME_${countDoc.id}`,
        });
      }

      const updated = await tx.inv_stock_count.update({
        where: { id: countDoc.id },
        data: { status: 'COMPLETED' },
      });

      await emitInventoryOutboxEvent(
        {
          tenantId: countDoc.tenant_id,
          companyId: input.companyId,
          aggregateType: 'STOCK_OPNAME',
          aggregateId: countDoc.id,
          eventType: 'inventory.opname.approved',
          payload: {
            stock_count_id: countDoc.id,
            approved_by_id: input.userId,
          },
        },
        tx,
      );

      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
