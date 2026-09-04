BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE iam_role_code AS ENUM (
    'ROLE-SUPER-ADMIN', 'ROLE-COMPANY-ADMIN', 'ROLE-DIRECTOR', 'ROLE-OM',
    'ROLE-PM', 'ROLE-SUPERVISOR', 'ROLE-CRM-LEAD', 'ROLE-SALES',
    'ROLE-FINANCE', 'ROLE-STAFF'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
DECLARE current_type text;
BEGIN
  SELECT data_type INTO current_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'iam_role' AND column_name = 'role_code';

  IF current_type <> 'USER-DEFINED' THEN
    ALTER TABLE iam_role ALTER COLUMN role_code TYPE iam_role_code USING (
      CASE role_code::text
        WHEN 'SUPER_ADMIN' THEN 'ROLE-SUPER-ADMIN'
        WHEN 'ROLE-SUPER-ADMIN' THEN 'ROLE-SUPER-ADMIN'
        WHEN 'ROLE-ADMIN' THEN 'ROLE-COMPANY-ADMIN'
        WHEN 'COMPANY_ADMIN' THEN 'ROLE-COMPANY-ADMIN'
        WHEN 'ROLE-COMPANY-ADMIN' THEN 'ROLE-COMPANY-ADMIN'
        WHEN 'DIRECTOR' THEN 'ROLE-DIRECTOR'
        WHEN 'EXECUTIVE' THEN 'ROLE-DIRECTOR'
        WHEN 'ROLE-DIRECTOR' THEN 'ROLE-DIRECTOR'
        WHEN 'MANAGER' THEN 'ROLE-OM'
        WHEN 'OPERATIONAL_MANAGER' THEN 'ROLE-OM'
        WHEN 'ROLE-OM' THEN 'ROLE-OM'
        WHEN 'PROJECT_MANAGER' THEN 'ROLE-PM'
        WHEN 'PROJECT_MANAGEMENT' THEN 'ROLE-PM'
        WHEN 'PROJECT_MANAGEMENT_TECHNICAL' THEN 'ROLE-PM'
        WHEN 'QUALITY_CONTROL' THEN 'ROLE-PM'
        WHEN 'WAREHOUSE' THEN 'ROLE-PM'
        WHEN 'PROJECT_ASSIGNEE' THEN 'ROLE-PM'
        WHEN 'ROLE-PM' THEN 'ROLE-PM'
        WHEN 'SUPERVISOR' THEN 'ROLE-SUPERVISOR'
        WHEN 'ROLE-SUPERVISOR' THEN 'ROLE-SUPERVISOR'
        WHEN 'CRM' THEN 'ROLE-CRM-LEAD'
        WHEN 'ROLE-CRM-LEAD' THEN 'ROLE-CRM-LEAD'
        WHEN 'SALES' THEN 'ROLE-SALES'
        WHEN 'ROLE-SALES' THEN 'ROLE-SALES'
        WHEN 'FINANCE' THEN 'ROLE-FINANCE'
        WHEN 'ACCOUNTING_FINANCE' THEN 'ROLE-FINANCE'
        WHEN 'ROLE-FINANCE' THEN 'ROLE-FINANCE'
        ELSE 'ROLE-STAFF'
      END::iam_role_code
    );
  END IF;
END $$;

ALTER TABLE iam_user ADD COLUMN IF NOT EXISTS active_role_id uuid;
ALTER TABLE iam_user_role ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE iam_user_role ADD COLUMN IF NOT EXISTS created_by_id uuid;
ALTER TABLE iam_user_role ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE iam_user_role ADD COLUMN IF NOT EXISTS updated_at timestamptz;
CREATE INDEX IF NOT EXISTS iam_user_role_tenant_company_idx ON iam_user_role(tenant_id, company_id);

CREATE TABLE IF NOT EXISTS iam_user_company_membership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_id uuid NOT NULL,
  user_id uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_by_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iam_user_company_membership_user_fk FOREIGN KEY (user_id) REFERENCES iam_user(id) ON DELETE CASCADE,
  CONSTRAINT iam_user_company_membership_company_fk FOREIGN KEY (company_id) REFERENCES core_company(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS iam_user_company_membership_tenant_company_idx
  ON iam_user_company_membership(tenant_id, company_id);

CREATE TABLE IF NOT EXISTS iam_company_module_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_id uuid NOT NULL,
  module_code text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  allow_read boolean NOT NULL DEFAULT false,
  allow_write boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'MANUAL',
  effective_from timestamptz,
  effective_until timestamptz,
  enabled_by_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iam_company_module_access_company_module_key UNIQUE(company_id, module_code),
  CONSTRAINT iam_company_module_access_company_fk FOREIGN KEY (company_id) REFERENCES core_company(id) ON DELETE CASCADE,
  CONSTRAINT iam_company_module_access_period_ck CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from)
);
CREATE INDEX IF NOT EXISTS iam_company_module_access_tenant_company_idx
  ON iam_company_module_access(tenant_id, company_id);

-- Create one canonical global Super Admin role for the approved dummy admin account.
INSERT INTO iam_role(id, tenant_id, role_code, role_name, description)
SELECT gen_random_uuid(), u.tenant_id, 'ROLE-SUPER-ADMIN'::iam_role_code,
       'Super Administrator', 'Global company governance and module entitlement administrator'
FROM iam_user u
WHERE lower(u.email) = 'dummy.admin@example.com'
  AND NOT EXISTS (
    SELECT 1 FROM iam_role r
    WHERE r.tenant_id IS NOT DISTINCT FROM u.tenant_id
      AND r.role_code = 'ROLE-SUPER-ADMIN'::iam_role_code
  );

