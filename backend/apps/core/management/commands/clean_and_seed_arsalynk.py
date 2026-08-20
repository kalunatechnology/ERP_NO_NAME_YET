"""
Management command: clean_and_seed_arsalynk

Wipes ALL app data and re-seeds the database with a single tenant
(Arsalynk Technology) plus all master data, user accounts, and workflow
configurations needed to run the full ERP prototype.

Usage:
    python manage.py clean_and_seed_arsalynk
    python manage.py clean_and_seed_arsalynk --yes  # skip confirmation
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import connection, transaction

User = get_user_model()

# All app data tables — PostgreSQL TRUNCATE CASCADE handles FK order automatically.
# Excludes: django_migrations, django_content_type, auth_*, iam_permission (schema-level).
TABLES_TO_CLEAR = [
    "workflow_transition_log", "workflow_tenant_config",
    "analytics_alert_event", "analytics_kpi_result", "analytics_kpi_definition", "analytics_alert_rule",
    "fin_billing_proposal", "fin_project_cost_entry", "fin_project_wip_snapshot", "fin_project_cost_snapshot",
    "fin_cost_variance", "fin_cost_baseline_line", "fin_cost_baseline",
    "fin_overhead_allocation", "fin_overhead_rule",
    "fin_project_funding_transaction", "fin_project_funding",
    "fin_invoice_variance_case", "fin_unit_cost_snapshot", "fin_financial_snapshot",
    "fin_budget_line", "fin_budget",
    "fin_recurring_payment_run", "fin_recurring_payment_rule",
    "fin_credit_facility", "fin_ar_ap_schedule",
    "fin_bank_reconciliation", "fin_bank_statement_line", "fin_bank_statement",
    "fin_payment_allocation", "fin_payment",
    "fin_billing_document_line", "fin_billing_document",
    "fin_tax_transaction", "fin_journal_line", "fin_journal_entry", "fin_journal",
    "fin_period_closing", "fin_fiscal_period", "fin_fiscal_year",
    "fin_bank_account", "fin_account",
    "mfg_scrap", "mfg_labor_log", "mfg_machine_log", "mfg_cost_ledger_entry",
    "mfg_production_material", "mfg_production_output", "mfg_work_order", "mfg_production_order",
    "mfg_bom_line", "mfg_bom_version", "mfg_bom", "mfg_routing_operation", "mfg_routing",
    "qa_corrective_action", "qa_nonconformance", "qa_inspection_result", "qa_inspection",
    "qa_quality_plan_point", "qa_quality_plan",
    "project_timesheet", "project_equipment_usage", "project_expense",
    "project_health_snapshot", "project_progress_snapshot",
    "project_task_dependency", "project_task_board_position", "project_task",
    "project_board_column", "project_board",
    "project_issue_action", "project_issue",
    "project_change_request_material", "project_change_request",
    "project_risk", "project_milestone",
    "project_resource_request_line", "project_resource_request", "project_resource_allocation",
    "project_material_requirement", "project_budget_line",
    "project_acceptance_criteria", "project_readiness_check",
    "project_weight_component", "project_weight_indicator",
    "project_control_item", "project_dispatch", "project_lifecycle_event",
    "project_member", "project_requirement",
    "project_technical_brief_version", "project_technical_brief", "project_project",
    "proc_three_way_match", "proc_goods_receipt_line", "proc_goods_receipt",
    "proc_supplier_quotation", "proc_rfq",
    "proc_purchase_requisition_line", "proc_purchase_requisition",
    "proc_purchase_order_line", "proc_purchase_order",
    "inv_stock_move_line", "inv_stock_move", "inv_stock_reservation",
    "inv_stock_count_line", "inv_stock_count", "inv_valuation_layer",
    "inv_stock_ledger_entry", "inv_stock_balance", "inv_serial_number", "inv_lot",
    "logistics_tracking_event", "logistics_proof_of_delivery",
    "logistics_shipment_line", "logistics_shipment",
    "service_case_message", "service_case_approval", "service_resolution", "service_case",
    "sales_recurring_order_run", "sales_recurring_order_rule",
    "sales_demand_supply_link", "sales_delivery_line", "sales_delivery",
    "sales_order_change_request", "sales_order_line", "sales_order",
    "sales_contract_line", "sales_contract",
    "sales_quotation_cost", "sales_quotation_line", "sales_quotation",
    "crm_workflow_event", "crm_survey_answer", "crm_survey_response",
    "crm_survey_question", "crm_survey",
    "crm_message_delivery_status", "crm_message_attachment",
    "crm_message", "crm_conversation_participant", "crm_conversation",
    "crm_channel_account", "crm_feedback", "crm_activity",
    "crm_opportunity_stage_history", "crm_opportunity_product", "crm_opportunity",
    "crm_executive_approval", "crm_credit_status_snapshot",
    "crm_quotation_version", "crm_quotation_delivery",
    "crm_cost_estimate_line", "crm_cost_estimate",
    "crm_inquiry_requirement", "crm_customer_inquiry",
    "crm_lead", "crm_pipeline_stage", "crm_pipeline",
    "asset_disposal", "asset_depreciation_line", "asset_maintenance",
    "asset_book", "asset_asset", "asset_category",
    "implementation_gtm_milestone", "implementation_test_cycle", "implementation_work_item",
    "implementation_workflow_stage", "implementation_workflow",
    "implementation_phase_item", "implementation_phase", "implementation_release",
    "core_audit_event", "core_workflow_approval", "core_workflow_instance",
    "core_document_link", "core_document_attachment", "core_document_signature",
    "core_generated_document", "core_notification_recipient", "core_notification",
    "core_file", "core_quick_action", "core_business_document", "core_organization",
    "iam_user_project_access", "iam_user_role", "iam_user_groups", "iam_user_user_permissions",
    "token_blacklist_blacklistedtoken", "token_blacklist_outstandingtoken", "iam_user",
    "master_exchange_rate", "master_contact", "master_address",
    "master_supplier_profile", "master_customer_profile",
    "master_party_role", "master_party",
    "master_warehouse_location", "master_warehouse",
    "master_cost_center", "master_department",
    "master_employee", "master_machine", "master_work_center",
    "master_payment_term", "master_uom", "master_tax_code",
    "master_product", "master_product_category", "master_currency",
    "core_company", "core_tenant",
]


class Command(BaseCommand):
    help = "Wipe ALL app data and seed a fresh Arsalynk Technology tenant."

    def add_arguments(self, parser):
        parser.add_argument("--yes", action="store_true", help="Skip confirmation prompt.")

    def handle(self, *args, **options):
        if not options["yes"]:
            self.stdout.write(self.style.WARNING(
                "\n[WARNING] This will DELETE ALL DATA in the database!\n"
                "   Only run this on a development/staging environment.\n"
            ))
            confirm = input('Type "ARSALYNK" to confirm: ').strip()
            if confirm != "ARSALYNK":
                self.stdout.write(self.style.ERROR("Aborted."))
                return

        self.stdout.write("\n[*] Cleaning database...")
        self._clean_all_tables()
        self.stdout.write(self.style.SUCCESS("  [OK] All tables cleared"))

        self.stdout.write("\n[*] Seeding Arsalynk tenant...")
        with transaction.atomic():
            self._seed_arsalynk()
        self.stdout.write(self.style.SUCCESS("\n[DONE] Arsalynk tenant is ready.\n"))
        self._print_summary()

    # -----------------------------------------------------------------------
    # Step 1: Clean
    # -----------------------------------------------------------------------

    def _clean_all_tables(self):
        db_engine = connection.settings_dict.get("ENGINE", "")
        with connection.cursor() as cursor:
            if "sqlite" in db_engine:
                cursor.execute("PRAGMA foreign_keys = OFF;")
                for table in TABLES_TO_CLEAR:
                    try:
                        cursor.execute(f'DELETE FROM "{table}";')
                    except Exception as e:
                        self.stdout.write(f"  [skip] {table}: {e}")
                cursor.execute("PRAGMA foreign_keys = ON;")
            else:
                # PostgreSQL: collect existing tables then bulk TRUNCATE CASCADE
                valid = []
                for table in TABLES_TO_CLEAR:
                    try:
                        cursor.execute("SELECT to_regclass(%s)", [table])
                        res = cursor.fetchone()
                        if res and res[0]:
                            valid.append(f'"{table}"')
                    except Exception:
                        pass
                if valid:
                    try:
                        cursor.execute(
                            f"TRUNCATE TABLE {', '.join(valid)} RESTART IDENTITY CASCADE;"
                        )
                    except Exception as e:
                        self.stdout.write(f"  [WARN] Bulk truncate failed ({e}), going one-by-one...")
                        for tbl in valid:
                            try:
                                cursor.execute(f"TRUNCATE TABLE {tbl} CASCADE;")
                            except Exception as inner:
                                self.stdout.write(f"  [skip] {tbl}: {inner}")

    # -----------------------------------------------------------------------
    # Step 2: Seed
    # -----------------------------------------------------------------------

    def _seed_arsalynk(self):
        from apps.core.models import Tenant, Company
        from apps.master_data.models import (
            Currency, UOM, TaxCode, Party, Product,
            ProductCategory, Warehouse,
        )
        from apps.accounts.models import User, UserRole, Role
        from apps.workflows.models import TenantWorkflowConfig

        # 1. Tenant
        tenant = Tenant.objects.create(
            code="arsalynk",
            name="Arsalynk Technology",
            status="ACTIVE",
        )
        self.stdout.write(f"  [OK] Tenant: {tenant.name}")

        # 2. Currency (no tenant/company FK — global master)
        idr, _ = Currency.objects.get_or_create(
            currency_code="IDR",
            defaults={"currency_name": "Indonesian Rupiah", "symbol": "Rp", "decimal_places": 0},
        )
        usd, _ = Currency.objects.get_or_create(
            currency_code="USD",
            defaults={"currency_name": "US Dollar", "symbol": "$", "decimal_places": 2},
        )
        self.stdout.write("  [OK] Currencies: IDR, USD")

        # 3. Company
        company = Company.objects.create(
            tenant=tenant,
            company_code="ARSA-001",
            legal_name="PT Arsalynk Technology Indonesia",
            tax_number="01.234.567.8-012.000",
            base_currency=idr,
            fiscal_year_start=date(2026, 1, 1),
            status="ACTIVE",
        )
        self.stdout.write(f"  [OK] Company: {company.legal_name}")

        # 4. UOM
        pcs, _ = UOM.objects.get_or_create(
            uom_code="PCS", tenant=tenant,
            defaults={"uom_name": "Piece", "base_uom": True, "dimension_type": "QUANTITY"},
        )
        UOM.objects.get_or_create(
            uom_code="KG", tenant=tenant,
            defaults={"uom_name": "Kilogram", "base_uom": False, "dimension_type": "WEIGHT"},
        )
        UOM.objects.get_or_create(
            uom_code="LTR", tenant=tenant,
            defaults={"uom_name": "Liter", "base_uom": False, "dimension_type": "VOLUME"},
        )
        UOM.objects.get_or_create(
            uom_code="SET", tenant=tenant,
            defaults={"uom_name": "Set", "base_uom": False, "dimension_type": "QUANTITY"},
        )
        self.stdout.write("  [OK] UOM: PCS, KG, LTR, SET")

        # 5. Tax Codes
        TaxCode.objects.get_or_create(
            tax_code="PPN-11", tenant=tenant,
            defaults={"tax_name": "PPN 11%", "tax_rate": Decimal("11.00"), "tax_type": "OUTPUT"},
        )
        TaxCode.objects.get_or_create(
            tax_code="PPN-0", tenant=tenant,
            defaults={"tax_name": "PPN 0% (Ekspor)", "tax_rate": Decimal("0.00"), "tax_type": "OUTPUT"},
        )
        self.stdout.write("  [OK] Tax Codes: PPN-11, PPN-0")

        # 6. Warehouse
        wh_main = Warehouse.objects.create(
            company=company,
            warehouse_code="WH-MAIN",
            warehouse_name="Gudang Utama Arsalynk",
            warehouse_type="MAIN",
            status="ACTIVE",
        )
        self.stdout.write(f"  [OK] Warehouse: {wh_main.warehouse_name}")

        # 7. Product Categories
        cat_tech, _ = ProductCategory.objects.get_or_create(
            category_code="TECH",
            defaults={"category_name": "Teknologi & Solusi Digital"},
        )
        cat_infra, _ = ProductCategory.objects.get_or_create(
            category_code="INFRA",
            defaults={"category_name": "Infrastruktur & Jaringan"},
        )

        # 8. Products
        products_data = [
            ("ERP-IMPL", "Implementasi ERP", "SERVICE", cat_tech, Decimal("50000000"), Decimal("75000000")),
            ("ERP-MAINT", "Maintenance ERP Bulanan", "SERVICE", cat_tech, Decimal("3000000"), Decimal("5000000")),
            ("SERVER-01", "Server Rack Unit", "ITEM", cat_infra, Decimal("15000000"), Decimal("22000000")),
            ("NETWORK-SW", "Managed Network Switch 24-port", "ITEM", cat_infra, Decimal("8000000"), Decimal("12000000")),
        ]
        for code, name, ptype, cat, cost, price in products_data:
            Product.objects.get_or_create(
                product_code=code, tenant=tenant,
                defaults={
                    "product_name": name, "product_type": ptype,
                    "category": cat, "base_uom": pcs,
                    "stock_item": ptype == "ITEM",
                    "purchase_item": True,
                    "costing_method": "STANDARD",
                },
            )
        self.stdout.write(f"  [OK] Products: {len(products_data)} items")

        # 9. Parties (Customers & Vendors)
        parties_data = [
            ("CUST-001", "PT Maju Bersama Tbk", "CUSTOMER"),
            ("CUST-002", "CV Berkah Digital", "CUSTOMER"),
            ("VEND-001", "PT Dell Technologies Indonesia", "VENDOR"),
            ("VEND-002", "PT Cisco Systems Indonesia", "VENDOR"),
        ]
        for code, legal_name, ptype in parties_data:
            Party.objects.get_or_create(
                party_code=code, tenant=tenant,
                defaults={
                    "party_type": ptype,
                    "legal_name": legal_name,
                    "display_name": legal_name,
                    "status": "ACTIVE",
                    "default_currency": idr,
                },
            )
        self.stdout.write(f"  [OK] Parties: 2 customers, 2 vendors")

        # 10. Roles
        roles_data = [
            ("SUPER_ADMIN", "Super Administrator"),
            ("PROJECT_MANAGER", "Project Manager"),
            ("SALES", "Sales Executive"),
            ("FINANCE", "Finance Officer"),
            ("SUPERVISOR", "Supervisor"),
            ("MANAGER", "Manager"),
            ("DIRECTOR", "Director"),
            ("QUALITY_CONTROL", "Quality Control"),
            ("WAREHOUSE", "Warehouse Staff"),
        ]
        role_objects = {}
        for code, name in roles_data:
            role, _ = Role.objects.get_or_create(
                role_code=code, tenant=tenant,
                defaults={"role_name": name, "description": f"Arsalynk {name} role"},
            )
            role_objects[code] = role

        # 11. Users
        admin = User.objects.create_superuser(
            email="admin@arsalynk.id",
            username="admin",
            password="Arsalynk@2026!",
            full_name="Admin Arsalynk",
            tenant=tenant,
        )

        staff_data = [
            ("pm@arsalynk.id", "pm", "Budi Santoso", "PROJECT_MANAGER"),
            ("sales@arsalynk.id", "sales", "Dewi Rahayu", "SALES"),
            ("finance@arsalynk.id", "finance", "Candra Wijaya", "FINANCE"),
            ("supervisor@arsalynk.id", "supervisor", "Eko Prasetyo", "SUPERVISOR"),
            ("manager@arsalynk.id", "manager", "Fahmi Nugroho", "MANAGER"),
            ("director@arsalynk.id", "director", "Fauzi Hidayat", "DIRECTOR"),
            ("qc@arsalynk.id", "qc", "Gita Lestari", "QUALITY_CONTROL"),
            ("warehouse@arsalynk.id", "warehouse", "Hendra Kurnia", "WAREHOUSE"),
        ]
        for email, uname, full_name, role_code in staff_data:
            u = User.objects.create_user(
                email=email, username=uname, password="Arsalynk@2026!",
                full_name=full_name, tenant=tenant,
            )
            UserRole.objects.create(
                user=u,
                role=role_objects[role_code],
                company=company,
            )
        self.stdout.write(f"  [OK] Users: admin + {len(staff_data)} staff")

        # 12. Workflow Configurations
        wf_configs = [
            (
                "SALES_ORDER",
                "apps.workflows.tenants.arsalynk.sales_order.ArsalynkSalesOrderWorkflow",
                "Arsalynk 8-stage: DRAFT->SUPERVISOR->DIRECTOR->QC->SPK->CONFIRMED->ALLOCATED->FULFILLED",
            ),
            (
                "PROJECT",
                "apps.workflows.tenants.arsalynk.project.ArsalynkProjectWorkflow",
                "Arsalynk project lifecycle with mandatory QC Gate before COMPLETED",
            ),
            (
                "PURCHASE_ORDER",
                "apps.workflows.tenants.arsalynk.procurement.ArsalynkProcurementWorkflow",
                "3-level approval: Supervisor -> Manager -> Director for all POs",
            ),
        ]
        for module_code, class_path, desc in wf_configs:
            TenantWorkflowConfig.objects.create(
                tenant=tenant,
                module_code=module_code,
                workflow_class_path=class_path,
                is_active=True,
                description=desc,
            )
        self.stdout.write(f"  [OK] Workflow configs: {len(wf_configs)} modules")

        # Store for summary
        self._company_id = str(company.pk)

    def _print_summary(self):
        self.stdout.write("=" * 60)
        self.stdout.write(self.style.SUCCESS(">>> ARSALYNK TENANT READY <<<"))
        self.stdout.write("=" * 60)
        self.stdout.write(f"  Company ID (X-Company-ID header): {self._company_id}")
        self.stdout.write("")
        self.stdout.write("  User Accounts (password: Arsalynk@2026!):")
        self.stdout.write("    admin@arsalynk.id       (superuser)")
        self.stdout.write("    supervisor@arsalynk.id  (SUPERVISOR)")
        self.stdout.write("    manager@arsalynk.id     (MANAGER)")
        self.stdout.write("    director@arsalynk.id    (DIRECTOR)")
        self.stdout.write("    pm@arsalynk.id          (PROJECT_MANAGER)")
        self.stdout.write("    sales@arsalynk.id       (SALES)")
        self.stdout.write("    finance@arsalynk.id     (FINANCE)")
        self.stdout.write("    qc@arsalynk.id          (QUALITY_CONTROL)")
        self.stdout.write("")
        self.stdout.write("  Workflow Engine (Arsalynk-specific):")
        self.stdout.write("    SALES_ORDER   -> 8-stage (DRAFT->SPK_GENERATED->CONFIRMED)")
        self.stdout.write("    PROJECT       -> QC Gate required before COMPLETED")
        self.stdout.write("    PURCHASE_ORDER -> 3-level (Supervisor->Manager->Director)")
        self.stdout.write("=" * 60)
