-- Forward repair for databases where the earlier conversion was marked applied
-- without executing its SQL. Keep historical migrations immutable.
-- Recheck physical types even when all previous migrations are recorded applied.
-- Baseline view_* placeholders may be physical tables. Preserve those tables
-- and their rows; only drop/recreate actual views, and create missing views.
-- Converge the legacy/master physical PostgreSQL schema to the established
-- production TEXT-backed identifier contract without changing identifier values.
--
-- Why this exists:
-- - production was baselined with Prisma String IDs stored as PostgreSQL TEXT;
-- - older master migrations created several of the same identifiers as UUID;
-- - raw SQL and cross-branch deployments therefore hit PostgreSQL 42883
--   (uuid = text) even though schema.prisma is shared.
--
-- Important:
-- - this is schema-only; it does not seed, truncate, copy, or rewrite business data;
-- - the migration is transactional, so a failure rolls all DDL back;
-- - reporting/AI views are dropped and recreated because PostgreSQL will not
--   ALTER the type of a column referenced by a view/rule.

BEGIN;

-- Views created by the legacy master history reference UUID-backed columns and
-- block ALTER COLUMN TYPE. Drop only repository-owned read views; they are
-- recreated at the end with the production TEXT contract.
DO $drop$ BEGIN IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='ai_crm_deals' AND c.relkind='v') THEN DROP VIEW ai_crm_deals; END IF; END $drop$;
DO $drop$ BEGIN IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='ai_finance_summary' AND c.relkind='v') THEN DROP VIEW ai_finance_summary; END IF; END $drop$;
DO $drop$ BEGIN IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='ai_project_finance_summary' AND c.relkind='v') THEN DROP VIEW ai_project_finance_summary; END IF; END $drop$;
DO $drop$ BEGIN IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='ai_project_tasks' AND c.relkind='v') THEN DROP VIEW ai_project_tasks; END IF; END $drop$;
DO $drop$ BEGIN IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='ai_projects' AND c.relkind='v') THEN DROP VIEW ai_projects; END IF; END $drop$;
DO $drop$ BEGIN IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='view_crm_sales_dashboard' AND c.relkind='v') THEN DROP VIEW view_crm_sales_dashboard; END IF; END $drop$;
DO $drop$ BEGIN IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='view_project_timeline_cost' AND c.relkind='v') THEN DROP VIEW view_project_timeline_cost; END IF; END $drop$;
DO $drop$ BEGIN IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='view_project_dashboard' AND c.relkind='v') THEN DROP VIEW view_project_dashboard; END IF; END $drop$;
DO $drop$ BEGIN IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='view_finance_main_dashboard' AND c.relkind='v') THEN DROP VIEW view_finance_main_dashboard; END IF; END $drop$;

-- Fail before changing tables if another view outside the repository-owned set
-- still depends on a UUID column. This keeps recovery deterministic instead of
-- failing halfway through a sequence of ALTER TABLE statements.
DO $$
DECLARE
  remaining_views text;
BEGIN
  SELECT string_agg(DISTINCT format('%I.%I', view_ns.nspname, view_cls.relname), ', ')
    INTO remaining_views
  FROM pg_depend dep
  JOIN pg_rewrite rewrite ON rewrite.oid = dep.objid
  JOIN pg_class view_cls ON view_cls.oid = rewrite.ev_class
  JOIN pg_namespace view_ns ON view_ns.oid = view_cls.relnamespace
  JOIN pg_attribute attr
    ON attr.attrelid = dep.refobjid
   AND attr.attnum = dep.refobjsubid
  WHERE dep.classid = 'pg_rewrite'::regclass
    AND dep.refclassid = 'pg_class'::regclass
    AND view_ns.nspname = 'public'
    AND view_cls.relkind IN ('v', 'm')
    AND attr.atttypid = 'uuid'::regtype;

  IF remaining_views IS NOT NULL THEN
    RAISE EXCEPTION 'UUID-to-TEXT convergence blocked by dependent view(s): %', remaining_views;
  END IF;
END $$;

-- Capture every FK that touches a UUID column on either side. Foreign keys must
-- be removed before the participating columns can be converted.
CREATE TEMP TABLE _erp_uuid_fk_restore ON COMMIT DROP AS
SELECT
  c.oid AS constraint_oid,
  c.conrelid AS table_oid,
  c.conname AS constraint_name,
  pg_get_constraintdef(c.oid, true) AS constraint_definition
