ALTER TABLE "project_timesheet"
  ADD COLUMN IF NOT EXISTS "overtime_started_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "overtime_ended_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "evidence_url" TEXT;

