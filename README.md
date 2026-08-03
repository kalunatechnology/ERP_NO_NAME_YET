# ERP Database ERD — 100% Information Architecture

Versi pembaruan: 3 Agustus 2026. Struktur ini mempertahankan transactional core sebelumnya dan menambahkan seluruh lapisan yang terlihat pada PNG: akses bertingkat, limited information sharing, dashboard/KPI, notifikasi, project health, technical brief, recurring payment/order, document builder, omnichannel, delivery tracking, feedback center, serta roadmap implementasi.

```mermaid
erDiagram

    %% =========================================================
    %% CORE, MULTI-TENANCY, IAM, DOCUMENT, WORKFLOW, AUDIT
    %% =========================================================

    CORE_TENANT {
        uuid id PK
        string code UK
        string name
        string status
        datetime created_at
        datetime updated_at
    }

    CORE_COMPANY {
        uuid id PK
        uuid tenant_id FK
        string company_code
        string legal_name
        string tax_number
        uuid base_currency_id FK
        date fiscal_year_start
        string status
    }

    CORE_ORGANIZATION {
        uuid id PK
        uuid tenant_id FK
        uuid company_id FK
        uuid parent_id FK
        string organization_code
        string organization_name
        string organization_type
        string status
    }

    IAM_USER {
        uuid id PK
        uuid tenant_id FK
        string username UK
        string email UK
        string password_hash
        string full_name
        string status
        datetime last_login_at
    }

    IAM_ROLE {
        uuid id PK
        uuid tenant_id FK
        string role_code
        string role_name
        string description
    }

    IAM_PERMISSION {
        uuid id PK
        string permission_code UK
        string module_code
        string resource_name
        string action_name
    }

    IAM_USER_ROLE {
        uuid id PK
        uuid user_id FK
        uuid role_id FK
        uuid company_id FK
        uuid organization_id FK
    }

    IAM_ROLE_PERMISSION {
        uuid id PK
        uuid role_id FK
        uuid permission_id FK
        boolean allowed
    }

    CORE_BUSINESS_DOCUMENT {
        uuid id PK
        uuid tenant_id FK
        uuid company_id FK
        string document_type
        string document_number
        string status
        date document_date
        date posting_date
        int version
        uuid created_by FK
        uuid approved_by FK
        uuid posted_by FK
        uuid reversal_of_id FK
        datetime created_at
        datetime updated_at
    }

    CORE_DOCUMENT_LINK {
        uuid id PK
        uuid source_document_id FK
        uuid target_document_id FK
        string link_type
        datetime created_at
    }

    CORE_WORKFLOW_INSTANCE {
        uuid id PK
        uuid document_id FK
        string workflow_code
        string current_state
        string status
        datetime started_at
        datetime completed_at
    }

    CORE_WORKFLOW_APPROVAL {
        uuid id PK
        uuid workflow_instance_id FK
        uuid approver_user_id FK
        string approval_level
        string decision
        string remarks
        datetime decided_at
    }

    CORE_AUDIT_EVENT {
        uuid id PK
        uuid tenant_id FK
        uuid company_id FK
        uuid document_id FK
        uuid user_id FK
        string entity_name
        uuid entity_id
        string event_type
        json before_data
        json after_data
        datetime occurred_at
    }

    %% =========================================================
    %% SHARED MASTER DATA
    %% =========================================================

    MASTER_PARTY {
        uuid id PK
        uuid tenant_id FK
        string party_code
        string party_type
        string legal_name
        string display_name
        string tax_number
        uuid default_currency_id FK
        string status
    }

    MASTER_PARTY_ROLE {
        uuid id PK
        uuid party_id FK
        string role_type
        date valid_from
        date valid_to
        boolean active
    }

    MASTER_CONTACT {
        uuid id PK
        uuid party_id FK
        string contact_name
        string job_title
        string email
        string phone
        boolean primary_contact
    }

    MASTER_ADDRESS {
        uuid id PK
        uuid party_id FK
        string address_type
        string address_line
        string city
        string province
        string postal_code
        string country_code
        boolean primary_address
    }

    MASTER_CUSTOMER_PROFILE {
        uuid id PK
        uuid party_id FK
        string customer_code
        decimal credit_limit
        boolean credit_hold
        uuid payment_term_id FK
        uuid price_list_id
        uuid receivable_account_id FK
        string risk_category
    }

    MASTER_SUPPLIER_PROFILE {
        uuid id PK
        uuid party_id FK
        string supplier_code
        uuid payment_term_id FK
        int lead_time_days
        decimal minimum_order_value
        uuid payable_account_id FK
        boolean approved_supplier
    }

    MASTER_PRODUCT_CATEGORY {
        uuid id PK
        uuid tenant_id FK
        uuid parent_id FK
        string category_code
        string category_name
        string status
    }

    MASTER_UOM {
        uuid id PK
        uuid tenant_id FK
        string uom_code
        string uom_name
        string dimension_type
        boolean base_uom
    }

    MASTER_PRODUCT {
        uuid id PK
        uuid tenant_id FK
        uuid category_id FK
        uuid base_uom_id FK
        string product_code
        string product_name
        string product_type
        string costing_method
        boolean stock_item
        boolean purchase_item
        boolean sales_item
        boolean manufactured_item
        boolean lot_controlled
        boolean serial_controlled
        string status
    }

    MASTER_CURRENCY {
        uuid id PK
        string currency_code UK
        string currency_name
        string symbol
        int decimal_places
    }

    MASTER_EXCHANGE_RATE {
        uuid id PK
        uuid company_id FK
        uuid from_currency_id FK
        uuid to_currency_id FK
        date rate_date
        decimal exchange_rate
        string rate_source
    }

    MASTER_PAYMENT_TERM {
        uuid id PK
        uuid tenant_id FK
        string term_code
        string term_name
        int due_days
        decimal early_discount_percent
        int early_discount_days
    }

    MASTER_TAX_CODE {
        uuid id PK
        uuid tenant_id FK
        string tax_code
        string tax_name
        string tax_type
        decimal tax_rate
        date effective_from
        date effective_to
        uuid input_account_id FK
        uuid output_account_id FK
    }

    MASTER_COST_CENTER {
        uuid id PK
        uuid company_id FK
        uuid parent_id FK
        string cost_center_code
        string cost_center_name
        string status
    }

    MASTER_DEPARTMENT {
        uuid id PK
        uuid company_id FK
        uuid parent_id FK
        string department_code
        string department_name
        string status
    }

    MASTER_EMPLOYEE {
        uuid id PK
        uuid tenant_id FK
        uuid party_id FK
        uuid department_id FK
        string employee_number
        string employment_status
        decimal standard_hourly_rate
    }

    MASTER_WAREHOUSE {
        uuid id PK
        uuid company_id FK
        string warehouse_code
        string warehouse_name
        string warehouse_type
        string status
    }

    MASTER_WAREHOUSE_LOCATION {
        uuid id PK
        uuid warehouse_id FK
        uuid parent_id FK
        string location_code
        string location_name
        string location_type
        boolean quality_hold
        boolean active
    }

    MASTER_WORK_CENTER {
        uuid id PK
        uuid company_id FK
        string work_center_code
        string work_center_name
        decimal hourly_rate
        decimal capacity_per_day
        string status
    }

    MASTER_MACHINE {
        uuid id PK
        uuid company_id FK
        uuid work_center_id FK
        uuid asset_id FK
        string machine_code
        string machine_name
        decimal hourly_rate
        string status
    }

    %% =========================================================
    %% CRM
    %% =========================================================

    CRM_LEAD {
        uuid id PK
        uuid document_id FK
        uuid tenant_id FK
        uuid company_id FK
        uuid party_id FK
        uuid owner_user_id FK
        string lead_source
        string lead_status
        decimal estimated_value
        date expected_close_date
    }

    CRM_OPPORTUNITY {
        uuid id PK
        uuid document_id FK
        uuid customer_party_id FK
        uuid lead_id FK
        uuid owner_user_id FK
        string pipeline_stage
        decimal probability_percent
        decimal expected_amount
        decimal expected_margin
        date expected_close_date
        string status
    }

    CRM_OPPORTUNITY_PRODUCT {
        uuid id PK
        uuid opportunity_id FK
        uuid product_id FK
        decimal quantity
        uuid uom_id FK
        decimal estimated_unit_price
        decimal estimated_cost
    }

    CRM_ACTIVITY {
        uuid id PK
        uuid opportunity_id FK
        uuid party_id FK
        uuid assigned_user_id FK
        string activity_type
        string subject
        datetime scheduled_at
        datetime completed_at
        string status
    }

    %% =========================================================
    %% SALES, ESTIMATING, CONTRACT, DELIVERY
    %% =========================================================

    SALES_QUOTATION {
        uuid id PK
        uuid document_id FK
        uuid opportunity_id FK
        uuid customer_party_id FK
        uuid currency_id FK
        uuid payment_term_id FK
        date valid_until
        decimal subtotal
        decimal tax_amount
        decimal total_amount
        decimal estimated_total_cost
        decimal estimated_margin
        string status
    }

    SALES_QUOTATION_LINE {
        uuid id PK
        uuid quotation_id FK
        uuid product_id FK
        string description
        decimal quantity
        uuid uom_id FK
        decimal unit_price
        decimal discount_amount
        uuid tax_code_id FK
        decimal line_total
    }

    SALES_QUOTATION_COST {
        uuid id PK
        uuid quotation_line_id FK
        string cost_element
        decimal quantity
        decimal rate
        decimal amount
        string calculation_source
    }

    SALES_CONTRACT {
        uuid id PK
        uuid document_id FK
        uuid customer_party_id FK
        string contract_number
        date start_date
        date end_date
        string contract_type
        string billing_frequency
        string order_frequency
        string status
    }

    SALES_CONTRACT_LINE {
        uuid id PK
        uuid contract_id FK
        uuid product_id FK
        decimal contracted_quantity
        decimal unit_price
        uuid tax_code_id FK
        string recurrence_rule
    }

    SALES_ORDER {
        uuid id PK
        uuid document_id FK
        uuid quotation_id FK
        uuid contract_id FK
        uuid customer_party_id FK
        uuid currency_id FK
        uuid payment_term_id FK
        date order_date
        date requested_delivery_date
        decimal subtotal
        decimal tax_amount
        decimal total_amount
        string status
    }

    SALES_ORDER_LINE {
        uuid id PK
        uuid sales_order_id FK
        uuid product_id FK
        decimal ordered_quantity
        decimal delivered_quantity
        decimal invoiced_quantity
        uuid uom_id FK
        decimal unit_price
        uuid tax_code_id FK
        uuid project_id FK
        string fulfillment_method
    }

    SALES_DELIVERY {
        uuid id PK
        uuid document_id FK
        uuid sales_order_id FK
        uuid customer_party_id FK
        uuid warehouse_id FK
        date delivery_date
        string delivery_status
    }

    SALES_DELIVERY_LINE {
        uuid id PK
        uuid delivery_id FK
        uuid sales_order_line_id FK
        uuid product_id FK
        uuid lot_id FK
        uuid serial_number_id FK
        decimal quantity
        uuid uom_id FK
    }

    SALES_DEMAND_SUPPLY_LINK {
        uuid id PK
        uuid sales_order_line_id FK
        uuid project_id FK
        uuid production_order_id FK
        uuid purchase_order_line_id FK
        uuid stock_reservation_id FK
        decimal demand_quantity
        decimal allocated_quantity
        decimal fulfilled_quantity
        string status
    }

    %% =========================================================
    %% PROJECT MANAGEMENT
    %% =========================================================

    PROJECT_PROJECT {
        uuid id PK
        uuid document_id FK
        uuid tenant_id FK
        uuid company_id FK
        uuid customer_party_id FK
        uuid sales_order_id FK
        uuid project_manager_id FK
        uuid cost_center_id FK
        string project_code
        string project_name
        date planned_start_date
        date planned_end_date
        date actual_start_date
        date actual_end_date
        decimal budget_amount
        decimal progress_percent
        string status
    }

    PROJECT_MEMBER {
        uuid id PK
        uuid project_id FK
        uuid user_id FK
        uuid employee_id FK
        string project_role
        date joined_at
        date left_at
    }

    PROJECT_TASK {
        uuid id PK
        uuid project_id FK
        uuid parent_task_id FK
        uuid work_center_id FK
        uuid production_order_id FK
        string task_code
        string task_name
        datetime planned_start_at
        datetime planned_end_at
        datetime actual_start_at
        datetime actual_end_at
        decimal planned_hours
        decimal actual_hours
        decimal progress_percent
        string status
    }

    PROJECT_TASK_DEPENDENCY {
        uuid id PK
        uuid predecessor_task_id FK
        uuid successor_task_id FK
        string dependency_type
        int lag_minutes
    }

    PROJECT_MILESTONE {
        uuid id PK
        uuid project_id FK
        string milestone_name
        date planned_date
        date actual_date
        decimal weight_percent
        string status
    }

    PROJECT_MATERIAL_REQUIREMENT {
        uuid id PK
        uuid project_id FK
        uuid task_id FK
        uuid product_id FK
        uuid warehouse_id FK
        decimal required_quantity
        decimal reserved_quantity
        decimal issued_quantity
        date required_date
        string status
    }

    PROJECT_BUDGET_LINE {
        uuid id PK
        uuid project_id FK
        string cost_element
        uuid account_id FK
        uuid cost_center_id FK
        decimal budget_quantity
        decimal budget_rate
        decimal budget_amount
    }

    PROJECT_TIMESHEET {
        uuid id PK
        uuid project_id FK
        uuid task_id FK
        uuid employee_id FK
        date work_date
        decimal hours
        decimal hourly_rate
        decimal amount
        string approval_status
    }

    PROJECT_CHANGE_REQUEST {
        uuid id PK
        uuid document_id FK
        uuid project_id FK
        string change_type
        string description
        decimal schedule_impact_days
        decimal cost_impact
        string approval_status
    }

    %% =========================================================
    %% PROCUREMENT
    %% =========================================================

    PROC_PURCHASE_REQUISITION {
        uuid id PK
        uuid document_id FK
        uuid company_id FK
        uuid project_id FK
        uuid requested_by FK
        date request_date
        date required_date
        string status
    }

    PROC_PURCHASE_REQUISITION_LINE {
        uuid id PK
        uuid requisition_id FK
        uuid product_id FK
        decimal requested_quantity
        uuid uom_id FK
        uuid warehouse_id FK
        uuid project_material_requirement_id FK
    }

    PROC_RFQ {
        uuid id PK
        uuid document_id FK
        uuid requisition_id FK
        date issue_date
        date closing_date
        string status
    }

    PROC_SUPPLIER_QUOTATION {
        uuid id PK
        uuid document_id FK
        uuid rfq_id FK
        uuid supplier_party_id FK
        uuid currency_id FK
        date quotation_date
        date valid_until
        decimal total_amount
        string evaluation_status
    }

    PROC_PURCHASE_ORDER {
        uuid id PK
        uuid document_id FK
        uuid supplier_quotation_id FK
        uuid supplier_party_id FK
        uuid currency_id FK
        uuid payment_term_id FK
        date order_date
        date expected_receipt_date
        decimal subtotal
        decimal tax_amount
        decimal total_amount
        string status
    }

    PROC_PURCHASE_ORDER_LINE {
        uuid id PK
        uuid purchase_order_id FK
        uuid requisition_line_id FK
        uuid product_id FK
        decimal ordered_quantity
        decimal received_quantity
        decimal invoiced_quantity
        uuid uom_id FK
        decimal unit_price
        uuid tax_code_id FK
        uuid project_id FK
    }

    PROC_GOODS_RECEIPT {
        uuid id PK
        uuid document_id FK
        uuid purchase_order_id FK
        uuid supplier_party_id FK
        uuid warehouse_id FK
        date receipt_date
        string inspection_status
        string status
    }

    PROC_GOODS_RECEIPT_LINE {
        uuid id PK
        uuid goods_receipt_id FK
        uuid purchase_order_line_id FK
        uuid product_id FK
        uuid lot_id FK
        uuid serial_number_id FK
        decimal received_quantity
        decimal accepted_quantity
        decimal rejected_quantity
        uuid uom_id FK
    }

    PROC_THREE_WAY_MATCH {
        uuid id PK
        uuid purchase_order_id FK
        uuid goods_receipt_id FK
        uuid supplier_invoice_id FK
        decimal quantity_variance
        decimal price_variance
        decimal tax_variance
        string match_status
        uuid reviewed_by FK
        datetime reviewed_at
    }

    %% =========================================================
    %% INVENTORY AND WAREHOUSE
    %% =========================================================

    INV_LOT {
        uuid id PK
        uuid product_id FK
        string lot_number
        date manufacture_date
        date expiry_date
        string quality_status
    }

    INV_SERIAL_NUMBER {
        uuid id PK
        uuid product_id FK
        string serial_number UK
        uuid current_location_id FK
        string status
    }

    INV_STOCK_MOVE {
        uuid id PK
        uuid document_id FK
        uuid company_id FK
        string move_type
        uuid source_location_id FK
        uuid destination_location_id FK
        uuid project_id FK
        uuid production_order_id FK
        datetime scheduled_at
        datetime completed_at
        string status
    }

    INV_STOCK_MOVE_LINE {
        uuid id PK
        uuid stock_move_id FK
        uuid product_id FK
        uuid lot_id FK
        uuid serial_number_id FK
        decimal quantity
        uuid uom_id FK
        decimal unit_cost
        decimal total_value
    }

    INV_STOCK_RESERVATION {
        uuid id PK
        uuid product_id FK
        uuid warehouse_location_id FK
        uuid project_id FK
        uuid sales_order_line_id FK
        uuid production_order_id FK
        decimal reserved_quantity
        date required_date
        string status
    }

    INV_STOCK_LEDGER_ENTRY {
        uuid id PK
        uuid tenant_id FK
        uuid company_id FK
        uuid product_id FK
        uuid warehouse_location_id FK
        uuid lot_id FK
        uuid serial_number_id FK
        uuid source_document_id FK
        uuid source_line_id FK
        uuid project_id FK
        uuid production_order_id FK
        datetime posting_at
        decimal quantity_delta
        decimal value_delta
        decimal unit_cost
        decimal balance_quantity
        decimal balance_value
        uuid reversal_of_id FK
    }

    INV_STOCK_BALANCE {
        uuid id PK
        uuid company_id FK
        uuid product_id FK
        uuid warehouse_location_id FK
        uuid lot_id FK
        uuid serial_number_id FK
        decimal on_hand_quantity
        decimal reserved_quantity
        decimal available_quantity
        decimal inventory_value
        uuid last_ledger_entry_id FK
    }

    INV_VALUATION_LAYER {
        uuid id PK
        uuid product_id FK
        uuid warehouse_id FK
        uuid receipt_ledger_entry_id FK
        decimal original_quantity
        decimal remaining_quantity
        decimal unit_cost
        decimal remaining_value
        datetime received_at
    }

    INV_STOCK_COUNT {
        uuid id PK
        uuid document_id FK
        uuid warehouse_id FK
        date count_date
        string count_type
        string status
    }

    INV_STOCK_COUNT_LINE {
        uuid id PK
        uuid stock_count_id FK
        uuid product_id FK
        uuid location_id FK
        uuid lot_id FK
        decimal system_quantity
        decimal counted_quantity
        decimal variance_quantity
        decimal variance_value
    }

    %% =========================================================
    %% MANUFACTURING
    %% =========================================================

    MFG_BOM {
        uuid id PK
        uuid tenant_id FK
        uuid product_id FK
        string bom_code
        string status
    }

    MFG_BOM_VERSION {
        uuid id PK
        uuid bom_id FK
        int version_number
        date effective_from
        date effective_to
        decimal output_quantity
        uuid output_uom_id FK
        string status
    }

    MFG_BOM_LINE {
        uuid id PK
        uuid bom_version_id FK
        uuid component_product_id FK
        uuid operation_id FK
        decimal quantity
        uuid uom_id FK
        decimal scrap_percent
        string issue_method
    }

    MFG_ROUTING {
        uuid id PK
        uuid tenant_id FK
        string routing_code
        string routing_name
        string status
    }

    MFG_ROUTING_OPERATION {
        uuid id PK
        uuid routing_id FK
        uuid work_center_id FK
        int sequence_number
        string operation_name
        decimal setup_minutes
        decimal run_minutes_per_unit
    }

    MFG_PRODUCTION_ORDER {
        uuid id PK
        uuid document_id FK
        uuid company_id FK
        uuid product_id FK
        uuid bom_version_id FK
        uuid routing_id FK
        uuid project_id FK
        uuid sales_order_line_id FK
        uuid warehouse_id FK
        decimal planned_quantity
        decimal completed_quantity
        decimal scrapped_quantity
        datetime planned_start_at
        datetime planned_end_at
        datetime actual_start_at
        datetime actual_end_at
        string material_status
        string quality_status
        string status
    }

    MFG_PRODUCTION_MATERIAL {
        uuid id PK
        uuid production_order_id FK
        uuid product_id FK
        uuid warehouse_id FK
        decimal required_quantity
        decimal reserved_quantity
        decimal issued_quantity
        decimal returned_quantity
        decimal actual_cost
    }

    MFG_WORK_ORDER {
        uuid id PK
        uuid document_id FK
        uuid production_order_id FK
        uuid routing_operation_id FK
        uuid work_center_id FK
        uuid machine_id FK
        int sequence_number
        datetime planned_start_at
        datetime planned_end_at
        datetime actual_start_at
        datetime actual_end_at
        decimal planned_quantity
        decimal completed_quantity
        decimal rejected_quantity
        string status
    }

    MFG_LABOR_LOG {
        uuid id PK
        uuid work_order_id FK
        uuid employee_id FK
        uuid project_id FK
        datetime start_at
        datetime end_at
        decimal duration_hours
        decimal hourly_rate
        decimal labor_cost
    }

    MFG_MACHINE_LOG {
        uuid id PK
        uuid work_order_id FK
        uuid machine_id FK
        uuid project_id FK
        datetime start_at
        datetime end_at
        decimal run_hours
        decimal setup_hours
        decimal downtime_hours
        decimal hourly_rate
        decimal machine_cost
    }

    MFG_PRODUCTION_OUTPUT {
        uuid id PK
        uuid production_order_id FK
        uuid product_id FK
        uuid lot_id FK
        decimal output_quantity
        decimal unit_cost
        decimal total_cost
        uuid destination_location_id FK
        datetime produced_at
    }

    MFG_SCRAP {
        uuid id PK
        uuid production_order_id FK
        uuid work_order_id FK
        uuid product_id FK
        decimal scrap_quantity
        decimal scrap_value
        string reason_code
        string disposition
    }

    MFG_COST_LEDGER_ENTRY {
        uuid id PK
        uuid company_id FK
        uuid project_id FK
        uuid production_order_id FK
        uuid work_order_id FK
        uuid product_id FK
        string cost_element
        decimal quantity
        decimal rate
        decimal amount
        uuid stock_ledger_entry_id FK
        uuid journal_line_id FK
        uuid source_document_id FK
        datetime posting_at
        uuid reversal_of_id FK
    }

    %% =========================================================
    %% QUALITY ASSURANCE
    %% =========================================================

    QA_QUALITY_PLAN {
        uuid id PK
        uuid tenant_id FK
        uuid product_id FK
        string plan_code
        string inspection_stage
        string status
    }

    QA_QUALITY_PLAN_POINT {
        uuid id PK
        uuid quality_plan_id FK
        int sequence_number
        string parameter_name
        string measurement_type
        decimal minimum_value
        decimal maximum_value
        decimal target_value
        boolean mandatory
    }

    QA_INSPECTION {
        uuid id PK
        uuid document_id FK
        uuid quality_plan_id FK
        uuid product_id FK
        uuid lot_id FK
        uuid goods_receipt_id FK
        uuid production_order_id FK
        uuid work_order_id FK
        uuid inspector_user_id FK
        string inspection_type
        decimal quantity_inspected
        decimal quantity_accepted
        decimal quantity_rejected
        datetime inspection_at
        string result
        string status
    }

    QA_INSPECTION_RESULT {
        uuid id PK
        uuid inspection_id FK
        uuid plan_point_id FK
        decimal numeric_value
        string text_value
        boolean passed
        string remarks
    }

    QA_NONCONFORMANCE {
        uuid id PK
        uuid document_id FK
        uuid inspection_id FK
        string severity
        string description
        string disposition
        string status
    }

    QA_CORRECTIVE_ACTION {
        uuid id PK
        uuid nonconformance_id FK
        uuid assigned_user_id FK
        string action_description
        date due_date
        date completed_date
        string verification_result
        string status
    }

    %% =========================================================
    %% ACCOUNTING AND FINANCE
    %% =========================================================

    FIN_FISCAL_YEAR {
        uuid id PK
        uuid company_id FK
        string fiscal_year_name
        date start_date
        date end_date
        string status
    }

    FIN_FISCAL_PERIOD {
        uuid id PK
        uuid fiscal_year_id FK
        int period_number
        date start_date
        date end_date
        string status
    }

    FIN_ACCOUNT {
        uuid id PK
        uuid company_id FK
        uuid parent_account_id FK
        string account_code
        string account_name
        string account_type
        string normal_balance
        uuid currency_id FK
        boolean allow_manual_posting
        boolean reconciliation_required
        string status
    }

    FIN_JOURNAL {
        uuid id PK
        uuid company_id FK
        string journal_code
        string journal_name
        string journal_type
        string status
    }

    FIN_JOURNAL_ENTRY {
        uuid id PK
        uuid document_id FK
        uuid journal_id FK
        uuid fiscal_period_id FK
        uuid currency_id FK
        string entry_number
        date posting_date
        decimal exchange_rate
        string description
        uuid source_document_id FK
        uuid reversal_of_entry_id FK
        string status
    }

    FIN_JOURNAL_LINE {
        uuid id PK
        uuid journal_entry_id FK
        uuid account_id FK
        uuid party_id FK
        uuid project_id FK
        uuid cost_center_id FK
        uuid department_id FK
        uuid product_id FK
        uuid warehouse_id FK
        decimal debit_base
        decimal credit_base
        uuid transaction_currency_id FK
        decimal transaction_amount
        date due_date
        uuid source_document_line_id FK
    }

    FIN_BILLING_DOCUMENT {
        uuid id PK
        uuid document_id FK
        uuid company_id FK
        uuid party_id FK
        uuid currency_id FK
        uuid payment_term_id FK
        uuid sales_order_id FK
        uuid purchase_order_id FK
        uuid project_id FK
        string billing_type
        string invoice_number
        date invoice_date
        date posting_date
        date due_date
        decimal subtotal
        decimal tax_amount
        decimal total_amount
        decimal paid_amount
        decimal outstanding_amount
        string payment_status
        string status
    }

    FIN_BILLING_DOCUMENT_LINE {
        uuid id PK
        uuid billing_document_id FK
        uuid product_id FK
        uuid account_id FK
        uuid project_id FK
        uuid cost_center_id FK
        decimal quantity
        uuid uom_id FK
        decimal unit_price
        decimal discount_amount
        uuid tax_code_id FK
        decimal line_total
    }

    FIN_AR_AP_SCHEDULE {
        uuid id PK
        uuid billing_document_id FK
        int installment_number
        date due_date
        decimal original_amount
        decimal paid_amount
        decimal outstanding_amount
        string status
    }

    FIN_PAYMENT {
        uuid id PK
        uuid document_id FK
        uuid company_id FK
        uuid party_id FK
        uuid bank_account_id FK
        uuid currency_id FK
        string payment_type
        date payment_date
        decimal amount
        string payment_method
        string reference_number
        uuid journal_entry_id FK
        string status
    }

    FIN_PAYMENT_ALLOCATION {
        uuid id PK
        uuid payment_id FK
        uuid billing_document_id FK
        uuid schedule_id FK
        decimal allocated_amount
        decimal discount_amount
        decimal write_off_amount
        decimal exchange_difference
    }

    FIN_BANK_ACCOUNT {
        uuid id PK
        uuid company_id FK
        uuid party_id FK
        uuid ledger_account_id FK
        uuid currency_id FK
        string bank_name
        string account_number
        string account_name
        string status
    }

    FIN_BANK_STATEMENT {
        uuid id PK
        uuid bank_account_id FK
        date statement_date
        decimal opening_balance
        decimal closing_balance
        string status
    }

    FIN_BANK_STATEMENT_LINE {
        uuid id PK
        uuid bank_statement_id FK
        date transaction_date
        string reference_number
        string description
        decimal debit_amount
        decimal credit_amount
        decimal running_balance
    }

    FIN_BANK_RECONCILIATION {
        uuid id PK
        uuid bank_statement_line_id FK
        uuid payment_id FK
        uuid journal_line_id FK
        decimal matched_amount
        string match_type
        string status
    }

    FIN_TAX_TRANSACTION {
        uuid id PK
        uuid billing_document_id FK
        uuid billing_document_line_id FK
        uuid tax_code_id FK
        decimal taxable_amount
        decimal tax_rate
        decimal tax_amount
        string tax_direction
        date tax_date
    }

    FIN_BUDGET {
        uuid id PK
        uuid company_id FK
        uuid fiscal_year_id FK
        string budget_name
        string budget_type
        string status
    }

    FIN_BUDGET_LINE {
        uuid id PK
        uuid budget_id FK
        uuid account_id FK
        uuid project_id FK
        uuid cost_center_id FK
        uuid department_id FK
        int period_number
        decimal budget_amount
    }

    FIN_PERIOD_CLOSING {
        uuid id PK
        uuid document_id FK
        uuid fiscal_period_id FK
        uuid executed_by FK
        datetime started_at
        datetime completed_at
        string closing_type
        string status
    }

    %% =========================================================
    %% FIXED ASSETS
    %% =========================================================

    ASSET_CATEGORY {
        uuid id PK
        uuid company_id FK
        string category_code
        string category_name
        uuid asset_account_id FK
        uuid accumulated_depreciation_account_id FK
        uuid depreciation_expense_account_id FK
    }

    ASSET_ASSET {
        uuid id PK
        uuid document_id FK
        uuid company_id FK
        uuid category_id FK
        uuid supplier_party_id FK
        uuid warehouse_location_id FK
        uuid department_id FK
        uuid project_id FK
        string asset_code
        string asset_name
        string serial_number
        date acquisition_date
        date available_for_use_date
        decimal acquisition_cost
        decimal salvage_value
        int useful_life_months
        string status
    }

    ASSET_BOOK {
        uuid id PK
        uuid asset_id FK
        string book_type
        string depreciation_method
        decimal cost_basis
        decimal salvage_value
        int useful_life_periods
        date depreciation_start_date
        decimal accumulated_depreciation
        decimal net_book_value
    }

    ASSET_DEPRECIATION_LINE {
        uuid id PK
        uuid asset_book_id FK
        uuid fiscal_period_id FK
        date depreciation_date
        decimal opening_book_value
        decimal depreciation_amount
        decimal accumulated_depreciation
        decimal closing_book_value
        uuid journal_entry_id FK
        string status
    }

    ASSET_MAINTENANCE {
        uuid id PK
        uuid asset_id FK
        uuid machine_id FK
        date scheduled_date
        date completed_date
        string maintenance_type
        decimal maintenance_cost
        string status
    }

    ASSET_DISPOSAL {
        uuid id PK
        uuid document_id FK
        uuid asset_id FK
        date disposal_date
        decimal disposal_proceeds
        decimal net_book_value
        decimal gain_or_loss
        uuid journal_entry_id FK
        string status
    }

    %% =========================================================
    %% CUSTOMER SERVICE
    %% =========================================================

    SERVICE_CASE {
        uuid id PK
        uuid document_id FK
        uuid customer_party_id FK
        uuid contact_id FK
        uuid sales_order_id FK
        uuid billing_document_id FK
        uuid product_id FK
        uuid serial_number_id FK
        uuid assigned_user_id FK
        string priority
        string subject
        string description
        datetime sla_due_at
        datetime resolved_at
        string status
    }

    SERVICE_CASE_MESSAGE {
        uuid id PK
        uuid service_case_id FK
        uuid sender_user_id FK
        string channel
        string message_text
        datetime sent_at
    }

    SERVICE_CASE_APPROVAL {
        uuid id PK
        uuid service_case_id FK
        uuid approver_user_id FK
        string approval_type
        decimal approved_amount
        string decision
        datetime decided_at
    }

    SERVICE_RESOLUTION {
        uuid id PK
        uuid service_case_id FK
        string resolution_type
        string resolution_notes
        uuid credit_note_id FK
        uuid replacement_delivery_id FK
        datetime resolved_at
    }

    %% =========================================================
    %% ACCESS GOVERNANCE, ROLE HIERARCHY, DATA SCOPE, SHARING
    %% =========================================================

    IAM_ROLE_HIERARCHY {
        uuid id PK
        uuid parent_role_id FK
        uuid child_role_id FK
        string inheritance_mode
        boolean active
    }

    IAM_DATA_SCOPE_POLICY {
        uuid id PK
        uuid tenant_id FK
        string policy_code UK
        string module_code
        string entity_name
        string scope_type
        json condition_json
        boolean active
    }

    IAM_ROLE_DATA_SCOPE {
        uuid id PK
        uuid role_id FK
        uuid policy_id FK
        string access_level
        boolean can_export
        boolean can_share
    }

    IAM_FIELD_PERMISSION {
        uuid id PK
        uuid role_id FK
        string module_code
        string entity_name
        string field_name
        boolean can_view
        boolean can_edit
        string masking_type
    }

    IAM_INFORMATION_SHARE_RULE {
        uuid id PK
        uuid tenant_id FK
        string source_module_code
        string target_module_code
        string entity_name
        string field_set_code
        string share_direction
        json filter_json
        string access_level
        boolean active
    }

    IAM_APPROVAL_LIMIT {
        uuid id PK
        uuid role_id FK
        uuid user_id FK
        uuid currency_id FK
        string approval_type
        decimal minimum_amount
        decimal maximum_amount
        boolean active
    }

    IAM_USER_PROJECT_ACCESS {
        uuid id PK
        uuid user_id FK
        uuid project_id FK
        string project_role
        string access_level
        date valid_from
        date valid_to
    }

    %% =========================================================
    %% DASHBOARD, KPI, ANALYTICS, ALERT, NOTIFICATION, QUICK ACTION
    %% =========================================================

    ANALYTICS_DASHBOARD {
        uuid id PK
        uuid tenant_id FK
        uuid company_id FK
        string dashboard_code UK
        string dashboard_name
        string module_code
        string dashboard_type
        boolean realtime_enabled
        string status
    }

    ANALYTICS_DASHBOARD_ROLE {
        uuid id PK
        uuid dashboard_id FK
        uuid role_id FK
        boolean is_default
        boolean can_customize
    }

    ANALYTICS_WIDGET {
        uuid id PK
        uuid dashboard_id FK
        string widget_code
        string widget_name
        string widget_type
        string data_source_type
        string data_source_name
        json filter_json
        json layout_json
        int refresh_seconds
        boolean active
    }

    ANALYTICS_KPI_DEFINITION {
        uuid id PK
        uuid tenant_id FK
        string kpi_code UK
        string kpi_name
        string module_code
        string measurement_unit
        string aggregation_method
        string source_entity
        string formula_expression
        string period_type
        boolean active
    }

    ANALYTICS_KPI_TARGET {
        uuid id PK
        uuid kpi_definition_id FK
        uuid company_id FK
        uuid organization_id FK
        uuid project_id FK
        uuid owner_user_id FK
        date period_start
        date period_end
        decimal target_value
        decimal warning_value
        decimal critical_value
    }

    ANALYTICS_KPI_RESULT {
        uuid id PK
        uuid kpi_definition_id FK
        uuid company_id FK
        uuid organization_id FK
        uuid project_id FK
        uuid owner_user_id FK
        datetime measured_at
        decimal actual_value
        decimal target_value
        string health_status
        json dimension_json
    }

    ANALYTICS_ALERT_RULE {
        uuid id PK
        uuid tenant_id FK
        uuid kpi_definition_id FK
        string rule_code UK
        string module_code
        string entity_name
        string operator
        decimal threshold_value
        string severity
        json condition_json
        boolean active
    }

    ANALYTICS_ALERT_EVENT {
        uuid id PK
        uuid alert_rule_id FK
        uuid company_id FK
        uuid project_id FK
        uuid source_document_id FK
        uuid source_entity_id
        decimal measured_value
        string severity
        string message
        datetime triggered_at
        datetime acknowledged_at
        uuid acknowledged_by FK
        string status
    }

    CORE_NOTIFICATION {
        uuid id PK
        uuid tenant_id FK
        uuid company_id FK
        uuid source_document_id FK
        uuid alert_event_id FK
        string notification_type
        string title
        string message
        string action_url
        string priority
        datetime created_at
        datetime expires_at
    }

    CORE_NOTIFICATION_RECIPIENT {
        uuid id PK
        uuid notification_id FK
        uuid recipient_user_id FK
        uuid recipient_role_id FK
        datetime delivered_at
        datetime read_at
        datetime dismissed_at
        string delivery_status
    }

    CORE_QUICK_ACTION {
        uuid id PK
        uuid tenant_id FK
        string action_code UK
        string action_name
        string module_code
        string entity_name
        string route_path
        uuid required_permission_id FK
        json default_payload
        boolean active
    }

    %% =========================================================
    %% FILE, ATTACHMENT, TEMPLATE, DOCUMENT BUILDER, SIGNATURE
    %% =========================================================

    CORE_FILE {
        uuid id PK
        uuid tenant_id FK
        uuid company_id FK
        string file_name
        string storage_key
        string mime_type
        bigint file_size
        string checksum
        uuid uploaded_by FK
        datetime uploaded_at
        string status
    }

    CORE_DOCUMENT_ATTACHMENT {
        uuid id PK
        uuid document_id FK
        uuid file_id FK
        string attachment_type
        int sort_order
        boolean visible_to_customer
    }

    CORE_DOCUMENT_TEMPLATE {
        uuid id PK
        uuid tenant_id FK
        uuid company_id FK
        string template_code UK
        string template_name
        string document_type
        string output_format
        string status
    }

    CORE_DOCUMENT_TEMPLATE_VERSION {
        uuid id PK
        uuid template_id FK
        int version_number
        text header_markup
        text body_markup
        text footer_markup
        json style_json
        date effective_from
        date effective_to
        string status
    }

    CORE_DOCUMENT_TEMPLATE_FIELD {
        uuid id PK
        uuid template_version_id FK
        string field_code
        string source_path
        string field_type
        string format_pattern
        boolean required
        int sort_order
    }

    CORE_GENERATED_DOCUMENT {
        uuid id PK
        uuid business_document_id FK
        uuid template_version_id FK
        uuid file_id FK
        int generation_number
        string generation_status
        uuid generated_by FK
        datetime generated_at
    }

    CORE_DOCUMENT_SIGNATURE {
        uuid id PK
        uuid generated_document_id FK
        uuid signer_user_id FK
        uuid signer_party_id FK
        string signature_type
        string signature_status
        datetime requested_at
        datetime signed_at
        string verification_reference
    }

    %% =========================================================
    %% FINANCE DASHBOARD, HPP, RECURRING PAYMENT, CREDIT, WIP,
    %% PROJECT FUNDING, IDEAL VS ACTUAL COST, OVERHEAD
    %% =========================================================

    FIN_FINANCIAL_SNAPSHOT {
        uuid id PK
        uuid company_id FK
        uuid fiscal_period_id FK
        datetime snapshot_at
        decimal revenue_amount
        decimal expense_amount
        decimal profit_loss_amount
        decimal operating_cashflow
        decimal investing_cashflow
        decimal financing_cashflow
        decimal cash_balance
        string snapshot_status
    }

    FIN_UNIT_COST_SNAPSHOT {
        uuid id PK
        uuid company_id FK
        uuid project_id FK
        uuid production_order_id FK
        uuid product_id FK
        string cost_unit_code
        datetime snapshot_at
        decimal material_cost
        decimal labor_cost
        decimal machine_cost
        decimal overhead_cost
        decimal total_cost
        decimal output_quantity
        decimal unit_cost
    }

    FIN_RECURRING_PAYMENT_RULE {
        uuid id PK
        uuid company_id FK
        uuid party_id FK
        uuid bank_account_id FK
        uuid expense_account_id FK
        uuid currency_id FK
        string rule_code UK
        decimal amount
        string recurrence_rule
        date next_run_date
        date end_date
        boolean approval_required
        string status
    }

    FIN_RECURRING_PAYMENT_RUN {
        uuid id PK
        uuid recurring_rule_id FK
        uuid payment_id FK
        date scheduled_date
        datetime executed_at
        string run_status
        string failure_reason
    }

    FIN_CREDIT_FACILITY {
        uuid id PK
        uuid company_id FK
        uuid party_id FK
        uuid currency_id FK
        string facility_type
        string facility_number
        decimal credit_limit
        decimal utilized_amount
        decimal available_amount
        date effective_from
        date effective_to
        string status
    }

    FIN_PROJECT_WIP_SNAPSHOT {
        uuid id PK
        uuid project_id FK
        uuid fiscal_period_id FK
        date snapshot_date
        decimal completion_percent
        decimal recognized_revenue
        decimal recognized_cost
        decimal wip_asset_amount
        decimal accrued_billing_amount
        decimal unbilled_amount
        string status
    }

    FIN_PROJECT_FUNDING {
        uuid id PK
        uuid document_id FK
        uuid project_id FK
        uuid funding_source_party_id FK
        uuid currency_id FK
        string funding_type
        decimal approved_limit
        decimal interest_rate
        date start_date
        date maturity_date
        string status
    }

    FIN_PROJECT_FUNDING_TRANSACTION {
        uuid id PK
        uuid project_funding_id FK
        uuid payment_id FK
        uuid journal_entry_id FK
        string transaction_type
        date transaction_date
        decimal amount
        decimal outstanding_balance
    }

    FIN_COST_BASELINE {
        uuid id PK
        uuid document_id FK
        uuid project_id FK
        int baseline_version
        date effective_date
        decimal total_ideal_cost
        uuid approved_by FK
        string status
    }

    FIN_COST_BASELINE_LINE {
        uuid id PK
        uuid cost_baseline_id FK
        uuid product_id FK
        uuid account_id FK
        uuid cost_center_id FK
        string cost_element
        decimal quantity
        decimal unit_rate
        decimal ideal_amount
    }

    FIN_COST_VARIANCE {
        uuid id PK
        uuid project_id FK
        uuid cost_baseline_line_id FK
        uuid fiscal_period_id FK
        decimal actual_amount
        decimal ideal_amount
        decimal variance_amount
        decimal variance_percent
        datetime calculated_at
    }

    FIN_OVERHEAD_RULE {
        uuid id PK
        uuid company_id FK
        uuid source_account_id FK
        uuid target_cost_center_id FK
        string rule_code UK
        string allocation_basis
        decimal rate_percent
        date effective_from
        date effective_to
        string status
    }

    FIN_OVERHEAD_ALLOCATION {
        uuid id PK
        uuid overhead_rule_id FK
        uuid project_id FK
        uuid production_order_id FK
        uuid fiscal_period_id FK
        uuid journal_entry_id FK
        decimal basis_quantity
        decimal allocated_amount
        datetime posted_at
        string status
    }

    FIN_PROJECT_COST_SNAPSHOT {
        uuid id PK
        uuid project_id FK
        datetime snapshot_at
        decimal budget_amount
        decimal committed_cost
        decimal actual_cost
        decimal overhead_cost
        decimal forecast_cost
        decimal cost_variance
        decimal remaining_budget
    }

    %% =========================================================
    %% PROJECT DASHBOARD, HEALTH, KANBAN, TECHNICAL BRIEF,
    %% RESOURCE REQUEST, EXECUTION PROGRESS, TIMELINE AND COST
    %% =========================================================

    PROJECT_BOARD {
        uuid id PK
        uuid project_id FK
        string board_name
        string board_type
        boolean default_board
        string status
    }

    PROJECT_BOARD_COLUMN {
        uuid id PK
        uuid board_id FK
        string column_name
        string mapped_task_status
        int position_order
        int wip_limit
    }

    PROJECT_TASK_BOARD_POSITION {
        uuid id PK
        uuid task_id FK
        uuid board_column_id FK
        decimal position_order
        datetime moved_at
        uuid moved_by FK
    }

    PROJECT_HEALTH_RULE {
        uuid id PK
        uuid company_id FK
        string rule_code UK
        string health_dimension
        string operator
        decimal warning_threshold
        decimal critical_threshold
        decimal weight_percent
        boolean active
    }

    PROJECT_HEALTH_SNAPSHOT {
        uuid id PK
        uuid project_id FK
        datetime snapshot_at
        decimal schedule_score
        decimal cost_score
        decimal quality_score
        decimal resource_score
        decimal risk_score
        decimal overall_score
        string health_status
        json explanation_json
    }

    PROJECT_RISK {
        uuid id PK
        uuid document_id FK
        uuid project_id FK
        uuid owner_user_id FK
        string risk_code
        string risk_category
        string description
        int probability_score
        int impact_score
        int risk_score
        string mitigation_plan
        date due_date
        string status
    }

    PROJECT_ISSUE {
        uuid id PK
        uuid document_id FK
        uuid project_id FK
        uuid task_id FK
        uuid assigned_user_id FK
        string issue_type
        string severity
        string description
        date due_date
        datetime resolved_at
        string status
    }

    PROJECT_TECHNICAL_BRIEF {
        uuid id PK
        uuid document_id FK
        uuid project_id FK
        uuid sales_order_id FK
        string brief_number
        string brief_title
        text objective
        text scope_summary
        uuid owner_user_id FK
        string approval_status
        string status
    }

    PROJECT_TECHNICAL_BRIEF_VERSION {
        uuid id PK
        uuid technical_brief_id FK
        int version_number
        text specification_text
        json specification_json
        uuid file_id FK
        uuid created_by FK
        datetime created_at
        string status
    }

    PROJECT_REQUIREMENT {
        uuid id PK
        uuid technical_brief_id FK
        uuid parent_requirement_id FK
        string requirement_code
        string requirement_type
        string requirement_text
        string priority
        string verification_method
        string status
    }

    PROJECT_ACCEPTANCE_CRITERIA {
        uuid id PK
        uuid requirement_id FK
        string criteria_text
        string expected_result
        string actual_result
        boolean passed
        uuid verified_by FK
        datetime verified_at
    }

    PROJECT_RESOURCE_REQUEST {
        uuid id PK
        uuid document_id FK
        uuid project_id FK
        uuid task_id FK
        uuid requested_by FK
        date request_date
        date required_date
        string request_type
        string priority
        string approval_status
        string status
    }

    PROJECT_RESOURCE_REQUEST_LINE {
        uuid id PK
        uuid resource_request_id FK
        uuid product_id FK
        uuid employee_id FK
        uuid machine_id FK
        uuid work_center_id FK
        uuid uom_id FK
        string resource_type
        decimal requested_quantity
        decimal requested_hours
        string specification
    }

    PROJECT_RESOURCE_ALLOCATION {
        uuid id PK
        uuid resource_request_line_id FK
        uuid stock_reservation_id FK
        uuid employee_id FK
        uuid machine_id FK
        datetime allocation_start_at
        datetime allocation_end_at
        decimal allocated_quantity
        decimal allocated_hours
        decimal estimated_cost
        decimal actual_cost
        string status
    }

    PROJECT_PROGRESS_SNAPSHOT {
        uuid id PK
        uuid project_id FK
        uuid work_order_id FK
        datetime snapshot_at
        decimal planned_progress_percent
        decimal actual_progress_percent
        decimal earned_value
        decimal planned_value
        decimal actual_cost
        string progress_status
    }

    PROJECT_EQUIPMENT_USAGE {
        uuid id PK
        uuid project_id FK
        uuid task_id FK
        uuid machine_id FK
        uuid asset_id FK
        uuid employee_id FK
        datetime start_at
        datetime end_at
        decimal usage_hours
        decimal hourly_rate
        decimal total_cost
        string status
    }

    PROJECT_WEIGHT_INDICATOR {
        uuid id PK
        uuid project_id FK
        uuid opportunity_id FK
        uuid sales_order_id FK
        uuid currency_id FK
        decimal base_project_value
        decimal weight_percent
        decimal weighted_project_value
        datetime calculated_at
        string status
    }

    PROJECT_WEIGHT_COMPONENT {
        uuid id PK
        uuid project_weight_indicator_id FK
        string component_code
        string component_name
        decimal raw_value
        decimal normalized_score
        decimal component_weight
        decimal weighted_score
    }

    %% =========================================================
    %% SALES PIPELINE, EXECUTIVE APPROVAL, CREDIT STATUS,
    %% ORDER CHANGE, REPEAT ORDER AUTOMATION
    %% =========================================================

    CRM_PIPELINE {
        uuid id PK
        uuid tenant_id FK
        uuid company_id FK
        string pipeline_code UK
        string pipeline_name
        boolean default_pipeline
        string status
    }

    CRM_PIPELINE_STAGE {
        uuid id PK
        uuid pipeline_id FK
        string stage_code
        string stage_name
        int position_order
        decimal default_probability_percent
        boolean closed_won
        boolean closed_lost
        string status
    }

    CRM_OPPORTUNITY_STAGE_HISTORY {
        uuid id PK
        uuid opportunity_id FK
        uuid from_stage_id FK
        uuid to_stage_id FK
        uuid changed_by FK
        datetime changed_at
        string change_reason
    }

    CRM_EXECUTIVE_APPROVAL {
        uuid id PK
        uuid document_id FK
        uuid opportunity_id FK
        uuid quotation_id FK
        uuid contract_id FK
        uuid project_id FK
        uuid requested_by FK
        uuid approver_user_id FK
        string approval_type
        decimal requested_amount
        string decision
        string remarks
        datetime requested_at
        datetime decided_at
    }

    CRM_CREDIT_STATUS_SNAPSHOT {
        uuid id PK
        uuid customer_party_id FK
        uuid company_id FK
        datetime snapshot_at
        decimal credit_limit
        decimal outstanding_receivable
        decimal overdue_amount
        decimal available_credit
        string risk_category
        string credit_status
    }

    SALES_ORDER_CHANGE_REQUEST {
        uuid id PK
        uuid document_id FK
        uuid sales_order_id FK
        uuid project_id FK
        uuid requested_by FK
        string change_type
        string change_reason
        decimal value_impact
        int schedule_impact_days
        string approval_status
        string status
    }

    SALES_RECURRING_ORDER_RULE {
        uuid id PK
        uuid contract_id FK
        uuid customer_party_id FK
        uuid source_sales_order_id FK
        string recurrence_rule
        date next_order_date
        date end_date
        boolean auto_create
        boolean approval_required
        string status
    }

    SALES_RECURRING_ORDER_RUN {
        uuid id PK
        uuid recurring_order_rule_id FK
        uuid generated_sales_order_id FK
        date scheduled_date
        datetime generated_at
        string run_status
        string failure_reason
    }

    %% =========================================================
    %% OMNICHANNEL CUSTOMER ENGAGEMENT
    %% =========================================================

    CRM_CHANNEL_ACCOUNT {
        uuid id PK
        uuid tenant_id FK
        uuid company_id FK
        string channel_type
        string account_name
        string external_account_id
        string credential_reference
        boolean active
    }

    CRM_CONVERSATION {
        uuid id PK
        uuid channel_account_id FK
        uuid customer_party_id FK
        uuid contact_id FK
        uuid opportunity_id FK
        uuid service_case_id FK
        uuid assigned_user_id FK
        string external_conversation_id
        string subject
        datetime opened_at
        datetime closed_at
        string priority
        string status
    }

    CRM_CONVERSATION_PARTICIPANT {
        uuid id PK
        uuid conversation_id FK
        uuid party_id FK
        uuid contact_id FK
        uuid user_id FK
        string participant_type
        datetime joined_at
        datetime left_at
    }

    CRM_MESSAGE {
        uuid id PK
        uuid conversation_id FK
        uuid sender_user_id FK
        uuid sender_party_id FK
        string external_message_id
        string direction
        string message_type
        text message_text
        datetime sent_at
        datetime received_at
        string status
    }

    CRM_MESSAGE_ATTACHMENT {
        uuid id PK
        uuid message_id FK
        uuid file_id FK
        string attachment_type
    }

    CRM_MESSAGE_DELIVERY_STATUS {
        uuid id PK
        uuid message_id FK
        string delivery_status
        datetime status_at
        string failure_code
        string failure_message
    }

    %% =========================================================
    %% DELIVERY TRACKING AND PROOF OF DELIVERY
    %% =========================================================

    LOGISTICS_SHIPMENT {
        uuid id PK
        uuid document_id FK
        uuid delivery_id FK
        uuid sales_order_id FK
        uuid customer_party_id FK
        string shipment_number
        string carrier_name
        string tracking_number
        datetime planned_dispatch_at
        datetime actual_dispatch_at
        datetime estimated_arrival_at
        datetime delivered_at
        string shipment_status
    }

    LOGISTICS_SHIPMENT_LINE {
        uuid id PK
        uuid shipment_id FK
        uuid delivery_line_id FK
        uuid product_id FK
        decimal shipped_quantity
        uuid uom_id FK
    }

    LOGISTICS_TRACKING_EVENT {
        uuid id PK
        uuid shipment_id FK
        string event_code
        string event_description
        string location_text
        decimal latitude
        decimal longitude
        datetime event_at
        string source_system
    }

    LOGISTICS_PROOF_OF_DELIVERY {
        uuid id PK
        uuid shipment_id FK
        uuid received_by_party_id FK
        uuid signature_file_id FK
        uuid photo_file_id FK
        string receiver_name
        datetime received_at
        string remarks
        string verification_status
    }

    %% =========================================================
    %% FEEDBACK CENTER, CUSTOMER SATISFACTION, SURVEY
    %% =========================================================

    CRM_FEEDBACK {
        uuid id PK
        uuid document_id FK
        uuid customer_party_id FK
        uuid contact_id FK
        uuid project_id FK
        uuid sales_order_id FK
        uuid delivery_id FK
        uuid service_case_id FK
        string feedback_type
        int rating_value
        decimal nps_score
        text feedback_text
        datetime submitted_at
        string status
    }

    CRM_SURVEY {
        uuid id PK
        uuid tenant_id FK
        uuid company_id FK
        string survey_code UK
        string survey_name
        string survey_type
        date active_from
        date active_to
        string status
    }

    CRM_SURVEY_QUESTION {
        uuid id PK
        uuid survey_id FK
        string question_text
        string answer_type
        boolean required
        int position_order
        json option_json
    }

    CRM_SURVEY_RESPONSE {
        uuid id PK
        uuid survey_id FK
        uuid customer_party_id FK
        uuid contact_id FK
        uuid project_id FK
        uuid sales_order_id FK
        datetime started_at
        datetime submitted_at
        string response_status
    }

    CRM_SURVEY_ANSWER {
        uuid id PK
        uuid response_id FK
        uuid question_id FK
        decimal numeric_answer
        text text_answer
        json option_answer
    }

    %% =========================================================
    %% PRODUCT IMPLEMENTATION ROADMAP AND DEVELOPMENT WORKFLOW
    %% Covers Suggested Phase and Suggested Workflow in the IA image
    %% =========================================================

    IMPLEMENTATION_RELEASE {
        uuid id PK
        uuid tenant_id FK
        string release_code UK
        string release_name
        date planned_start_date
        date planned_launch_date
        date actual_launch_date
        string release_status
    }

    IMPLEMENTATION_PHASE {
        uuid id PK
        uuid release_id FK
        string phase_code
        string phase_name
        int phase_order
        date planned_start_date
        date planned_end_date
        date actual_start_date
        date actual_end_date
        string status
    }

    IMPLEMENTATION_PHASE_ITEM {
        uuid id PK
        uuid phase_id FK
        string module_code
        string item_type
        string item_name
        int sequence_order
        string status
    }

    IMPLEMENTATION_WORKFLOW {
        uuid id PK
        uuid release_id FK
        string workflow_code UK
        string workflow_name
        string methodology
        string status
    }

    IMPLEMENTATION_WORKFLOW_STAGE {
        uuid id PK
        uuid workflow_id FK
        string stage_code
        string stage_name
        int stage_order
        string stage_type
        string status
    }

    IMPLEMENTATION_WORK_ITEM {
        uuid id PK
        uuid release_id FK
        uuid phase_id FK
        uuid workflow_stage_id FK
        uuid assigned_user_id FK
        string module_code
        string work_item_type
        string title
        text description
        date planned_start_date
        date planned_end_date
        datetime completed_at
        string status
    }

    IMPLEMENTATION_TEST_CYCLE {
        uuid id PK
        uuid release_id FK
        uuid phase_id FK
        string test_scope
        string test_type
        date planned_date
        date executed_date
        int passed_count
        int failed_count
        string status
    }

    IMPLEMENTATION_GTM_MILESTONE {
        uuid id PK
        uuid release_id FK
        string milestone_type
        string milestone_name
        date planned_date
        date actual_date
        string status
    }

    %% =========================================================
    %% DATABASE VIEWS / MATERIALIZED VIEWS FOR THE THREE MAIN UI AREAS
    %% =========================================================

    VIEW_FINANCE_MAIN_DASHBOARD {
        uuid company_id PK
        datetime calculated_at
        decimal profit_loss_amount
        decimal net_cashflow_amount
        decimal total_unit_hpp
        int active_alert_count
        int periodic_kpi_count
    }

    VIEW_PROJECT_DASHBOARD {
        uuid project_id PK
        datetime calculated_at
        decimal overall_kpi_score
        decimal planned_progress_percent
        decimal actual_progress_percent
        string project_health_status
        int overdue_task_count
        int unread_notification_count
    }

    VIEW_PROJECT_TIMELINE_COST {
        uuid project_id PK
        datetime calculated_at
        decimal labor_hours
        decimal machine_hours
        decimal labor_cost
        decimal equipment_cost
        decimal material_cost
        decimal overhead_cost
        decimal total_actual_cost
    }

    VIEW_CRM_SALES_DASHBOARD {
        uuid company_id PK
        datetime calculated_at
        decimal weighted_project_value
        decimal win_rate_percent
        int prospect_count
        int pitch_count
        int closing_count
        decimal offering_margin_percent
    }

    %% =========================================================
    %% COMPLETE RELATIONSHIPS
    %% =========================================================

    %% CORE RELATIONSHIPS
    CORE_BUSINESS_DOCUMENT ||--o{ ANALYTICS_ALERT_EVENT : source_document
    CORE_BUSINESS_DOCUMENT ||--o{ ASSET_ASSET : document
    CORE_BUSINESS_DOCUMENT ||--o{ ASSET_DISPOSAL : document
    CORE_BUSINESS_DOCUMENT ||--o{ CORE_AUDIT_EVENT : document
    CORE_BUSINESS_DOCUMENT ||--o{ CORE_BUSINESS_DOCUMENT : reversal_of
    CORE_BUSINESS_DOCUMENT ||--o{ CORE_DOCUMENT_ATTACHMENT : document
    CORE_BUSINESS_DOCUMENT ||--o{ CORE_DOCUMENT_LINK : source_document
    CORE_BUSINESS_DOCUMENT ||--o{ CORE_DOCUMENT_LINK : target_document
    CORE_BUSINESS_DOCUMENT ||--o{ CORE_GENERATED_DOCUMENT : business_document
    CORE_BUSINESS_DOCUMENT ||--o{ CORE_NOTIFICATION : source_document
    CORE_BUSINESS_DOCUMENT ||--o{ CORE_WORKFLOW_INSTANCE : document
    CORE_BUSINESS_DOCUMENT ||--o{ CRM_EXECUTIVE_APPROVAL : document
    CORE_BUSINESS_DOCUMENT ||--o{ CRM_FEEDBACK : document
    CORE_BUSINESS_DOCUMENT ||--o{ CRM_LEAD : document
    CORE_BUSINESS_DOCUMENT ||--o{ CRM_OPPORTUNITY : document
    CORE_BUSINESS_DOCUMENT ||--o{ FIN_BILLING_DOCUMENT : document
    CORE_BUSINESS_DOCUMENT ||--o{ FIN_COST_BASELINE : document
    CORE_BUSINESS_DOCUMENT ||--o{ FIN_JOURNAL_ENTRY : document
    CORE_BUSINESS_DOCUMENT ||--o{ FIN_JOURNAL_ENTRY : source_document
    CORE_BUSINESS_DOCUMENT ||--o{ FIN_JOURNAL_LINE : source_document_line
    CORE_BUSINESS_DOCUMENT ||--o{ FIN_PAYMENT : document
    CORE_BUSINESS_DOCUMENT ||--o{ FIN_PERIOD_CLOSING : document
    CORE_BUSINESS_DOCUMENT ||--o{ FIN_PROJECT_FUNDING : document
    CORE_BUSINESS_DOCUMENT ||--o{ INV_STOCK_COUNT : document
    CORE_BUSINESS_DOCUMENT ||--o{ INV_STOCK_LEDGER_ENTRY : source_document
    CORE_BUSINESS_DOCUMENT ||--o{ INV_STOCK_LEDGER_ENTRY : source_line
    CORE_BUSINESS_DOCUMENT ||--o{ INV_STOCK_MOVE : document
    CORE_BUSINESS_DOCUMENT ||--o{ LOGISTICS_SHIPMENT : document
    CORE_BUSINESS_DOCUMENT ||--o{ MFG_COST_LEDGER_ENTRY : source_document
    CORE_BUSINESS_DOCUMENT ||--o{ MFG_PRODUCTION_ORDER : document
    CORE_BUSINESS_DOCUMENT ||--o{ MFG_WORK_ORDER : document
    CORE_BUSINESS_DOCUMENT ||--o{ PROC_GOODS_RECEIPT : document
    CORE_BUSINESS_DOCUMENT ||--o{ PROC_PURCHASE_ORDER : document
    CORE_BUSINESS_DOCUMENT ||--o{ PROC_PURCHASE_REQUISITION : document
    CORE_BUSINESS_DOCUMENT ||--o{ PROC_RFQ : document
    CORE_BUSINESS_DOCUMENT ||--o{ PROC_SUPPLIER_QUOTATION : document
    CORE_BUSINESS_DOCUMENT ||--o{ PROJECT_CHANGE_REQUEST : document
    CORE_BUSINESS_DOCUMENT ||--o{ PROJECT_ISSUE : document
    CORE_BUSINESS_DOCUMENT ||--o{ PROJECT_PROJECT : document
    CORE_BUSINESS_DOCUMENT ||--o{ PROJECT_RESOURCE_REQUEST : document
    CORE_BUSINESS_DOCUMENT ||--o{ PROJECT_RISK : document
    CORE_BUSINESS_DOCUMENT ||--o{ PROJECT_TECHNICAL_BRIEF : document
    CORE_BUSINESS_DOCUMENT ||--o{ QA_INSPECTION : document
    CORE_BUSINESS_DOCUMENT ||--o{ QA_NONCONFORMANCE : document
    CORE_BUSINESS_DOCUMENT ||--o{ SALES_CONTRACT : document
    CORE_BUSINESS_DOCUMENT ||--o{ SALES_DELIVERY : document
    CORE_BUSINESS_DOCUMENT ||--o{ SALES_ORDER : document
    CORE_BUSINESS_DOCUMENT ||--o{ SALES_ORDER_CHANGE_REQUEST : document
    CORE_BUSINESS_DOCUMENT ||--o{ SALES_QUOTATION : document
    CORE_BUSINESS_DOCUMENT ||--o{ SERVICE_CASE : document
    CORE_COMPANY ||--o{ ANALYTICS_ALERT_EVENT : company
    CORE_COMPANY ||--o{ ANALYTICS_DASHBOARD : company
    CORE_COMPANY ||--o{ ANALYTICS_KPI_RESULT : company
    CORE_COMPANY ||--o{ ANALYTICS_KPI_TARGET : company
    CORE_COMPANY ||--o{ ASSET_ASSET : company
    CORE_COMPANY ||--o{ ASSET_CATEGORY : company
    CORE_COMPANY ||--o{ CORE_AUDIT_EVENT : company
    CORE_COMPANY ||--o{ CORE_BUSINESS_DOCUMENT : company
    CORE_COMPANY ||--o{ CORE_DOCUMENT_TEMPLATE : company
    CORE_COMPANY ||--o{ CORE_FILE : company
    CORE_COMPANY ||--o{ CORE_NOTIFICATION : company
    CORE_COMPANY ||--o{ CORE_ORGANIZATION : company
    CORE_COMPANY ||--o{ CRM_CHANNEL_ACCOUNT : company
    CORE_COMPANY ||--o{ CRM_LEAD : company
    CORE_COMPANY ||--o{ CRM_PIPELINE : company
    CORE_COMPANY ||--o{ CRM_SURVEY : company
    CORE_COMPANY ||--o{ FIN_ACCOUNT : company
    CORE_COMPANY ||--o{ FIN_BANK_ACCOUNT : company
    CORE_COMPANY ||--o{ FIN_BILLING_DOCUMENT : company
    CORE_COMPANY ||--o{ FIN_BUDGET : company
    CORE_COMPANY ||--o{ FIN_CREDIT_FACILITY : company
    CORE_COMPANY ||--o{ FIN_FINANCIAL_SNAPSHOT : company
    CORE_COMPANY ||--o{ FIN_FISCAL_YEAR : company
    CORE_COMPANY ||--o{ FIN_JOURNAL : company
    CORE_COMPANY ||--o{ FIN_OVERHEAD_RULE : company
    CORE_COMPANY ||--o{ FIN_PAYMENT : company
    CORE_COMPANY ||--o{ FIN_RECURRING_PAYMENT_RULE : company
    CORE_COMPANY ||--o{ FIN_UNIT_COST_SNAPSHOT : company
    CORE_COMPANY ||--o{ IAM_USER_ROLE : company
    CORE_COMPANY ||--o{ INV_STOCK_BALANCE : company
    CORE_COMPANY ||--o{ INV_STOCK_LEDGER_ENTRY : company
    CORE_COMPANY ||--o{ INV_STOCK_MOVE : company
    CORE_COMPANY ||--o{ MASTER_COST_CENTER : company
    CORE_COMPANY ||--o{ MASTER_DEPARTMENT : company
    CORE_COMPANY ||--o{ MASTER_EXCHANGE_RATE : company
    CORE_COMPANY ||--o{ MASTER_MACHINE : company
    CORE_COMPANY ||--o{ MASTER_WAREHOUSE : company
    CORE_COMPANY ||--o{ MASTER_WORK_CENTER : company
    CORE_COMPANY ||--o{ MFG_COST_LEDGER_ENTRY : company
    CORE_COMPANY ||--o{ MFG_PRODUCTION_ORDER : company
    CORE_COMPANY ||--o{ PROC_PURCHASE_REQUISITION : company
    CORE_COMPANY ||--o{ PROJECT_HEALTH_RULE : company
    CORE_COMPANY ||--o{ PROJECT_PROJECT : company
    CORE_COMPANY ||--o| CRM_CREDIT_STATUS_SNAPSHOT : company
    CORE_COMPANY ||--o| VIEW_CRM_SALES_DASHBOARD : summarizes
    CORE_COMPANY ||--o| VIEW_FINANCE_MAIN_DASHBOARD : summarizes
    CORE_DOCUMENT_TEMPLATE ||--o{ CORE_DOCUMENT_TEMPLATE_VERSION : template
    CORE_DOCUMENT_TEMPLATE_VERSION ||--o{ CORE_DOCUMENT_TEMPLATE_FIELD : template_version
    CORE_DOCUMENT_TEMPLATE_VERSION ||--o{ CORE_GENERATED_DOCUMENT : template_version
    CORE_FILE ||--o{ CORE_DOCUMENT_ATTACHMENT : file
    CORE_FILE ||--o{ CORE_GENERATED_DOCUMENT : file
    CORE_FILE ||--o{ CRM_MESSAGE_ATTACHMENT : file
    CORE_FILE ||--o{ LOGISTICS_PROOF_OF_DELIVERY : photo_file
    CORE_FILE ||--o{ LOGISTICS_PROOF_OF_DELIVERY : signature_file
    CORE_FILE ||--o{ PROJECT_TECHNICAL_BRIEF_VERSION : file
    CORE_GENERATED_DOCUMENT ||--o{ CORE_DOCUMENT_SIGNATURE : generated_document
    CORE_NOTIFICATION ||--o{ CORE_NOTIFICATION_RECIPIENT : notification
    CORE_ORGANIZATION ||--o{ ANALYTICS_KPI_RESULT : organization
    CORE_ORGANIZATION ||--o{ ANALYTICS_KPI_TARGET : organization
    CORE_ORGANIZATION ||--o{ CORE_ORGANIZATION : parent
    CORE_ORGANIZATION ||--o{ IAM_USER_ROLE : organization
    CORE_TENANT ||--o{ ANALYTICS_ALERT_RULE : tenant
    CORE_TENANT ||--o{ ANALYTICS_DASHBOARD : tenant
    CORE_TENANT ||--o{ ANALYTICS_KPI_DEFINITION : tenant
    CORE_TENANT ||--o{ CORE_AUDIT_EVENT : tenant
    CORE_TENANT ||--o{ CORE_BUSINESS_DOCUMENT : tenant
    CORE_TENANT ||--o{ CORE_COMPANY : tenant
    CORE_TENANT ||--o{ CORE_DOCUMENT_TEMPLATE : tenant
    CORE_TENANT ||--o{ CORE_FILE : tenant
    CORE_TENANT ||--o{ CORE_NOTIFICATION : tenant
    CORE_TENANT ||--o{ CORE_ORGANIZATION : tenant
    CORE_TENANT ||--o{ CORE_QUICK_ACTION : tenant
    CORE_TENANT ||--o{ CRM_CHANNEL_ACCOUNT : tenant
    CORE_TENANT ||--o{ CRM_LEAD : tenant
    CORE_TENANT ||--o{ CRM_PIPELINE : tenant
    CORE_TENANT ||--o{ CRM_SURVEY : tenant
    CORE_TENANT ||--o{ IAM_DATA_SCOPE_POLICY : tenant
    CORE_TENANT ||--o{ IAM_INFORMATION_SHARE_RULE : tenant
    CORE_TENANT ||--o{ IAM_ROLE : tenant
    CORE_TENANT ||--o{ IAM_USER : tenant
    CORE_TENANT ||--o{ IMPLEMENTATION_RELEASE : tenant
    CORE_TENANT ||--o{ INV_STOCK_LEDGER_ENTRY : tenant
    CORE_TENANT ||--o{ MASTER_EMPLOYEE : tenant
    CORE_TENANT ||--o{ MASTER_PARTY : tenant
    CORE_TENANT ||--o{ MASTER_PAYMENT_TERM : tenant
    CORE_TENANT ||--o{ MASTER_PRODUCT : tenant
    CORE_TENANT ||--o{ MASTER_PRODUCT_CATEGORY : tenant
    CORE_TENANT ||--o{ MASTER_TAX_CODE : tenant
    CORE_TENANT ||--o{ MASTER_UOM : tenant
    CORE_TENANT ||--o{ MFG_BOM : tenant
    CORE_TENANT ||--o{ MFG_ROUTING : tenant
    CORE_TENANT ||--o{ PROJECT_PROJECT : tenant
    CORE_TENANT ||--o{ QA_QUALITY_PLAN : tenant
    CORE_WORKFLOW_INSTANCE ||--o{ CORE_WORKFLOW_APPROVAL : workflow_instance

    %% IAM RELATIONSHIPS
    IAM_DATA_SCOPE_POLICY ||--o{ IAM_ROLE_DATA_SCOPE : policy
    IAM_PERMISSION ||--o{ CORE_QUICK_ACTION : required_permission
    IAM_PERMISSION ||--o{ IAM_ROLE_PERMISSION : permission
    IAM_ROLE ||--o{ ANALYTICS_DASHBOARD_ROLE : role
    IAM_ROLE ||--o{ CORE_NOTIFICATION_RECIPIENT : recipient_role
    IAM_ROLE ||--o{ IAM_APPROVAL_LIMIT : role
    IAM_ROLE ||--o{ IAM_FIELD_PERMISSION : role
    IAM_ROLE ||--o{ IAM_ROLE_DATA_SCOPE : role
    IAM_ROLE ||--o{ IAM_ROLE_HIERARCHY : child_role
    IAM_ROLE ||--o{ IAM_ROLE_HIERARCHY : parent_role
    IAM_ROLE ||--o{ IAM_ROLE_PERMISSION : role
    IAM_ROLE ||--o{ IAM_USER_ROLE : role
    IAM_USER ||--o{ ANALYTICS_ALERT_EVENT : acknowledged_by
    IAM_USER ||--o{ ANALYTICS_KPI_RESULT : owner_user
    IAM_USER ||--o{ ANALYTICS_KPI_TARGET : owner_user
    IAM_USER ||--o{ CORE_AUDIT_EVENT : user
    IAM_USER ||--o{ CORE_BUSINESS_DOCUMENT : approved_by
    IAM_USER ||--o{ CORE_BUSINESS_DOCUMENT : created_by
    IAM_USER ||--o{ CORE_BUSINESS_DOCUMENT : posted_by
    IAM_USER ||--o{ CORE_DOCUMENT_SIGNATURE : signer_user
    IAM_USER ||--o{ CORE_FILE : uploaded_by
    IAM_USER ||--o{ CORE_GENERATED_DOCUMENT : generated_by
    IAM_USER ||--o{ CORE_NOTIFICATION_RECIPIENT : recipient_user
    IAM_USER ||--o{ CORE_WORKFLOW_APPROVAL : approver_user
    IAM_USER ||--o{ CRM_ACTIVITY : assigned_user
    IAM_USER ||--o{ CRM_CONVERSATION : assigned_user
    IAM_USER ||--o{ CRM_CONVERSATION_PARTICIPANT : user
    IAM_USER ||--o{ CRM_EXECUTIVE_APPROVAL : approver_user
    IAM_USER ||--o{ CRM_EXECUTIVE_APPROVAL : requested_by
    IAM_USER ||--o{ CRM_LEAD : owner_user
    IAM_USER ||--o{ CRM_MESSAGE : sender_user
    IAM_USER ||--o{ CRM_OPPORTUNITY : owner_user
    IAM_USER ||--o{ CRM_OPPORTUNITY_STAGE_HISTORY : changed_by
    IAM_USER ||--o{ FIN_COST_BASELINE : approved_by
    IAM_USER ||--o{ FIN_PERIOD_CLOSING : executed_by
    IAM_USER ||--o{ IAM_APPROVAL_LIMIT : user
    IAM_USER ||--o{ IAM_USER_PROJECT_ACCESS : user
    IAM_USER ||--o{ IAM_USER_ROLE : user
    IAM_USER ||--o{ IMPLEMENTATION_WORK_ITEM : assigned_user
    IAM_USER ||--o{ PROC_PURCHASE_REQUISITION : requested_by
    IAM_USER ||--o{ PROC_THREE_WAY_MATCH : reviewed_by
    IAM_USER ||--o{ PROJECT_ACCEPTANCE_CRITERIA : verified_by
    IAM_USER ||--o{ PROJECT_ISSUE : assigned_user
    IAM_USER ||--o{ PROJECT_MEMBER : user
    IAM_USER ||--o{ PROJECT_PROJECT : project_manager
    IAM_USER ||--o{ PROJECT_RESOURCE_REQUEST : requested_by
    IAM_USER ||--o{ PROJECT_RISK : owner_user
    IAM_USER ||--o{ PROJECT_TASK_BOARD_POSITION : moved_by
    IAM_USER ||--o{ PROJECT_TECHNICAL_BRIEF : owner_user
    IAM_USER ||--o{ PROJECT_TECHNICAL_BRIEF_VERSION : created_by
    IAM_USER ||--o{ QA_CORRECTIVE_ACTION : assigned_user
    IAM_USER ||--o{ QA_INSPECTION : inspector_user
    IAM_USER ||--o{ SALES_ORDER_CHANGE_REQUEST : requested_by
    IAM_USER ||--o{ SERVICE_CASE : assigned_user
    IAM_USER ||--o{ SERVICE_CASE_APPROVAL : approver_user
    IAM_USER ||--o{ SERVICE_CASE_MESSAGE : sender_user

    %% MASTER RELATIONSHIPS
    MASTER_CONTACT ||--o{ CRM_CONVERSATION : contact
    MASTER_CONTACT ||--o{ CRM_CONVERSATION_PARTICIPANT : contact
    MASTER_CONTACT ||--o{ CRM_FEEDBACK : contact
    MASTER_CONTACT ||--o{ CRM_SURVEY_RESPONSE : contact
    MASTER_CONTACT ||--o{ SERVICE_CASE : contact
    MASTER_COST_CENTER ||--o{ FIN_BILLING_DOCUMENT_LINE : cost_center
    MASTER_COST_CENTER ||--o{ FIN_BUDGET_LINE : cost_center
    MASTER_COST_CENTER ||--o{ FIN_COST_BASELINE_LINE : cost_center
    MASTER_COST_CENTER ||--o{ FIN_JOURNAL_LINE : cost_center
    MASTER_COST_CENTER ||--o{ FIN_OVERHEAD_RULE : target_cost_center
    MASTER_COST_CENTER ||--o{ MASTER_COST_CENTER : parent
    MASTER_COST_CENTER ||--o{ PROJECT_BUDGET_LINE : cost_center
    MASTER_COST_CENTER ||--o{ PROJECT_PROJECT : cost_center
    MASTER_CURRENCY ||--o{ CORE_COMPANY : base_currency
    MASTER_CURRENCY ||--o{ FIN_ACCOUNT : currency
    MASTER_CURRENCY ||--o{ FIN_BANK_ACCOUNT : currency
    MASTER_CURRENCY ||--o{ FIN_BILLING_DOCUMENT : currency
    MASTER_CURRENCY ||--o{ FIN_CREDIT_FACILITY : currency
    MASTER_CURRENCY ||--o{ FIN_JOURNAL_ENTRY : currency
    MASTER_CURRENCY ||--o{ FIN_JOURNAL_LINE : transaction_currency
    MASTER_CURRENCY ||--o{ FIN_PAYMENT : currency
    MASTER_CURRENCY ||--o{ FIN_PROJECT_FUNDING : currency
    MASTER_CURRENCY ||--o{ FIN_RECURRING_PAYMENT_RULE : currency
    MASTER_CURRENCY ||--o{ IAM_APPROVAL_LIMIT : currency
    MASTER_CURRENCY ||--o{ MASTER_EXCHANGE_RATE : from_currency
    MASTER_CURRENCY ||--o{ MASTER_EXCHANGE_RATE : to_currency
    MASTER_CURRENCY ||--o{ MASTER_PARTY : default_currency
    MASTER_CURRENCY ||--o{ PROC_PURCHASE_ORDER : currency
    MASTER_CURRENCY ||--o{ PROC_SUPPLIER_QUOTATION : currency
    MASTER_CURRENCY ||--o{ PROJECT_WEIGHT_INDICATOR : currency
    MASTER_CURRENCY ||--o{ SALES_ORDER : currency
    MASTER_CURRENCY ||--o{ SALES_QUOTATION : currency
    MASTER_DEPARTMENT ||--o{ ASSET_ASSET : department
    MASTER_DEPARTMENT ||--o{ FIN_BUDGET_LINE : department
    MASTER_DEPARTMENT ||--o{ FIN_JOURNAL_LINE : department
    MASTER_DEPARTMENT ||--o{ MASTER_DEPARTMENT : parent
    MASTER_DEPARTMENT ||--o{ MASTER_EMPLOYEE : department
    MASTER_EMPLOYEE ||--o{ MFG_LABOR_LOG : employee
    MASTER_EMPLOYEE ||--o{ PROJECT_EQUIPMENT_USAGE : employee
    MASTER_EMPLOYEE ||--o{ PROJECT_MEMBER : employee
    MASTER_EMPLOYEE ||--o{ PROJECT_RESOURCE_ALLOCATION : employee
    MASTER_EMPLOYEE ||--o{ PROJECT_RESOURCE_REQUEST_LINE : employee
    MASTER_EMPLOYEE ||--o{ PROJECT_TIMESHEET : employee
    MASTER_MACHINE ||--o{ ASSET_MAINTENANCE : machine
    MASTER_MACHINE ||--o{ MFG_MACHINE_LOG : machine
    MASTER_MACHINE ||--o{ MFG_WORK_ORDER : machine
    MASTER_MACHINE ||--o{ PROJECT_EQUIPMENT_USAGE : machine
    MASTER_MACHINE ||--o{ PROJECT_RESOURCE_ALLOCATION : machine
    MASTER_MACHINE ||--o{ PROJECT_RESOURCE_REQUEST_LINE : machine
    MASTER_PARTY ||--o{ ASSET_ASSET : supplier_party
    MASTER_PARTY ||--o{ CORE_DOCUMENT_SIGNATURE : signer_party
    MASTER_PARTY ||--o{ CRM_ACTIVITY : party
    MASTER_PARTY ||--o{ CRM_CONVERSATION : customer_party
    MASTER_PARTY ||--o{ CRM_CONVERSATION_PARTICIPANT : party
    MASTER_PARTY ||--o{ CRM_FEEDBACK : customer_party
    MASTER_PARTY ||--o{ CRM_LEAD : party
    MASTER_PARTY ||--o{ CRM_MESSAGE : sender_party
    MASTER_PARTY ||--o{ CRM_OPPORTUNITY : customer_party
    MASTER_PARTY ||--o{ CRM_SURVEY_RESPONSE : customer_party
    MASTER_PARTY ||--o{ FIN_BANK_ACCOUNT : party
    MASTER_PARTY ||--o{ FIN_BILLING_DOCUMENT : party
    MASTER_PARTY ||--o{ FIN_CREDIT_FACILITY : party
    MASTER_PARTY ||--o{ FIN_JOURNAL_LINE : party
    MASTER_PARTY ||--o{ FIN_PAYMENT : party
    MASTER_PARTY ||--o{ FIN_PROJECT_FUNDING : funding_source_party
    MASTER_PARTY ||--o{ FIN_RECURRING_PAYMENT_RULE : party
    MASTER_PARTY ||--o{ LOGISTICS_PROOF_OF_DELIVERY : received_by_party
    MASTER_PARTY ||--o{ LOGISTICS_SHIPMENT : customer_party
    MASTER_PARTY ||--o{ MASTER_ADDRESS : party
    MASTER_PARTY ||--o{ MASTER_CONTACT : party
    MASTER_PARTY ||--o{ MASTER_EMPLOYEE : party
    MASTER_PARTY ||--o{ MASTER_PARTY_ROLE : party
    MASTER_PARTY ||--o{ PROC_GOODS_RECEIPT : supplier_party
    MASTER_PARTY ||--o{ PROC_PURCHASE_ORDER : supplier_party
    MASTER_PARTY ||--o{ PROC_SUPPLIER_QUOTATION : supplier_party
    MASTER_PARTY ||--o{ PROJECT_PROJECT : customer_party
    MASTER_PARTY ||--o{ SALES_CONTRACT : customer_party
    MASTER_PARTY ||--o{ SALES_DELIVERY : customer_party
    MASTER_PARTY ||--o{ SALES_ORDER : customer_party
    MASTER_PARTY ||--o{ SALES_QUOTATION : customer_party
    MASTER_PARTY ||--o{ SALES_RECURRING_ORDER_RULE : customer_party
    MASTER_PARTY ||--o{ SERVICE_CASE : customer_party
    MASTER_PARTY ||--o| CRM_CREDIT_STATUS_SNAPSHOT : customer_party
    MASTER_PARTY ||--o| MASTER_CUSTOMER_PROFILE : party
    MASTER_PARTY ||--o| MASTER_SUPPLIER_PROFILE : party
    MASTER_PAYMENT_TERM ||--o{ FIN_BILLING_DOCUMENT : payment_term
    MASTER_PAYMENT_TERM ||--o{ PROC_PURCHASE_ORDER : payment_term
    MASTER_PAYMENT_TERM ||--o{ SALES_ORDER : payment_term
    MASTER_PAYMENT_TERM ||--o{ SALES_QUOTATION : payment_term
    MASTER_PAYMENT_TERM ||--o| MASTER_CUSTOMER_PROFILE : payment_term
    MASTER_PAYMENT_TERM ||--o| MASTER_SUPPLIER_PROFILE : payment_term
    MASTER_PRODUCT ||--o{ CRM_OPPORTUNITY_PRODUCT : product
    MASTER_PRODUCT ||--o{ FIN_BILLING_DOCUMENT_LINE : product
    MASTER_PRODUCT ||--o{ FIN_COST_BASELINE_LINE : product
    MASTER_PRODUCT ||--o{ FIN_JOURNAL_LINE : product
    MASTER_PRODUCT ||--o{ FIN_UNIT_COST_SNAPSHOT : product
    MASTER_PRODUCT ||--o{ INV_LOT : product
    MASTER_PRODUCT ||--o{ INV_SERIAL_NUMBER : product
    MASTER_PRODUCT ||--o{ INV_STOCK_BALANCE : product
    MASTER_PRODUCT ||--o{ INV_STOCK_COUNT_LINE : product
    MASTER_PRODUCT ||--o{ INV_STOCK_LEDGER_ENTRY : product
    MASTER_PRODUCT ||--o{ INV_STOCK_MOVE_LINE : product
    MASTER_PRODUCT ||--o{ INV_STOCK_RESERVATION : product
    MASTER_PRODUCT ||--o{ INV_VALUATION_LAYER : product
    MASTER_PRODUCT ||--o{ LOGISTICS_SHIPMENT_LINE : product
    MASTER_PRODUCT ||--o{ MFG_BOM : product
    MASTER_PRODUCT ||--o{ MFG_BOM_LINE : component_product
    MASTER_PRODUCT ||--o{ MFG_COST_LEDGER_ENTRY : product
    MASTER_PRODUCT ||--o{ MFG_PRODUCTION_MATERIAL : product
    MASTER_PRODUCT ||--o{ MFG_PRODUCTION_ORDER : product
    MASTER_PRODUCT ||--o{ MFG_PRODUCTION_OUTPUT : product
    MASTER_PRODUCT ||--o{ MFG_SCRAP : product
    MASTER_PRODUCT ||--o{ PROC_GOODS_RECEIPT_LINE : product
    MASTER_PRODUCT ||--o{ PROC_PURCHASE_ORDER_LINE : product
    MASTER_PRODUCT ||--o{ PROC_PURCHASE_REQUISITION_LINE : product
    MASTER_PRODUCT ||--o{ PROJECT_MATERIAL_REQUIREMENT : product
    MASTER_PRODUCT ||--o{ PROJECT_RESOURCE_REQUEST_LINE : product
    MASTER_PRODUCT ||--o{ QA_INSPECTION : product
    MASTER_PRODUCT ||--o{ QA_QUALITY_PLAN : product
    MASTER_PRODUCT ||--o{ SALES_CONTRACT_LINE : product
    MASTER_PRODUCT ||--o{ SALES_DELIVERY_LINE : product
    MASTER_PRODUCT ||--o{ SALES_ORDER_LINE : product
    MASTER_PRODUCT ||--o{ SALES_QUOTATION_LINE : product
    MASTER_PRODUCT ||--o{ SERVICE_CASE : product
    MASTER_PRODUCT_CATEGORY ||--o{ ASSET_ASSET : category
    MASTER_PRODUCT_CATEGORY ||--o{ MASTER_PRODUCT : category
    MASTER_PRODUCT_CATEGORY ||--o{ MASTER_PRODUCT_CATEGORY : parent
    MASTER_TAX_CODE ||--o{ FIN_BILLING_DOCUMENT_LINE : tax_code
    MASTER_TAX_CODE ||--o{ FIN_TAX_TRANSACTION : tax_code
    MASTER_TAX_CODE ||--o{ PROC_PURCHASE_ORDER_LINE : tax_code
    MASTER_TAX_CODE ||--o{ SALES_CONTRACT_LINE : tax_code
    MASTER_TAX_CODE ||--o{ SALES_ORDER_LINE : tax_code
    MASTER_TAX_CODE ||--o{ SALES_QUOTATION_LINE : tax_code
    MASTER_UOM ||--o{ CRM_OPPORTUNITY_PRODUCT : uom
    MASTER_UOM ||--o{ FIN_BILLING_DOCUMENT_LINE : uom
    MASTER_UOM ||--o{ INV_STOCK_MOVE_LINE : uom
    MASTER_UOM ||--o{ LOGISTICS_SHIPMENT_LINE : uom
    MASTER_UOM ||--o{ MASTER_PRODUCT : base_uom
    MASTER_UOM ||--o{ MFG_BOM_LINE : uom
    MASTER_UOM ||--o{ MFG_BOM_VERSION : output_uom
    MASTER_UOM ||--o{ PROC_GOODS_RECEIPT_LINE : uom
    MASTER_UOM ||--o{ PROC_PURCHASE_ORDER_LINE : uom
    MASTER_UOM ||--o{ PROC_PURCHASE_REQUISITION_LINE : uom
    MASTER_UOM ||--o{ PROJECT_RESOURCE_REQUEST_LINE : uom
    MASTER_UOM ||--o{ SALES_DELIVERY_LINE : uom
    MASTER_UOM ||--o{ SALES_ORDER_LINE : uom
    MASTER_UOM ||--o{ SALES_QUOTATION_LINE : uom
    MASTER_WAREHOUSE ||--o{ FIN_JOURNAL_LINE : warehouse
    MASTER_WAREHOUSE ||--o{ INV_STOCK_COUNT : warehouse
    MASTER_WAREHOUSE ||--o{ INV_VALUATION_LAYER : warehouse
    MASTER_WAREHOUSE ||--o{ MASTER_WAREHOUSE_LOCATION : warehouse
    MASTER_WAREHOUSE ||--o{ MFG_PRODUCTION_MATERIAL : warehouse
    MASTER_WAREHOUSE ||--o{ MFG_PRODUCTION_ORDER : warehouse
    MASTER_WAREHOUSE ||--o{ PROC_GOODS_RECEIPT : warehouse
    MASTER_WAREHOUSE ||--o{ PROC_PURCHASE_REQUISITION_LINE : warehouse
    MASTER_WAREHOUSE ||--o{ PROJECT_MATERIAL_REQUIREMENT : warehouse
    MASTER_WAREHOUSE ||--o{ SALES_DELIVERY : warehouse
    MASTER_WAREHOUSE_LOCATION ||--o{ ASSET_ASSET : warehouse_location
    MASTER_WAREHOUSE_LOCATION ||--o{ INV_SERIAL_NUMBER : current_location
    MASTER_WAREHOUSE_LOCATION ||--o{ INV_STOCK_BALANCE : warehouse_location
    MASTER_WAREHOUSE_LOCATION ||--o{ INV_STOCK_COUNT_LINE : location
    MASTER_WAREHOUSE_LOCATION ||--o{ INV_STOCK_LEDGER_ENTRY : warehouse_location
    MASTER_WAREHOUSE_LOCATION ||--o{ INV_STOCK_MOVE : destination_location
    MASTER_WAREHOUSE_LOCATION ||--o{ INV_STOCK_MOVE : source_location
    MASTER_WAREHOUSE_LOCATION ||--o{ INV_STOCK_RESERVATION : warehouse_location
    MASTER_WAREHOUSE_LOCATION ||--o{ MASTER_WAREHOUSE_LOCATION : parent
    MASTER_WAREHOUSE_LOCATION ||--o{ MFG_PRODUCTION_OUTPUT : destination_location
    MASTER_WORK_CENTER ||--o{ MASTER_MACHINE : work_center
    MASTER_WORK_CENTER ||--o{ MFG_ROUTING_OPERATION : work_center
    MASTER_WORK_CENTER ||--o{ MFG_WORK_ORDER : work_center
    MASTER_WORK_CENTER ||--o{ PROJECT_RESOURCE_REQUEST_LINE : work_center
    MASTER_WORK_CENTER ||--o{ PROJECT_TASK : work_center

    %% ANALYTICS RELATIONSHIPS
    ANALYTICS_ALERT_EVENT ||--o{ CORE_NOTIFICATION : alert_event
    ANALYTICS_ALERT_RULE ||--o{ ANALYTICS_ALERT_EVENT : alert_rule
    ANALYTICS_DASHBOARD ||--o{ ANALYTICS_DASHBOARD_ROLE : dashboard
    ANALYTICS_DASHBOARD ||--o{ ANALYTICS_WIDGET : dashboard
    ANALYTICS_KPI_DEFINITION ||--o{ ANALYTICS_ALERT_RULE : kpi_definition
    ANALYTICS_KPI_DEFINITION ||--o{ ANALYTICS_KPI_RESULT : kpi_definition
    ANALYTICS_KPI_DEFINITION ||--o{ ANALYTICS_KPI_TARGET : kpi_definition

    %% CRM RELATIONSHIPS
    CRM_CHANNEL_ACCOUNT ||--o{ CRM_CONVERSATION : channel_account
    CRM_CONVERSATION ||--o{ CRM_CONVERSATION_PARTICIPANT : conversation
    CRM_CONVERSATION ||--o{ CRM_MESSAGE : conversation
    CRM_LEAD ||--o{ CRM_OPPORTUNITY : lead
    CRM_MESSAGE ||--o{ CRM_MESSAGE_ATTACHMENT : message
    CRM_MESSAGE ||--o{ CRM_MESSAGE_DELIVERY_STATUS : message
    CRM_OPPORTUNITY ||--o{ CRM_ACTIVITY : opportunity
    CRM_OPPORTUNITY ||--o{ CRM_CONVERSATION : opportunity
    CRM_OPPORTUNITY ||--o{ CRM_EXECUTIVE_APPROVAL : opportunity
    CRM_OPPORTUNITY ||--o{ CRM_OPPORTUNITY_PRODUCT : opportunity
    CRM_OPPORTUNITY ||--o{ CRM_OPPORTUNITY_STAGE_HISTORY : opportunity
    CRM_OPPORTUNITY ||--o{ PROJECT_WEIGHT_INDICATOR : opportunity
    CRM_OPPORTUNITY ||--o{ SALES_QUOTATION : opportunity
    CRM_PIPELINE ||--o{ CRM_PIPELINE_STAGE : pipeline
    CRM_PIPELINE_STAGE ||--o{ CRM_OPPORTUNITY_STAGE_HISTORY : from_stage
    CRM_PIPELINE_STAGE ||--o{ CRM_OPPORTUNITY_STAGE_HISTORY : to_stage
    CRM_SURVEY ||--o{ CRM_SURVEY_QUESTION : survey
    CRM_SURVEY ||--o{ CRM_SURVEY_RESPONSE : survey
    CRM_SURVEY_QUESTION ||--o{ CRM_SURVEY_ANSWER : question
    CRM_SURVEY_RESPONSE ||--o{ CRM_SURVEY_ANSWER : response

    %% SALES RELATIONSHIPS
    SALES_CONTRACT ||--o{ CRM_EXECUTIVE_APPROVAL : contract
    SALES_CONTRACT ||--o{ SALES_CONTRACT_LINE : contract
    SALES_CONTRACT ||--o{ SALES_ORDER : contract
    SALES_CONTRACT ||--o{ SALES_RECURRING_ORDER_RULE : contract
    SALES_DELIVERY ||--o{ CRM_FEEDBACK : delivery
    SALES_DELIVERY ||--o{ LOGISTICS_SHIPMENT : delivery
    SALES_DELIVERY ||--o{ SALES_DELIVERY_LINE : delivery
    SALES_DELIVERY ||--o{ SERVICE_RESOLUTION : replacement_delivery
    SALES_DELIVERY_LINE ||--o{ LOGISTICS_SHIPMENT_LINE : delivery_line
    SALES_ORDER ||--o{ CRM_FEEDBACK : sales_order
    SALES_ORDER ||--o{ CRM_SURVEY_RESPONSE : sales_order
    SALES_ORDER ||--o{ FIN_BILLING_DOCUMENT : sales_order
    SALES_ORDER ||--o{ LOGISTICS_SHIPMENT : sales_order
    SALES_ORDER ||--o{ PROJECT_PROJECT : sales_order
    SALES_ORDER ||--o{ PROJECT_TECHNICAL_BRIEF : sales_order
    SALES_ORDER ||--o{ PROJECT_WEIGHT_INDICATOR : sales_order
    SALES_ORDER ||--o{ SALES_DELIVERY : sales_order
    SALES_ORDER ||--o{ SALES_ORDER_CHANGE_REQUEST : sales_order
    SALES_ORDER ||--o{ SALES_ORDER_LINE : sales_order
    SALES_ORDER ||--o{ SALES_RECURRING_ORDER_RULE : source_sales_order
    SALES_ORDER ||--o{ SALES_RECURRING_ORDER_RUN : generated_sales_order
    SALES_ORDER ||--o{ SERVICE_CASE : sales_order
    SALES_ORDER_LINE ||--o{ INV_STOCK_RESERVATION : sales_order_line
    SALES_ORDER_LINE ||--o{ MFG_PRODUCTION_ORDER : sales_order_line
    SALES_ORDER_LINE ||--o{ SALES_DELIVERY_LINE : sales_order_line
    SALES_ORDER_LINE ||--o{ SALES_DEMAND_SUPPLY_LINK : sales_order_line
    SALES_QUOTATION ||--o{ CRM_EXECUTIVE_APPROVAL : quotation
    SALES_QUOTATION ||--o{ SALES_ORDER : quotation
    SALES_QUOTATION ||--o{ SALES_QUOTATION_LINE : quotation
    SALES_QUOTATION_LINE ||--o{ SALES_QUOTATION_COST : quotation_line
    SALES_RECURRING_ORDER_RULE ||--o{ SALES_RECURRING_ORDER_RUN : recurring_order_rule

    %% PROJECT RELATIONSHIPS
    PROJECT_BOARD ||--o{ PROJECT_BOARD_COLUMN : board
    PROJECT_BOARD_COLUMN ||--o{ PROJECT_TASK_BOARD_POSITION : board_column
    PROJECT_MATERIAL_REQUIREMENT ||--o{ PROC_PURCHASE_REQUISITION_LINE : project_material_requirement
    PROJECT_PROJECT ||--o{ ANALYTICS_ALERT_EVENT : project
    PROJECT_PROJECT ||--o{ ANALYTICS_KPI_RESULT : project
    PROJECT_PROJECT ||--o{ ANALYTICS_KPI_TARGET : project
    PROJECT_PROJECT ||--o{ ASSET_ASSET : project
    PROJECT_PROJECT ||--o{ CRM_EXECUTIVE_APPROVAL : project
    PROJECT_PROJECT ||--o{ CRM_FEEDBACK : project
    PROJECT_PROJECT ||--o{ CRM_SURVEY_RESPONSE : project
    PROJECT_PROJECT ||--o{ FIN_BILLING_DOCUMENT : project
    PROJECT_PROJECT ||--o{ FIN_BILLING_DOCUMENT_LINE : project
    PROJECT_PROJECT ||--o{ FIN_BUDGET_LINE : project
    PROJECT_PROJECT ||--o{ FIN_COST_BASELINE : project
    PROJECT_PROJECT ||--o{ FIN_COST_VARIANCE : project
    PROJECT_PROJECT ||--o{ FIN_JOURNAL_LINE : project
    PROJECT_PROJECT ||--o{ FIN_OVERHEAD_ALLOCATION : project
    PROJECT_PROJECT ||--o{ FIN_PROJECT_COST_SNAPSHOT : project
    PROJECT_PROJECT ||--o{ FIN_PROJECT_FUNDING : project
    PROJECT_PROJECT ||--o{ FIN_PROJECT_WIP_SNAPSHOT : project
    PROJECT_PROJECT ||--o{ FIN_UNIT_COST_SNAPSHOT : project
    PROJECT_PROJECT ||--o{ IAM_USER_PROJECT_ACCESS : project
    PROJECT_PROJECT ||--o{ INV_STOCK_LEDGER_ENTRY : project
    PROJECT_PROJECT ||--o{ INV_STOCK_MOVE : project
    PROJECT_PROJECT ||--o{ INV_STOCK_RESERVATION : project
    PROJECT_PROJECT ||--o{ MFG_COST_LEDGER_ENTRY : project
    PROJECT_PROJECT ||--o{ MFG_LABOR_LOG : project
    PROJECT_PROJECT ||--o{ MFG_MACHINE_LOG : project
    PROJECT_PROJECT ||--o{ MFG_PRODUCTION_ORDER : project
    PROJECT_PROJECT ||--o{ PROC_PURCHASE_ORDER_LINE : project
    PROJECT_PROJECT ||--o{ PROC_PURCHASE_REQUISITION : project
    PROJECT_PROJECT ||--o{ PROJECT_BOARD : project
    PROJECT_PROJECT ||--o{ PROJECT_BUDGET_LINE : project
    PROJECT_PROJECT ||--o{ PROJECT_CHANGE_REQUEST : project
    PROJECT_PROJECT ||--o{ PROJECT_EQUIPMENT_USAGE : project
    PROJECT_PROJECT ||--o{ PROJECT_HEALTH_SNAPSHOT : project
    PROJECT_PROJECT ||--o{ PROJECT_ISSUE : project
    PROJECT_PROJECT ||--o{ PROJECT_MATERIAL_REQUIREMENT : project
    PROJECT_PROJECT ||--o{ PROJECT_MEMBER : project
    PROJECT_PROJECT ||--o{ PROJECT_MILESTONE : project
    PROJECT_PROJECT ||--o{ PROJECT_PROGRESS_SNAPSHOT : project
    PROJECT_PROJECT ||--o{ PROJECT_RESOURCE_REQUEST : project
    PROJECT_PROJECT ||--o{ PROJECT_RISK : project
    PROJECT_PROJECT ||--o{ PROJECT_TASK : project
    PROJECT_PROJECT ||--o{ PROJECT_TECHNICAL_BRIEF : project
    PROJECT_PROJECT ||--o{ PROJECT_TIMESHEET : project
    PROJECT_PROJECT ||--o{ PROJECT_WEIGHT_INDICATOR : project
    PROJECT_PROJECT ||--o{ SALES_DEMAND_SUPPLY_LINK : project
    PROJECT_PROJECT ||--o{ SALES_ORDER_CHANGE_REQUEST : project
    PROJECT_PROJECT ||--o{ SALES_ORDER_LINE : project
    PROJECT_PROJECT ||--o| VIEW_PROJECT_DASHBOARD : summarizes
    PROJECT_PROJECT ||--o| VIEW_PROJECT_TIMELINE_COST : summarizes
    PROJECT_REQUIREMENT ||--o{ PROJECT_ACCEPTANCE_CRITERIA : requirement
    PROJECT_REQUIREMENT ||--o{ PROJECT_REQUIREMENT : parent_requirement
    PROJECT_RESOURCE_REQUEST ||--o{ PROJECT_RESOURCE_REQUEST_LINE : resource_request
    PROJECT_RESOURCE_REQUEST_LINE ||--o{ PROJECT_RESOURCE_ALLOCATION : resource_request_line
    PROJECT_TASK ||--o{ PROJECT_EQUIPMENT_USAGE : task
    PROJECT_TASK ||--o{ PROJECT_ISSUE : task
    PROJECT_TASK ||--o{ PROJECT_MATERIAL_REQUIREMENT : task
    PROJECT_TASK ||--o{ PROJECT_RESOURCE_REQUEST : task
    PROJECT_TASK ||--o{ PROJECT_TASK : parent_task
    PROJECT_TASK ||--o{ PROJECT_TASK_BOARD_POSITION : task
    PROJECT_TASK ||--o{ PROJECT_TASK_DEPENDENCY : predecessor_task
    PROJECT_TASK ||--o{ PROJECT_TASK_DEPENDENCY : successor_task
    PROJECT_TASK ||--o{ PROJECT_TIMESHEET : task
    PROJECT_TECHNICAL_BRIEF ||--o{ PROJECT_REQUIREMENT : technical_brief
    PROJECT_TECHNICAL_BRIEF ||--o{ PROJECT_TECHNICAL_BRIEF_VERSION : technical_brief
    PROJECT_WEIGHT_INDICATOR ||--o{ PROJECT_WEIGHT_COMPONENT : project_weight_indicator

    %% PROC RELATIONSHIPS
    PROC_GOODS_RECEIPT ||--o{ PROC_GOODS_RECEIPT_LINE : goods_receipt
    PROC_GOODS_RECEIPT ||--o{ PROC_THREE_WAY_MATCH : goods_receipt
    PROC_GOODS_RECEIPT ||--o{ QA_INSPECTION : goods_receipt
    PROC_PURCHASE_ORDER ||--o{ FIN_BILLING_DOCUMENT : purchase_order
    PROC_PURCHASE_ORDER ||--o{ PROC_GOODS_RECEIPT : purchase_order
    PROC_PURCHASE_ORDER ||--o{ PROC_PURCHASE_ORDER_LINE : purchase_order
    PROC_PURCHASE_ORDER ||--o{ PROC_THREE_WAY_MATCH : purchase_order
    PROC_PURCHASE_ORDER_LINE ||--o{ PROC_GOODS_RECEIPT_LINE : purchase_order_line
    PROC_PURCHASE_ORDER_LINE ||--o{ SALES_DEMAND_SUPPLY_LINK : purchase_order_line
    PROC_PURCHASE_REQUISITION ||--o{ PROC_PURCHASE_REQUISITION_LINE : requisition
    PROC_PURCHASE_REQUISITION ||--o{ PROC_RFQ : requisition
    PROC_PURCHASE_REQUISITION_LINE ||--o{ PROC_PURCHASE_ORDER_LINE : requisition_line
    PROC_RFQ ||--o{ PROC_SUPPLIER_QUOTATION : rfq
    PROC_SUPPLIER_QUOTATION ||--o{ PROC_PURCHASE_ORDER : supplier_quotation

    %% INV RELATIONSHIPS
    INV_LOT ||--o{ INV_STOCK_BALANCE : lot
    INV_LOT ||--o{ INV_STOCK_COUNT_LINE : lot
    INV_LOT ||--o{ INV_STOCK_LEDGER_ENTRY : lot
    INV_LOT ||--o{ INV_STOCK_MOVE_LINE : lot
    INV_LOT ||--o{ MFG_PRODUCTION_OUTPUT : lot
    INV_LOT ||--o{ PROC_GOODS_RECEIPT_LINE : lot
    INV_LOT ||--o{ QA_INSPECTION : lot
    INV_LOT ||--o{ SALES_DELIVERY_LINE : lot
    INV_SERIAL_NUMBER ||--o{ INV_STOCK_BALANCE : serial_number
    INV_SERIAL_NUMBER ||--o{ INV_STOCK_LEDGER_ENTRY : serial_number
    INV_SERIAL_NUMBER ||--o{ INV_STOCK_MOVE_LINE : serial_number
    INV_SERIAL_NUMBER ||--o{ PROC_GOODS_RECEIPT_LINE : serial_number
    INV_SERIAL_NUMBER ||--o{ SALES_DELIVERY_LINE : serial_number
    INV_SERIAL_NUMBER ||--o{ SERVICE_CASE : serial_number
    INV_STOCK_COUNT ||--o{ INV_STOCK_COUNT_LINE : stock_count
    INV_STOCK_LEDGER_ENTRY ||--o{ INV_STOCK_BALANCE : last_ledger_entry
    INV_STOCK_LEDGER_ENTRY ||--o{ INV_STOCK_LEDGER_ENTRY : reversal_of
    INV_STOCK_LEDGER_ENTRY ||--o{ INV_VALUATION_LAYER : receipt_ledger_entry
    INV_STOCK_LEDGER_ENTRY ||--o{ MFG_COST_LEDGER_ENTRY : stock_ledger_entry
    INV_STOCK_MOVE ||--o{ INV_STOCK_MOVE_LINE : stock_move
    INV_STOCK_RESERVATION ||--o{ PROJECT_RESOURCE_ALLOCATION : stock_reservation
    INV_STOCK_RESERVATION ||--o{ SALES_DEMAND_SUPPLY_LINK : stock_reservation

    %% MFG RELATIONSHIPS
    MFG_BOM ||--o{ MFG_BOM_VERSION : bom
    MFG_BOM_VERSION ||--o{ MFG_BOM_LINE : bom_version
    MFG_BOM_VERSION ||--o{ MFG_PRODUCTION_ORDER : bom_version
    MFG_COST_LEDGER_ENTRY ||--o{ MFG_COST_LEDGER_ENTRY : reversal_of
    MFG_PRODUCTION_ORDER ||--o{ FIN_OVERHEAD_ALLOCATION : production_order
    MFG_PRODUCTION_ORDER ||--o{ FIN_UNIT_COST_SNAPSHOT : production_order
    MFG_PRODUCTION_ORDER ||--o{ INV_STOCK_LEDGER_ENTRY : production_order
    MFG_PRODUCTION_ORDER ||--o{ INV_STOCK_MOVE : production_order
    MFG_PRODUCTION_ORDER ||--o{ INV_STOCK_RESERVATION : production_order
    MFG_PRODUCTION_ORDER ||--o{ MFG_COST_LEDGER_ENTRY : production_order
    MFG_PRODUCTION_ORDER ||--o{ MFG_PRODUCTION_MATERIAL : production_order
    MFG_PRODUCTION_ORDER ||--o{ MFG_PRODUCTION_OUTPUT : production_order
    MFG_PRODUCTION_ORDER ||--o{ MFG_SCRAP : production_order
    MFG_PRODUCTION_ORDER ||--o{ MFG_WORK_ORDER : production_order
    MFG_PRODUCTION_ORDER ||--o{ PROJECT_TASK : production_order
    MFG_PRODUCTION_ORDER ||--o{ QA_INSPECTION : production_order
    MFG_PRODUCTION_ORDER ||--o{ SALES_DEMAND_SUPPLY_LINK : production_order
    MFG_ROUTING ||--o{ MFG_PRODUCTION_ORDER : routing
    MFG_ROUTING ||--o{ MFG_ROUTING_OPERATION : routing
    MFG_ROUTING_OPERATION ||--o{ MFG_BOM_LINE : operation
    MFG_ROUTING_OPERATION ||--o{ MFG_WORK_ORDER : routing_operation
    MFG_WORK_ORDER ||--o{ MFG_COST_LEDGER_ENTRY : work_order
    MFG_WORK_ORDER ||--o{ MFG_LABOR_LOG : work_order
    MFG_WORK_ORDER ||--o{ MFG_MACHINE_LOG : work_order
    MFG_WORK_ORDER ||--o{ MFG_SCRAP : work_order
    MFG_WORK_ORDER ||--o{ PROJECT_PROGRESS_SNAPSHOT : work_order
    MFG_WORK_ORDER ||--o{ QA_INSPECTION : work_order

    %% QA RELATIONSHIPS
    QA_INSPECTION ||--o{ QA_INSPECTION_RESULT : inspection
    QA_INSPECTION ||--o{ QA_NONCONFORMANCE : inspection
    QA_NONCONFORMANCE ||--o{ QA_CORRECTIVE_ACTION : nonconformance
    QA_QUALITY_PLAN ||--o{ QA_INSPECTION : quality_plan
    QA_QUALITY_PLAN ||--o{ QA_QUALITY_PLAN_POINT : quality_plan
    QA_QUALITY_PLAN_POINT ||--o{ QA_INSPECTION_RESULT : plan_point

    %% FIN RELATIONSHIPS
    FIN_ACCOUNT ||--o{ ASSET_CATEGORY : accumulated_depreciation_account
    FIN_ACCOUNT ||--o{ ASSET_CATEGORY : asset_account
    FIN_ACCOUNT ||--o{ ASSET_CATEGORY : depreciation_expense_account
    FIN_ACCOUNT ||--o{ FIN_ACCOUNT : parent_account
    FIN_ACCOUNT ||--o{ FIN_BANK_ACCOUNT : ledger_account
    FIN_ACCOUNT ||--o{ FIN_BILLING_DOCUMENT_LINE : account
    FIN_ACCOUNT ||--o{ FIN_BUDGET_LINE : account
    FIN_ACCOUNT ||--o{ FIN_COST_BASELINE_LINE : account
    FIN_ACCOUNT ||--o{ FIN_JOURNAL_LINE : account
    FIN_ACCOUNT ||--o{ FIN_OVERHEAD_RULE : source_account
    FIN_ACCOUNT ||--o{ FIN_RECURRING_PAYMENT_RULE : expense_account
    FIN_ACCOUNT ||--o{ MASTER_TAX_CODE : input_account
    FIN_ACCOUNT ||--o{ MASTER_TAX_CODE : output_account
    FIN_ACCOUNT ||--o{ PROJECT_BUDGET_LINE : account
    FIN_ACCOUNT ||--o| MASTER_CUSTOMER_PROFILE : receivable_account
    FIN_ACCOUNT ||--o| MASTER_SUPPLIER_PROFILE : payable_account
    FIN_AR_AP_SCHEDULE ||--o{ FIN_PAYMENT_ALLOCATION : schedule
    FIN_BANK_ACCOUNT ||--o{ FIN_BANK_STATEMENT : bank_account
    FIN_BANK_ACCOUNT ||--o{ FIN_PAYMENT : bank_account
    FIN_BANK_ACCOUNT ||--o{ FIN_RECURRING_PAYMENT_RULE : bank_account
    FIN_BANK_STATEMENT ||--o{ FIN_BANK_STATEMENT_LINE : bank_statement
    FIN_BANK_STATEMENT_LINE ||--o{ FIN_BANK_RECONCILIATION : bank_statement_line
    FIN_BILLING_DOCUMENT ||--o{ FIN_AR_AP_SCHEDULE : billing_document
    FIN_BILLING_DOCUMENT ||--o{ FIN_BILLING_DOCUMENT_LINE : billing_document
    FIN_BILLING_DOCUMENT ||--o{ FIN_PAYMENT_ALLOCATION : billing_document
    FIN_BILLING_DOCUMENT ||--o{ FIN_TAX_TRANSACTION : billing_document
    FIN_BILLING_DOCUMENT ||--o{ PROC_THREE_WAY_MATCH : supplier_invoice
    FIN_BILLING_DOCUMENT ||--o{ SERVICE_CASE : billing_document
    FIN_BILLING_DOCUMENT ||--o{ SERVICE_RESOLUTION : credit_note
    FIN_BILLING_DOCUMENT_LINE ||--o{ FIN_TAX_TRANSACTION : billing_document_line
    FIN_BUDGET ||--o{ FIN_BUDGET_LINE : budget
    FIN_COST_BASELINE ||--o{ FIN_COST_BASELINE_LINE : cost_baseline
    FIN_COST_BASELINE_LINE ||--o{ FIN_COST_VARIANCE : cost_baseline_line
    FIN_FISCAL_PERIOD ||--o{ ASSET_DEPRECIATION_LINE : fiscal_period
    FIN_FISCAL_PERIOD ||--o{ FIN_COST_VARIANCE : fiscal_period
    FIN_FISCAL_PERIOD ||--o{ FIN_FINANCIAL_SNAPSHOT : fiscal_period
    FIN_FISCAL_PERIOD ||--o{ FIN_JOURNAL_ENTRY : fiscal_period
    FIN_FISCAL_PERIOD ||--o{ FIN_OVERHEAD_ALLOCATION : fiscal_period
    FIN_FISCAL_PERIOD ||--o{ FIN_PERIOD_CLOSING : fiscal_period
    FIN_FISCAL_PERIOD ||--o{ FIN_PROJECT_WIP_SNAPSHOT : fiscal_period
    FIN_FISCAL_YEAR ||--o{ FIN_BUDGET : fiscal_year
    FIN_FISCAL_YEAR ||--o{ FIN_FISCAL_PERIOD : fiscal_year
    FIN_JOURNAL ||--o{ FIN_JOURNAL_ENTRY : journal
    FIN_JOURNAL_ENTRY ||--o{ ASSET_DEPRECIATION_LINE : journal_entry
    FIN_JOURNAL_ENTRY ||--o{ ASSET_DISPOSAL : journal_entry
    FIN_JOURNAL_ENTRY ||--o{ FIN_JOURNAL_ENTRY : reversal_of_entry
    FIN_JOURNAL_ENTRY ||--o{ FIN_JOURNAL_LINE : journal_entry
    FIN_JOURNAL_ENTRY ||--o{ FIN_OVERHEAD_ALLOCATION : journal_entry
    FIN_JOURNAL_ENTRY ||--o{ FIN_PAYMENT : journal_entry
    FIN_JOURNAL_ENTRY ||--o{ FIN_PROJECT_FUNDING_TRANSACTION : journal_entry
    FIN_JOURNAL_LINE ||--o{ FIN_BANK_RECONCILIATION : journal_line
    FIN_JOURNAL_LINE ||--o{ MFG_COST_LEDGER_ENTRY : journal_line
    FIN_OVERHEAD_RULE ||--o{ FIN_OVERHEAD_ALLOCATION : overhead_rule
    FIN_PAYMENT ||--o{ FIN_BANK_RECONCILIATION : payment
    FIN_PAYMENT ||--o{ FIN_PAYMENT_ALLOCATION : payment
    FIN_PAYMENT ||--o{ FIN_PROJECT_FUNDING_TRANSACTION : payment
    FIN_PAYMENT ||--o{ FIN_RECURRING_PAYMENT_RUN : payment
    FIN_PROJECT_FUNDING ||--o{ FIN_PROJECT_FUNDING_TRANSACTION : project_funding
    FIN_RECURRING_PAYMENT_RULE ||--o{ FIN_RECURRING_PAYMENT_RUN : recurring_rule

    %% ASSET RELATIONSHIPS
    ASSET_ASSET ||--o{ ASSET_BOOK : asset
    ASSET_ASSET ||--o{ ASSET_DISPOSAL : asset
    ASSET_ASSET ||--o{ ASSET_MAINTENANCE : asset
    ASSET_ASSET ||--o{ MASTER_MACHINE : asset
    ASSET_ASSET ||--o{ PROJECT_EQUIPMENT_USAGE : asset
    ASSET_BOOK ||--o{ ASSET_DEPRECIATION_LINE : asset_book

    %% SERVICE RELATIONSHIPS
    SERVICE_CASE ||--o{ CRM_CONVERSATION : service_case
    SERVICE_CASE ||--o{ CRM_FEEDBACK : service_case
    SERVICE_CASE ||--o{ SERVICE_CASE_APPROVAL : service_case
    SERVICE_CASE ||--o{ SERVICE_CASE_MESSAGE : service_case
    SERVICE_CASE ||--o{ SERVICE_RESOLUTION : service_case

    %% LOGISTICS RELATIONSHIPS
    LOGISTICS_SHIPMENT ||--o{ LOGISTICS_PROOF_OF_DELIVERY : shipment
    LOGISTICS_SHIPMENT ||--o{ LOGISTICS_SHIPMENT_LINE : shipment
    LOGISTICS_SHIPMENT ||--o{ LOGISTICS_TRACKING_EVENT : shipment

    %% IMPLEMENTATION RELATIONSHIPS
    IMPLEMENTATION_PHASE ||--o{ IMPLEMENTATION_PHASE_ITEM : phase
    IMPLEMENTATION_PHASE ||--o{ IMPLEMENTATION_TEST_CYCLE : phase
    IMPLEMENTATION_PHASE ||--o{ IMPLEMENTATION_WORK_ITEM : phase
    IMPLEMENTATION_RELEASE ||--o{ IMPLEMENTATION_GTM_MILESTONE : release
    IMPLEMENTATION_RELEASE ||--o{ IMPLEMENTATION_PHASE : release
    IMPLEMENTATION_RELEASE ||--o{ IMPLEMENTATION_TEST_CYCLE : release
    IMPLEMENTATION_RELEASE ||--o{ IMPLEMENTATION_WORKFLOW : release
    IMPLEMENTATION_RELEASE ||--o{ IMPLEMENTATION_WORK_ITEM : release
    IMPLEMENTATION_WORKFLOW ||--o{ IMPLEMENTATION_WORKFLOW_STAGE : workflow
    IMPLEMENTATION_WORKFLOW_STAGE ||--o{ IMPLEMENTATION_WORK_ITEM : workflow_stage
```

