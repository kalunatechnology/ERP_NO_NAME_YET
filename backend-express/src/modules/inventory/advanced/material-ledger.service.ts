/**
 * File: backend-express/src/modules/inventory/advanced/material-ledger.service.ts
 *
 * Purpose: Phase 4 — Material Ledger & Periodic Unit Price (PUP) Actual Costing.
 * Aggregates receipts, issues, and optional period variances per product over
 * `[periodStart, periodEnd]` to compute Periodic Unit Price (PUP) and
 * ending inventory / COGS revaluation deltas.
 */
import prisma from '../../../config/database';
import { emitInventoryOutboxEvent } from '../inventory-event.service';

export async function calculatePeriodicUnitPrice(input: {
  companyId: string;
  productId?: string;
  periodStart: Date;
  periodEnd: Date;
  varianceAmount?: number;
}) {
  const entries = await (prisma as any).inv_stock_ledger_entry.findMany({
    where: {
      company_id: input.companyId,
      ...(input.productId ? { product_id: input.productId } : {}),
      posting_at: { gte: input.periodStart, lte: input.periodEnd },
    },
    orderBy: { posting_at: 'asc' },
  });

  const byProduct = new Map<
    string,
    { receiptQty: number; receiptValue: number; issueQty: number; issueValue: number }
  >();

  for (const e of entries) {
    const pid = String(e.product_id || '');
    if (!pid) continue;
    const agg = byProduct.get(pid) || { receiptQty: 0, receiptValue: 0, issueQty: 0, issueValue: 0 };
    const q = Number(e.quantity_delta ?? 0);
    const v = Number(e.value_delta ?? 0);
    if (q > 0) {
      agg.receiptQty += q;
      agg.receiptValue += v;
    } else if (q < 0) {
      agg.issueQty += Math.abs(q);
      agg.issueValue += Math.abs(v);
    }
    byProduct.set(pid, agg);
  }

  const productIds = Array.from(byProduct.keys());
  const [products, balances] = await Promise.all([
    productIds.length
      ? prisma.master_product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, product_code: true, product_name: true, costing_method: true },
        })
      : [],
    productIds.length
      ? (prisma as any).inv_stock_balance.findMany({
          where: { company_id: input.companyId, product_id: { in: productIds } },
          select: { product_id: true, on_hand_quantity: true, inventory_value: true },
        })
      : [],
  ]);

  const prodMap = new Map(products.map((p) => [p.id, p]));
  const endQtyMap = new Map<string, number>();
  const endValMap = new Map<string, number>();
  for (const b of balances) {
    const pid = String(b.product_id || '');
    endQtyMap.set(pid, (endQtyMap.get(pid) ?? 0) + Number(b.on_hand_quantity ?? 0));
    endValMap.set(pid, (endValMap.get(pid) ?? 0) + Number(b.inventory_value ?? 0));
  }

  const extraVariance = Number(input.varianceAmount ?? 0);
  return productIds.map((pid) => {
    const agg = byProduct.get(pid)!;
    const prod = prodMap.get(pid);
    const totalPoolQty = agg.receiptQty;
    const totalPoolValue = agg.receiptValue + (productIds.length === 1 ? extraVariance : 0);
    const pup = totalPoolQty > 0 ? totalPoolValue / totalPoolQty : 0;
    const endingQty = endQtyMap.get(pid) ?? 0;
    const endingBookValue = endValMap.get(pid) ?? 0;
    const revaluedEndingValue = endingQty * pup;
    const revaluedCogs = agg.issueQty * pup;

    return {
      product_id: pid,
      product_code: prod?.product_code ?? null,
      product_name: prod?.product_name ?? null,
      costing_method: prod?.costing_method ?? null,
      receipt_quantity: agg.receiptQty,
      receipt_value: agg.receiptValue,
      issue_quantity: agg.issueQty,
      issue_book_value: agg.issueValue,
      periodic_unit_price: Number(pup.toFixed(4)),
      cogs_revaluation_delta: Number((revaluedCogs - agg.issueValue).toFixed(2)),
      ending_inventory_revaluation_delta: Number((revaluedEndingValue - endingBookValue).toFixed(2)),
    };
  });
}

export async function postPeriodicUnitPriceRevaluation(input: {
  companyId: string;
  tenantId?: string | null;
  userId: string;
  periodStart: Date;
  periodEnd: Date;
  varianceAmount?: number;
}) {
  const rows = await calculatePeriodicUnitPrice(input);
  const activeRows = rows.filter(
    (r) => Math.abs(r.cogs_revaluation_delta) > 0.01 || Math.abs(r.ending_inventory_revaluation_delta) > 0.01,
  );
  const periodKey = `${input.periodStart.toISOString().slice(0, 10)}_${input.periodEnd.toISOString().slice(0, 10)}`;

  return prisma.$transaction(async (tx) => {
    const evt = await emitInventoryOutboxEvent(
      {
        tenantId: input.tenantId ?? null,
        companyId: input.companyId,
        aggregateType: 'MATERIAL_LEDGER_PUP',
        aggregateId: periodKey,
        eventType: 'inventory.valuation.pup_posted',
        idempotencyKey: `PUP_${input.companyId}_${periodKey}`,
        payload: {
          period_start: input.periodStart.toISOString(),
          period_end: input.periodEnd.toISOString(),
          posted_by_id: input.userId,
          items: activeRows,
        },
      },
      tx,
    );
    return {
      period_key: periodKey,
      item_count: activeRows.length,
      outbox_event_id: evt?.id ?? null,
      items: activeRows,
    };
  });
}

