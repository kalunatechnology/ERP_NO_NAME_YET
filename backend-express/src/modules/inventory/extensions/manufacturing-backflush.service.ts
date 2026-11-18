/**
 * File: backend-express/src/modules/inventory/extensions/manufacturing-backflush.service.ts
 *
 * Purpose: Phase 3 Extension — Manufacturing BOM Backflushing (W7).
 * Given a `mfg_production_order` and `output_quantity`:
 *   1. Reads `mfg_bom_line` for `order.bom_version_id`, scales component quantities
 *      by `output_quantity` (+ `scrap_percent`), and posts an `ISSUE` move from
 *      `component_source_location_id` -> `VIRT-PRODUCTION`.
 *   2. Sums actual issued component value, computes unit cost of the finished
 *      product, and posts a `RECEIPT` move from `VIRT-PRODUCTION` ->
 *      `finished_goods_location_id`.
 */
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { NotFoundError, ValidationError } from '../../../utils/errors';
import { postStockMove } from '../stock-posting.service';
import { assertExtensionEnabled } from './extension-registry.service';

export async function postProductionBackflush(input: {
  companyId: string;
  tenantId?: string | null;
  userId: string;
  productionOrderId: string;
  outputQuantity: number | string;
  componentSourceLocationId: string;
  finishedGoodsLocationId: string;
  lotId?: string | null;
}) {
  const outQty = new Prisma.Decimal(input.outputQuantity ?? 0);
  if (outQty.lte(0)) throw new ValidationError('Kuantitas output produksi harus positif.');

  return prisma.$transaction(
    async (tx: any) => {
      await assertExtensionEnabled(input.companyId, 'MANUFACTURING', tx);

      const order = await tx.mfg_production_order.findFirst({
        where: { id: input.productionOrderId, company_id: input.companyId },
      });
      if (!order) throw new NotFoundError('ProductionOrder');
      if (!order.product_id) throw new ValidationError('Production Order tidak memiliki finished product.');

      const bomLines: any[] = order.bom_version_id
        ? await tx.mfg_bom_line.findMany({
            where: { bom_version_id: order.bom_version_id, company_id: input.companyId },
          })
        : [];

      let totalComponentCost = new Prisma.Decimal(0);
      let issueMove: any = null;

      if (bomLines.length > 0) {
        issueMove = await tx.inv_stock_move.create({
          data: {
            id: crypto.randomUUID(),
            tenant_id: input.tenantId ?? order.tenant_id ?? null,
            company_id: input.companyId,
            created_by_id: input.userId,
            document_id: order.id,
            move_type: 'ISSUE',
            source_location_id: input.componentSourceLocationId,
            destination_location_id: null,
            production_order_id: order.id,
            project_id: order.project_id ?? null,
            scheduled_at: new Date(),
            status: 'READY',
          },
        });

        const moveLineIds: string[] = [];
        for (const bl of bomLines) {
          if (!bl.component_product_id) continue;
          const baseQty = new Prisma.Decimal(bl.quantity ?? 0);
          if (baseQty.lte(0)) continue;
          const scrapFactor = new Prisma.Decimal(1).plus(new Prisma.Decimal(bl.scrap_percent ?? 0).div(100));
          const reqQty = baseQty.times(outQty).times(scrapFactor);
          const lineId = crypto.randomUUID();
          await tx.inv_stock_move_line.create({
            data: {
              id: lineId,
              tenant_id: input.tenantId ?? order.tenant_id ?? null,
              company_id: input.companyId,
              created_by_id: input.userId,
              stock_move_id: issueMove.id,
              product_id: bl.component_product_id,
              quantity: reqQty,
              uom_id: bl.uom_id ?? null,
            },
          });
          moveLineIds.push(lineId);
        }

        if (moveLineIds.length > 0) {
          issueMove = await postStockMove(issueMove.id, input.companyId, input.userId, tx, {
            counterpartKind: 'PRODUCTION',
            idempotencyKeyPrefix: `MFG_BACKFLUSH_${order.id}_${Date.now()}`,
          });
          const postedLines = await tx.inv_stock_move_line.findMany({
            where: { id: { in: moveLineIds } },
          });
          for (const pl of postedLines) {
            totalComponentCost = totalComponentCost.plus(new Prisma.Decimal(pl.total_value ?? 0));
          }
        }
      }

      const unitFinishedCost = outQty.gt(0) ? totalComponentCost.div(outQty) : new Prisma.Decimal(0);
      const receiptMove = await tx.inv_stock_move.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: input.tenantId ?? order.tenant_id ?? null,
          company_id: input.companyId,
          created_by_id: input.userId,
          document_id: order.id,
          move_type: 'RECEIPT',
          source_location_id: null,
          destination_location_id: input.finishedGoodsLocationId,
          production_order_id: order.id,
          project_id: order.project_id ?? null,
          scheduled_at: new Date(),
          status: 'READY',
        },
      });
      await tx.inv_stock_move_line.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: input.tenantId ?? order.tenant_id ?? null,
          company_id: input.companyId,
          created_by_id: input.userId,
          stock_move_id: receiptMove.id,
          product_id: order.product_id,
          lot_id: input.lotId ?? null,
          quantity: outQty,
          unit_cost: unitFinishedCost,
        },
      });
      const postedReceipt = await postStockMove(receiptMove.id, input.companyId, input.userId, tx, {
        counterpartKind: 'PRODUCTION',
        idempotencyKeyPrefix: `MFG_OUTPUT_${order.id}_${Date.now()}`,
      });

      const nextCompleted = new Prisma.Decimal(order.completed_quantity ?? 0).plus(outQty);
      const planned = new Prisma.Decimal(order.planned_quantity ?? 0);
      await tx.mfg_production_order.update({
        where: { id: order.id },
        data: {
          completed_quantity: nextCompleted,
          status: planned.gt(0) && nextCompleted.gte(planned) ? 'COMPLETED' : 'IN_PROGRESS',
        },
      });

      return {
        production_order_id: order.id,
        output_quantity: outQty.toString(),
        total_component_cost: totalComponentCost.toString(),
        unit_finished_cost: unitFinishedCost.toString(),
        component_issue_move: issueMove,
        finished_goods_receipt_move: postedReceipt,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

