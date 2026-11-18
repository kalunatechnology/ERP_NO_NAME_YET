/**
 * File: backend-express/src/modules/inventory/advanced/epcis.service.ts
 *
 * Purpose: Phase 4 — GS1 EPCIS 2.0 JSON-LD Traceability Export (CBV 2.0).
 * Transforms `inv_stock_ledger_entry` rows into standard GS1 EPCIS 2.0
 * ObjectEvents capturing What (GTIN/SKU/Lot/Serial), Where (Location),
 * When (UTC timestamp), and Why (CBV bizStep & disposition).
 */
import prisma from '../../../config/database';

function mapTransactionToCbv(txType: string, qtyDelta: number): { bizStep: string; disposition: string } {
  const t = String(txType || '').toUpperCase();
  if (t === 'RECEIPT') return { bizStep: 'receiving', disposition: 'in_progress' };
  if (t === 'TRANSFER_OUT') return { bizStep: 'shipping', disposition: 'in_transit' };
  if (t === 'TRANSFER_IN') return { bizStep: 'receiving', disposition: 'sellable_accessible' };
  if (t === 'ADJUSTMENT') {
    return qtyDelta < 0
      ? { bizStep: 'destroying', disposition: 'damaged' }
      : { bizStep: 'cycle_counting', disposition: 'sellable_accessible' };
  }
  return { bizStep: 'shipping', disposition: 'retail_sold' };
}

export async function exportEpcis2Document(input: {
  companyId: string;
  productId?: string;
  lotId?: string;
  serialNumberId?: string;
  limit?: number;
}) {
  const entries = await (prisma as any).inv_stock_ledger_entry.findMany({
    where: {
      company_id: input.companyId,
      ...(input.productId ? { product_id: input.productId } : {}),
      ...(input.lotId ? { lot_id: input.lotId } : {}),
      ...(input.serialNumberId ? { serial_number_id: input.serialNumberId } : {}),
    },
    orderBy: { posting_at: 'asc' },
    take: Math.min(500, Math.max(1, input.limit ?? 100)),
  });

  const prodIds = Array.from(new Set(entries.map((e: any) => e.product_id).filter(Boolean))) as string[];
  const locIds = Array.from(new Set(entries.map((e: any) => e.warehouse_location_id).filter(Boolean))) as string[];
  const lotIds = Array.from(new Set(entries.map((e: any) => e.lot_id).filter(Boolean))) as string[];
  const serialIds = Array.from(new Set(entries.map((e: any) => e.serial_number_id).filter(Boolean))) as string[];

  const [prods, locs, lots, serials] = await Promise.all([
    prodIds.length ? prisma.master_product.findMany({ where: { id: { in: prodIds } }, select: { id: true, product_code: true, barcode: true } }) : [],
    locIds.length ? prisma.master_warehouse_location.findMany({ where: { id: { in: locIds } }, select: { id: true, location_code: true } }) : [],
    lotIds.length ? prisma.inv_lot.findMany({ where: { id: { in: lotIds } }, select: { id: true, lot_number: true } }) : [],
    serialIds.length ? prisma.inv_serial_number.findMany({ where: { id: { in: serialIds } }, select: { id: true, serial_number: true } }) : [],
  ]);

  const prodMap = new Map(prods.map((p) => [p.id, p]));
  const locMap = new Map(locs.map((l) => [l.id, l]));
  const lotMap = new Map(lots.map((l) => [l.id, l]));
  const serialMap = new Map(serials.map((s) => [s.id, s]));

  const eventList = entries.map((e: any) => {
    const prod = e.product_id ? prodMap.get(e.product_id) : null;
    const loc = e.warehouse_location_id ? locMap.get(e.warehouse_location_id) : null;
    const lot = e.lot_id ? lotMap.get(e.lot_id) : null;
    const serial = e.serial_number_id ? serialMap.get(e.serial_number_id) : null;
    const qtyDelta = Number(e.quantity_delta ?? 0);
    const { bizStep, disposition } = mapTransactionToCbv(e.transaction_type, qtyDelta);
    const skuOrGtin = prod?.barcode || prod?.product_code || e.product_id || 'UNKNOWN';

    return {
      type: 'ObjectEvent',
      eventID: `urn:uuid:${e.id}`,
      eventTime: new Date(e.posting_at || e.created_at || Date.now()).toISOString(),
      eventTimeZoneOffset: '+07:00',
      action: qtyDelta >= 0 ? 'ADD' : 'OBSERVE',
      bizStep,
      disposition,
      readPoint: { id: `urn:arsalynt:location:${loc?.location_code || e.warehouse_location_id}` },
      bizLocation: { id: `urn:arsalynt:location:${loc?.location_code || e.warehouse_location_id}` },
      ...(serial
        ? { epcList: [`urn:epc:id:sgtin:${skuOrGtin}.${serial.serial_number}`] }
        : {
            quantityList: [
              {
                epcClass: lot
                  ? `urn:epc:class:lgtin:${skuOrGtin}.${lot.lot_number}`
                  : `urn:epc:idpat:gtin:${skuOrGtin}`,
                quantity: Math.abs(qtyDelta),
              },
            ],
          }),
    };
  });

  return {
    '@context': ['https://ref.gs1.org/standards/epcis/2.0.0/epcis-context.jsonld'],
    type: 'EPCISDocument',
    schemaVersion: '2.0',
    creationDate: new Date().toISOString(),
    epcisBody: { eventList },
  };
}

