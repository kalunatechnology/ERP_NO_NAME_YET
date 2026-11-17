import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import {
  ensureInventoryV2SchemaAndBackfill,
  evaluateStockEligibility,
} from './inventory-policy.service';

export async function getInventoryOverviewAndBalances(
  companyId: string,
  tenantId?: string | null,
) {
  await ensureInventoryV2SchemaAndBackfill(companyId, tenantId);

  const [
    products,
    locations,
    warehouses,
    lots,
    serials,
    balances,
    valuationLayers,
    transfers,
    transferLines,
    reservations,
    stockCounts,
    assets,
    assetHistory,
    owners,
    uomConversions,
  ] = await Promise.all([
    prisma.master_product.findMany({
      where: { company_id: companyId },
      orderBy: { product_code: 'asc' },
    }),
    prisma.master_warehouse_location.findMany({
      where: { company_id: companyId },
      orderBy: { location_code: 'asc' },
    }),
    prisma.master_warehouse.findMany({
      where: { company_id: companyId },
      orderBy: { warehouse_code: 'asc' },
    }),
    prisma.inv_lot.findMany({
      where: { company_id: companyId },
      orderBy: { created_at: 'desc' },
    }),
    prisma.inv_serial_number.findMany({
      where: { company_id: companyId },
      orderBy: { created_at: 'desc' },
    }),
    (prisma as any).inv_stock_balance.findMany({
      where: { company_id: companyId },
      orderBy: { updated_at: 'desc' },
    }),
    prisma.inv_valuation_layer.findMany({
      where: { company_id: companyId, remaining_quantity: { gt: 0 } },
    }),
    (prisma as any).inv_transfer_order
      ?.findMany?.({
        where: { company_id: companyId },
        orderBy: { created_at: 'desc' },
        take: 100,
      })
      .catch(() => []) ?? [],
    (prisma as any).inv_transfer_order_line
      ?.findMany?.({
        where: { company_id: companyId },
      })
      .catch(() => []) ?? [],
    (prisma as any).inv_stock_reservation.findMany({
      where: { company_id: companyId },
      orderBy: { created_at: 'desc' },
      take: 100,
    }),
    prisma.inv_stock_count.findMany({
      where: { company_id: companyId },
      orderBy: { created_at: 'desc' },
      take: 50,
    }),
    (prisma as any).asset_asset.findMany({
      where: { company_id: companyId },
      orderBy: { created_at: 'desc' },
      take: 200,
    }),
    (prisma as any).asset_assignment_history
      ?.findMany?.({
        where: { company_id: companyId },
        orderBy: { assigned_at: 'desc' },
        take: 100,
      })
      .catch(() => []) ?? [],
    (prisma as any).inv_inventory_owner
      ?.findMany?.({
        where: { company_id: companyId },
      })
      .catch(() => []) ?? [],
    (prisma as any).master_uom_conversion
      ?.findMany?.({
        where: { company_id: companyId },
      })
      .catch(() => []) ?? [],
  ]);

  const productMap = new Map<string, any>(products.map((p) => [p.id, p]));
  const locationMap = new Map<string, any>(locations.map((l) => [l.id, l]));
  const lotMap = new Map<string, any>(lots.map((l) => [l.id, l]));
  const ownerMap = new Map<string, any>(owners.map((o: any) => [o.id, o]));

  let physicalOnHand = new Prisma.Decimal(0);
  let eligibleOnHand = new Prisma.Decimal(0);
  let availableStock = new Prisma.Decimal(0);
  let reservedTotal = new Prisma.Decimal(0);
  let allocatedTotal = new Prisma.Decimal(0);
  let blockedTotal = new Prisma.Decimal(0);
  let inTransitTotal = new Prisma.Decimal(0);
  let damagedTotal = new Prisma.Decimal(0);
  let quarantinedTotal = new Prisma.Decimal(0);
  let totalInventoryValue = new Prisma.Decimal(0);

  const enrichedBalances = balances.map((b: any) => {
    const loc = b.warehouse_location_id ? locationMap.get(b.warehouse_location_id) : null;
    const lot = b.lot_id ? lotMap.get(b.lot_id) : null;
    const prod = b.product_id ? productMap.get(b.product_id) : null;
    const owner = b.inventory_owner_id ? ownerMap.get(b.inventory_owner_id) : null;

    const onHand = new Prisma.Decimal(b.on_hand_quantity ?? 0);
    const reserved = new Prisma.Decimal(b.reserved_quantity ?? 0);
    const allocated = new Prisma.Decimal(b.allocated_quantity ?? 0);
    const blocked = new Prisma.Decimal(b.blocked_quantity ?? 0);
    const invVal = new Prisma.Decimal(b.inventory_value ?? 0);
    const cond = String(b.condition_status || 'GOOD').toUpperCase();
    const purpose = String((loc as any)?.location_purpose || 'STORAGE').toUpperCase();

    const eligibility = evaluateStockEligibility({
      conditionStatus: cond,
      location: loc,
      lot,
    });

    const calcAvailable = eligibility.eligible
      ? Prisma.Decimal.max(
          new Prisma.Decimal(0),
          onHand.minus(reserved).minus(allocated).minus(blocked),
        )
      : new Prisma.Decimal(0);

    physicalOnHand = physicalOnHand.plus(onHand);
    reservedTotal = reservedTotal.plus(reserved);
    allocatedTotal = allocatedTotal.plus(allocated);
    blockedTotal = blockedTotal.plus(blocked);
    totalInventoryValue = totalInventoryValue.plus(invVal);

    if (eligibility.eligible) {
      eligibleOnHand = eligibleOnHand.plus(onHand);
      availableStock = availableStock.plus(calcAvailable);
    }
    if (purpose === 'TRANSIT') {
      inTransitTotal = inTransitTotal.plus(onHand);
    }
    if (cond === 'DAMAGED' || cond === 'DEFECTIVE') {
      damagedTotal = damagedTotal.plus(onHand);
    }
    if (purpose === 'QUARANTINE_AREA' || loc?.quality_hold === true) {
      quarantinedTotal = quarantinedTotal.plus(onHand);
    }

    return {
      ...b,
      product_code: prod?.product_code ?? null,
      product_name: prod?.product_name ?? null,
      costing_method: prod?.costing_method ?? 'FIFO',
      location_code: loc?.location_code ?? null,
      location_name: loc?.location_name ?? null,
      location_purpose: purpose,
      owner_name: owner?.owner_name ?? 'Company Owned',
      owner_type: owner?.owner_type ?? 'COMPANY_OWNED',
      condition_status: cond,
      stock_status: eligibility.stockStatus,
      is_eligible: eligibility.eligible,
      computed_available_quantity: Number(calcAvailable),
    };
  });

  // Inventory Aging Buckets from Valuation Layers (0-30, 31-60, 61-90, 90+ days)
  const nowMs = Date.now();
  const agingBuckets = {
    days_0_30_value: 0,
    days_31_60_value: 0,
    days_61_90_value: 0,
    days_90_plus_value: 0,
  };
  for (const layer of valuationLayers) {
    const val = Number(layer.remaining_value ?? 0);
    const recDate = layer.received_at ? new Date(layer.received_at).getTime() : nowMs;
    const ageDays = Math.max(0, Math.floor((nowMs - recDate) / 86400000));
    if (ageDays <= 30) agingBuckets.days_0_30_value += val;
    else if (ageDays <= 60) agingBuckets.days_31_60_value += val;
    else if (ageDays <= 90) agingBuckets.days_61_90_value += val;
    else agingBuckets.days_90_plus_value += val;
  }

  // Low Stock & Reorder Point Alerts
  const stockByProduct = new Map<string, Prisma.Decimal>();
  for (const b of enrichedBalances) {
    if (!b.product_id || !b.is_eligible) continue;
    const prev = stockByProduct.get(b.product_id) ?? new Prisma.Decimal(0);
    stockByProduct.set(b.product_id, prev.plus(new Prisma.Decimal(b.on_hand_quantity ?? 0)));
  }

  const lowStockAlerts = products
    .filter((p) => p.stock_item)
    .map((p: any) => {
      const currentEligible = stockByProduct.get(p.id) ?? new Prisma.Decimal(0);
      const reorderPoint = new Prisma.Decimal(p.reorder_point ?? 0);
      const minStock = new Prisma.Decimal(p.min_stock_level ?? 0);
      return {
        product_id: p.id,
        product_code: p.product_code,
        product_name: p.product_name,
        eligible_on_hand: Number(currentEligible),
        reorder_point: Number(reorderPoint),
        min_stock_level: Number(minStock),
        reorder_quantity: Number(p.reorder_quantity ?? 0),
        needs_reorder: reorderPoint.gt(0) && currentEligible.lte(reorderPoint),
      };
    })
    .filter((item) => item.needs_reorder);

  const linesByTransfer = new Map<string, any[]>();
  for (const tl of transferLines) {
    const arr = linesByTransfer.get(tl.transfer_order_id) || [];
    arr.push({
      ...tl,
      product_code: productMap.get(tl.product_id)?.product_code ?? null,
      product_name: productMap.get(tl.product_id)?.product_name ?? null,
    });
    linesByTransfer.set(tl.transfer_order_id, arr);
  }

  const enrichedTransfers = transfers.map((t: any) => ({
    ...t,
    source_location_name: locationMap.get(t.source_location_id)?.location_name ?? t.source_location_id,
    destination_location_name:
      locationMap.get(t.destination_location_id)?.location_name ?? t.destination_location_id,
    lines: linesByTransfer.get(t.id) || [],
  }));

  const totalAssetValue = assets.reduce(
    (sum: number, a: any) => sum + Number(a.acquisition_cost ?? 0),
    0,
  );

  return {
    kpis: {
      physical_on_hand: Number(physicalOnHand),
      eligible_on_hand: Number(EligibleOnHandSafe(eligibleOnHand)),
      available_stock: Number(availableStock),
      reserved_quantity: Number(reservedTotal),
      allocated_quantity: Number(allocatedTotal),
      blocked_quantity: Number(blockedTotal),
      in_transit_quantity: Number(inTransitTotal),
      damaged_quantity: Number(damagedTotal),
      quarantined_quantity: Number(quarantinedTotal),
      total_inventory_value: Number(totalInventoryValue),
      total_fixed_assets: assets.length,
      total_fixed_asset_value: totalAssetValue,
      low_stock_alert_count: lowStockAlerts.length,
      active_transfer_count: transfers.filter((t: any) => t.status === 'IN_TRANSIT').length,
      active_opname_count: stockCounts.filter((c) => c.status !== 'COMPLETED').length,
    },
    aging_buckets: agingBuckets,
    low_stock_alerts: lowStockAlerts,
    balances: enrichedBalances,
    transfers: enrichedTransfers,
    reservations,
    stock_counts: stockCounts,
    assets,
    asset_assignment_history: assetHistory,
    owners,
    uom_conversions: uomConversions,
    warehouses,
    locations,
    products,
    lots,
    serials,
  };
}

function EligibleOnHandSafe(d: Prisma.Decimal) {
  return d;
}
