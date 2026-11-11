BEGIN;

ALTER TABLE "master_tax_code"
  ADD COLUMN IF NOT EXISTS "payable_account_id" TEXT,
  ADD COLUMN IF NOT EXISTS "is_recoverable" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "tax_direction" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "fin_recurring_payment_rule"
  ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "project_id" TEXT,
  ADD COLUMN IF NOT EXISTS "cost_center_id" TEXT,
  ADD COLUMN IF NOT EXISTS "budget_allocation_id" TEXT,
  ADD COLUMN IF NOT EXISTS "input_tax_code_id" TEXT;

ALTER TABLE "fin_recurring_payment_run"
  ADD COLUMN IF NOT EXISTS "billing_document_id" TEXT,
  ADD COLUMN IF NOT EXISTS "run_key" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "fin_recurring_payment_run_run_key_key"
  ON "fin_recurring_payment_run"("run_key");

COMMIT;
