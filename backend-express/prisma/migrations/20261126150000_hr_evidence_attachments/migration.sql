ALTER TABLE IF EXISTS "hr_overtime_request"
  ADD COLUMN IF NOT EXISTS "evidence_url" TEXT;

ALTER TABLE "master_employee"
  ADD COLUMN IF NOT EXISTS "leave_hourly_rate" DECIMAL(18, 2);

ALTER TABLE "hr_company_overtime_setting"
  ADD COLUMN IF NOT EXISTS "default_leave_hourly_rate" DECIMAL(18, 2);

CREATE TABLE IF NOT EXISTS "hr_evidence_attachment" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "uploaded_by_id" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "file_size" INTEGER NOT NULL,
  "content" BYTEA NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "hr_evidence_attachment_company_created_idx"
  ON "hr_evidence_attachment" ("company_id", "created_at");
