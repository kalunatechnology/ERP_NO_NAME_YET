from __future__ import annotations

import json
from typing import Optional

from seeder_common import (
    SeederClient,
    SeederError,
    build_client,
    configure_logging,
    stage_is_successful,
)


def run_stage(client: Optional[SeederClient] = None) -> bool:
    configure_logging()
    own_client = client is None
    client = client or build_client()

    try:
        if own_client:
            client.bootstrap()

        tenant_id = client.require_state_id(
            ("created_records", "DUMMY-HOLDING"),
            "DUMMY-HOLDING tenant",
        )
        company_id = client.require_state_id(
            ("stage_2", "companies", "COMP-HOLDING"),
            "COMP-HOLDING company",
        )
        product_id = client.require_state_id(
            ("stage_3", "products", "PROD-ITEM-A"),
            "PROD-ITEM-A product",
        )
        customer_id = client.require_state_id(
            ("stage_3", "parties", "PARTY-CUST-01"),
            "customer party",
        )
        project_manager_id = client.require_state_id(
            ("stage_2", "users", "dummy.manager@example.com"),
            "dummy manager user",
        )
        sales_order_id = client.require_state_id(
            ("stage_4", "sales_orders", "SO-2026-001"),
            "SO-2026-001 sales order",
        )

        reports = []

        projects = [
            {
                "_key": "PROJ-2026-001",
                "tenant": tenant_id,
                "company": company_id,
                "customer_party": customer_id,
                "sales_order": sales_order_id,
                "project_manager": project_manager_id,
                "project_code": "PROJ-2026-001",
                "project_name": "Implementasi ERP Phase 1",
                "planned_start_date": "2026-08-15",
                "planned_end_date": "2027-02-28",
                "actual_start_date": "2026-08-15",
                "budget_amount": "1500000000.00",
                "progress_percent": "25.00",
                "status": "IN_PROGRESS",
            },
            {
                "_key": "PROJ-2026-002",
                "tenant": tenant_id,
                "company": company_id,
                "customer_party": customer_id,
                "project_manager": project_manager_id,
                "project_code": "PROJ-2026-002",
                "project_name": "Pengembangan Infrastruktur Jaringan",
                "planned_start_date": "2026-10-01",
                "planned_end_date": "2027-03-31",
                "budget_amount": "850000000.00",
                "progress_percent": "0.00",
                "status": "PLANNED",
            },
            {
                "_key": "PROJ-2026-003",
                "tenant": tenant_id,
                "company": company_id,
                "customer_party": customer_id,
                "project_manager": project_manager_id,
                "project_code": "PROJ-2026-003",
                "project_name": "Renovasi Gedung Operasional",
                "planned_start_date": "2026-06-01",
                "planned_end_date": "2026-12-31",
                "budget_amount": "2250000000.00",
                "progress_percent": "40.00",
                "status": "ON_HOLD",
            },
            {
                "_key": "PROJ-COMPLETED",
                "tenant": tenant_id,
                "company": company_id,
                "customer_party": customer_id,
                "project_manager": project_manager_id,
                "project_code": "PROJ-COMPLETED",
                "project_name": "Migrasi Data Server 2025",
                "planned_start_date": "2025-01-01",
                "planned_end_date": "2025-12-31",
                "actual_start_date": "2025-01-02",
                "actual_end_date": "2025-12-20",
                "budget_amount": "500000000.00",
                "progress_percent": "100.00",
                "status": "COMPLETED",
            },
            {
                "_key": "PROJ-DEL",
                "tenant": tenant_id,
                "company": company_id,
                "project_manager": project_manager_id,
                "project_code": "PROJ-DEL",
                "project_name": "Project Delete Test",
                "planned_start_date": "2026-12-01",
                "planned_end_date": "2026-12-31",
                "budget_amount": "1000.00",
                "progress_percent": "0.00",
                "status": "PLANNED",
            },
        ]
        project_report = client.seed_resource(
            stage_name="stage_6.projects",
            state_path=("stage_6", "projects"),
            endpoint="/api/v1/projects/projects/",
            items=projects,
            match_fields=("project_code", "tenant", "company"),
            patch_payload={
                "project_name": "Implementasi ERP Phase 1 Updated"
            },
            delete_key="PROJ-DEL",
            search_term="Implementasi",
            company_id=company_id,
        )
        reports.append(project_report)

        main_project_id = client.require_state_id(
            ("stage_6", "projects", "PROJ-2026-001"),
            "PROJ-2026-001 project",
        )

        tasks = [
            {
                "_key": "TASK-001",
                "project": main_project_id,
                "task_code": "TASK-001",
                "task_name": "Analisis Kebutuhan Sistem",
                "planned_start_at": "2026-08-15T08:00:00+07:00",
                "planned_end_at": "2026-08-31T17:00:00+07:00",
                "actual_start_at": "2026-08-15T08:30:00+07:00",
                "actual_end_at": "2026-08-29T16:00:00+07:00",
                "planned_hours": "120.00",
                "actual_hours": "112.00",
                "progress_percent": "100.00",
                "status": "DONE",
            },
            {
                "_key": "TASK-002",
                "project": main_project_id,
                "task_code": "TASK-002",
                "task_name": "Konfigurasi Database dan Module",
                "planned_start_at": "2026-09-01T08:00:00+07:00",
                "planned_end_at": "2026-10-15T17:00:00+07:00",
                "actual_start_at": "2026-09-01T08:00:00+07:00",
                "planned_hours": "320.00",
                "actual_hours": "145.00",
                "progress_percent": "45.00",
                "status": "IN_PROGRESS",
            },
            {
                "_key": "TASK-003",
                "project": main_project_id,
                "task_code": "TASK-003",
                "task_name": "User Acceptance Testing",
                "planned_start_at": "2026-11-01T08:00:00+07:00",
                "planned_end_at": "2026-11-30T17:00:00+07:00",
                "planned_hours": "160.00",
                "actual_hours": "0.00",
                "progress_percent": "0.00",
                "status": "TODO",
            },
            {
                "_key": "TASK-BLOCKED",
                "project": main_project_id,
                "task_code": "TASK-BLOCKED",
                "task_name": "Integrasi Payment Gateway",
                "planned_start_at": "2026-10-16T08:00:00+07:00",
                "planned_end_at": "2026-10-31T17:00:00+07:00",
                "planned_hours": "80.00",
                "actual_hours": "10.00",
                "progress_percent": "15.00",
                "status": "BLOCKED",
            },
            {
                "_key": "TASK-DEL",
                "project": main_project_id,
                "task_code": "TASK-DEL",
                "task_name": "Task Delete Test",
                "planned_start_at": "2026-12-20T08:00:00+07:00",
                "planned_end_at": "2026-12-21T17:00:00+07:00",
                "planned_hours": "8.00",
                "actual_hours": "0.00",
                "progress_percent": "0.00",
                "status": "TODO",
            },
        ]
        task_report = client.seed_resource(
            stage_name="stage_6.project_tasks",
            state_path=("stage_6", "project_tasks"),
            endpoint="/api/v1/projects/tasks/",
            items=tasks,
            match_fields=("task_code", "project"),
            patch_payload={"task_name": "Analisis Kebutuhan Sistem Updated"},
            delete_key="TASK-DEL",
            search_term="Analisis",
            company_id=company_id,
        )
        reports.append(task_report)

        production_orders = [
            {
                "_key": "PO-MFG-2026-001",
                "company": company_id,
                "product": product_id,
                "planned_quantity": "100.00",
                "completed_quantity": "20.00",
                "scrapped_quantity": "0.00",
                "planned_start_at": "2026-09-01T08:00:00+07:00",
                "planned_end_at": "2026-09-15T17:00:00+07:00",
                "actual_start_at": "2026-09-01T08:15:00+07:00",
                "material_status": "AVAILABLE",
                "quality_status": "PENDING",
                "status": "RELEASED",
            },
            {
                "_key": "PO-MFG-2026-002",
                "company": company_id,
                "product": product_id,
                "planned_quantity": "200.00",
                "completed_quantity": "0.00",
                "scrapped_quantity": "0.00",
                "planned_start_at": "2026-10-01T08:00:00+07:00",
                "planned_end_at": "2026-10-20T17:00:00+07:00",
                "material_status": "PLANNED",
                "quality_status": "PENDING",
                "status": "DRAFT",
            },
            {
                "_key": "PO-MFG-2026-003",
                "company": company_id,
                "product": product_id,
                "planned_quantity": "75.00",
                "completed_quantity": "35.00",
                "scrapped_quantity": "2.00",
                "planned_start_at": "2026-08-01T08:00:00+07:00",
                "planned_end_at": "2026-08-31T17:00:00+07:00",
                "actual_start_at": "2026-08-01T08:00:00+07:00",
                "material_status": "PARTIAL",
                "quality_status": "IN_PROGRESS",
                "status": "IN_PROGRESS",
            },
            {
                "_key": "PO-MFG-CANCELLED",
                "company": company_id,
                "product": product_id,
                "planned_quantity": "50.00",
                "completed_quantity": "0.00",
                "scrapped_quantity": "0.00",
                "planned_start_at": "2026-07-01T08:00:00+07:00",
                "planned_end_at": "2026-07-10T17:00:00+07:00",
                "material_status": "SHORTAGE",
                "quality_status": "NOT_STARTED",
                "status": "CANCELLED",
            },
            {
                "_key": "PO-MFG-DEL",
                "company": company_id,
                "product": product_id,
                "planned_quantity": "1.00",
                "completed_quantity": "0.00",
                "scrapped_quantity": "0.00",
                "planned_start_at": "2026-12-30T08:00:00+07:00",
                "planned_end_at": "2026-12-31T17:00:00+07:00",
                "material_status": "PLANNED",
                "quality_status": "PENDING",
                "status": "DRAFT",
            },
        ]
        production_report = client.seed_resource(
            stage_name="stage_6.production_orders",
            state_path=("stage_6", "production_orders"),
            endpoint="/api/v1/manufacturing/production-orders/",
            items=production_orders,
            match_fields=(
                "planned_start_at",
                "planned_quantity",
                "product",
                "company",
            ),
            patch_payload={"status": "RELEASED"},
            delete_key="PO-MFG-DEL",
            search_term="RELEASED",
            company_id=company_id,
        )
        reports.append(production_report)

        released_production_id = client.require_state_id(
            ("stage_6", "production_orders", "PO-MFG-2026-001"),
            "released production order",
        )

        work_orders = [
            {
                "_key": "WO-2026-001",
                "production_order": released_production_id,
                "sequence_number": 10,
                "planned_start_at": "2026-09-01T08:00:00+07:00",
                "planned_end_at": "2026-09-05T17:00:00+07:00",
                "planned_quantity": "100.00",
                "completed_quantity": "20.00",
                "rejected_quantity": "0.00",
                "status": "READY",
            },
            {
                "_key": "WO-2026-002",
                "production_order": released_production_id,
                "sequence_number": 20,
                "planned_start_at": "2026-09-06T08:00:00+07:00",
                "planned_end_at": "2026-09-10T17:00:00+07:00",
                "planned_quantity": "100.00",
                "completed_quantity": "10.00",
                "rejected_quantity": "1.00",
                "status": "IN_PROGRESS",
            },
            {
                "_key": "WO-2026-003",
                "production_order": released_production_id,
                "sequence_number": 30,
                "planned_start_at": "2026-09-11T08:00:00+07:00",
                "planned_end_at": "2026-09-15T17:00:00+07:00",
                "actual_start_at": "2026-09-11T08:00:00+07:00",
                "actual_end_at": "2026-09-14T16:00:00+07:00",
                "planned_quantity": "100.00",
                "completed_quantity": "100.00",
                "rejected_quantity": "2.00",
                "status": "COMPLETED",
            },
            {
                "_key": "WO-PAUSED",
                "production_order": released_production_id,
                "sequence_number": 40,
                "planned_start_at": "2026-09-16T08:00:00+07:00",
                "planned_end_at": "2026-09-18T17:00:00+07:00",
                "planned_quantity": "25.00",
                "completed_quantity": "5.00",
                "rejected_quantity": "0.00",
                "status": "PAUSED",
            },
            {
                "_key": "WO-DEL",
                "production_order": released_production_id,
                "sequence_number": 99,
                "planned_start_at": "2026-12-30T08:00:00+07:00",
                "planned_end_at": "2026-12-31T17:00:00+07:00",
                "planned_quantity": "1.00",
                "completed_quantity": "0.00",
                "rejected_quantity": "0.00",
                "status": "READY",
            },
        ]
        work_order_report = client.seed_resource(
            stage_name="stage_6.work_orders",
            state_path=("stage_6", "work_orders"),
            endpoint="/api/v1/manufacturing/work-orders/",
            items=work_orders,
            match_fields=("sequence_number", "production_order"),
            patch_payload={"status": "READY"},
            delete_key="WO-DEL",
            search_term="READY",
            company_id=company_id,
        )
        reports.append(work_order_report)

        success = stage_is_successful(reports)

        print("\n" + "=" * 68)
        print("HASIL SEEDING TAHAP 6 — PROJECT & MANUFACTURING")
        print("=" * 68)
        print(
            json.dumps(
                {
                    "success": success,
                    "reports": [
                        {
                            "endpoint": report["endpoint"],
                            "success": report["success"],
                            "tests": report["tests"],
                            "errors": report["errors"],
                        }
                        for report in reports
                    ],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return success

    except SeederError as exc:
        print(f"\n[STAGE 6 FAILED] {exc}")
        return False


if __name__ == "__main__":
    raise SystemExit(0 if run_stage() else 1)
