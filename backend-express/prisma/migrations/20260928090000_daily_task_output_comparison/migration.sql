ALTER TABLE "project_daily_task"
  ADD COLUMN "output_target" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "output_similarity_score" DECIMAL NOT NULL DEFAULT 0,
  ADD COLUMN "output_review_category" TEXT NOT NULL DEFAULT 'NOT_EVALUATED';
