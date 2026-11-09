BEGIN;

ALTER TABLE "fin_budget"
  ADD COLUMN IF NOT EXISTS "currency_id" TEXT,
  ADD COLUMN IF NOT EXISTS "control_policy" TEXT NOT NULL DEFAULT 'HARD_STOP',
  ADD COLUMN IF NOT EXISTS "period_mode" TEXT NOT NULL DEFAULT 'ANNUAL',
  ADD COLUMN IF NOT EXISTS "carry_forward" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "submitted_by" TEXT,
  ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approved_by" TEXT,
  ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approval_note" TEXT,
  ADD COLUMN IF NOT EXISTS "rejected_by" TEXT,
  ADD COLUMN IF NOT EXISTS "activated_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "closed_by" TEXT,
  ADD COLUMN IF NOT EXISTS "closed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "close_note" TEXT;

ALTER TABLE "fin_budget_line"
  ADD COLUMN IF NOT EXISTS "allocation_name" TEXT,
  ADD COLUMN IF NOT EXISTS "description" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_budget_line_budget_id_fkey') THEN
    ALTER TABLE "fin_budget_line"
      ADD CONSTRAINT "fin_budget_line_budget_id_fkey"
      FOREIGN KEY ("budget_id") REFERENCES "fin_budget"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "fin_budget_company_fiscal_year_status_idx"
  ON "fin_budget"("company_id", "fiscal_year_id", "status");
CREATE INDEX IF NOT EXISTS "fin_budget_line_dimensions_idx"
  ON "fin_budget_line"("company_id", "budget_id", "account_id", "cost_center_id", "project_id");

CREATE TABLE IF NOT EXISTS "fin_budget_period_allocation" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT,
  "company_id" TEXT,
  "budget_id" TEXT NOT NULL,
  "allocation_id" TEXT NOT NULL,
  "fiscal_period_id" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fin_budget_period_allocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fin_budget_period_allocation_allocation_id_fkey"
    FOREIGN KEY ("allocation_id") REFERENCES "fin_budget_line"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "fin_budget_period_allocation_allocation_period_key"
  ON "fin_budget_period_allocation"("allocation_id", "fiscal_period_id");
CREATE INDEX IF NOT EXISTS "fin_budget_period_allocation_company_period_idx"
  ON "fin_budget_period_allocation"("company_id", "fiscal_period_id");

CREATE TABLE IF NOT EXISTS "fin_budget_ledger" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT,
  "company_id" TEXT NOT NULL,
  "budget_id" TEXT NOT NULL,
  "allocation_id" TEXT NOT NULL,
  "fiscal_period_id" TEXT,
  "source_type" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "source_line_id" TEXT,
  "entry_type" TEXT NOT NULL,
  "allocated_delta" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "committed_delta" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "actual_delta" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "description" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "reversal_of_id" TEXT,
  "posted_by_id" TEXT,
  "posted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fin_budget_ledger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fin_budget_ledger_allocation_id_fkey"
    FOREIGN KEY ("allocation_id") REFERENCES "fin_budget_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "fin_budget_ledger_idempotency_key_key"
  ON "fin_budget_ledger"("idempotency_key");
CREATE INDEX IF NOT EXISTS "fin_budget_ledger_company_allocation_posted_idx"
  ON "fin_budget_ledger"("company_id", "allocation_id", "posted_at");
CREATE INDEX IF NOT EXISTS "fin_budget_ledger_company_source_idx"
  ON "fin_budget_ledger"("company_id", "source_type", "source_id");
CREATE INDEX IF NOT EXISTS "fin_budget_ledger_company_period_idx"
  ON "fin_budget_ledger"("company_id", "fiscal_period_id");

CREATE TABLE IF NOT EXISTS "fin_budget_reservation" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT,
  "company_id" TEXT NOT NULL,
  "budget_id" TEXT NOT NULL,
  "allocation_id" TEXT NOT NULL,
  "fiscal_period_id" TEXT,
  "source_type" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "source_line_id" TEXT,
  "amount" DECIMAL(18,2) NOT NULL,
  "remaining_amount" DECIMAL(18,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "description" TEXT,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fin_budget_reservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fin_budget_reservation_allocation_id_fkey"
    FOREIGN KEY ("allocation_id") REFERENCES "fin_budget_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fin_budget_reservation_positive_amount_check"
    CHECK ("amount" > 0 AND "remaining_amount" >= 0 AND "remaining_amount" <= "amount")
);
CREATE INDEX IF NOT EXISTS "fin_budget_reservation_company_allocation_status_idx"
  ON "fin_budget_reservation"("company_id", "allocation_id", "status");
CREATE INDEX IF NOT EXISTS "fin_budget_reservation_company_source_idx"
  ON "fin_budget_reservation"("company_id", "source_type", "source_id");

CREATE TABLE IF NOT EXISTS "fin_budget_revision" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT,
  "company_id" TEXT NOT NULL,
  "budget_id" TEXT NOT NULL,
  "allocation_id" TEXT NOT NULL,
  "fiscal_period_id" TEXT,
  "revision_type" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "requested_by" TEXT NOT NULL,
  "approved_by" TEXT,
  "approved_at" TIMESTAMP(3),
  "approval_note" TEXT,
  "rejected_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fin_budget_revision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fin_budget_revision_allocation_id_fkey"
    FOREIGN KEY ("allocation_id") REFERENCES "fin_budget_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fin_budget_revision_positive_amount_check" CHECK ("amount" > 0)
);
CREATE INDEX IF NOT EXISTS "fin_budget_revision_company_budget_status_idx"
  ON "fin_budget_revision"("company_id", "budget_id", "status");

CREATE TABLE IF NOT EXISTS "fin_budget_transfer" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT,
  "company_id" TEXT NOT NULL,
  "budget_id" TEXT NOT NULL,
  "from_allocation_id" TEXT NOT NULL,
  "to_allocation_id" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "requested_by" TEXT NOT NULL,
  "approved_by" TEXT,
  "approved_at" TIMESTAMP(3),
  "approval_note" TEXT,
  "rejected_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fin_budget_transfer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fin_budget_transfer_from_allocation_id_fkey"
    FOREIGN KEY ("from_allocation_id") REFERENCES "fin_budget_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fin_budget_transfer_to_allocation_id_fkey"
    FOREIGN KEY ("to_allocation_id") REFERENCES "fin_budget_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fin_budget_transfer_positive_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "fin_budget_transfer_distinct_allocations_check" CHECK ("from_allocation_id" <> "to_allocation_id")
);
CREATE INDEX IF NOT EXISTS "fin_budget_transfer_company_budget_status_idx"
  ON "fin_budget_transfer"("company_id", "budget_id", "status");

COMMIT;
