-- =============================================================================
-- Universal Inventory Phase 1 — Double-Entry Virtual Counterparts & Variants
-- Non-Destructive Migration
-- =============================================================================

-- 1. Product Variants table (color, size, grade, SKU override)
CREATE TABLE IF NOT EXISTS "master_product_variant" (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_master_product_variant_sku"
  ON "master_product_variant" ("company_id", "variant_sku");

CREATE INDEX IF NOT EXISTS "idx_master_product_variant_product"
  ON "master_product_variant" ("company_id", "product_id", "status");

-- 2. Double-entry counterpart & variant columns on inventory ledger / move / balance
ALTER TABLE "inv_stock_move_line" ADD COLUMN IF NOT EXISTS "variant_id" TEXT;
ALTER TABLE "inv_stock_ledger_entry" ADD COLUMN IF NOT EXISTS "counterpart_location_id" TEXT;
ALTER TABLE "inv_stock_ledger_entry" ADD COLUMN IF NOT EXISTS "variant_id" TEXT;
ALTER TABLE "inv_stock_balance" ADD COLUMN IF NOT EXISTS "variant_id" TEXT;

