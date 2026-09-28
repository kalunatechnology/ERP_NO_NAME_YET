-- Production-only additive migration for the Daily Task output comparison contract.
--
-- This migration is intentionally idempotent and data-preserving. It prepares
-- the production database before application code starts reading/writing the
-- new fields. Application deployment and database migration remain separate
-- release operations.

ALTER TABLE "project_daily_task"
  ADD COLUMN IF NOT EXISTS "output_target" TEXT,
  ADD COLUMN IF NOT EXISTS "output_similarity_score" DECIMAL,
  ADD COLUMN IF NOT EXISTS "output_review_category" TEXT;

-- Reconcile an environment where one or more columns may have been created
-- manually before this migration was registered in Prisma migration history.
UPDATE "project_daily_task"
SET
  "output_target" = COALESCE("output_target", ''),
  "output_similarity_score" = COALESCE("output_similarity_score", 0),
  "output_review_category" = COALESCE("output_review_category", 'NOT_EVALUATED')
WHERE
  "output_target" IS NULL
  OR "output_similarity_score" IS NULL
  OR "output_review_category" IS NULL;

ALTER TABLE "project_daily_task"
  ALTER COLUMN "output_target" SET DEFAULT '',
  ALTER COLUMN "output_target" SET NOT NULL,
  ALTER COLUMN "output_similarity_score" SET DEFAULT 0,
  ALTER COLUMN "output_similarity_score" SET NOT NULL,
  ALTER COLUMN "output_review_category" SET DEFAULT 'NOT_EVALUATED',
  ALTER COLUMN "output_review_category" SET NOT NULL;
