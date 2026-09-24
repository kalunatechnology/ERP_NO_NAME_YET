-- Reconcile the paid/demo entitlement contract for PT Coba Arsalynk.
-- The original entitlement migration intentionally created every module as
-- disabled, while the canonical seed later established these six modules as
-- the Ghost company's approved package. Production deploys run migrations but
-- do not run demo seeds, so keep that approved package consistent here too.
INSERT INTO iam_company_module_access (
  id,
  tenant_id,
  company_id,
  module_code,
  enabled,
  allow_read,
  allow_write,
  source
)
SELECT
  gen_random_uuid(),
  company.tenant_id,
  company.id,
  approved.module_code,
  true,
  true,
  true,
  'MIGRATION_DEFAULT'
FROM core_company AS company
CROSS JOIN unnest(ARRAY[
  'CORE',
  'REQUESTS',
  'CRM',
  'SALES',
  'PROJECTS',
  'FINANCE'
]) AS approved(module_code)
WHERE company.company_code = 'GHOST-ARSALYNK'
  AND company.tenant_id IS NOT NULL
ON CONFLICT (company_id, module_code) DO UPDATE
SET
  enabled = true,
  allow_read = true,
  allow_write = true,
  updated_at = now();
