import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';

export interface CanonicalIdentityInput {
  companyId: string;
  productId: string;
  locationId: string;
  inventoryOwnerId: string;
  conditionStatus?: string | null;
  lotId?: string | null;
  serialNumberId?: string | null;
  variantId?: string | null;
}

/**
 * Deterministic SHA-256 identity key for Canonical Stock Identity (K):
 * K = (company_id, product_id, location_id, inventory_owner_id, condition_status, lot_id, serial_number_id[, variant_id])
 */
export function buildBalanceIdentityKey(input: CanonicalIdentityInput): string {
  const parts = [
    String(input.companyId || '').trim(),
    String(input.productId || '').trim(),
    String(input.locationId || '').trim(),
    String(input.inventoryOwnerId || 'COMPANY_OWNED').trim(),
    String(input.conditionStatus || 'GOOD').trim().toUpperCase(),
    input.lotId ? String(input.lotId).trim() : '-',
    input.serialNumberId ? String(input.serialNumberId).trim() : '-',
  ];
  if (input.variantId) {
    parts.push(`V:${String(input.variantId).trim()}`);
  }
  return crypto.createHash('sha256').update(parts.join(':')).digest('hex');
}

export interface EligibilityCheckInput {
  conditionStatus?: string | null;
  location?: {
    active?: boolean | null;
    quality_hold?: boolean | null;
    is_allocatable?: boolean | null;
    location_purpose?: string | null;
  } | null;
  lot?: {
    quality_status?: string | null;
    expiry_date?: Date | string | null;
  } | null;
  now?: Date;
}

const NON_ALLOCATABLE_PURPOSES = new Set([
  'TRANSIT',
  'QUARANTINE_AREA',
  'REPAIR_CENTER',
  'SCRAP',
]);

export function evaluateStockEligibility(input: EligibilityCheckInput): {
  eligible: boolean;
  stockStatus: 'ELIGIBLE' | 'INELIGIBLE_CONDITION' | 'INELIGIBLE_LOCATION' | 'IN_TRANSIT' | 'EXPIRED_HOLD';
} {
  const condition = String(input.conditionStatus || 'GOOD').trim().toUpperCase();
  const purpose = String(input.location?.location_purpose || 'STORAGE').trim().toUpperCase();

  if (purpose === 'TRANSIT') {
    return { eligible: false, stockStatus: 'IN_TRANSIT' };
  }
  if (condition !== 'GOOD') {
    return { eligible: false, stockStatus: 'INELIGIBLE_CONDITION' };
  }
  if (input.location) {
    if (input.location.active === false || input.location.quality_hold === true) {
      return { eligible: false, stockStatus: 'INELIGIBLE_LOCATION' };
    }
    if (input.location.is_allocatable === false || NON_ALLOCATABLE_PURPOSES.has(purpose)) {
      return { eligible: false, stockStatus: 'INELIGIBLE_LOCATION' };
    }
  }
  if (input.lot) {
    const lotStatus = String(input.lot.quality_status || 'RELEASED').trim().toUpperCase();
    if (lotStatus !== 'RELEASED' && lotStatus !== 'ACTIVE' && lotStatus !== 'GOOD') {
      return { eligible: false, stockStatus: 'EXPIRED_HOLD' };
    }
    if (input.lot.expiry_date) {
      const exp = new Date(input.lot.expiry_date);
      const refNow = input.now ?? new Date();
      if (!Number.isNaN(exp.getTime()) && exp <= refNow) {
        return { eligible: false, stockStatus: 'EXPIRED_HOLD' };
      }
    }
  }
  return { eligible: true, stockStatus: 'ELIGIBLE' };
}

export function isEligibleStock(input: EligibilityCheckInput): boolean {
  return evaluateStockEligibility(input).eligible;
}

let schemaEnsured = false;
const backfilledCompanies = new Set<string>();

