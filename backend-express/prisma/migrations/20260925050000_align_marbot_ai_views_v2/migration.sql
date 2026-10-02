-- Align ERP safe read views with Chatbot_Arsalynk Contract V2 resource policies.
-- The views retain tenant_id for mandatory server-side scoping even though it
-- is intentionally excluded from the model-visible allowed field list.

DROP VIEW IF EXISTS "ai_project_finance_summary";
DROP VIEW IF EXISTS "ai_finance_summary";
DROP VIEW IF EXISTS "ai_project_tasks";
DROP VIEW IF EXISTS "ai_crm_deals";
DROP VIEW IF EXISTS "ai_projects";

CREATE VIEW "ai_projects" AS
WITH posted_cost AS (
  SELECT tenant_id, company_id, project_id, SUM(total_cost) AS spent
  FROM "fin_project_cost_entry"
  WHERE status = 'POSTED'
  GROUP BY tenant_id, company_id, project_id
)
SELECT
  p.id,
  p.tenant_id,
  p.company_id,
  p.project_name,
  p.project_code,
  p.status,
  p.progress_percent AS progress,
  p.planned_start_date AS start_date,
  p.planned_end_date AS end_date,
  p.planned_end_date AS deadline,
  p.customer_name AS client_name,
  p.budget_amount AS budget,
  COALESCE(pc.spent, 0) AS spent,
  p.created_at,
  p.updated_at
FROM "project_project" p
LEFT JOIN posted_cost pc
  ON pc.tenant_id IS NOT DISTINCT FROM p.tenant_id
 AND pc.company_id IS NOT DISTINCT FROM p.company_id
 AND pc.project_id = p.id;

CREATE VIEW "ai_project_tasks" AS
SELECT
  t.id,
  t.tenant_id,
  t.company_id,
  t.project_id,
  t.task_name AS title,
  t.status,
  t.priority,
  COALESCE(u.full_name, assignee_party.display_name, assignee_party.legal_name) AS assigned_to_name,
  t.planned_end_at AS due_date,
  t.actual_end_at AS completed_at,
  t.created_at
FROM "project_task" t
LEFT JOIN "iam_user" u ON u.id = t.assigned_to_id
LEFT JOIN "master_employee" employee ON employee.id = t.assigned_to_id
LEFT JOIN "master_party" assignee_party ON assignee_party.id = employee.party_id;

CREATE VIEW "ai_project_finance_summary" AS
SELECT
  p.id,
  p.tenant_id,
  p.company_id,
  p.id AS project_id,
  p.project_name,
  COALESCE(TO_CHAR(MAX(c.transaction_date), 'YYYY-MM'), TO_CHAR(CURRENT_DATE, 'YYYY-MM')) AS period,
  p.budget_amount AS budget,
  COALESCE(SUM(c.total_cost) FILTER (WHERE c.status = 'POSTED'), 0) AS expense,
  p.contract_amount AS income,
  currency.currency_code AS currency,
  p.status,
  p.created_at
FROM "project_project" p
LEFT JOIN "fin_project_cost_entry" c
  ON c.tenant_id IS NOT DISTINCT FROM p.tenant_id
 AND c.company_id IS NOT DISTINCT FROM p.company_id
 AND c.project_id = p.id
LEFT JOIN "core_company" company ON company.id = p.company_id
LEFT JOIN "master_currency" currency ON currency.id = company.base_currency_id
GROUP BY p.id, p.tenant_id, p.company_id, p.project_name, p.budget_amount,
  p.contract_amount, currency.currency_code, p.status, p.created_at;

CREATE VIEW "ai_finance_summary" AS
SELECT
  CONCAT(c.company_id, ':', TO_CHAR(c.transaction_date, 'YYYY-MM')) AS id,
  c.tenant_id,
  c.company_id,
  TO_CHAR(c.transaction_date, 'YYYY-MM') AS period,
  0::numeric AS total_income,
  COALESCE(SUM(c.total_cost), 0) AS total_expense,
  currency.currency_code AS currency,
  'PROJECT_COST'::text AS category,
  'POSTED'::text AS status,
  MIN(c.created_at) AS created_at
FROM "fin_project_cost_entry" c
LEFT JOIN "core_company" company ON company.id = c.company_id
LEFT JOIN "master_currency" currency ON currency.id = company.base_currency_id
WHERE c.status = 'POSTED'
GROUP BY c.tenant_id, c.company_id, TO_CHAR(c.transaction_date, 'YYYY-MM'), currency.currency_code;

CREATE VIEW "ai_crm_deals" AS
SELECT
  o.id,
  o.tenant_id,
  o.company_id,
  o.opportunity_name AS deal_name,
  COALESCE(customer.display_name, customer.legal_name) AS client_name,
  o.pipeline_stage AS stage,
  o.expected_amount AS amount,
  COALESCE(customer_currency.currency_code, company_currency.currency_code) AS currency,
  o.expected_close_date,
  o.created_at
FROM "crm_opportunity" o
LEFT JOIN "master_party" customer ON customer.id = o.customer_party_id
LEFT JOIN "master_currency" customer_currency ON customer_currency.id = customer.default_currency_id
LEFT JOIN "core_company" company ON company.id = o.company_id
LEFT JOIN "master_currency" company_currency ON company_currency.id = company.base_currency_id;

REVOKE ALL ON ai_projects, ai_project_tasks, ai_project_finance_summary,
  ai_finance_summary, ai_crm_deals FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marbot_reader') THEN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO marbot_reader', current_database());
    ALTER ROLE marbot_reader SET default_transaction_read_only = on;
    ALTER ROLE marbot_reader SET statement_timeout = '5s';
    GRANT USAGE ON SCHEMA public TO marbot_reader;
    GRANT SELECT ON ai_projects, ai_project_tasks, ai_project_finance_summary,
      ai_finance_summary, ai_crm_deals TO marbot_reader;
  END IF;
END $$;
