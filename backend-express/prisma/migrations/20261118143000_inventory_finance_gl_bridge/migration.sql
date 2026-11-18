-- =============================================================================
-- Inventory-to-Finance GL Bridge & GR/IR Clearing — Non-Destructive Migration
-- =============================================================================

ALTER TABLE "inv_costing_policy" ADD COLUMN IF NOT EXISTS "gr_ir_gl_account_id" TEXT;

ALTER TABLE "inv_outbox_event" ADD COLUMN IF NOT EXISTS "gl_status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "inv_outbox_event" ADD COLUMN IF NOT EXISTS "gl_journal_entry_id" TEXT;
ALTER TABLE "inv_outbox_event" ADD COLUMN IF NOT EXISTS "gl_processed_at" TIMESTAMP(3);
ALTER TABLE "inv_outbox_event" ADD COLUMN IF NOT EXISTS "gl_error" TEXT;

CREATE INDEX IF NOT EXISTS "idx_inv_outbox_event_gl_status"
  ON "inv_outbox_event" ("company_id", "gl_status", "created_at");

