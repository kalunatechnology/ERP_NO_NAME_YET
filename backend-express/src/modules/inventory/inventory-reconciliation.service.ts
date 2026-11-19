import { Prisma } from '@prisma/client';
import prisma from '../../config/database';

/**
 * Verifies the 3-way Inventory Reconciliation Equation:
 * sum(Ledger.quantity_delta) == sum(Balance.on_hand_quantity)
 * and sum(Ledger.value_delta) == sum(Balance.inventory_value)
 */
export async function verifyInventoryReconciliation(companyId: string) {
  const [ledgerAgg, balanceAgg, layerAgg] = await Promise.all([
    prisma.inv_stock_ledger_entry.groupBy({
      by: ['product_id'],
      where: { company_id: companyId },
      _sum: { quantity_delta: true, value_delta: true },
    }),
    prisma.inv_stock_balance.groupBy({
      by: ['product_id'],
      where: { company_id: companyId },
      _sum: { on_hand_quantity: true, inventory_value: true },
    }),
    prisma.inv_valuation_layer.groupBy({
      by: ['product_id'],
      where: { company_id: companyId, remaining_quantity: { gt: 0 } },
      _sum: { remaining_quantity: true, remaining_value: true },
    }),
  ]);

  const ledgerByProduct = new Map(
    ledgerAgg.map((r) => [
      String(r.product_id || ''),
      {
        qty: new Prisma.Decimal(r._sum.quantity_delta ?? 0),
        val: new Prisma.Decimal(r._sum.value_delta ?? 0),
      },
    ]),
  );
  const balanceByProduct = new Map(
    balanceAgg.map((r) => [
      String(r.product_id || ''),
      {
        qty: new Prisma.Decimal(r._sum.on_hand_quantity ?? 0),
        val: new Prisma.Decimal(r._sum.inventory_value ?? 0),
      },
    ]),
  );
  const layerByProduct = new Map(
    layerAgg.map((r) => [
      String(r.product_id || ''),
      {
        qty: new Prisma.Decimal(r._sum.remaining_quantity ?? 0),
        val: new Prisma.Decimal(r._sum.remaining_value ?? 0),
      },
    ]),
  );

  const allProductIds = new Set([
    ...ledgerByProduct.keys(),
    ...balanceByProduct.keys(),
  ]);

  const discrepancies: Array<{
    product_id: string;
    ledger_quantity: number;
    balance_quantity: number;
    layer_quantity: number;
    quantity_diff: number;
    ledger_value: number;
    balance_value: number;
    value_diff: number;
  }> = [];

  for (const pid of allProductIds) {
    if (!pid) continue;
    const l = ledgerByProduct.get(pid) ?? { qty: new Prisma.Decimal(0), val: new Prisma.Decimal(0) };
    const b = balanceByProduct.get(pid) ?? { qty: new Prisma.Decimal(0), val: new Prisma.Decimal(0) };
    const v = layerByProduct.get(pid) ?? { qty: new Prisma.Decimal(0), val: new Prisma.Decimal(0) };

    const qtyDiff = b.qty.minus(l.qty);
    const valDiff = b.val.minus(l.val);

    if (qtyDiff.abs().gt(new Prisma.Decimal('0.0001')) || valDiff.abs().gt(new Prisma.Decimal('0.01'))) {
      discrepancies.push({
        product_id: pid,
        ledger_quantity: Number(l.qty),
        balance_quantity: Number(b.qty),
        layer_quantity: Number(v.qty),
        quantity_diff: Number(qtyDiff),
        ledger_value: Number(l.val),
        balance_value: Number(b.val),
        value_diff: Number(valDiff),
      });
    }
  }

  return {
    company_id: companyId,
    checked_at: new Date().toISOString(),
    reconciled: discrepancies.length === 0,
    total_products_checked: allProductIds.size,
    discrepancy_count: discrepancies.length,
    discrepancies,
  };
}