UPDATE iam_user_role ur
SET role_id = r.id, company_id = NULL
FROM iam_user u, iam_role r
WHERE ur.user_id = u.id
  AND lower(u.email) = 'dummy.admin@example.com'
  AND r.tenant_id IS NOT DISTINCT FROM u.tenant_id
  AND r.role_code = 'ROLE-SUPER-ADMIN'::iam_role_code;

-- Prevent legacy SUPER_ADMIN assignments from granting global authority to any other account.
UPDATE iam_user_role ur
SET role_id = company_admin.id
FROM iam_user u, iam_role legacy_role, LATERAL (
  SELECT r.id
  FROM iam_role r
  WHERE r.tenant_id IS NOT DISTINCT FROM u.tenant_id
    AND r.role_code = 'ROLE-COMPANY-ADMIN'::iam_role_code
  ORDER BY r.id LIMIT 1
) company_admin
WHERE ur.user_id = u.id
  AND ur.role_id = legacy_role.id
  AND legacy_role.role_code = 'ROLE-SUPER-ADMIN'::iam_role_code
  AND lower(u.email) <> 'dummy.admin@example.com';

UPDATE iam_user
SET is_superuser = (lower(email) = 'dummy.admin@example.com'),
    is_staff = CASE WHEN lower(email) = 'dummy.admin@example.com' THEN true ELSE is_staff END;

-- Derive exactly one company membership from existing assignments, falling back to a company in the user's tenant.
INSERT INTO iam_user_company_membership(id, tenant_id, company_id, user_id, status)
SELECT gen_random_uuid(), u.tenant_id, COALESCE(assigned.company_id, fallback.id), u.id, 'ACTIVE'
FROM iam_user u
LEFT JOIN LATERAL (
  SELECT ur.company_id
  FROM iam_user_role ur
  WHERE ur.user_id = u.id AND ur.company_id IS NOT NULL
  GROUP BY ur.company_id
  ORDER BY count(*) DESC, ur.company_id
  LIMIT 1
) assigned ON true
LEFT JOIN LATERAL (
  SELECT c.id FROM core_company c
  WHERE c.tenant_id IS NOT DISTINCT FROM u.tenant_id
  ORDER BY c.id LIMIT 1
) fallback ON true
WHERE lower(u.email) <> 'dummy.admin@example.com'
  AND COALESCE(assigned.company_id, fallback.id) IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  company_id = EXCLUDED.company_id,
  status = 'ACTIVE',
  updated_at = now();

DELETE FROM iam_user_company_membership m
USING iam_user u
WHERE m.user_id = u.id AND lower(u.email) = 'dummy.admin@example.com';

UPDATE iam_user_role ur
SET company_id = m.company_id
FROM iam_user_company_membership m
WHERE ur.user_id = m.user_id;

UPDATE iam_user u
SET active_role_id = (
  SELECT ur.role_id
  FROM iam_user_role ur
  WHERE ur.user_id = u.id AND ur.role_id IS NOT NULL
  ORDER BY ur.id LIMIT 1
)
WHERE u.active_role_id IS NULL
  AND EXISTS (SELECT 1 FROM iam_user_role ur WHERE ur.user_id = u.id AND ur.role_id IS NOT NULL);

-- All paid modules start disabled until Super Admin enables them.
INSERT INTO iam_company_module_access(
  id, tenant_id, company_id, module_code, enabled, allow_read, allow_write, source
)
SELECT gen_random_uuid(), c.tenant_id, c.id, modules.code, false, false, false, 'MIGRATION_DEFAULT'
FROM core_company c
CROSS JOIN unnest(ARRAY[
  'CORE','REQUESTS','CRM','SALES','PROJECTS','FINANCE','PROCUREMENT','INVENTORY',
  'MANUFACTURING','QUALITY','ASSETS','SERVICE','LOGISTICS','ANALYTICS','IMPLEMENTATION','REPORTING'
]) AS modules(code)
WHERE c.tenant_id IS NOT NULL
ON CONFLICT (company_id, module_code) DO NOTHING;

-- Add uniform tenant/company/audit columns to application-owned tables without deleting legacy data.
DO $$
DECLARE t record; index_name text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^(core|iam|master|crm|sales|project|fin|proc|inv|mfg|qa|asset|service|logistics|analytics|implementation|reporting)_'
      AND tablename NOT IN (
        'core_tenant','core_company','core_document_template','core_document_template_version',
        'core_document_template_field','iam_user','iam_role','iam_permission',
        'iam_user_role','iam_user_company_membership','iam_company_module_access','master_currency'
      )
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id uuid', t.tablename);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS company_id uuid', t.tablename);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS created_by_id uuid', t.tablename);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now()', t.tablename);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at timestamptz', t.tablename);
    index_name := left(t.tablename, 45) || '_tenant_company_idx';
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (tenant_id, company_id)', index_name, t.tablename);
  END LOOP;
END $$;

-- Backfill tenant from known company. Rows that cannot be inferred safely remain NULL and fail closed in the API.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=tablename AND c.column_name='company_id')
      AND EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=tablename AND c.column_name='tenant_id')
  LOOP
    EXECUTE format(
      'UPDATE %I x SET tenant_id = c.tenant_id FROM core_company c WHERE x.company_id = c.id AND x.tenant_id IS NULL',
      t.tablename
    );
  END LOOP;
END $$;

COMMIT;
