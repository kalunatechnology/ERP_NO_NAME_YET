-- AlterTable
ALTER TABLE "core_app_notification" ADD COLUMN IF NOT EXISTS "read_at" TIMESTAMP(3);
ALTER TABLE "core_app_notification" ADD COLUMN IF NOT EXISTS "reference_type" TEXT;
ALTER TABLE "core_app_notification" ADD COLUMN IF NOT EXISTS "reference_id" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "core_app_notification_recipient_id_is_read_idx" ON "core_app_notification"("recipient_id", "is_read");
