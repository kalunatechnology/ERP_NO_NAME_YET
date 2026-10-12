-- Add the lifecycle metadata while keeping the legacy operational status intact.
-- `status` remains authoritative for execution gates (for example ON_HOLD),
-- while `lifecycle_status` records the commercial/project lifecycle stage.
BEGIN;

ALTER TABLE "project_project"
  ADD COLUMN IF NOT EXISTS "lifecycle_status" TEXT,
  ADD COLUMN IF NOT EXISTS "cancellation_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "stage_entered_at" TIMESTAMP(3);

-- Existing projects are already in execution. Derive the lifecycle stage from
-- each row's operational status, without changing that operational status.
-- The NULL timestamp guard makes a replay after rollout avoid resetting newer
-- projects that have already entered a lifecycle stage.
UPDATE "project_project"
SET
  "lifecycle_status" = CASE
    WHEN UPPER(COALESCE("status"::text, '')) IN ('COMPLETED', 'FINISHED', 'CLOSED') THEN 'CLOSED'
    WHEN UPPER(COALESCE("status"::text, '')) IN ('CANCELLED', 'CANCELED', 'LOST', 'REJECTED') THEN 'LOST'
    ELSE 'ACTIVE'
  END,
  "stage_entered_at" = COALESCE("stage_entered_at", CURRENT_TIMESTAMP)
WHERE "stage_entered_at" IS NULL;

ALTER TABLE "project_project"
  ALTER COLUMN "lifecycle_status" SET DEFAULT 'INCOMING',
  ALTER COLUMN "lifecycle_status" SET NOT NULL,
  ALTER COLUMN "stage_entered_at" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "stage_entered_at" SET NOT NULL;

-- Do not add a restrictive CHECK here yet. Existing DRF/Express lifecycle
-- handlers still write legacy values such as DRAFT, STARTED, and COMPLETED.
-- Enforce the canonical nine-stage vocabulary after those handlers are moved
-- to lifecycle_status transitions; the operational `status` stays separate.

COMMIT;
