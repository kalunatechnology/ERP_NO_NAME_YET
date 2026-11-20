-- Every module entitlement uses module-scoped assignments. Existing global role
-- rows and legacy assignments remain stored for audit/compatibility, but do not
-- grant operational access after this cutover.
ALTER TABLE "iam_company_module_access"
  ADD COLUMN IF NOT EXISTS "access_mode" TEXT NOT NULL DEFAULT 'ASSIGNMENT';

UPDATE "iam_company_module_access"
SET "access_mode" = 'ASSIGNMENT';

CREATE TABLE IF NOT EXISTS "iam_module_role_profile" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "module_code" TEXT NOT NULL,
  "profile_code" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "legacy_role_code" TEXT,
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "iam_module_role_profile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_iam_module_role_profile_code"
  ON "iam_module_role_profile" ("company_id", "module_code", "profile_code");
CREATE INDEX IF NOT EXISTS "idx_iam_module_role_profile_lookup"
  ON "iam_module_role_profile" ("tenant_id", "company_id", "module_code", "is_active");

CREATE TABLE IF NOT EXISTS "iam_module_role_capability" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "profile_id" TEXT NOT NULL,
  "capability_code" TEXT NOT NULL,
  "effect" TEXT NOT NULL DEFAULT 'ALLOW',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "iam_module_role_capability_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "iam_module_role_capability_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "iam_module_role_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_iam_module_role_capability"
  ON "iam_module_role_capability" ("profile_id", "capability_code");
CREATE INDEX IF NOT EXISTS "idx_iam_module_role_capability_profile"
  ON "iam_module_role_capability" ("company_id", "profile_id");

ALTER TABLE "iam_user_module_assignment"
  ADD COLUMN IF NOT EXISTS "profile_id" TEXT,
  ADD COLUMN IF NOT EXISTS "profile_code" TEXT,
  ADD COLUMN IF NOT EXISTS "scope_resource_ids" JSONB;

ALTER TABLE "iam_user_module_assignment"
  DROP CONSTRAINT IF EXISTS "uq_iam_user_module_assignment";
DROP INDEX IF EXISTS "uq_iam_user_module_assignment";
CREATE INDEX IF NOT EXISTS "idx_iam_user_module_assignment_profile"
  ON "iam_user_module_assignment" ("company_id", "user_id", "module_code", "status");

ALTER TABLE "iam_user_module_assignment"
  ADD CONSTRAINT "iam_user_module_assignment_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "iam_module_role_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