FROM pg_constraint c
WHERE c.contype = 'f'
  AND c.connamespace = 'public'::regnamespace
  AND (
    EXISTS (
      SELECT 1
      FROM unnest(c.conkey) AS key(attnum)
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid
       AND a.attnum = key.attnum
      WHERE a.atttypid = 'uuid'::regtype
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(c.confkey) AS key(attnum)
      JOIN pg_attribute a
        ON a.attrelid = c.confrelid
       AND a.attnum = key.attnum
      WHERE a.atttypid = 'uuid'::regtype
    )
  );

DO $$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT * FROM _erp_uuid_fk_restore LOOP
    EXECUTE format(
      'ALTER TABLE %s DROP CONSTRAINT %I',
      item.table_oid::regclass,
      item.constraint_name
    );
  END LOOP;
END $$;

-- UUID-returning defaults cannot remain attached while a column changes to
-- TEXT. Preserve them and restore the same generation semantics as text.
CREATE TEMP TABLE _erp_uuid_default_restore ON COMMIT DROP AS
SELECT
  cls.oid AS table_oid,
  attr.attname AS column_name,
  pg_get_expr(def.adbin, def.adrelid) AS default_expression
FROM pg_attribute attr
JOIN pg_class cls ON cls.oid = attr.attrelid
JOIN pg_namespace ns ON ns.oid = cls.relnamespace
JOIN pg_attrdef def
  ON def.adrelid = attr.attrelid
 AND def.adnum = attr.attnum
WHERE ns.nspname = 'public'
  AND cls.relkind IN ('r', 'p')
  AND attr.attnum > 0
  AND NOT attr.attisdropped
  AND attr.atttypid = 'uuid'::regtype;

DO $$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT * FROM _erp_uuid_default_restore LOOP
    EXECUTE format(
      'ALTER TABLE %s ALTER COLUMN %I DROP DEFAULT',
      item.table_oid::regclass,
      item.column_name
    );
  END LOOP;
END $$;

-- schema.prisma has no @db.Uuid identifier fields. Normalize every remaining
-- application UUID column in public to the same TEXT storage used by the
-- production baseline. UUID values keep their canonical textual value.
DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT cls.oid AS table_oid, attr.attname AS column_name
    FROM pg_attribute attr
    JOIN pg_class cls ON cls.oid = attr.attrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE ns.nspname = 'public'
      AND cls.relkind IN ('r', 'p')
      AND attr.attnum > 0
      AND NOT attr.attisdropped
      AND attr.atttypid = 'uuid'::regtype
    ORDER BY cls.relname, attr.attnum
  LOOP
    EXECUTE format(
      'ALTER TABLE %s ALTER COLUMN %I TYPE text USING %I::text',
      item.table_oid::regclass,
      item.column_name,
      item.column_name
    );
  END LOOP;
END $$;

DO $$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT * FROM _erp_uuid_default_restore LOOP
    EXECUTE format(
      'ALTER TABLE %s ALTER COLUMN %I SET DEFAULT ((%s)::text)',
      item.table_oid::regclass,
      item.column_name,
      item.default_expression
    );
  END LOOP;
END $$;

-- Both sides of every captured FK now use TEXT, so the original definitions
-- can be restored verbatim, preserving delete/update actions and deferrability.
DO $$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT * FROM _erp_uuid_fk_restore ORDER BY constraint_oid LOOP
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I %s',
      item.table_oid::regclass,
      item.constraint_name,
      item.constraint_definition
    );
  END LOOP;
END $$;

-- Recreate repository-owned reporting projections using the TEXT ID contract.
DO $view$ BEGIN IF to_regclass('public.view_finance_main_dashboard') IS NULL THEN CREATE VIEW view_finance_main_dashboard AS
SELECT
  c.tenant_id,
  NULL::text AS created_by_id,
  NULL::timestamptz AS created_at,
  NULL::timestamptz AS updated_at,
  c.id AS company_id,
  CURRENT_TIMESTAMP AS calculated_at,
  COALESCE(b.revenue, 0) - COALESCE(e.cost, 0) AS profit_loss_amount,
  COALESCE(b.revenue, 0) - COALESCE(e.cost, 0) AS net_cashflow_amount,
  COALESCE(e.cost, 0) AS total_unit_hpp,
  0::integer AS active_alert_count,
  0::integer AS periodic_kpi_count
