BEGIN;

-- The CRM origin-domain migration was recorded as applied in production, but
-- crm_feedback.origin_domain is missing from the physical schema. Keep this
-- forward repair additive and safe to retry; existing feedback rows are kept.
ALTER TABLE "crm_feedback"
  ADD COLUMN IF NOT EXISTS "origin_domain" TEXT;

COMMIT;
