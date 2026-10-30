ALTER TABLE "crm_activity"
  ADD COLUMN "meeting_minutes_id" TEXT;

CREATE INDEX "crm_activity_company_meeting_minutes_idx"
  ON "crm_activity"("company_id", "meeting_minutes_id");
