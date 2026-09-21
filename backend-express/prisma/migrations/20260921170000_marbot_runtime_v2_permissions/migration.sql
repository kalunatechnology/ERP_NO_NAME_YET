ALTER TABLE "marbot_tenant_config"
  ADD COLUMN IF NOT EXISTS "provisioning_operation_id" TEXT,
  ADD COLUMN IF NOT EXISTS "contract_version" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS "runtime_context_version" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS "datasource_source_key" TEXT,
  ADD COLUMN IF NOT EXISTS "datasource_status" TEXT,
  ADD COLUMN IF NOT EXISTS "last_contract_sync_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "marbot_tenant_config_provisioning_operation_id_idx"
  ON "marbot_tenant_config"("provisioning_operation_id");

INSERT INTO "iam_permission" ("id", "permission_code", "module_code", "resource_name", "action_name")
VALUES
  (gen_random_uuid(), 'READ_PROJECT_FINANCE', 'FINANCE', 'PROJECT_FINANCE', 'READ'),
  (gen_random_uuid(), 'READ_COMPANY_FINANCE', 'FINANCE', 'COMPANY_FINANCE', 'READ'),
  (gen_random_uuid(), 'READ_CRM_DEALS', 'CRM', 'CRM_DEALS', 'READ')
ON CONFLICT ("permission_code") DO NOTHING;
