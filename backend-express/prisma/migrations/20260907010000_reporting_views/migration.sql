-- Read-only reporting projections required by the Prisma reporting models.
-- Every view retains tenant/company keys so normal resource scoping applies.

CREATE OR REPLACE VIEW view_finance_main_dashboard AS
SELECT
  c.tenant_id,
  NULL::uuid AS created_by_id,
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
) e ON e.company_id = c.id;

CREATE OR REPLACE VIEW view_project_dashboard AS
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
) t ON t.project_id = p.id;

CREATE OR REPLACE VIEW view_project_timeline_cost AS
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
) e ON e.project_id = p.id;

CREATE OR REPLACE VIEW view_crm_sales_dashboard AS
SELECT
  c.tenant_id,
  NULL::uuid AS created_by_id,
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
GROUP BY c.tenant_id, c.id;
