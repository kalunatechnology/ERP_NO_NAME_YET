/**
 * File: backend-express/src/modules/finance/inventory-cashflow-forecast.service.ts
 *
 * Purpose: Phase 4 — Inventory Working Capital & DDMRP Replenishment Cash Flow Forecast.
 * Aggregates physical inventory value, damaged/trapped overstock value, committed unpaid
 * PO-backed AP invoices, and DDMRP Red/Yellow zone restock cash requirements.
 */
import prisma from '../../config/database';
import { evaluateDdmrpBuffers } from '../inventory/advanced/ddmrp.service';

export async function getInventoryCashflowIntelligence(companyId: string) {
  const [ddmrpRows, balances, products, openApInvoices] = await Promise.all([
    evaluateDdmrpBuffers(companyId),
    (prisma as any).inv_stock_balance.findMany({ where: { company_id: companyId } }),
    prisma.master_product.findMany({
      where: { company_id: companyId },
      select: { id: true, standard_cost: true },
    }),
    prisma.fin_billing_document.findMany({
      where: {
        company_id: companyId,
        billing_type: 'SUPPLIER_INVOICE',
        purchase_order_id: { not: null },
        status: 'POSTED',
      },
      select: { id: true, invoice_number: true, due_date: true, outstanding_amount: true },
    }),
  ]);

  const avgCostByProduct = new Map<string, number>();
  let totalInventoryValue = 0;
  let damagedLockedValue = 0;

  for (const b of balances) {
    const val = Number(b.inventory_value ?? 0);
    const avg = Number(b.unit_average_cost ?? 0);
    totalInventoryValue += val;
    if (String(b.condition_status || 'GOOD').toUpperCase() !== 'GOOD') {
      damagedLockedValue += val;
    }
    if (b.product_id && avg > 0) avgCostByProduct.set(b.product_id, avg);
  }
  for (const p of products) {
    if (!avgCostByProduct.has(p.id) && Number(p.standard_cost ?? 0) > 0) {
      avgCostByProduct.set(p.id, Number(p.standard_cost));
    }
  }

  let redCashNeed = 0;
  let yellowCashNeed = 0;
  let overstockTrappedCash = 0;

  const replenishmentForecast = ddmrpRows.map((row: any) => {
    const unitCost = avgCostByProduct.get(String(row.product_id)) ?? 0;
    const estOrderCost = Number((Number(row.recommended_order_qty || 0) * unitCost).toFixed(2));
    if (row.zone_status === 'CRITICAL_RED') redCashNeed += estOrderCost;
    if (row.zone_status === 'REORDER_YELLOW') yellowCashNeed += estOrderCost;
    if (row.zone_status === 'OVERSTOCK') {
      const excessQty = Math.max(0, Number(row.net_flow_position) - Number(row.zones.top_of_green));
      overstockTrappedCash += Number((excessQty * unitCost).toFixed(2));
    }
    return { ...row, unit_cost: unitCost, estimated_cash_outflow: estOrderCost };
  });

  const committedApOutflow = openApInvoices.reduce(
    (acc, inv) => acc + Number(inv.outstanding_amount ?? 0),
    0,
  );

  return {
    working_capital: {
      total_inventory_value: Number(totalInventoryValue.toFixed(2)),
      damaged_or_non_good_value: Number(damagedLockedValue.toFixed(2)),
      overstock_trapped_cash: Number(overstockTrappedCash.toFixed(2)),
    },
    cash_outflow_forecast: {
      immediate_red_zone_outflow: Number(redCashNeed.toFixed(2)),
      upcoming_yellow_zone_outflow: Number(yellowCashNeed.toFixed(2)),
      total_ddmrp_restock_outflow: Number((redCashNeed + yellowCashNeed).toFixed(2)),
      committed_unpaid_po_invoices: Number(committedApOutflow.toFixed(2)),
    },
    replenishment_items: replenishmentForecast,
  };
}