FROM core_company c
LEFT JOIN (
  SELECT company_id, SUM(total_amount) FILTER (WHERE status IN ('APPROVED','PAID','COMPLETED')) AS revenue
  FROM fin_billing_proposal GROUP BY company_id
) b ON b.company_id = c.id
LEFT JOIN (
  SELECT company_id, SUM(total_cost) FILTER (WHERE status IN ('VALIDATED','APPROVED')) AS cost
  FROM fin_project_cost_entry GROUP BY company_id
) e ON e.company_id = c.id; END IF; END $view$;

DO $view$ BEGIN IF to_regclass('public.view_project_dashboard') IS NULL THEN CREATE VIEW view_project_dashboard AS
SELECT
  p.tenant_id,
  p.company_id,
  p.created_by_id,
  p.created_at,
  p.updated_at,
  p.id AS project_id,
  CURRENT_TIMESTAMP AS calculated_at,
  COALESCE(p.progress_percent, 0) AS overall_kpi_score,
  COALESCE(p.progress_percent, 0) AS planned_progress_percent,
  COALESCE(p.progress_percent, 0) AS actual_progress_percent,
  p.health_status AS project_health_status,
  COALESCE(t.overdue_task_count, 0)::integer AS overdue_task_count,
  0::integer AS unread_notification_count
FROM project_project p
LEFT JOIN (
  SELECT project_id, COUNT(*) FILTER (
    WHERE planned_end_at < CURRENT_TIMESTAMP AND status NOT IN ('COMPLETED','DONE','CLOSED')
  ) AS overdue_task_count
  FROM project_task GROUP BY project_id
) t ON t.project_id = p.id; END IF; END $view$;

DO $view$ BEGIN IF to_regclass('public.view_project_timeline_cost') IS NULL THEN CREATE VIEW view_project_timeline_cost AS
SELECT
  p.tenant_id,
  p.company_id,
  p.created_by_id,
  p.created_at,
  p.updated_at,
  p.id AS project_id,
  CURRENT_TIMESTAMP AS calculated_at,
  COALESCE(t.labor_hours, 0) AS labor_hours,
  0::numeric AS machine_hours,
  COALESCE(e.labor_cost, 0) AS labor_cost,
  COALESCE(e.equipment_cost, 0) AS equipment_cost,
  COALESCE(e.material_cost, 0) AS material_cost,
  COALESCE(e.overhead_cost, 0) AS overhead_cost,
  COALESCE(e.total_actual_cost, 0) AS total_actual_cost
FROM project_project p
LEFT JOIN (
  SELECT project_id, SUM(COALESCE(actual_hours, 0)) AS labor_hours
  FROM project_task GROUP BY project_id
) t ON t.project_id = p.id
LEFT JOIN (
  SELECT project_id,
    SUM(total_cost) FILTER (WHERE upper(cost_element) LIKE '%LABOR%' OR upper(cost_element) LIKE '%TENAGA%') AS labor_cost,
    SUM(total_cost) FILTER (WHERE upper(cost_element) LIKE '%EQUIP%' OR upper(cost_element) LIKE '%MESIN%') AS equipment_cost,
    SUM(total_cost) FILTER (WHERE upper(cost_element) LIKE '%MATERIAL%') AS material_cost,
    SUM(total_cost) FILTER (WHERE upper(cost_element) LIKE '%OVERHEAD%') AS overhead_cost,
    SUM(total_cost) AS total_actual_cost
  FROM fin_project_cost_entry WHERE status IN ('VALIDATED','APPROVED') GROUP BY project_id
) e ON e.project_id = p.id; END IF; END $view$;

