-- =============================================================================
-- Universal Inventory & Asset Management V2 — Non-Destructive Migration
-- =============================================================================

-- 1. Alter master_product
ALTER TABLE "master_product" ADD COLUMN IF NOT EXISTS "purchase_uom_id" TEXT;
ALTER TABLE "master_product" ADD COLUMN IF NOT EXISTS "sales_uom_id" TEXT;
ALTER TABLE "master_product" ADD COLUMN IF NOT EXISTS "inventory_uom_id" TEXT;
ALTER TABLE "master_product" ADD COLUMN IF NOT EXISTS "barcode" TEXT;
ALTER TABLE "master_product" ADD COLUMN IF NOT EXISTS "qr_code" TEXT;
ALTER TABLE "master_product" ADD COLUMN IF NOT EXISTS "rfid_tag_prefix" TEXT;
ALTER TABLE "master_product" ADD COLUMN IF NOT EXISTS "is_asset_capitalizable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "master_product" ADD COLUMN IF NOT EXISTS "capitalization_min_cost" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "master_product" ADD COLUMN IF NOT EXISTS "default_asset_category_id" TEXT;
ALTER TABLE "master_product" ADD COLUMN IF NOT EXISTS "standard_cost" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "master_product" ADD COLUMN IF NOT EXISTS "min_stock_level" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "master_product" ADD COLUMN IF NOT EXISTS "reorder_point" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "master_product" ADD COLUMN IF NOT EXISTS "reorder_quantity" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- 2. Alter master_warehouse_location
ALTER TABLE "master_warehouse_location" ADD COLUMN IF NOT EXISTS "branch_id" TEXT;
ALTER TABLE "master_warehouse_location" ADD COLUMN IF NOT EXISTS "location_purpose" TEXT NOT NULL DEFAULT 'STORAGE';
ALTER TABLE "master_warehouse_location" ADD COLUMN IF NOT EXISTS "is_virtual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "master_warehouse_location" ADD COLUMN IF NOT EXISTS "is_allocatable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "master_warehouse_location" ADD COLUMN IF NOT EXISTS "allow_negative_stock" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "master_warehouse_location" ADD COLUMN IF NOT EXISTS "reference_transfer_id" TEXT;

-- 3. Alter inv_stock_reservation
ALTER TABLE "inv_stock_reservation" ADD COLUMN IF NOT EXISTS "inventory_owner_id" TEXT;
ALTER TABLE "inv_stock_reservation" ADD COLUMN IF NOT EXISTS "lot_id" TEXT;
ALTER TABLE "inv_stock_reservation" ADD COLUMN IF NOT EXISTS "serial_number_id" TEXT;
ALTER TABLE "inv_stock_reservation" ADD COLUMN IF NOT EXISTS "source_type" TEXT NOT NULL DEFAULT 'INTERNAL_REQUEST';
ALTER TABLE "inv_stock_reservation" ADD COLUMN IF NOT EXISTS "source_reference_id" TEXT;
ALTER TABLE "inv_stock_reservation" ADD COLUMN IF NOT EXISTS "allocated_quantity" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "inv_stock_reservation" ADD COLUMN IF NOT EXISTS "fulfilled_quantity" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "inv_stock_reservation" ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3);

-- 4. Alter inv_stock_ledger_entry
ALTER TABLE "inv_stock_ledger_entry" ADD COLUMN IF NOT EXISTS "inventory_owner_id" TEXT;
ALTER TABLE "inv_stock_ledger_entry" ADD COLUMN IF NOT EXISTS "condition_status" TEXT NOT NULL DEFAULT 'GOOD';
ALTER TABLE "inv_stock_ledger_entry" ADD COLUMN IF NOT EXISTS "transaction_type" TEXT NOT NULL DEFAULT 'RECEIPT';
ALTER TABLE "inv_stock_ledger_entry" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "inv_stock_ledger_entry_idempotency_key_key" ON "inv_stock_ledger_entry"("idempotency_key");

