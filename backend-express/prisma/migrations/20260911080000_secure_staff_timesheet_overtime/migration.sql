-- AlterTable master_employee
ALTER TABLE "master_employee" ADD COLUMN IF NOT EXISTS "user_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "master_employee_company_id_user_id_key" ON "master_employee"("company_id", "user_id");
CREATE INDEX IF NOT EXISTS "master_employee_tenant_id_company_id_user_id_idx" ON "master_employee"("tenant_id", "company_id", "user_id");

-- AlterTable project_timesheet
ALTER TABLE "project_timesheet" ADD COLUMN IF NOT EXISTS "overtime_hours" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "project_timesheet" ADD COLUMN IF NOT EXISTS "overtime_reason" TEXT;

-- CreateIndex on project_timesheet
CREATE INDEX IF NOT EXISTS "project_timesheet_tenant_id_company_id_project_id_employee_id_idx" ON "project_timesheet"("tenant_id", "company_id", "project_id", "employee_id");
CREATE INDEX IF NOT EXISTS "project_timesheet_tenant_id_company_id_approval_status_idx" ON "project_timesheet"("tenant_id", "company_id", "approval_status");
CREATE INDEX IF NOT EXISTS "project_timesheet_tenant_id_company_id_employee_id_work_date_idx" ON "project_timesheet"("tenant_id", "company_id", "employee_id", "work_date");

