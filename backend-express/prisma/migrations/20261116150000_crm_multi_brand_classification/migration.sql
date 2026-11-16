-- 1. Buat tabel induk klasifikasi Brand per Company
CREATE TABLE IF NOT EXISTS "master_brand" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT,
  "company_id" TEXT NOT NULL,
  "brand_code" TEXT NOT NULL,
  "brand_name" TEXT NOT NULL,
  "slug" TEXT,
  "description" TEXT NOT NULL DEFAULT '',
  "origin_domain" TEXT,
  "default_department_id" TEXT,
  "default_owner_user_id" TEXT,
  "color_hex" TEXT NOT NULL DEFAULT '#0876CD',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_master_brand_company_code"
  ON "master_brand" ("company_id", "brand_code");
CREATE INDEX IF NOT EXISTS "idx_master_brand_company_status"
  ON "master_brand" ("tenant_id", "company_id", "status");

-- 2. Tambahkan relasi klasifikasi brand_id ke seluruh tabel Request & Flow CRM
ALTER TABLE "core_integration_source" ADD COLUMN IF NOT EXISTS "brand_id" TEXT;
ALTER TABLE "crm_whatsapp_connection" ADD COLUMN IF NOT EXISTS "brand_id" TEXT;
ALTER TABLE "crm_conversation"        ADD COLUMN IF NOT EXISTS "brand_id" TEXT;
ALTER TABLE "crm_customer_inquiry"    ADD COLUMN IF NOT EXISTS "brand_id" TEXT;
ALTER TABLE "crm_lead"                ADD COLUMN IF NOT EXISTS "brand_id" TEXT;
ALTER TABLE "crm_opportunity"         ADD COLUMN IF NOT EXISTS "brand_id" TEXT;
ALTER TABLE "crm_cost_estimate"       ADD COLUMN IF NOT EXISTS "brand_id" TEXT;
ALTER TABLE "sales_quotation"         ADD COLUMN IF NOT EXISTS "brand_id" TEXT;
ALTER TABLE "sales_contract"          ADD COLUMN IF NOT EXISTS "brand_id" TEXT;
ALTER TABLE "sales_order"             ADD COLUMN IF NOT EXISTS "brand_id" TEXT;
ALTER TABLE "crm_deal_handoff"        ADD COLUMN IF NOT EXISTS "brand_id" TEXT;
ALTER TABLE "project_project"         ADD COLUMN IF NOT EXISTS "brand_id" TEXT;
ALTER TABLE "service_case"            ADD COLUMN IF NOT EXISTS "brand_id" TEXT;
ALTER TABLE "crm_feedback"            ADD COLUMN IF NOT EXISTS "brand_id" TEXT;
ALTER TABLE "crm_survey_response"     ADD COLUMN IF NOT EXISTS "brand_id" TEXT;
ALTER TABLE "master_party"            ADD COLUMN IF NOT EXISTS "brand_id" TEXT;
ALTER TABLE "master_contact"          ADD COLUMN IF NOT EXISTS "brand_id" TEXT;
ALTER TABLE "request_ticket"          ADD COLUMN IF NOT EXISTS "brand_id" TEXT;
ALTER TABLE "request_meeting"         ADD COLUMN IF NOT EXISTS "brand_id" TEXT;

-- 3. Composite index untuk percepatan SELECT filter per Brand di dalam Company
CREATE INDEX IF NOT EXISTS "idx_crm_inquiry_company_brand"     ON "crm_customer_inquiry" ("company_id", "brand_id");
CREATE INDEX IF NOT EXISTS "idx_crm_opp_company_brand"         ON "crm_opportunity" ("company_id", "brand_id");
CREATE INDEX IF NOT EXISTS "idx_crm_estimate_company_brand"    ON "crm_cost_estimate" ("company_id", "brand_id");
CREATE INDEX IF NOT EXISTS "idx_sales_quotation_company_brand" ON "sales_quotation" ("company_id", "brand_id");
CREATE INDEX IF NOT EXISTS "idx_sales_contract_company_brand"  ON "sales_contract" ("company_id", "brand_id");
CREATE INDEX IF NOT EXISTS "idx_sales_order_company_brand"     ON "sales_order" ("company_id", "brand_id");
CREATE INDEX IF NOT EXISTS "idx_crm_conv_company_brand"        ON "crm_conversation" ("company_id", "brand_id");
CREATE INDEX IF NOT EXISTS "idx_service_case_company_brand"    ON "service_case" ("company_id", "brand_id");
CREATE INDEX IF NOT EXISTS "idx_master_party_company_brand"    ON "master_party" ("company_id", "brand_id");