-- 5. Alter inv_stock_balance
ALTER TABLE "inv_stock_balance" ADD COLUMN IF NOT EXISTS "inventory_owner_id" TEXT;
ALTER TABLE "inv_stock_balance" ADD COLUMN IF NOT EXISTS "condition_status" TEXT NOT NULL DEFAULT 'GOOD';
ALTER TABLE "inv_stock_balance" ADD COLUMN IF NOT EXISTS "balance_identity_key" TEXT;
ALTER TABLE "inv_stock_balance" ADD COLUMN IF NOT EXISTS "allocated_quantity" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "inv_stock_balance" ADD COLUMN IF NOT EXISTS "blocked_quantity" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "inv_stock_balance" ADD COLUMN IF NOT EXISTS "unit_average_cost" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "inv_stock_balance" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS "inv_stock_balance_balance_identity_key_key" ON "inv_stock_balance"("balance_identity_key");

-- 6. Alter asset_asset
ALTER TABLE "asset_asset" ADD COLUMN IF NOT EXISTS "product_id" TEXT;
ALTER TABLE "asset_asset" ADD COLUMN IF NOT EXISTS "serial_number_id" TEXT;
ALTER TABLE "asset_asset" ADD COLUMN IF NOT EXISTS "source_goods_receipt_id" TEXT;
ALTER TABLE "asset_asset" ADD COLUMN IF NOT EXISTS "source_goods_receipt_line_id" TEXT;
ALTER TABLE "asset_asset" ADD COLUMN IF NOT EXISTS "current_custodian_user_id" TEXT;
ALTER TABLE "asset_asset" ADD COLUMN IF NOT EXISTS "current_custodian_emp_id" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "asset_asset_serial_number_id_key" ON "asset_asset"("serial_number_id");

-- 7. Create inv_inventory_owner
CREATE TABLE IF NOT EXISTS "inv_inventory_owner" (
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
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_inv_inventory_owner_code" ON "inv_inventory_owner"("company_id", "owner_code");
CREATE INDEX IF NOT EXISTS "idx_inv_inventory_owner_company" ON "inv_inventory_owner"("company_id", "owner_type", "status");

-- 8. Create master_uom_conversion
CREATE TABLE IF NOT EXISTS "master_uom_conversion" (
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
);
CREATE INDEX IF NOT EXISTS "idx_master_uom_conversion_lookup" ON "master_uom_conversion"("company_id", "product_id", "from_uom_id", "to_uom_id");

-- 9. Create inv_costing_policy
CREATE TABLE IF NOT EXISTS "inv_costing_policy" (
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
);
CREATE INDEX IF NOT EXISTS "idx_inv_costing_policy_company" ON "inv_costing_policy"("company_id", "category_id", "status");

-- 10. Create inv_transfer_order & inv_transfer_order_line
CREATE TABLE IF NOT EXISTS "inv_transfer_order" (
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
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_inv_transfer_order_number" ON "inv_transfer_order"("company_id", "transfer_number");
CREATE INDEX IF NOT EXISTS "idx_inv_transfer_order_status" ON "inv_transfer_order"("company_id", "status");

CREATE TABLE IF NOT EXISTS "inv_transfer_order_line" (
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
);
CREATE INDEX IF NOT EXISTS "idx_inv_transfer_order_line_order" ON "inv_transfer_order_line"("company_id", "transfer_order_id");

-- 11. Create asset_assignment_history
CREATE TABLE IF NOT EXISTS "asset_assignment_history" (
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
);
CREATE INDEX IF NOT EXISTS "idx_asset_assignment_history_asset" ON "asset_assignment_history"("company_id", "asset_id", "is_current");

-- 12. Create inv_outbox_event
CREATE TABLE IF NOT EXISTS "inv_outbox_event" (
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
);
CREATE UNIQUE INDEX IF NOT EXISTS "inv_outbox_event_idempotency_key_key" ON "inv_outbox_event"("idempotency_key");
CREATE INDEX IF NOT EXISTS "idx_inv_outbox_event_status" ON "inv_outbox_event"("company_id", "status", "created_at");
