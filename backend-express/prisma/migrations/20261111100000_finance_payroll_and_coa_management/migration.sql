BEGIN;

ALTER TABLE "master_employee"
  ADD COLUMN IF NOT EXISTS "employee_name" TEXT,
  ADD COLUMN IF NOT EXISTS "monthly_salary" DECIMAL(18,2);

CREATE TABLE IF NOT EXISTS "fin_payroll_run" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT,
  "company_id" TEXT NOT NULL,
  "run_number" TEXT NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "payment_date" DATE,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "gross_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "deduction_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "employer_contribution_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "net_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "journal_entry_id" TEXT,
  "payment_journal_entry_id" TEXT,
  "bank_account_id" TEXT,
  "created_by_id" TEXT,
  "approved_by_id" TEXT,
  "approved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fin_payroll_run_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "fin_payroll_line" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT,
  "company_id" TEXT NOT NULL,
  "payroll_run_id" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "employee_number" TEXT NOT NULL,
  "employee_name" TEXT NOT NULL,
  "cost_center_id" TEXT,
  "gross_salary" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "allowances" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "employee_tax" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "employee_bpjs" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "employer_bpjs" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "net_salary" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fin_payroll_line_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fin_payroll_line_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "fin_payroll_run"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "fin_payroll_run_company_number_key" ON "fin_payroll_run"("company_id", "run_number");
CREATE UNIQUE INDEX IF NOT EXISTS "fin_payroll_run_journal_entry_id_key" ON "fin_payroll_run"("journal_entry_id");
CREATE UNIQUE INDEX IF NOT EXISTS "fin_payroll_run_payment_journal_entry_id_key" ON "fin_payroll_run"("payment_journal_entry_id");
CREATE INDEX IF NOT EXISTS "fin_payroll_run_company_period_idx" ON "fin_payroll_run"("company_id", "period_start", "period_end");
CREATE UNIQUE INDEX IF NOT EXISTS "fin_payroll_line_run_employee_key" ON "fin_payroll_line"("payroll_run_id", "employee_id");
CREATE INDEX IF NOT EXISTS "fin_payroll_line_company_employee_idx" ON "fin_payroll_line"("company_id", "employee_id");

ALTER TABLE "master_employee" ADD COLUMN IF NOT EXISTS "cost_center_id" TEXT;

COMMIT;