DO $view$ BEGIN IF to_regclass('public.view_crm_sales_dashboard') IS NULL THEN CREATE VIEW view_crm_sales_dashboard AS
SELECT
  c.tenant_id,
  NULL::text AS created_by_id,
  NULL::timestamptz AS created_at,
  NULL::timestamptz AS updated_at,
  c.id AS company_id,
  CURRENT_TIMESTAMP AS calculated_at,
  COALESCE(SUM(o.expected_amount * COALESCE(o.probability_percent, 0) / 100), 0) AS weighted_project_value,
  CASE WHEN COUNT(o.id) = 0 THEN 0::numeric
       ELSE COUNT(o.id) FILTER (WHERE o.status = 'WON')::numeric * 100 / COUNT(o.id) END AS win_rate_percent,
  COUNT(o.id) FILTER (WHERE upper(o.pipeline_stage) LIKE '%PROSPECT%')::integer AS prospect_count,
  COUNT(o.id) FILTER (WHERE upper(o.pipeline_stage) LIKE '%PITCH%')::integer AS pitch_count,
  COUNT(o.id) FILTER (WHERE o.status = 'WON' OR upper(o.pipeline_stage) LIKE '%CLOS%')::integer AS closing_count,
  CASE WHEN COALESCE(SUM(o.expected_amount), 0) = 0 THEN 0::numeric
       ELSE COALESCE(SUM(o.expected_margin), 0) * 100 / SUM(o.expected_amount) END AS offering_margin_percent
FROM core_company c
LEFT JOIN crm_opportunity o ON o.company_id = c.id
GROUP BY c.tenant_id, c.id; END IF; END $view$;

DO $view$ BEGIN IF to_regclass('public.ai_projects') IS NULL THEN CREATE VIEW ai_projects AS
SELECT p.id, p.tenant_id, p.company_id, p.project_code, p.project_name,
       p.project_manager_id, p.status, p.planned_start_date, p.planned_end_date,
       p.progress_percent, p.health_status
FROM project_project p; END IF; END $view$;

DO $view$ BEGIN IF to_regclass('public.ai_project_tasks') IS NULL THEN CREATE VIEW ai_project_tasks AS
SELECT t.id, t.tenant_id, t.company_id, t.project_id, t.parent_task_id,
       t.task_code, t.task_name, t.priority, t.planned_start_at, t.planned_end_at,
       t.progress_percent, t.status
FROM project_task t; END IF; END $view$;

DO $view$ BEGIN IF to_regclass('public.ai_project_finance_summary') IS NULL THEN CREATE VIEW ai_project_finance_summary AS
SELECT c.tenant_id, c.company_id, c.project_id,
       COALESCE(SUM(c.total_cost), 0) AS total_posted_cost,
       COUNT(*)::bigint AS posted_entry_count,
       MAX(c.transaction_date) AS latest_transaction_date
FROM fin_project_cost_entry c
WHERE c.status = 'POSTED'
GROUP BY c.tenant_id, c.company_id, c.project_id; END IF; END $view$;

DO $view$ BEGIN IF to_regclass('public.ai_finance_summary') IS NULL THEN CREATE VIEW ai_finance_summary AS
SELECT c.tenant_id, c.company_id,
       COALESCE(SUM(c.total_cost), 0) AS total_posted_cost,
       COUNT(DISTINCT c.project_id)::bigint AS project_count,
       MAX(c.transaction_date) AS latest_transaction_date
FROM fin_project_cost_entry c
WHERE c.status = 'POSTED'
GROUP BY c.tenant_id, c.company_id; END IF; END $view$;

DO $view$ BEGIN IF to_regclass('public.ai_crm_deals') IS NULL THEN CREATE VIEW ai_crm_deals AS
SELECT o.id, o.tenant_id, o.company_id, o.customer_party_id, o.owner_user_id,
       o.pipeline_stage, o.opportunity_name, o.probability_percent,
       o.expected_amount, o.expected_margin, o.expected_close_date, o.status
FROM crm_opportunity o; END IF; END $view$;

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

-- Fail closed if a UUID column survived. Production baseline and schema.prisma
-- intentionally use TEXT-backed identifiers.
DO $$
DECLARE
  remaining text;
BEGIN
  SELECT string_agg(format('%I.%I', table_name, column_name), ', ' ORDER BY table_name, ordinal_position)
    INTO remaining
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND data_type = 'uuid';

  IF remaining IS NOT NULL THEN
    RAISE EXCEPTION 'ERP schema normalization incomplete; UUID columns remain: %', remaining;
  END IF;
END $$;

COMMIT;
