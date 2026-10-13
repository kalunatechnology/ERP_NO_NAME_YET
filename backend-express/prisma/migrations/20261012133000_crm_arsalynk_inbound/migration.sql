BEGIN;

ALTER TABLE "crm_opportunity"
  ADD COLUMN IF NOT EXISTS "source_inquiry_id" TEXT;

-- Backfill the existing one-to-one inquiry link before enforcing the unique
-- source-inquiry guard. crm_customer_inquiry.opportunity_id is already unique.
UPDATE "crm_opportunity" AS opportunity
SET "source_inquiry_id" = inquiry.id
FROM "crm_customer_inquiry" AS inquiry
WHERE inquiry.opportunity_id = opportunity.id
  AND opportunity."source_inquiry_id" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "crm_opportunity_source_inquiry_id_key"
  ON "crm_opportunity" ("source_inquiry_id");

ALTER TABLE "crm_conversation"
  ADD COLUMN IF NOT EXISTS "inquiry_id" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "crm_conversation_inquiry_id_key"
  ON "crm_conversation" ("inquiry_id");

CREATE TABLE IF NOT EXISTS "core_integration_source" (
  "id" TEXT NOT NULL,
  "source_code" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "channel_type" TEXT NOT NULL,
  "channel_account_id" TEXT,
  "secret_encrypted" TEXT NOT NULL,
  "key_id" TEXT NOT NULL,
  "previous_secret_encrypted" TEXT,
  "previous_key_id" TEXT,
  "previous_valid_until" TIMESTAMP(3),
  "allowed_event_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3),
  CONSTRAINT "core_integration_source_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "core_integration_source_tenant_id_company_id_status_idx"
  ON "core_integration_source" ("tenant_id", "company_id", "status");

CREATE TABLE IF NOT EXISTS "crm_integration_event" (
  "id" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "schema_version" INTEGER NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "payload" JSONB,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 12,
  "locked_by" TEXT,
  "lock_token" TEXT,
  "locked_until" TIMESTAMP(3),
  "next_retry_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_error" TEXT,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_integration_event_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_integration_event_source_id_event_id_key"
  ON "crm_integration_event" ("source_id", "event_id");
CREATE INDEX IF NOT EXISTS "crm_integration_event_status_next_retry_at_locked_until_idx"
  ON "crm_integration_event" ("status", "next_retry_at", "locked_until");

CREATE TABLE IF NOT EXISTS "crm_integration_nonce" (
  "id" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_integration_nonce_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_integration_nonce_source_id_nonce_key"
  ON "crm_integration_nonce" ("source_id", "nonce");
CREATE INDEX IF NOT EXISTS "crm_integration_nonce_expires_at_idx"
  ON "crm_integration_nonce" ("expires_at");

CREATE TABLE IF NOT EXISTS "crm_external_thread" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "integration_source_id" TEXT NOT NULL,
  "channel_account_id" TEXT NOT NULL,
  "external_thread_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "link_method" TEXT NOT NULL,
  "link_evidence" TEXT,
  "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "linked_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_external_thread_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_external_thread_integration_source_id_channel_account_id_external_thread_id_key"
  ON "crm_external_thread" ("integration_source_id", "channel_account_id", "external_thread_id");
CREATE INDEX IF NOT EXISTS "crm_external_thread_tenant_id_company_id_conversation_id_idx"
  ON "crm_external_thread" ("tenant_id", "company_id", "conversation_id");

CREATE TABLE IF NOT EXISTS "crm_external_identity" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "integration_source_id" TEXT NOT NULL,
  "channel_account_id" TEXT NOT NULL,
  "identity_type" TEXT NOT NULL,
  "normalized_value" TEXT NOT NULL,
  "channel_verification_status" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  "customer_match_status" TEXT NOT NULL DEFAULT 'UNMATCHED',
  "verification_method" TEXT,
  "verified_at" TIMESTAMP(3),
  "verified_by_id" TEXT,
  "party_id" TEXT,
  "contact_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_external_identity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_external_identity_source_channel_type_value_key"
  ON "crm_external_identity" ("integration_source_id", "channel_account_id", "identity_type", "normalized_value");
CREATE INDEX IF NOT EXISTS "crm_external_identity_tenant_id_company_id_customer_match_status_idx"
  ON "crm_external_identity" ("tenant_id", "company_id", "customer_match_status");

CREATE TABLE IF NOT EXISTS "crm_external_thread_identity" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "thread_link_id" TEXT NOT NULL,
  "external_identity_id" TEXT NOT NULL,
  "participant_role" TEXT NOT NULL DEFAULT 'CUSTOMER',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_external_thread_identity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_external_thread_identity_thread_link_id_external_identity_id_key"
  ON "crm_external_thread_identity" ("thread_link_id", "external_identity_id");
CREATE INDEX IF NOT EXISTS "crm_external_thread_identity_tenant_id_company_id_identity_id_idx"
  ON "crm_external_thread_identity" ("tenant_id", "company_id", "external_identity_id");

CREATE TABLE IF NOT EXISTS "crm_external_message" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "integration_source_id" TEXT NOT NULL,
  "channel_account_id" TEXT NOT NULL,
  "external_message_id" TEXT NOT NULL,
  "message_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_external_message_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_external_message_source_channel_external_id_key"
  ON "crm_external_message" ("integration_source_id", "channel_account_id", "external_message_id");
CREATE UNIQUE INDEX IF NOT EXISTS "crm_external_message_message_id_key"
  ON "crm_external_message" ("message_id");
CREATE INDEX IF NOT EXISTS "crm_external_message_tenant_id_company_id_idx"
  ON "crm_external_message" ("tenant_id", "company_id");

CREATE TABLE IF NOT EXISTS "crm_deal_handoff" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "opportunity_id" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "credit_snapshot_id" TEXT NOT NULL,
  "sales_order_id" TEXT,
  "project_id" TEXT,
  "proforma_invoice_id" TEXT,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_deal_handoff_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_deal_handoff_opportunity_id_key"
  ON "crm_deal_handoff" ("opportunity_id");
CREATE INDEX IF NOT EXISTS "crm_deal_handoff_tenant_id_company_id_idx"
  ON "crm_deal_handoff" ("tenant_id", "company_id");

COMMIT;
