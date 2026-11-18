/**
 * File: backend-express/src/modules/inventory/virtual-location.service.ts
 *
 * Purpose: Universal Inventory Phase 1 — Double-Entry counterpart locations.
 *
 * Every stock movement is recorded with BOTH a source and a destination
 * (Odoo-style double entry). Goods are never "created from nothing" or
 * "deleted into nothing": a receipt moves goods out of the virtual VENDOR
 * location, a sale/issue moves them into the virtual CUSTOMER location, a
 * write-off moves them into the virtual INVENTORY_LOSS location, and so on.
 *
 * Counterpart locations are flagged `is_virtual = true` and
 * `location_purpose = 'VIRTUAL'`. They are recorded on the move and on each
 * ledger entry (`counterpart_location_id`) but they never hold a projected
 * balance, so valuation, availability and reconciliation stay unchanged.
 * Note: VIRTUAL_TRANSIT locations (location_purpose = 'TRANSIT') are NOT
 * counterparts — goods in transit are real, owned stock with a balance.
 */
import crypto from 'crypto';
import { Prisma } from '@prisma/client';

export const VIRTUAL_COUNTERPART_PURPOSE = 'VIRTUAL';

export type VirtualLocationKind =
  | 'VENDOR'
  | 'CUSTOMER'
  | 'INVENTORY_LOSS'
  | 'PRODUCTION'
  | 'PROJECT_CONSUMPTION'
  | 'OPENING_BALANCE'
  | 'CONDITION_RECLASS';

const VIRTUAL_LOCATION_LABELS: Record<VirtualLocationKind, string> = {
  VENDOR: 'Virtual — Pemasok (Vendor)',
  CUSTOMER: 'Virtual — Pelanggan (Customer)',
  INVENTORY_LOSS: 'Virtual — Kehilangan / Susut / Scrap',
  PRODUCTION: 'Virtual — Produksi (Konsumsi & Output)',
  PROJECT_CONSUMPTION: 'Virtual — Konsumsi Proyek',
  OPENING_BALANCE: 'Virtual — Saldo Awal',
  CONDITION_RECLASS: 'Virtual — Reklasifikasi Kondisi Stok',
};

export const VIRTUAL_LOCATION_KINDS = Object.keys(VIRTUAL_LOCATION_LABELS) as VirtualLocationKind[];

export function isCounterpartLocation(location: any): boolean {
  return Boolean(
    location &&
      location.is_virtual === true &&
      String(location.location_purpose || '').toUpperCase() === VIRTUAL_COUNTERPART_PURPOSE,
  );
}

export function virtualLocationCode(kind: VirtualLocationKind): string {
  return `VIRT-${kind}`;
}

/**
 * Idempotently returns (and creates on first use) the company-scoped virtual
 * counterpart location of the given kind.
 */
export async function ensureVirtualLocation(
  tx: Prisma.TransactionClient | any,
  companyId: string,
  tenantId: string | null | undefined,
  kind: VirtualLocationKind,
): Promise<any> {
  const code = virtualLocationCode(kind);
  const existing = await tx.master_warehouse_location.findFirst({
    where: { company_id: companyId, location_code: code },
  });
  if (existing) {
    if (!existing.is_virtual || existing.location_purpose !== VIRTUAL_COUNTERPART_PURPOSE || !existing.active) {
      return tx.master_warehouse_location.update({
        where: { id: existing.id },
        data: {
          is_virtual: true,
          location_purpose: VIRTUAL_COUNTERPART_PURPOSE,
          is_allocatable: false,
          allow_negative_stock: true,
          quality_hold: false,
          active: true,
        },
      });
    }
    return existing;
  }
  return tx.master_warehouse_location.create({
    data: {
      id: crypto.randomUUID(),
      tenant_id: tenantId ?? null,
      company_id: companyId,
      warehouse_id: null,
      parent_id: null,
      location_code: code,
      location_name: VIRTUAL_LOCATION_LABELS[kind],
      location_type: `VIRTUAL_${kind}`,
      location_purpose: VIRTUAL_COUNTERPART_PURPOSE,
      is_virtual: true,
      is_allocatable: false,
      allow_negative_stock: true,
      quality_hold: false,
      active: true,
    },
  });
}

/** Ensures every counterpart location exists for a company (used by setup endpoint). */
export async function ensureAllVirtualLocations(
  tx: Prisma.TransactionClient | any,
  companyId: string,
  tenantId?: string | null,
): Promise<any[]> {
  const rows: any[] = [];
  for (const kind of VIRTUAL_LOCATION_KINDS) {
    rows.push(await ensureVirtualLocation(tx, companyId, tenantId, kind));
  }
  return rows;
}

/**
 * Chooses the default counterpart for a one-sided movement.
 * - RECEIPT  (only destination) → VENDOR (or PRODUCTION if tied to a production order)
 * - ISSUE    (only source)      → PROJECT_CONSUMPTION / PRODUCTION / CUSTOMER
 * - ADJUSTMENT (either side)    → INVENTORY_LOSS
 */
export function defaultCounterpartKind(move: {
  move_type: string;
  project_id?: string | null;
  production_order_id?: string | null;
}): VirtualLocationKind {
  const type = String(move.move_type || '').toUpperCase();
  if (type === 'ADJUSTMENT') return 'INVENTORY_LOSS';
  if (type === 'RECEIPT') return move.production_order_id ? 'PRODUCTION' : 'VENDOR';
  if (move.production_order_id) return 'PRODUCTION';
  if (move.project_id) return 'PROJECT_CONSUMPTION';
  return 'CUSTOMER';
}