export async function ensureInventoryV2SchemaAndBackfill(
  companyId: string,
  tenantId?: string | null,
): Promise<{ defaultOwnerId: string }> {
  if (!schemaEnsured) {
    try {
      const statements = [
        `ALTER TABLE "master_product" ADD COLUMN IF NOT EXISTS "purchase_uom_id" TEXT`,
        `ALTER TABLE "master_product" ADD COLUMN IF NOT EXISTS "sales_uom_id" TEXT`,
        `ALTER TABLE "master_product" ADD COLUMN IF NOT EXISTS "inventory_uom_id" TEXT`,
        `ALTER TABLE "master_product" ADD COLUMN IF NOT EXISTS "barcode" TEXT`,
        `ALTER TABLE "master_product" ADD COLUMN IF NOT EXISTS "qr_code" TEXT`,
        `ALTER TABLE "master_product" ADD COLUMN IF NOT EXISTS "rfid_tag_prefix" TEXT`,
        `ALTER TABLE "master_product" ADD COLUMN IF NOT EXISTS "is_asset_capitalizable" BOOLEAN NOT NULL DEFAULT false`,
        `ALTER TABLE "master_product" ADD COLUMN IF NOT EXISTS "capitalization_min_cost" DECIMAL(65,30) NOT NULL DEFAULT 0`,
        `ALTER TABLE "master_product" ADD COLUMN IF NOT EXISTS "default_asset_category_id" TEXT`,
        `ALTER TABLE "master_product" ADD COLUMN IF NOT EXISTS "standard_cost" DECIMAL(65,30) NOT NULL DEFAULT 0`,
        `ALTER TABLE "master_product" ADD COLUMN IF NOT EXISTS "min_stock_level" DECIMAL(65,30) NOT NULL DEFAULT 0`,
        `ALTER TABLE "master_product" ADD COLUMN IF NOT EXISTS "reorder_point" DECIMAL(65,30) NOT NULL DEFAULT 0`,
        `ALTER TABLE "master_product" ADD COLUMN IF NOT EXISTS "reorder_quantity" DECIMAL(65,30) NOT NULL DEFAULT 0`,
        `ALTER TABLE "master_warehouse_location" ADD COLUMN IF NOT EXISTS "branch_id" TEXT`,
        `ALTER TABLE "master_warehouse_location" ADD COLUMN IF NOT EXISTS "location_purpose" TEXT NOT NULL DEFAULT 'STORAGE'`,
        `ALTER TABLE "master_warehouse_location" ADD COLUMN IF NOT EXISTS "is_virtual" BOOLEAN NOT NULL DEFAULT false`,
        `ALTER TABLE "master_warehouse_location" ADD COLUMN IF NOT EXISTS "is_allocatable" BOOLEAN NOT NULL DEFAULT true`,
        `ALTER TABLE "master_warehouse_location" ADD COLUMN IF NOT EXISTS "allow_negative_stock" BOOLEAN NOT NULL DEFAULT false`,
        `ALTER TABLE "master_warehouse_location" ADD COLUMN IF NOT EXISTS "reference_transfer_id" TEXT`,
        `ALTER TABLE "inv_stock_reservation" ADD COLUMN IF NOT EXISTS "inventory_owner_id" TEXT`,
        `ALTER TABLE "inv_stock_reservation" ADD COLUMN IF NOT EXISTS "lot_id" TEXT`,
        `ALTER TABLE "inv_stock_reservation" ADD COLUMN IF NOT EXISTS "serial_number_id" TEXT`,
        `ALTER TABLE "inv_stock_reservation" ADD COLUMN IF NOT EXISTS "source_type" TEXT NOT NULL DEFAULT 'INTERNAL_REQUEST'`,
        `ALTER TABLE "inv_stock_reservation" ADD COLUMN IF NOT EXISTS "source_reference_id" TEXT`,
        `ALTER TABLE "inv_stock_reservation" ADD COLUMN IF NOT EXISTS "allocated_quantity" DECIMAL(65,30) NOT NULL DEFAULT 0`,
        `ALTER TABLE "inv_stock_reservation" ADD COLUMN IF NOT EXISTS "fulfilled_quantity" DECIMAL(65,30) NOT NULL DEFAULT 0`,
        `ALTER TABLE "inv_stock_reservation" ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3)`,
        `ALTER TABLE "inv_stock_ledger_entry" ADD COLUMN IF NOT EXISTS "inventory_owner_id" TEXT`,
        `ALTER TABLE "inv_stock_ledger_entry" ADD COLUMN IF NOT EXISTS "condition_status" TEXT NOT NULL DEFAULT 'GOOD'`,
        `ALTER TABLE "inv_stock_ledger_entry" ADD COLUMN IF NOT EXISTS "transaction_type" TEXT NOT NULL DEFAULT 'RECEIPT'`,
        `ALTER TABLE "inv_stock_ledger_entry" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT`,
        `ALTER TABLE "inv_stock_ledger_entry" ADD COLUMN IF NOT EXISTS "counterpart_location_id" TEXT`,
        `ALTER TABLE "inv_stock_ledger_entry" ADD COLUMN IF NOT EXISTS "variant_id" TEXT`,
        `ALTER TABLE "inv_stock_move_line" ADD COLUMN IF NOT EXISTS "variant_id" TEXT`,
        `ALTER TABLE "inv_stock_balance" ADD COLUMN IF NOT EXISTS "variant_id" TEXT`,
        `CREATE TABLE IF NOT EXISTS "master_product_variant" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "tenant_id" TEXT,
          "company_id" TEXT NOT NULL,
          "created_by_id" TEXT,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "product_id" TEXT NOT NULL,
          "variant_sku" TEXT NOT NULL,
          "variant_name" TEXT NOT NULL,
          "attributes_json" TEXT NOT NULL DEFAULT '{}',
          "barcode" TEXT,
          "standard_cost" DECIMAL(65,30) NOT NULL DEFAULT 0,
          "price_delta" DECIMAL(65,30) NOT NULL DEFAULT 0,
          "status" TEXT NOT NULL DEFAULT 'ACTIVE'
        )`,
        `ALTER TABLE "inv_stock_balance" ADD COLUMN IF NOT EXISTS "inventory_owner_id" TEXT`,
        `ALTER TABLE "inv_stock_balance" ADD COLUMN IF NOT EXISTS "condition_status" TEXT NOT NULL DEFAULT 'GOOD'`,
        `ALTER TABLE "inv_stock_balance" ADD COLUMN IF NOT EXISTS "balance_identity_key" TEXT`,
        `ALTER TABLE "inv_stock_balance" ADD COLUMN IF NOT EXISTS "allocated_quantity" DECIMAL(65,30) NOT NULL DEFAULT 0`,
        `ALTER TABLE "inv_stock_balance" ADD COLUMN IF NOT EXISTS "blocked_quantity" DECIMAL(65,30) NOT NULL DEFAULT 0`,
        `ALTER TABLE "inv_stock_balance" ADD COLUMN IF NOT EXISTS "unit_average_cost" DECIMAL(65,30) NOT NULL DEFAULT 0`,
        `ALTER TABLE "inv_stock_balance" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1`,
        `ALTER TABLE "asset_asset" ADD COLUMN IF NOT EXISTS "product_id" TEXT`,
        `ALTER TABLE "asset_asset" ADD COLUMN IF NOT EXISTS "serial_number_id" TEXT`,
        `ALTER TABLE "asset_asset" ADD COLUMN IF NOT EXISTS "source_goods_receipt_id" TEXT`,
        `ALTER TABLE "asset_asset" ADD COLUMN IF NOT EXISTS "source_goods_receipt_line_id" TEXT`,
        `ALTER TABLE "asset_asset" ADD COLUMN IF NOT EXISTS "current_custodian_user_id" TEXT`,
        `ALTER TABLE "asset_asset" ADD COLUMN IF NOT EXISTS "current_custodian_emp_id" TEXT`,
        `CREATE TABLE IF NOT EXISTS "inv_inventory_owner" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "tenant_id" TEXT,
          "company_id" TEXT NOT NULL,
          "owner_code" TEXT NOT NULL,
          "owner_name" TEXT NOT NULL,
          "owner_type" TEXT NOT NULL DEFAULT 'COMPANY_OWNED',
          "party_id" TEXT,
          "project_id" TEXT,
          "is_default" BOOLEAN NOT NULL DEFAULT false,
          "status" TEXT NOT NULL DEFAULT 'ACTIVE',
          "created_by_id" TEXT,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS "master_uom_conversion" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "tenant_id" TEXT,
          "company_id" TEXT NOT NULL,
          "product_id" TEXT,
          "from_uom_id" TEXT NOT NULL,
          "to_uom_id" TEXT NOT NULL,
          "conversion_factor" DECIMAL(65,30) NOT NULL,
          "precision_scale" INTEGER NOT NULL DEFAULT 4,
          "rounding_mode" TEXT NOT NULL DEFAULT 'HALF_UP',
          "effective_from" TIMESTAMP(3),
          "effective_until" TIMESTAMP(3),
          "status" TEXT NOT NULL DEFAULT 'ACTIVE',
          "created_by_id" TEXT,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS "inv_costing_policy" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "tenant_id" TEXT,
          "company_id" TEXT NOT NULL,
          "category_id" TEXT,
          "costing_method" TEXT NOT NULL DEFAULT 'FIFO',
          "inventory_gl_account_id" TEXT,
          "cogs_gl_account_id" TEXT,
          "variance_gl_account_id" TEXT,
          "write_off_gl_account_id" TEXT,
          "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "effective_until" TIMESTAMP(3),
          "status" TEXT NOT NULL DEFAULT 'ACTIVE',
          "created_by_id" TEXT,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS "inv_transfer_order" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "tenant_id" TEXT,
          "company_id" TEXT NOT NULL,
          "transfer_number" TEXT NOT NULL,
          "source_warehouse_id" TEXT,
          "source_location_id" TEXT NOT NULL,
          "transit_location_id" TEXT,
          "destination_warehouse_id" TEXT,
          "destination_location_id" TEXT NOT NULL,
          "inventory_owner_id" TEXT,
          "project_id" TEXT,
          "status" TEXT NOT NULL DEFAULT 'DRAFT',
          "notes" TEXT NOT NULL DEFAULT '',
          "requested_by_id" TEXT,
          "approved_by_id" TEXT,
          "dispatched_by_id" TEXT,
          "received_by_id" TEXT,
          "resolved_by_id" TEXT,
          "approved_at" TIMESTAMP(3),
          "dispatched_at" TIMESTAMP(3),
          "received_at" TIMESTAMP(3),
          "resolved_at" TIMESTAMP(3),
          "created_by_id" TEXT,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS "inv_transfer_order_line" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "tenant_id" TEXT,
          "company_id" TEXT NOT NULL,
          "transfer_order_id" TEXT NOT NULL,
          "product_id" TEXT NOT NULL,
          "uom_id" TEXT,
          "lot_id" TEXT,
          "serial_number_id" TEXT,
          "requested_quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
          "shipped_quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
          "received_good_quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
          "received_damaged_quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
          "written_off_quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
          "remaining_transit_qty" DECIMAL(65,30) NOT NULL DEFAULT 0,
          "unit_cost" DECIMAL(65,30) NOT NULL DEFAULT 0,
          "notes" TEXT NOT NULL DEFAULT '',
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS "asset_assignment_history" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "tenant_id" TEXT,
          "company_id" TEXT NOT NULL,
          "asset_id" TEXT NOT NULL,
          "assignment_type" TEXT NOT NULL DEFAULT 'HANDOVER',
          "custodian_user_id" TEXT,
          "custodian_emp_id" TEXT,
          "department_id" TEXT,
          "project_id" TEXT,
          "location_id" TEXT,
          "condition_status" TEXT NOT NULL DEFAULT 'GOOD',
          "is_current" BOOLEAN NOT NULL DEFAULT true,
          "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "returned_at" TIMESTAMP(3),
          "notes" TEXT NOT NULL DEFAULT '',
          "assigned_by_id" TEXT,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS "inv_outbox_event" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "tenant_id" TEXT,
          "company_id" TEXT NOT NULL,
          "aggregate_type" TEXT NOT NULL,
          "aggregate_id" TEXT NOT NULL,
          "event_type" TEXT NOT NULL,
          "idempotency_key" TEXT NOT NULL,
          "payload_json" TEXT NOT NULL DEFAULT '{}',
          "status" TEXT NOT NULL DEFAULT 'PENDING',
          "attempt_count" INTEGER NOT NULL DEFAULT 0,
          "last_error" TEXT,
          "processed_at" TIMESTAMP(3),
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
        `ALTER TABLE "inv_costing_policy" ADD COLUMN IF NOT EXISTS "gr_ir_gl_account_id" TEXT`,
        `ALTER TABLE "inv_outbox_event" ADD COLUMN IF NOT EXISTS "gl_status" TEXT NOT NULL DEFAULT 'PENDING'`,
        `ALTER TABLE "inv_outbox_event" ADD COLUMN IF NOT EXISTS "gl_journal_entry_id" TEXT`,
        `ALTER TABLE "inv_outbox_event" ADD COLUMN IF NOT EXISTS "gl_processed_at" TIMESTAMP(3)`,
        `ALTER TABLE "inv_outbox_event" ADD COLUMN IF NOT EXISTS "gl_error" TEXT`,
        `CREATE INDEX IF NOT EXISTS "idx_inv_outbox_event_gl_status" ON "inv_outbox_event"("company_id", "gl_status", "created_at")`,
        `ALTER TABLE "inv_stock_ledger_entry" DROP CONSTRAINT IF EXISTS "inv_stock_ledger_ent_source_document_id_190ee411_fk_core_busi"`,
        `ALTER TABLE "inv_stock_ledger_entry" DROP CONSTRAINT IF EXISTS "inv_stock_ledger_ent_source_line_id_15aa25e7_fk_core_busi"`,
        `DO $$ DECLARE r RECORD; BEGIN FOR r IN (SELECT conname, conrelid::regclass::text AS tbl FROM pg_constraint WHERE contype = 'f' AND conrelid::regclass::text IN ('inv_stock_ledger_entry','inv_stock_move','inv_stock_balance','inv_valuation_layer') AND confrelid::regclass::text IN ('core_business_document','core_business_document_line')) LOOP EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.tbl, r.conname); END LOOP; END $$`,
      ];
      for (const sql of statements) {
        await prisma.$executeRawUnsafe(sql);
      }
      schemaEnsured = true;
    } catch (err) {
      console.error('[ensureInventoryV2SchemaAndBackfill:DDL]', err);
    }
  }

  let defaultOwner = await (prisma as any).inv_inventory_owner
    ?.findFirst?.({
      where: { company_id: companyId, is_default: true },
    })
    .catch(() => null);

  if (!defaultOwner) {
    defaultOwner = await (prisma as any).inv_inventory_owner
      ?.create?.({
        data: {
          tenant_id: tenantId ?? null,
          company_id: companyId,
          owner_code: 'OWN-COMPANY-DEFAULT',
          owner_name: 'Kepemilikan Perusahaan (Company Owned)',
          owner_type: 'COMPANY_OWNED',
          is_default: true,
          status: 'ACTIVE',
        },
      })
      .catch(() => ({ id: `DEFAULT-${companyId}` }));
  }

  const defaultOwnerId = String(defaultOwner?.id || `DEFAULT-${companyId}`);

  if (!backfilledCompanies.has(companyId)) {
    try {
      const legacyBalances = await (prisma as any).inv_stock_balance.findMany({
        where: {
          company_id: companyId,
          OR: [{ balance_identity_key: null }, { inventory_owner_id: null }],
        },
        take: 500,
      });

      for (const bal of legacyBalances) {
        if (!bal.product_id || !bal.warehouse_location_id) continue;
        const ownerId = bal.inventory_owner_id || defaultOwnerId;
        const cond = bal.condition_status || 'GOOD';
        const identityKey = buildBalanceIdentityKey({
          companyId,
          productId: bal.product_id,
          locationId: bal.warehouse_location_id,
          inventoryOwnerId: ownerId,
          conditionStatus: cond,
          lotId: bal.lot_id,
          serialNumberId: bal.serial_number_id,
        });
        const onHand = new Prisma.Decimal(bal.on_hand_quantity ?? 0);
        const val = new Prisma.Decimal(bal.inventory_value ?? 0);
        const avgCost = onHand.gt(0) ? val.div(onHand) : new Prisma.Decimal(0);
        await (prisma as any).inv_stock_balance
          .update({
            where: { id: bal.id },
            data: {
              inventory_owner_id: ownerId,
              condition_status: cond,
              balance_identity_key: identityKey,
              unit_average_cost: avgCost,
            },
          })
          .catch(() => null);
      }
      backfilledCompanies.add(companyId);
    } catch {
      // Non-fatal backfill
    }
  }

  return { defaultOwnerId };
}

export async function resolveDefaultInventoryOwnerId(
  companyId: string,
  tenantId?: string | null,
  tx: any = prisma,
): Promise<string> {
  const existing = await tx.inv_inventory_owner
    ?.findFirst?.({
      where: { company_id: companyId, is_default: true },
    })
    .catch(() => null);
  if (existing?.id) return String(existing.id);

  const ensured = await ensureInventoryV2SchemaAndBackfill(companyId, tenantId);
  return ensured.defaultOwnerId;
}

