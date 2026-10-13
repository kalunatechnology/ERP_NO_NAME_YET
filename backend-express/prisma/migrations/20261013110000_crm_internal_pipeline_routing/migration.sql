BEGIN;

-- Integration credentials identify trusted internal senders; routing is
-- configured on the source and never selected by an inbound webhook payload.
ALTER TABLE "core_integration_source"
  ADD COLUMN IF NOT EXISTS "business_unit_code" TEXT,
  ADD COLUMN IF NOT EXISTS "business_unit_name" TEXT,
  ADD COLUMN IF NOT EXISTS "default_assigned_user_id" TEXT;

ALTER TABLE "crm_conversation"
  ADD COLUMN IF NOT EXISTS "business_unit_code" TEXT,
  ADD COLUMN IF NOT EXISTS "business_unit_name" TEXT;

CREATE INDEX IF NOT EXISTS "crm_conversation_company_id_business_unit_code_idx"
  ON "crm_conversation" ("company_id", "business_unit_code");

COMMIT;
