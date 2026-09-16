-- Keep a single canonical assignment before enforcing request idempotency at
-- the database boundary. Existing references use the Main/assignee pair, not
-- the assignment row id, so retaining one deterministic canonical row is safe.
DELETE FROM "project_task_assignment" duplicate
USING "project_task_assignment" canonical
WHERE duplicate."company_id" IS NOT DISTINCT FROM canonical."company_id"
  AND duplicate."main_task_id" = canonical."main_task_id"
  AND duplicate."assignee_id" = canonical."assignee_id"
  AND duplicate."id" > canonical."id";

CREATE UNIQUE INDEX "project_task_assignment_company_id_main_task_id_assignee_id_key"
ON "project_task_assignment"("company_id", "main_task_id", "assignee_id");
