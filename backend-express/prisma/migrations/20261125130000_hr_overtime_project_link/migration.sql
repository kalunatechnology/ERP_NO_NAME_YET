-- Keep project provenance on HR overtime requests created from assigned Staff timesheets.
-- Older installations create the HR table at runtime, so this migration safely
-- adds the column only when that table already exists; runtime DDL includes it
-- for databases where the table has not been created yet.
ALTER TABLE IF EXISTS "hr_overtime_request"
  ADD COLUMN IF NOT EXISTS "project_id" TEXT;