## Matriks kesesuaian terhadap Information Architecture PNG

| Area/fungsi pada PNG                        | Struktur database yang mendukung                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Executive memiliki akses penuh              | `IAM_ROLE_HIERARCHY`, `IAM_ROLE_PERMISSION`, `IAM_ROLE_DATA_SCOPE`                                                  |
| Informasi terbatas PM–Finance–CRM–Technical | `IAM_INFORMATION_SHARE_RULE`, `IAM_FIELD_PERMISSION`, `IAM_USER_PROJECT_ACCESS`                                     |
| Dashboard utama Finance                     | `ANALYTICS_DASHBOARD`, `ANALYTICS_WIDGET`, `VIEW_FINANCE_MAIN_DASHBOARD`                                            |
| Laba rugi dan cashflow real-time            | `FIN_FINANCIAL_SNAPSHOT`, `FIN_JOURNAL_ENTRY`, `FIN_JOURNAL_LINE`                                                   |
| Unit-unit HPP                               | `FIN_UNIT_COST_SNAPSHOT`, `MFG_COST_LEDGER_ENTRY`                                                                   |
| Peringatan dan KPI periodik                 | `ANALYTICS_ALERT_RULE`, `ANALYTICS_ALERT_EVENT`, `ANALYTICS_KPI_*`                                                  |
| CoA, jurnal, pajak, tutup buku              | `FIN_ACCOUNT`, `FIN_JOURNAL_*`, `FIN_TAX_TRANSACTION`, `FIN_PERIOD_CLOSING`                                         |
| Vendor invoice dan three-way matching       | `FIN_BILLING_DOCUMENT`, `PROC_THREE_WAY_MATCH`                                                                      |
| Batch payment                               | `FIN_PAYMENT`, `FIN_PAYMENT_ALLOCATION`                                                                             |
| Recurring payment                           | `FIN_RECURRING_PAYMENT_RULE`, `FIN_RECURRING_PAYMENT_RUN`                                                           |
| Limit kredit                                | `FIN_CREDIT_FACILITY`, `MASTER_CUSTOMER_PROFILE`, `CRM_CREDIT_STATUS_SNAPSHOT`                                      |
| Work in progress                            | `FIN_PROJECT_WIP_SNAPSHOT`                                                                                          |
| Permodalan/pembiayaan proyek                | `FIN_PROJECT_FUNDING`, `FIN_PROJECT_FUNDING_TRANSACTION`                                                            |
| Selisih biaya ideal dan riil                | `FIN_COST_BASELINE*`, `FIN_COST_VARIANCE`                                                                           |
| Biaya overhead                              | `FIN_OVERHEAD_RULE`, `FIN_OVERHEAD_ALLOCATION`                                                                      |
| Invoice/document builder                    | `CORE_DOCUMENT_TEMPLATE*`, `CORE_GENERATED_DOCUMENT`, `CORE_DOCUMENT_SIGNATURE`                                     |
| Nilai, depresiasi, maintenance aset         | `ASSET_ASSET`, `ASSET_BOOK`, `ASSET_DEPRECIATION_LINE`, `ASSET_MAINTENANCE`                                         |
| Dashboard Project dan KPI                   | `VIEW_PROJECT_DASHBOARD`, `ANALYTICS_KPI_*`                                                                         |
| Gantt dan summary task                      | `PROJECT_TASK`, `PROJECT_TASK_DEPENDENCY`                                                                           |
| Notification dan quick actions              | `CORE_NOTIFICATION*`, `CORE_QUICK_ACTION`                                                                           |
| Project health status                       | `PROJECT_HEALTH_RULE`, `PROJECT_HEALTH_SNAPSHOT`, `PROJECT_RISK`, `PROJECT_ISSUE`                                   |
| Timeline dan Kanban                         | `PROJECT_BOARD*`, `PROJECT_TASK_BOARD_POSITION`                                                                     |
| Milestones/KPI                              | `PROJECT_MILESTONE`, `ANALYTICS_KPI_*`                                                                              |
| Linked sales orders                         | `PROJECT_PROJECT.sales_order_id`, `SALES_DEMAND_SUPPLY_LINK`                                                        |
| Spesifikasi teknis/brief                    | `PROJECT_TECHNICAL_BRIEF*`, `PROJECT_REQUIREMENT`, `PROJECT_ACCEPTANCE_CRITERIA`                                    |
| Change of order/update                      | `SALES_ORDER_CHANGE_REQUEST`, `PROJECT_CHANGE_REQUEST`                                                              |
| Alokasi material dan permintaan resource    | `PROJECT_RESOURCE_REQUEST*`, `PROJECT_RESOURCE_ALLOCATION`, `INV_STOCK_RESERVATION`                                 |
| Work order progress dan QA                  | `PROJECT_PROGRESS_SNAPSHOT`, `MFG_WORK_ORDER`, `QA_INSPECTION*`                                                     |
| Jam kerja alat dan pekerja                  | `PROJECT_TIMESHEET`, `PROJECT_EQUIPMENT_USAGE`, `MFG_LABOR_LOG`, `MFG_MACHINE_LOG`                                  |
| Modal dan pengeluaran proyek                | `FIN_PROJECT_COST_SNAPSHOT`, `FIN_PROJECT_FUNDING*`                                                                 |
| Dashboard Sales dan indikator bobot proyek  | `VIEW_CRM_SALES_DASHBOARD`, `PROJECT_WEIGHT_INDICATOR*`                                                             |
| Prospect–pitch–closing dan win rate         | `CRM_PIPELINE*`, `CRM_OPPORTUNITY_STAGE_HISTORY`, `CRM_OPPORTUNITY`                                                 |
| Keuntungan offering                         | `CRM_OPPORTUNITY.expected_margin`, `SALES_QUOTATION.estimated_margin`                                               |
| Profil dan kontak customer                  | `MASTER_PARTY`, `MASTER_CONTACT`, `MASTER_CUSTOMER_PROFILE`                                                         |
| Executive approval                          | `CRM_EXECUTIVE_APPROVAL`, `CORE_WORKFLOW_APPROVAL`, `IAM_APPROVAL_LIMIT`                                            |
| Credit status                               | `CRM_CREDIT_STATUS_SNAPSHOT`                                                                                        |
| Estimating dan quotation                    | `SALES_QUOTATION*`, `SALES_QUOTATION_COST`                                                                          |
| Kontrak umum dan berkala                    | `SALES_CONTRACT`, `SALES_CONTRACT_LINE`                                                                             |
| Otomasi repeat order                        | `SALES_RECURRING_ORDER_RULE`, `SALES_RECURRING_ORDER_RUN`                                                           |
| Omnichannel dashboard                       | `CRM_CHANNEL_ACCOUNT`, `CRM_CONVERSATION*`, `CRM_MESSAGE*`                                                          |
| Delivery tracking                           | `LOGISTICS_SHIPMENT*`, `LOGISTICS_TRACKING_EVENT`, `LOGISTICS_PROOF_OF_DELIVERY`                                    |
| Feedback center                             | `CRM_FEEDBACK`, `CRM_SURVEY*`                                                                                       |
| Suggested Phase 1–4                         | `IMPLEMENTATION_RELEASE`, `IMPLEMENTATION_PHASE`, `IMPLEMENTATION_PHASE_ITEM`                                       |
| Suggested Workflow dan testing/GTM/launch   | `IMPLEMENTATION_WORKFLOW*`, `IMPLEMENTATION_WORK_ITEM`, `IMPLEMENTATION_TEST_CYCLE`, `IMPLEMENTATION_GTM_MILESTONE` |

## Seed role yang harus dibuat

* `EXECUTIVE`: akses penuh seluruh modul dan seluruh data.
* `PROJECT_MANAGEMENT`: akses penuh Project Management dan akses terbatas ke data Finance/CRM sesuai share rule.
* `ACCOUNTING_FINANCE`: akses penuh Finance dan akses terbatas ke data Project/CRM.
* `CRM`: akses penuh CRM/Sales dan akses terbatas ke status, nilai, serta approval terkait proyek.
* `PROJECT_MANAGEMENT_TECHNICAL`: akses teknis untuk brief, resource, work order, progress, dan QA.

Kesesuaian 100% di sini berarti setiap node fitur pada PNG sudah memiliki representasi berupa tabel transaksi, tabel konfigurasi, tabel snapshot, atau database view. Rumus KPI, aturan approval, serta batas informasi yang dibagikan tetap dikonfigurasi melalui data dan application service, bukan di-hardcode pada tabel.
