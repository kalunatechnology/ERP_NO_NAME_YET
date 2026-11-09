-- 1. Enum untuk 3 Level Role Utama di setiap Departemen / Divisi
DO $$ BEGIN
    CREATE TYPE "DepartmentRoleLevel" AS ENUM ('GM', 'SPV', 'STAFF');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Tabel Master Departemen & Divisi sekaligus Cost Center
CREATE TABLE IF NOT EXISTS "core_department" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "company_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "unit_type" TEXT NOT NULL DEFAULT 'DEPARTMENT',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "manager_user_id" TEXT,
    "is_cost_center" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_department_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_core_dept_company" FOREIGN KEY ("company_id") REFERENCES "core_company"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_core_dept_parent" FOREIGN KEY ("parent_id") REFERENCES "core_department"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_core_department_code" ON "core_department"("company_id", "code");
CREATE INDEX IF NOT EXISTS "idx_core_department_company_active" ON "core_department"("company_id", "is_active");
CREATE INDEX IF NOT EXISTS "idx_core_department_parent" ON "core_department"("company_id", "parent_id");

-- 3. Tabel Delegasi Modul per Departemen / Divisi (Diatur oleh Company Admin / Super Admin)
CREATE TABLE IF NOT EXISTS "core_department_module_access" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "module_key" TEXT NOT NULL,
    "can_read" BOOLEAN NOT NULL DEFAULT true,
    "can_write" BOOLEAN NOT NULL DEFAULT true,
    "can_approve" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_department_module_access_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_dept_mod_department" FOREIGN KEY ("department_id") REFERENCES "core_department"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_dept_module_key" ON "core_department_module_access"("department_id", "module_key");
CREATE INDEX IF NOT EXISTS "idx_dept_mod_company" ON "core_department_module_access"("company_id", "department_id");

-- 4. Tambahkan atribut department_id dan role_level pada tabel user (iam_user)
ALTER TABLE "iam_user"
  ADD COLUMN IF NOT EXISTS "department_id" TEXT,
  ADD COLUMN IF NOT EXISTS "role_level" "DepartmentRoleLevel" NOT NULL DEFAULT 'STAFF';

DO $$ BEGIN
    ALTER TABLE "iam_user"
      ADD CONSTRAINT "fk_iam_user_core_department"
      FOREIGN KEY ("department_id") REFERENCES "core_department"("id") ON DELETE SET NULL;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "idx_iam_user_department_role" ON "iam_user"("department_id", "role_level");

-- 5. Tambahkan referensi anggaran & departemen pada request_ticket serta CRM
ALTER TABLE "request_ticket"
  ADD COLUMN IF NOT EXISTS "department_id" TEXT,
  ADD COLUMN IF NOT EXISTS "cost_center_id" TEXT,
  ADD COLUMN IF NOT EXISTS "budget_allocation_id" TEXT,
  ADD COLUMN IF NOT EXISTS "budget_reservation_id" TEXT;

ALTER TABLE "crm_customer_inquiry"
  ADD COLUMN IF NOT EXISTS "department_id" TEXT;

ALTER TABLE "crm_opportunity"
  ADD COLUMN IF NOT EXISTS "department_id" TEXT;

-- 6. Seed 4 Departemen & Cost Center Standar untuk seluruh Company yang ada
INSERT INTO "core_department" ("id", "tenant_id", "company_id", "unit_type", "code", "name", "description", "is_cost_center", "is_active", "created_at", "updated_at")
SELECT
    md5(c.id || ':DEPT:' || v.code),
    c.tenant_id,
    c.id,
    'DEPARTMENT',
    v.code,
    v.name,
    v.description,
    true,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "core_company" c
CROSS JOIN (
    VALUES
        ('SALES', 'Sales & Marketing', 'Departemen Penjualan, Kualifikasi Lead, dan Pemasaran'),
        ('FIN', 'Finance & Accounting', 'Departemen Keuangan, Akuntansi, dan Pengendalian Anggaran'),
        ('OPS', 'Project & Operations', 'Departemen Eksekusi Proyek, Pengadaan, dan Operasional'),
        ('IT', 'IT & Engineering', 'Departemen Teknologi Informasi, Sistem, dan Engineering')
) AS v(code, name, description)
ON CONFLICT ("company_id", "code") DO NOTHING;

-- Sinkronkan ke master_department & master_cost_center agar relasi lama tetap konsisten
INSERT INTO "master_department" ("id", "tenant_id", "company_id", "department_code", "department_name", "status", "created_at", "updated_at")
SELECT
    d.id,
    d.tenant_id,
    d.company_id,
    d.code,
    d.name,
    CASE WHEN d.is_active THEN 'ACTIVE' ELSE 'INACTIVE' END,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "core_department" d
WHERE NOT EXISTS (
    SELECT 1 FROM "master_department" md
    WHERE md.company_id = d.company_id AND UPPER(md.department_code) = UPPER(d.code)
)
ON CONFLICT DO NOTHING;

INSERT INTO "master_cost_center" ("id", "tenant_id", "company_id", "cost_center_code", "cost_center_name", "status", "created_at", "updated_at")
SELECT
    d.id,
    d.tenant_id,
    d.company_id,
    d.code,
    d.name,
    CASE WHEN d.is_active THEN 'ACTIVE' ELSE 'INACTIVE' END,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "core_department" d
WHERE d.is_cost_center = true
  AND NOT EXISTS (
    SELECT 1 FROM "master_cost_center" mcc
    WHERE mcc.company_id = d.company_id AND UPPER(mcc.cost_center_code) = UPPER(d.code)
)
ON CONFLICT DO NOTHING;

-- Seed default delegasi modul per departemen standar
INSERT INTO "core_department_module_access" ("id", "company_id", "department_id", "module_key", "can_read", "can_write", "can_approve")
SELECT
    md5(d.id || ':MOD:' || m.module_key),
    d.company_id,
    d.id,
    m.module_key,
    true,
    true,
    false
FROM "core_department" d
JOIN (
    VALUES
        ('SALES', 'CRM'),
        ('SALES', 'SALES'),
        ('SALES', 'REQUESTS'),
        ('FIN', 'FINANCE'),
        ('FIN', 'REPORTING'),
        ('FIN', 'REQUESTS'),
        ('OPS', 'PROJECTS'),
        ('OPS', 'PROCUREMENT'),
        ('OPS', 'INVENTORY'),
        ('OPS', 'LOGISTICS'),
        ('OPS', 'REQUESTS'),
        ('IT', 'PROJECTS'),
        ('IT', 'SERVICE'),
        ('IT', 'ASSETS'),
        ('IT', 'REQUESTS')
) AS m(dept_code, module_key) ON d.code = m.dept_code
ON CONFLICT ("department_id", "module_key") DO NOTHING;

