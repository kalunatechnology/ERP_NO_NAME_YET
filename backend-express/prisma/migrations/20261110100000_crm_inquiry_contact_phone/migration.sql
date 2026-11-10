ALTER TABLE "crm_customer_inquiry"
ADD COLUMN IF NOT EXISTS "customer_phone" TEXT NOT NULL DEFAULT '';
