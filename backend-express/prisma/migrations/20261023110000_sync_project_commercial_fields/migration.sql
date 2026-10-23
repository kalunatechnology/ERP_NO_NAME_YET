-- Populate the project's revenue target from its confirmed CRM/Sales Order
-- source when the historical project has not yet received a contract amount.
UPDATE "project_project" AS project
SET "contract_amount" = sales_order."total_amount"
FROM "sales_order" AS sales_order
WHERE project."sales_order_id" = sales_order."id"
  AND project."company_id" = sales_order."company_id"
  AND project."contract_amount" IS NULL
  AND (project."source_type" IN ('CRM', 'SALES_ORDER') OR project."sales_order_id" IS NOT NULL);
