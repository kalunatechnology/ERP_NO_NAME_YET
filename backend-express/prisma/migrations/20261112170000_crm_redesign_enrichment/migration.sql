-- Non-destructive enrichment for Marka ERP CRM Redesign (Companies, Contacts, Leads, Contracts)

ALTER TABLE "master_party"
  ADD COLUMN IF NOT EXISTS "industry" TEXT,
  ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "phone" TEXT,
  ADD COLUMN IF NOT EXISTS "city" TEXT,
  ADD COLUMN IF NOT EXISTS "website" TEXT,
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "owner_user_id" TEXT;

ALTER TABLE "master_contact"
  ADD COLUMN IF NOT EXISTS "department" TEXT,
  ADD COLUMN IF NOT EXISTS "contact_type" TEXT,
  ADD COLUMN IF NOT EXISTS "notes" TEXT;

ALTER TABLE "crm_customer_inquiry"
  ADD COLUMN IF NOT EXISTS "lead_source" TEXT,
  ADD COLUMN IF NOT EXISTS "interested_service" TEXT,
  ADD COLUMN IF NOT EXISTS "notes" TEXT;

ALTER TABLE "sales_contract"
  ADD COLUMN IF NOT EXISTS "contact_id" TEXT,
  ADD COLUMN IF NOT EXISTS "opportunity_id" TEXT,
  ADD COLUMN IF NOT EXISTS "project_id" TEXT,
  ADD COLUMN IF NOT EXISTS "contract_amount" DECIMAL(65, 30),
  ADD COLUMN IF NOT EXISTS "notes" TEXT;

