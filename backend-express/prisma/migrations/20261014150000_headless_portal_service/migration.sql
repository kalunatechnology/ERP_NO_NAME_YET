BEGIN;

ALTER TABLE "service_case"
  ADD COLUMN IF NOT EXISTS "warranty_status" TEXT,
  ADD COLUMN IF NOT EXISTS "warranty_checked_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "warranty_expires_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "service_work_order" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "service_case_id" TEXT NOT NULL,
  "assigned_user_id" TEXT,
  "work_order_type" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "service_work_order_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "service_work_order_company_id_service_case_id_status_idx"
  ON "service_work_order"("company_id", "service_case_id", "status");

CREATE TABLE IF NOT EXISTS "core_portal_access_token" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "party_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at" TIMESTAMP(3),
  CONSTRAINT "core_portal_access_token_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "core_portal_access_token_token_hash_key"
  ON "core_portal_access_token"("token_hash");
CREATE INDEX IF NOT EXISTS "core_portal_access_token_company_id_party_id_revoked_at_idx"
  ON "core_portal_access_token"("company_id", "party_id", "revoked_at");

COMMIT;
