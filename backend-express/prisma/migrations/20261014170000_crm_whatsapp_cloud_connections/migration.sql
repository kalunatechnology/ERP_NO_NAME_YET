BEGIN;

CREATE TABLE IF NOT EXISTS "crm_whatsapp_connection" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "waba_id" TEXT NOT NULL,
  "phone_number_id" TEXT NOT NULL,
  "display_phone_number" TEXT,
  "api_version" TEXT NOT NULL DEFAULT 'v25.0',
  "access_token_encrypted" TEXT NOT NULL,
  "app_secret_encrypted" TEXT NOT NULL,
  "verify_token_encrypted" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "last_verified_at" TIMESTAMP(3),
  "last_webhook_at" TIMESTAMP(3),
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_whatsapp_connection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "crm_whatsapp_connection_source_id_key"
  ON "crm_whatsapp_connection"("source_id");
CREATE UNIQUE INDEX IF NOT EXISTS "crm_whatsapp_connection_company_id_phone_number_id_key"
  ON "crm_whatsapp_connection"("company_id", "phone_number_id");
CREATE INDEX IF NOT EXISTS "crm_whatsapp_connection_company_id_status_idx"
  ON "crm_whatsapp_connection"("company_id", "status");

COMMIT;
