ALTER TABLE "request_meeting"
  ADD COLUMN "crm_opportunity_id" TEXT;

CREATE INDEX "request_meeting_company_crm_opportunity_idx"
  ON "request_meeting"("company_id", "crm_opportunity_id");
