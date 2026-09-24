-- Q9: Company Admin may delegate read/write only for modules that Super Admin
-- has already activated for the target user's company. This table is an
-- explicit per-user override; it never enables a module for a company itself.
CREATE TABLE IF NOT EXISTS iam_user_module_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  module_code text NOT NULL,
  allow_read boolean NOT NULL DEFAULT false,
  allow_write boolean NOT NULL DEFAULT false,
  granted_by_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iam_user_module_access_user_module_key UNIQUE(user_id, module_code),
  CONSTRAINT iam_user_module_access_company_fk FOREIGN KEY (company_id) REFERENCES core_company(id) ON DELETE CASCADE,
  CONSTRAINT iam_user_module_access_user_fk FOREIGN KEY (user_id) REFERENCES iam_user(id) ON DELETE CASCADE,
  CONSTRAINT iam_user_module_access_write_requires_read_ck CHECK (NOT allow_write OR allow_read)
);
CREATE INDEX IF NOT EXISTS iam_user_module_access_tenant_company_user_idx
  ON iam_user_module_access(tenant_id, company_id, user_id);
