ALTER TABLE "crm_customer_inquiry"
  ADD COLUMN "last_contacted_at" TIMESTAMPTZ,
  ADD COLUMN "last_contact_note" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "responded_at" TIMESTAMPTZ,
  ADD COLUMN "next_follow_up_at" TIMESTAMPTZ;

CREATE INDEX "crm_customer_inquiry_company_next_follow_up_idx"
  ON "crm_customer_inquiry"("company_id", "next_follow_up_at");

ALTER TABLE "crm_opportunity"
  ADD COLUMN "next_follow_up_at" TIMESTAMPTZ,
  ADD COLUMN "follow_up_reason" TEXT NOT NULL DEFAULT '';

CREATE INDEX "crm_opportunity_company_next_follow_up_idx"
  ON "crm_opportunity"("company_id", "next_follow_up_at");
