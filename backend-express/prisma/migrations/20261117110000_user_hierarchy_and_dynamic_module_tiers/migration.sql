-- 1. Konfigurasi 3-Tier Jabatan per Modul (Level 1 Head, Level 2 Supervisor, Level 3 Staff)
CREATE TABLE IF NOT EXISTS "iam_module_tier_config" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT,
  "company_id" TEXT NOT NULL,
  "module_code" TEXT NOT NULL,
  "tier_level" INTEGER NOT NULL,
  "custom_title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_iam_module_tier_config"
  ON "iam_module_tier_config" ("company_id", "module_code", "tier_level");
CREATE INDEX IF NOT EXISTS "idx_iam_module_tier_config_company"
  ON "iam_module_tier_config" ("tenant_id", "company_id", "module_code");

-- 2. Penugasan User Dinamis Multi-Modul & Independent Tier
CREATE TABLE IF NOT EXISTS "iam_user_module_assignment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT,
  "company_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "module_code" TEXT NOT NULL,
  "tier_level" INTEGER NOT NULL DEFAULT 3,
  "tier_config_id" TEXT,
  "position_title" TEXT NOT NULL DEFAULT '',
  "department_id" TEXT,
  "reports_to_user_id" TEXT,
  "data_scope" TEXT NOT NULL DEFAULT 'OWN',
  "permission_profile" TEXT NOT NULL DEFAULT 'STANDARD',
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "effective_from" TIMESTAMP(3),
  "effective_until" TIMESTAMP(3),
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_iam_user_module_assignment"
  ON "iam_user_module_assignment" ("company_id", "user_id", "module_code");
CREATE INDEX IF NOT EXISTS "idx_iam_user_module_assignment_lookup"
  ON "iam_user_module_assignment" ("company_id", "module_code", "tier_level", "status");
CREATE INDEX IF NOT EXISTS "idx_iam_user_module_assignment_user"
  ON "iam_user_module_assignment" ("user_id", "status");

-- 3. Permission Matrix per Tingkatan Modul
CREATE TABLE IF NOT EXISTS "iam_module_tier_permission" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT,
  "company_id" TEXT NOT NULL,
  "module_code" TEXT NOT NULL,
  "tier_level" INTEGER NOT NULL,
  "allow_read" BOOLEAN NOT NULL DEFAULT true,
  "allow_write" BOOLEAN NOT NULL DEFAULT true,
  "allow_approve" BOOLEAN NOT NULL DEFAULT false,
  "allow_delete" BOOLEAN NOT NULL DEFAULT false,
  "allow_manage_users" BOOLEAN NOT NULL DEFAULT false,
  "allow_export" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_iam_module_tier_permission"
  ON "iam_module_tier_permission" ("company_id", "module_code", "tier_level");
CREATE INDEX IF NOT EXISTS "idx_iam_module_tier_permission_company"
  ON "iam_module_tier_permission" ("company_id", "module_code");

-- 4. Granular Permission Override per User
CREATE TABLE IF NOT EXISTS "iam_user_permission_override" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT,
  "company_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "module_code" TEXT NOT NULL,
  "action_code" TEXT NOT NULL,
  "effect" TEXT NOT NULL DEFAULT 'ALLOW',
  "reason" TEXT NOT NULL DEFAULT '',
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_iam_user_permission_override"
  ON "iam_user_permission_override" ("company_id", "user_id", "module_code", "action_code");
CREATE INDEX IF NOT EXISTS "idx_iam_user_permission_override_user"
  ON "iam_user_permission_override" ("company_id", "user_id");

-- 5. Delegation of Authority (DoA) Berbatas Waktu & Plafon
CREATE TABLE IF NOT EXISTS "iam_approval_delegation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT,
  "company_id" TEXT NOT NULL,
  "delegator_user_id" TEXT NOT NULL,
  "delegate_user_id" TEXT NOT NULL,
  "module_code" TEXT NOT NULL,
  "max_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "reason" TEXT NOT NULL DEFAULT '',
  "valid_from" TIMESTAMP(3) NOT NULL,
  "valid_until" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_iam_approval_delegation_delegate"
  ON "iam_approval_delegation" ("company_id", "delegate_user_id", "module_code");

-- 6. Audit Trail Riwayat Penugasan & Promosi Jabatan
CREATE TABLE IF NOT EXISTS "iam_assignment_history" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT,
  "company_id" TEXT NOT NULL,
  "actor_id" TEXT,
  "target_user_id" TEXT NOT NULL,
  "module_code" TEXT NOT NULL DEFAULT '',
  "change_type" TEXT NOT NULL,
  "before_json" TEXT NOT NULL DEFAULT '{}',
  "after_json" TEXT NOT NULL DEFAULT '{}',
  "reason" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_iam_assignment_history_user"
  ON "iam_assignment_history" ("company_id", "target_user_id", "created_at");

-- 7. Cross-Module Interaction Capability
CREATE TABLE IF NOT EXISTS "iam_cross_module_capability" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT,
  "company_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "source_module_code" TEXT NOT NULL,
  "target_module_code" TEXT NOT NULL,
  "capability_code" TEXT NOT NULL,
  "allowed_actions" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_iam_cross_module_capability"
  ON "iam_cross_module_capability" ("company_id", "user_id", "source_module_code", "target_module_code", "capability_code");
CREATE INDEX IF NOT EXISTS "idx_iam_cross_module_capability_user"
  ON "iam_cross_module_capability" ("company_id", "user_id", "status");

