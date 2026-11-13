-- Add pipeline_position to crm_opportunity for persistent Kanban card ordering
ALTER TABLE "crm_opportunity" ADD COLUMN IF NOT EXISTS "pipeline_position" INTEGER NOT NULL DEFAULT 0;

