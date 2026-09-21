-- Alter marbot_tenant_config to support the tenant provisioning lifecycle.
-- Kredensial dijadikan nullable karena status PROVISIONING belum memiliki key/secret,
-- dan ditambahkan fields sync_status, chatbot_tenant_id, active_key_id, last_synced_at, last_sync_error.

ALTER TABLE "marbot_tenant_config" ALTER COLUMN "chatbot_api_key" DROP NOT NULL;
ALTER TABLE "marbot_tenant_config" ALTER COLUMN "inbound_context_secret" DROP NOT NULL;
ALTER TABLE "marbot_tenant_config" ALTER COLUMN "outbound_tool_secret" DROP NOT NULL;

ALTER TABLE "marbot_tenant_config" ADD COLUMN IF NOT EXISTS "chatbot_tenant_id" TEXT;
ALTER TABLE "marbot_tenant_config" ADD COLUMN IF NOT EXISTS "active_key_id" TEXT;
ALTER TABLE "marbot_tenant_config" ADD COLUMN IF NOT EXISTS "sync_status" TEXT NOT NULL DEFAULT 'NOT_PROVISIONED';
ALTER TABLE "marbot_tenant_config" ADD COLUMN IF NOT EXISTS "last_synced_at" TIMESTAMP(3);
ALTER TABLE "marbot_tenant_config" ADD COLUMN IF NOT EXISTS "last_sync_error" TEXT;

CREATE INDEX IF NOT EXISTS "marbot_tenant_config_sync_status_idx" ON "marbot_tenant_config"("sync_status");

-- Backfill query (dalam deployment unit yang sama):
-- Semua baris tenant yang sudah memiliki kredensial lengkap ditandai sebagai ACTIVE.
UPDATE "marbot_tenant_config"
SET "sync_status" = 'ACTIVE'
WHERE "chatbot_api_key" IS NOT NULL
  AND "inbound_context_secret" IS NOT NULL
  AND "outbound_tool_secret" IS NOT NULL;
