-- Persist the optional cost-owner organization selected for a Main Task.
-- Company/tenant ownership is validated by the project command handler.
ALTER TABLE "project_main_task"
    ADD COLUMN IF NOT EXISTS "cost_owner_division_id" TEXT;

CREATE INDEX IF NOT EXISTS "project_main_task_company_cost_owner_division_idx"
    ON "project_main_task"("company_id", "cost_owner_division_id");
