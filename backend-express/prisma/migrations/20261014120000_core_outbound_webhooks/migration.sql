BEGIN;

CREATE TABLE IF NOT EXISTS "core_webhook_subscription" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "target_url" TEXT NOT NULL,
  "secret_encrypted" TEXT NOT NULL,
  "events" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "core_webhook_subscription_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "core_webhook_subscription_company_id_status_idx"
  ON "core_webhook_subscription"("company_id", "status");

CREATE TABLE IF NOT EXISTS "core_webhook_delivery_log" (
  "id" TEXT NOT NULL,
  "subscription_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "next_retry_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_by" TEXT,
  "lock_token" TEXT,
  "locked_until" TIMESTAMP(3),
  "http_status" INTEGER,
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "delivered_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "core_webhook_delivery_log_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "core_webhook_delivery_log_subscription_id_event_id_key"
  ON "core_webhook_delivery_log"("subscription_id", "event_id");
CREATE INDEX IF NOT EXISTS "core_webhook_delivery_log_status_next_retry_at_locked_until_idx"
  ON "core_webhook_delivery_log"("status", "next_retry_at", "locked_until");
CREATE INDEX IF NOT EXISTS "core_webhook_delivery_log_company_id_created_at_idx"
  ON "core_webhook_delivery_log"("company_id", "created_at");

COMMIT;
