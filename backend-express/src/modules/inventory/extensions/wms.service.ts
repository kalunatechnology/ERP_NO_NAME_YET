/**
 * File: backend-express/src/modules/inventory/extensions/wms.service.ts
 *
 * Purpose: Phase 3 Extension — WMS Putaway Suggestions & Wave/FEFO Pick List.
 */
import prisma from '../../../config/database';
import { assertExtensionEnabled } from './extension-registry.service';

export async function suggestPutawayBins(input: {
  companyId: string;
  warehouseId?: string | null;
  productId: string;
}) {
  await assertExtensionEnabled(input.companyId, 'WMS');

  const candidateLocations = await prisma.master_warehouse_location.findMany({
    where: {
      company_id: input.companyId,
      active: true,
      is_virtual: false,
      quality_hold: false,
      is_allocatable: true,
      ...(input.warehouseId ? { warehouse_id: input.warehouseId } : {}),
    },
    orderBy: [{ location_type: 'asc' }, { location_code: 'asc' }],
  });

  const existingBalances = await (prisma as any).inv_stock_balance.findMany({
    where: {
      company_id: input.companyId,
      product_id: input.productId,
      on_hand_quantity: { gt: 0 },
    },
    select: { warehouse_location_id: true, on_hand_quantity: true },
  });
  const qtyByLoc = new Map<string, number>();
  for (const b of existingBalances) {
    const id = String(b.warehouse_location_id || '');
    qtyByLoc.set(id, (qtyByLoc.get(id) ?? 0) + Number(b.on_hand_quantity ?? 0));
  }

  return candidateLocations
    .map((loc) => ({
      location_id: loc.id,
      location_code: loc.location_code,
      location_name: loc.location_name,
      location_type: loc.location_type,
      existing_qty_for_product: qtyByLoc.get(loc.id) ?? 0,
      strategy: (qtyByLoc.get(loc.id) ?? 0) > 0 ? 'CONSOLIDATE_SAME_SKU' : 'EMPTY_OR_MIXED_BIN',
    }))
    .sort((a, b) => b.existing_qty_for_product - a.existing_qty_for_product);
}

export async function generateWavePickList(input: {
  companyId: string;
  warehouseId?: string | null;
  items: Array<{ product_id: string; quantity: number }>;
}) {
  await assertExtensionEnabled(input.companyId, 'WMS');

  const locations = await prisma.master_warehouse_location.findMany({
    where: {
      company_id: input.companyId,
      active: true,
      is_virtual: false,
      quality_hold: false,
      is_allocatable: true,
      ...(input.warehouseId ? { warehouse_id: input.warehouseId } : {}),
    },
  });
  const locMap = new Map(locations.map((l) => [l.id, l]));
  const allowedLocIds = locations.map((l) => l.id);

  const pickTasks: any[] = [];
  for (const item of input.items) {
    if (!item.product_id || Number(item.quantity) <= 0 || !allowedLocIds.length) continue;
    const balances = await (prisma as any).inv_stock_balance.findMany({
      where: {
        company_id: input.companyId,
        product_id: item.product_id,
        warehouse_location_id: { in: allowedLocIds },
        condition_status: 'GOOD',
        available_quantity: { gt: 0 },
      },
    });
    const lotIds = balances.map((b: any) => b.lot_id).filter(Boolean);
    const lots = lotIds.length
      ? await prisma.inv_lot.findMany({ where: { id: { in: lotIds }, company_id: input.companyId } })
      : [];
    const lotMap = new Map(lots.map((l) => [l.id, l]));

    const sorted = balances
      .map((b: any) => {
        const lot = b.lot_id ? lotMap.get(b.lot_id) : null;
        const loc = locMap.get(String(b.warehouse_location_id));
        return {
          balance: b,
          lot,
          loc,
          avail: Number(b.available_quantity ?? 0),
          exp: lot?.expiry_date ? new Date(lot.expiry_date).getTime() : Number.POSITIVE_INFINITY,
        };
      })
      .filter((x: any) => x.avail > 0 && x.exp > Date.now())
      .sort((a: any, b: any) => a.exp - b.exp || String(a.loc?.location_code || '').localeCompare(String(b.loc?.location_code || '')));

    let remaining = Number(item.quantity);
    for (const candidate of sorted) {
      if (remaining <= 0) break;
      const take = Math.min(candidate.avail, remaining);
      pickTasks.push({
        product_id: item.product_id,
        location_id: candidate.loc?.id,
        location_code: candidate.loc?.location_code,
        location_name: candidate.loc?.location_name,
        lot_id: candidate.lot?.id ?? null,
        lot_number: candidate.lot?.lot_number ?? null,
        expiry_date: candidate.lot?.expiry_date ?? null,
        pick_quantity: take,
      });
      remaining -= take;
    }
  }

  return { pick_tasks: pickTasks };
}

