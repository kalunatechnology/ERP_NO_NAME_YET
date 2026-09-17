-- Persist the tenant-managed MarBot credentials introduced in schema.prisma.
CREATE TABLE IF NOT EXISTS "marbot_tenant_config" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "external_tenant_id" TEXT NOT NULL,
    "chatbot_url" TEXT NOT NULL,
    "chatbot_api_key" TEXT NOT NULL,
    "inbound_context_secret" TEXT NOT NULL,
    "outbound_tool_secret" TEXT NOT NULL,
    "role_map_json" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    CONSTRAINT "marbot_tenant_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "marbot_tenant_config_tenant_id_key"
    ON "marbot_tenant_config"("tenant_id");

-- Company code is a tenant-local business identifier. Abort with a readable
-- migration error if old data violates the contract instead of silently
-- leaving an unsafe race in application-level duplicate checks.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "core_company"
        WHERE "tenant_id" IS NOT NULL
        GROUP BY "tenant_id", UPPER("company_code")
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicate company_code exists within a tenant; clean the data before applying this migration.';
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "core_company_tenant_id_company_code_unique"
    ON "core_company"("tenant_id", UPPER("company_code"))
    WHERE "tenant_id" IS NOT NULL;
