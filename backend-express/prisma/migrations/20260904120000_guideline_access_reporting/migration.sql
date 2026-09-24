-- Links checklist records to daily tasks so progress can be derived instead of entered manually.
ALTER TABLE "project_control_item"
  ADD COLUMN IF NOT EXISTS "daily_task_id" TEXT;

CREATE INDEX IF NOT EXISTS "project_control_item_daily_task_id_idx"
  ON "project_control_item"("daily_task_id");

-- Categorizes project costs by the company's organizational division.
ALTER TABLE "fin_project_cost_entry"
  ADD COLUMN IF NOT EXISTS "division_id" TEXT;

CREATE INDEX IF NOT EXISTS "fin_project_cost_entry_division_id_idx"
  ON "fin_project_cost_entry"("division_id");
