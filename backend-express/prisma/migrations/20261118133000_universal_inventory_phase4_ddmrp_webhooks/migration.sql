-- =============================================================================
-- Universal Inventory Phase 4 — DDMRP Buffers & Outbound Webhooks
-- Non-Destructive Migration
-- =============================================================================

CREATE TABLE IF NOT EXISTS "inv_ddmrp_buffer" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT,
  "company_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "warehouse_id" TEXT,
  "adu" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "dlt_days" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "ltf" DECIMAL(65,30) NOT NULL DEFAULT 0.4,
  "vf" DECIMAL(65,30) NOT NULL DEFAULT 0.5,
  "moq" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_inv_ddmrp_buffer"
  ON "inv_ddmrp_buffer" ("company_id", "product_id", "warehouse_id");

CREATE INDEX IF NOT EXISTS "idx_inv_ddmrp_buffer_company"
  ON "inv_ddmrp_buffer" ("company_id", "is_active");

CREATE TABLE IF NOT EXISTS "inv_webhook_subscription" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT,
  "company_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "target_url" TEXT NOT NULL,
  "event_types" TEXT NOT NULL DEFAULT '*',
  "secret_hmac" TEXT NOT NULL DEFAULT '',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_inv_webhook_sub_company"
  ON "inv_webhook_subscription" ("company_id", "is_active");

