CREATE OR REPLACE VIEW "ai_projects" AS
SELECT p.id, p.tenant_id, p.company_id, p.project_code, p.project_name,
       p.project_manager_id, p.status, p.planned_start_date, p.planned_end_date,
       p.progress_percent, p.health_status
FROM "project_project" p;

CREATE OR REPLACE VIEW "ai_project_tasks" AS
SELECT t.id, t.tenant_id, t.company_id, t.project_id, t.parent_task_id,
       t.task_code, t.task_name, t.priority, t.planned_start_at, t.planned_end_at,
       t.progress_percent, t.status
FROM "project_task" t;

CREATE OR REPLACE VIEW "ai_project_finance_summary" AS
SELECT c.tenant_id, c.company_id, c.project_id,
       COALESCE(SUM(c.total_cost), 0) AS total_posted_cost,
       COUNT(*)::bigint AS posted_entry_count,
       MAX(c.transaction_date) AS latest_transaction_date
FROM "fin_project_cost_entry" c
WHERE c.status = 'POSTED'
GROUP BY c.tenant_id, c.company_id, c.project_id;

CREATE OR REPLACE VIEW "ai_finance_summary" AS
SELECT c.tenant_id, c.company_id,
       COALESCE(SUM(c.total_cost), 0) AS total_posted_cost,
       COUNT(DISTINCT c.project_id)::bigint AS project_count,
       MAX(c.transaction_date) AS latest_transaction_date
FROM "fin_project_cost_entry" c
WHERE c.status = 'POSTED'
GROUP BY c.tenant_id, c.company_id;

CREATE OR REPLACE VIEW "ai_crm_deals" AS
SELECT o.id, o.tenant_id, o.company_id, o.customer_party_id, o.owner_user_id,
       o.pipeline_stage, o.opportunity_name, o.probability_percent,
       o.expected_amount, o.expected_margin, o.expected_close_date, o.status
FROM "crm_opportunity" o;

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
