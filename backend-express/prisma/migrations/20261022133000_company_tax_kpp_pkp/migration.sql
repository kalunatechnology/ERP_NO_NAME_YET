-- AlterTable
ALTER TABLE "core_company"
  ADD COLUMN IF NOT EXISTS "kpp_name" TEXT,
  ADD COLUMN IF NOT EXISTS "pkp_status" TEXT;
