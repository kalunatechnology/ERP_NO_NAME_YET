import { Prisma } from '@prisma/client';
import { ValidationError } from '../../utils/errors';
import { emitInventoryOutboxEvent } from './inventory-event.service';

export type CostingMethodType = 'FIFO' | 'WEIGHTED_AVERAGE' | 'STANDARD_COST';

/**
 * Resolves the effective costing method for a product (product.costing_method or company inv_costing_policy).
 */
export function resolveEffectiveCostingMethod(product: { costing_method?: string | null }): CostingMethodType {
  const raw = String(product.costing_method || 'FIFO').trim().toUpperCase();
  if (raw === 'WEIGHTED_AVERAGE' || raw === 'AVG' || raw === 'MOVING_AVERAGE') return 'WEIGHTED_AVERAGE';
  if (raw === 'STANDARD_COST' || raw === 'STANDARD') return 'STANDARD_COST';
  return 'FIFO';
}

/**
 * Calculates receipt valuation and Purchase Price Variance (PPV) for Standard Cost.
 */
export async function calculateReceiptValuation(
  input: {
    companyId: string;
    tenantId?: string | null;
    product: any;
    quantity: Prisma.Decimal;
    rawUnitCost?: Prisma.Decimal | null;
    currentOnHand: Prisma.Decimal;
    currentAvgCost: Prisma.Decimal;
    sourceDocumentId: string;
    sourceLineId: string;
  },
  tx: any,
): Promise<{
  totalValue: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  newUnitAverageCost: Prisma.Decimal;
  ppvAmount: Prisma.Decimal;
}> {
  const method = resolveEffectiveCostingMethod(input.product);
  const qty = input.quantity;
  const actualUnitCost = input.rawUnitCost ?? new Prisma.Decimal(input.product.standard_cost ?? 0);
  if (actualUnitCost.lt(0)) {
    throw new ValidationError('Harga perolehan receipt tidak boleh negatif.');
  }

  if (method === 'STANDARD_COST') {
    const stdCost = new Prisma.Decimal(input.product.standard_cost ?? actualUnitCost);
    const totalValue = qty.times(stdCost);
    const ppvAmount = actualUnitCost.minus(stdCost).times(qty);
    if (!ppvAmount.isZero()) {
      await emitInventoryOutboxEvent(
        {
          tenantId: input.tenantId,
          companyId: input.companyId,
          aggregateType: 'STOCK_RECEIPT',
          aggregateId: input.sourceLineId,
          eventType: 'inventory.valuation.ppv_recorded',
          payload: {
            product_id: input.product.id,
            quantity: qty.toString(),
            standard_cost: stdCost.toString(),
            actual_unit_cost: actualUnitCost.toString(),
            ppv_amount: ppvAmount.toString(),
            source_document_id: input.sourceDocumentId,
          },
        },
        tx,
      );
    }
    return {
      totalValue,
      unitCost: stdCost,
      newUnitAverageCost: stdCost,
      ppvAmount,
    };
  }

  const totalValue = qty.times(actualUnitCost);
  const newTotalQty = input.currentOnHand.plus(qty);
  const currentTotalVal = input.currentOnHand.times(input.currentAvgCost);
  const newUnitAverageCost = newTotalQty.gt(0)
    ? currentTotalVal.plus(totalValue).div(newTotalQty)
    : actualUnitCost;

  return {
    totalValue,
    unitCost: actualUnitCost,
    newUnitAverageCost,
    ppvAmount: new Prisma.Decimal(0),
  };
}

/**
 * Consumes valuation layers (for FIFO) or uses Moving Weighted Average / Standard Cost on Issue/Dispatch.
 */
export async function consumeOutboundValuation(
  input: {
    companyId: string;
    product: any;
    sourceLocationId: string;
    quantity: Prisma.Decimal;
    currentAvgCost: Prisma.Decimal;
    lotId?: string | null;
    serialNumberId?: string | null;
  },
  tx: any,
): Promise<{
  totalValue: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  consumedLayers: Array<{ unitCost: Prisma.Decimal; quantity: Prisma.Decimal; receivedAt: Date }>;
}> {
  const method = resolveEffectiveCostingMethod(input.product);
  const qty = input.quantity;

  if (method === 'WEIGHTED_AVERAGE') {
    const unitCost = input.currentAvgCost.gt(0)
      ? input.currentAvgCost
      : new Prisma.Decimal(input.product.standard_cost ?? 0);
    const totalValue = qty.times(unitCost);
    return {
      totalValue,
      unitCost,
      consumedLayers: [{ unitCost, quantity: qty, receivedAt: new Date() }],
    };
  }

  if (method === 'STANDARD_COST') {
    const unitCost = new Prisma.Decimal(input.product.standard_cost ?? input.currentAvgCost ?? 0);
    const totalValue = qty.times(unitCost);
    return {
      totalValue,
      unitCost,
      consumedLayers: [{ unitCost, quantity: qty, receivedAt: new Date() }],
    };
  }

  // FIFO Layer Consumption
  const receipts = await tx.inv_stock_ledger_entry.findMany({
    where: {
      company_id: input.companyId,
      product_id: input.product.id,
      warehouse_location_id: input.sourceLocationId,
      quantity_delta: { gt: 0 },
    },
    select: { id: true },
  });

  const layers = await tx.inv_valuation_layer.findMany({
    where: {
      company_id: input.companyId,
      product_id: input.product.id,
      ...(receipts.length > 0 ? { receipt_ledger_entry_id: { in: receipts.map((r: any) => r.id) } } : {}),
      remaining_quantity: { gt: 0 },
    },
    orderBy: [{ received_at: 'asc' }, { id: 'asc' }],
  });

  let remaining = qty;
  let totalValue = new Prisma.Decimal(0);
  const consumedLayers: Array<{ unitCost: Prisma.Decimal; quantity: Prisma.Decimal; receivedAt: Date }> = [];

  for (const layer of layers) {
    if (remaining.isZero()) break;
    if (layer.unit_cost == null || layer.unit_cost.lt(0) || layer.remaining_quantity == null) {
      throw new ValidationError('FIFO layer tidak valid.');
    }
    const take = Prisma.Decimal.min(remaining, layer.remaining_quantity);
    const layerCost = new Prisma.Decimal(layer.unit_cost);
    totalValue = totalValue.plus(take.times(layerCost));
    const left = layer.remaining_quantity.minus(take);
    await tx.inv_valuation_layer.update({
      where: { id: layer.id },
      data: {
        remaining_quantity: left,
        remaining_value: left.times(layerCost),
      },
    });
    consumedLayers.push({
      unitCost: layerCost,
      quantity: take,
      receivedAt: layer.received_at ?? new Date(),
    });
    remaining = remaining.minus(take);
  }

  if (!remaining.isZero()) {
    // Fallback if legacy stock was seeded without valuation layer rows
    if (input.currentAvgCost.gt(0)) {
      const fallbackVal = remaining.times(input.currentAvgCost);
      totalValue = totalValue.plus(fallbackVal);
      consumedLayers.push({
        unitCost: input.currentAvgCost,
        quantity: remaining,
        receivedAt: new Date(),
      });
      remaining = new Prisma.Decimal(0);
    } else {
      throw new ValidationError('FIFO layer tidak mencukupi; rekonsiliasi stok diperlukan.');
    }
  }

  return {
    totalValue,
    unitCost: qty.gt(0) ? totalValue.div(qty) : new Prisma.Decimal(0),
    consumedLayers,
  };
}

