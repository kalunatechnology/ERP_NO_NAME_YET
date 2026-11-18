-- =============================================================================
-- Universal Inventory Phase 3 — Company-Configurable Industry Extensions
-- Non-Destructive Migration
-- =============================================================================

CREATE TABLE IF NOT EXISTS "inv_company_extension" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT,
  "company_id" TEXT NOT NULL,
  "extension_code" TEXT NOT NULL,
  "is_enabled" BOOLEAN NOT NULL DEFAULT false,
  "config_json" TEXT NOT NULL DEFAULT '{}',
  "updated_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_inv_company_extension"
  ON "inv_company_extension" ("company_id", "extension_code");

CREATE INDEX IF NOT EXISTS "idx_inv_company_extension_lookup"
  ON "inv_company_extension" ("company_id", "is_enabled");

