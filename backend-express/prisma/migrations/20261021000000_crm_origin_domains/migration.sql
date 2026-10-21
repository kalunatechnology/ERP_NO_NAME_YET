BEGIN;

ALTER TABLE "core_integration_source"
  ADD COLUMN IF NOT EXISTS "allowed_origin_domains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "crm_customer_inquiry"
  ADD COLUMN IF NOT EXISTS "origin_domain" TEXT;

ALTER TABLE "crm_conversation"
  ADD COLUMN IF NOT EXISTS "origin_domain" TEXT;

ALTER TABLE "service_case"
  ADD COLUMN IF NOT EXISTS "origin_domain" TEXT;

ALTER TABLE "crm_survey_response"
  ADD COLUMN IF NOT EXISTS "origin_domain" TEXT;

COMMIT;
