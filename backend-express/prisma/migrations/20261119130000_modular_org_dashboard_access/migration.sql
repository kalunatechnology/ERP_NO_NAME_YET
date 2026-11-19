-- Modular Org Membership & Dashboard Access Migration (100% Additive & Backward-Compatible)

ALTER TABLE "core_department"
  ADD COLUMN IF NOT EXISTS "hierarchy_level" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "materialized_path" TEXT NOT NULL DEFAULT '/';

ALTER TABLE "core_department_module_access"
  ADD COLUMN IF NOT EXISTS "default_role_code" TEXT;

ALTER TABLE "iam_user"
  ADD COLUMN IF NOT EXISTS "reports_to_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "job_title" TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS "core_user_org_membership" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "unit_role" TEXT NOT NULL DEFAULT 'STAFF',
  "is_primary" BOOLEAN NOT NULL DEFAULT true,
  "allocation_pct" DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "core_user_org_membership_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "core_user_org_membership_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "core_department"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_core_user_org_membership"
  ON "core_user_org_membership"("company_id", "user_id", "department_id");
CREATE INDEX IF NOT EXISTS "idx_core_user_org_membership_user"
  ON "core_user_org_membership"("company_id", "user_id", "is_active");
CREATE INDEX IF NOT EXISTS "idx_core_user_org_membership_dept"
  ON "core_user_org_membership"("company_id", "department_id", "is_active");

CREATE TABLE IF NOT EXISTS "iam_user_dashboard_access" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT,
  "company_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "widget_code" TEXT NOT NULL,
  "is_enabled" BOOLEAN NOT NULL DEFAULT true,
  "granted_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "iam_user_dashboard_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_iam_user_dashboard_access"
  ON "iam_user_dashboard_access"("company_id", "user_id", "widget_code");
CREATE INDEX IF NOT EXISTS "idx_iam_user_dashboard_access_user"
  ON "iam_user_dashboard_access"("company_id", "user_id", "is_enabled");
