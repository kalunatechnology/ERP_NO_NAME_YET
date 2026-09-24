ALTER TABLE "project_timesheet"
  ADD COLUMN IF NOT EXISTS "work_started_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "work_ended_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_activity_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "attendance_source" TEXT DEFAULT 'WEB';

CREATE INDEX IF NOT EXISTS "project_timesheet_company_employee_work_started_idx"
  ON "project_timesheet" ("company_id", "employee_id", "work_started_at");
