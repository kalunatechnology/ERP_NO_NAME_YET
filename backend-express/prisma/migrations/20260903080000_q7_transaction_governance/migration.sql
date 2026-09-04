ALTER TABLE "iam_role"
  ADD COLUMN IF NOT EXISTS "company_id" UUID,
  ADD COLUMN IF NOT EXISTS "custom_code" TEXT,
  ADD COLUMN IF NOT EXISTS "is_system" BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS "iam_role_tenant_id_company_id_idx"
  ON "iam_role"("tenant_id", "company_id");
CREATE UNIQUE INDEX IF NOT EXISTS "iam_role_company_custom_code_key"
  ON "iam_role"("company_id", LOWER("custom_code"))
  WHERE "custom_code" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "core_idempotency_key" (
  "id" UUID NOT NULL,
  "tenant_id" UUID,
  "company_id" UUID,
  "user_id" UUID NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "request_path" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PROCESSING',
  "response_status" INTEGER,
  "response_body" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "core_idempotency_key_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "core_idempotency_key_user_method_path_key"
  ON "core_idempotency_key"("user_id", "method", "request_path", "idempotency_key");
CREATE INDEX IF NOT EXISTS "core_idempotency_key_tenant_company_created_idx"
  ON "core_idempotency_key"("tenant_id", "company_id", "created_at");

ALTER TABLE "fin_period_closing"
  ADD COLUMN IF NOT EXISTS "requested_by" UUID,
  ADD COLUMN IF NOT EXISTS "approved_by" UUID,
  ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3);
