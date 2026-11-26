ALTER TABLE "master_employee"
  ADD COLUMN IF NOT EXISTS "overtime_hourly_rate" DECIMAL(18, 2);

CREATE TABLE IF NOT EXISTS "hr_company_overtime_setting" (
  "company_id" TEXT PRIMARY KEY,
  "tenant_id" TEXT,
  "default_overtime_hourly_rate" DECIMAL(18, 2),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
