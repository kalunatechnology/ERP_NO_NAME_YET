-- Existing meetings remain non-recurring. No occurrence or empty minutes rows
-- are materialized; the application derives scheduled dates from this rule.
ALTER TABLE "request_meeting"
  ADD COLUMN IF NOT EXISTS "recurrence_type" TEXT NOT NULL DEFAULT 'NON_RECURRING',
  ADD COLUMN IF NOT EXISTS "recurrence_end_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "recurrence_days" INTEGER[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[];

-- Preserve every existing note by attaching it to the original meeting date.
ALTER TABLE "request_meeting_minutes" ADD COLUMN IF NOT EXISTS "occurrence_date" DATE;
UPDATE "request_meeting_minutes" AS minutes
SET "occurrence_date" = (meeting."start_at" AT TIME ZONE meeting."timezone")::date
FROM "request_meeting" AS meeting
WHERE minutes."meeting_id" = meeting."id" AND minutes."occurrence_date" IS NULL;
-- Defensive fallback for legacy orphan rows: preserve the row and anchor it to
-- its preparation date rather than deleting historical minutes.
UPDATE "request_meeting_minutes"
SET "occurrence_date" = "prepared_at"::date
WHERE "occurrence_date" IS NULL;
ALTER TABLE "request_meeting_minutes" ALTER COLUMN "occurrence_date" SET NOT NULL;

DROP INDEX IF EXISTS "request_meeting_minutes_meeting_id_version_number_key";
CREATE UNIQUE INDEX IF NOT EXISTS "request_meeting_minutes_meeting_id_occurrence_date_key"
  ON "request_meeting_minutes"("meeting_id", "occurrence_date");
