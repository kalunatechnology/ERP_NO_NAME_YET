-- =============================================================================
-- Universal Inventory Phase 2 — Configurable Workflow Engine, Warehouse ABAC Scope,
-- and Intercompany Stock Transport Order (STO)
-- Non-Destructive Migration
-- =============================================================================

CREATE TABLE IF NOT EXISTS "inv_workflow_rule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT,
  "company_id" TEXT NOT NULL,
  "document_type" TEXT NOT NULL,
  "from_status" TEXT NOT NULL,
  "to_status" TEXT NOT NULL,
  "action_name" TEXT NOT NULL DEFAULT 'APPROVE',
  "min_amount_threshold" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "required_tier_level" INTEGER NOT NULL DEFAULT 2,
  "enforce_sod" BOOLEAN NOT NULL DEFAULT true,
  "require_expiry_min_days" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_inv_workflow_rule_lookup"
  ON "inv_workflow_rule" ("company_id", "document_type", "from_status", "is_active");

CREATE TABLE IF NOT EXISTS "inv_warehouse_user_scope" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT,
  "company_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "warehouse_id" TEXT NOT NULL,
  "can_read" BOOLEAN NOT NULL DEFAULT true,
  "can_write" BOOLEAN NOT NULL DEFAULT true,
  "can_approve" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_inv_warehouse_user_scope"
  ON "inv_warehouse_user_scope" ("company_id", "user_id", "warehouse_id");

CREATE INDEX IF NOT EXISTS "idx_inv_warehouse_user_scope_user"
  ON "inv_warehouse_user_scope" ("company_id", "user_id", "is_active");

CREATE TABLE IF NOT EXISTS "inv_intercompany_sto" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT,
  "sto_number" TEXT NOT NULL UNIQUE,
  "requesting_company_id" TEXT NOT NULL,
  "requesting_location_id" TEXT NOT NULL,
  "supplying_company_id" TEXT NOT NULL,
  "supplying_location_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "total_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "notes" TEXT NOT NULL DEFAULT '',
  "requested_by_id" TEXT,
  "approved_by_id" TEXT,
  "dispatched_by_id" TEXT,
  "received_by_id" TEXT,
  "approved_at" TIMESTAMP(3),
  "dispatched_at" TIMESTAMP(3),
  "received_at" TIMESTAMP(3),
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_inv_ic_sto_req" ON "inv_intercompany_sto" ("requesting_company_id", "status");
CREATE INDEX IF NOT EXISTS "idx_inv_ic_sto_sup" ON "inv_intercompany_sto" ("supplying_company_id", "status");

CREATE TABLE IF NOT EXISTS "inv_intercompany_sto_line" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT,
  "sto_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "uom_id" TEXT,
  "lot_id" TEXT,
  "serial_number_id" TEXT,
  "requested_quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "shipped_quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "received_quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "unit_cost" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "total_value" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_inv_ic_sto_line_order" ON "inv_intercompany_sto_line" ("sto_id");
