from __future__ import annotations

import json
from typing import Optional, Sequence, Mapping, Any

from seeder_common import (
    SeederClient,
    SeederError,
    build_client,
    configure_logging,
    stage_is_successful,
)


# ============================================================================
# STAGE 6 — PROJECT MANAGEMENT & MANUFACTURING
# ----------------------------------------------------------------------------
# Tujuan:
# - Menghidupkan Project Management sebagai backbone operasional sebelum HR.
# - Mempertahankan state key existing, terutama:
#       stage_6.projects.PROJ-2026-003
#   karena dipakai Finance.
# - Project member sementara memakai IAM User.
# - Employee pada Timesheet / Resource tetap nullable sampai HR di-seed.
# - Seluruh 27 CRUD resource Projects diisi dummy yang saling terhubung.
# - Manufacturing Production Order + Work Order existing tetap dipertahankan.
#
# Dependency:
# - Stage 1: DUMMY-HOLDING
# - Stage 2: COMP-HOLDING + dummy users
# - Stage 3: IDR, PCS, PROD-ITEM-A, PARTY-CUST-01
# - Stage 4: SO-2026-001
#
# Mekanisme:
# - Semua insert/update melalui REST API.
# - Payload diverifikasi terhadap OpenAPI live oleh SeederClient.
# - UUID disimpan di seeding_state.json.
# - Idempotent: rerun akan update/reuse record, bukan menggandakan.
# ============================================================================


EXPECTED_PROJECT_ENDPOINTS = {
    "/api/v1/projects/projects/",
    "/api/v1/projects/members/",
    "/api/v1/projects/tasks/",
    "/api/v1/projects/task-dependencies/",
    "/api/v1/projects/milestones/",
    "/api/v1/projects/material-requirements/",
    "/api/v1/projects/budget-lines/",
    "/api/v1/projects/timesheets/",
    "/api/v1/projects/change-requests/",
    "/api/v1/projects/boards/",
    "/api/v1/projects/board-columns/",
    "/api/v1/projects/task-board-positions/",
    "/api/v1/projects/health-rules/",
    "/api/v1/projects/health-snapshots/",
    "/api/v1/projects/risks/",
    "/api/v1/projects/issues/",
    "/api/v1/projects/technical-briefs/",
    "/api/v1/projects/technical-brief-versions/",
    "/api/v1/projects/requirements/",
    "/api/v1/projects/acceptance-criterias/",
    "/api/v1/projects/resource-requests/",
    "/api/v1/projects/resource-request-lines/",
    "/api/v1/projects/resource-allocations/",
    "/api/v1/projects/progress-snapshots/",
    "/api/v1/projects/equipment-usages/",
    "/api/v1/projects/weight-indicators/",
    "/api/v1/projects/weight-components/",
}


def _report_view(report: Mapping[str, Any]) -> dict:
    return {
        "endpoint": report.get("endpoint"),
        "success": report.get("success"),
        "tests": report.get("tests"),
        "errors": report.get("errors"),
    }


def run_stage(client: Optional[SeederClient] = None) -> bool:
    configure_logging()
    own_client = client is None
    client = client or build_client()

    try:
        if own_client:
            client.bootstrap()

        # ====================================================================
        # DEPENDENCY RESOLUTION
        # ====================================================================
        tenant_id = client.require_state_id(
            ("created_records", "DUMMY-HOLDING"),
            "DUMMY-HOLDING tenant",
        )
        company_id = client.require_state_id(
            ("stage_2", "companies", "COMP-HOLDING"),
            "COMP-HOLDING company",
        )

        # Dependency-recovery helper dipakai untuk master data yang aman
        # dicari ulang secara exact-match bila state lokal hilang.
        product_id = client.resolve_state_or_api_id(
            path=("stage_3", "products", "PROD-ITEM-A"),
            label="PROD-ITEM-A product",
            endpoint="/api/v1/master-data/products/",
            match_fields={"product_code": "PROD-ITEM-A"},
            search_term="PROD-ITEM-A",
            company_id=company_id,
        )
        customer_id = client.resolve_state_or_api_id(
            path=("stage_3", "parties", "PARTY-CUST-01"),
            label="customer party PARTY-CUST-01",
            endpoint="/api/v1/master-data/parties/",
            match_fields={"party_code": "PARTY-CUST-01"},
            search_term="PARTY-CUST-01",
            company_id=company_id,
        )
        currency_id = client.resolve_state_or_api_id(
            path=("stage_3", "currencies", "IDR"),
            label="IDR currency",
            endpoint="/api/v1/master-data/currencies/",
            match_fields={"currency_code": "IDR"},
            search_term="IDR",
            company_id=company_id,
        )
        uom_id = client.resolve_state_or_api_id(
            path=("stage_3", "uoms", "PCS"),
            label="PCS UOM",
            endpoint="/api/v1/master-data/uoms/",
            match_fields={"uom_code": "PCS"},
            search_term="PCS",
            company_id=company_id,
        )

        # User tetap berasal dari Stage 2 sampai HR Employee diperkenalkan.
        admin_user_id = client.resolve_state_or_api_id(
            path=("stage_2", "users", "dummy.admin@example.com"),
            label="dummy admin user",
            endpoint="/api/v1/accounts/users/",
            match_fields={"email": "dummy.admin@example.com"},
            search_term="dummy.admin@example.com",
        )

        manager_user_id = client.resolve_state_or_api_id(
            path=("stage_2", "users", "dummy.manager@example.com"),
            label="dummy manager user",
            endpoint="/api/v1/accounts/users/",
            match_fields={"email": "dummy.manager@example.com"},
            search_term="dummy.manager@example.com",
        )

        staff_user_id = client.resolve_state_or_api_id(
            path=("stage_2", "users", "dummy.staff@example.com"),
            label="dummy staff user",
            endpoint="/api/v1/accounts/users/",
            match_fields={"email": "dummy.staff@example.com"},
            search_term="dummy.staff@example.com",
        )

        sales_order_id = client.resolve_state_or_api_id(
            path=("stage_4", "sales_orders", "SO-2026-001"),
            label="SO-2026-001 sales order",
            endpoint="/api/v1/sales/orders/",
            match_fields={
                "order_date": "2026-08-10",
                "total_amount": "138750000.00",
                "customer_party": customer_id,
            },
            search_term="",
            company_id=company_id,
        )

        reports: list[dict] = []

        def seed(
            *,
            name: str,
            state_key: str,
            endpoint: str,
            items: Sequence[Mapping[str, Any]],
            match_fields: Sequence[str],
            patch_payload: Optional[Mapping[str, Any]] = None,
            delete_key: Optional[str] = None,
            search_term: str = "",
        ) -> dict:
            report = client.seed_resource(
                stage_name=f"stage_6.{name}",
                state_path=("stage_6", state_key),
                endpoint=endpoint,
                items=items,
                match_fields=match_fields,
                patch_payload=patch_payload,
                delete_key=delete_key,
                search_term=search_term,
                company_id=company_id,
            )
            reports.append(report)
            return report

        def sid(state_key: str, key: str, label: Optional[str] = None) -> str:
            return client.require_state_id(
                ("stage_6", state_key, key),
                label or f"{state_key}.{key}",
            )

        # ====================================================================
        # 1/27 — PROJECTS
        # ====================================================================
        projects = [
            {
                "_key": "PROJ-2026-001",
                "tenant": tenant_id,
                "company": company_id,
                "customer_party": customer_id,
                "sales_order": sales_order_id,
                "project_manager": manager_user_id,
                "project_code": "PROJ-2026-001",
                "project_name": "Implementasi ERP Internal Phase 1",
                "planned_start_date": "2026-01-05",
                "planned_end_date": "2026-11-30",
                "actual_start_date": "2026-01-05",
                "budget_amount": "1500000000.00",
                "progress_percent": "64.00",
                "status": "IN_PROGRESS",
            },
            {
                "_key": "PROJ-2026-002",
                "tenant": tenant_id,
                "company": company_id,
                "customer_party": customer_id,
                "project_manager": manager_user_id,
                "project_code": "PROJ-2026-002",
                "project_name": "Pengembangan Infrastruktur Jaringan",
                "planned_start_date": "2026-09-01",
                "planned_end_date": "2027-02-28",
                "budget_amount": "850000000.00",
                "progress_percent": "0.00",
                "status": "PLANNED",
            },
            {
                "_key": "PROJ-2026-003",
                "tenant": tenant_id,
                "company": company_id,
                "customer_party": customer_id,
                "project_manager": manager_user_id,
                "project_code": "PROJ-2026-003",
                "project_name": "Renovasi Gedung Operasional",
                "planned_start_date": "2026-02-01",
                "planned_end_date": "2026-10-31",
                "actual_start_date": "2026-02-01",
                "budget_amount": "2250000000.00",
                "progress_percent": "40.00",
                "status": "ON_HOLD",
            },
            {
                "_key": "PROJ-2026-004",
                "tenant": tenant_id,
                "company": company_id,
                "customer_party": customer_id,
                "project_manager": manager_user_id,
                "project_code": "PROJ-2026-004",
                "project_name": "Customer Self Service Portal",
                "planned_start_date": "2026-03-01",
                "planned_end_date": "2026-09-30",
                "actual_start_date": "2026-03-02",
                "budget_amount": "720000000.00",
                "progress_percent": "72.00",
                "status": "IN_PROGRESS",
            },
            {
                "_key": "PROJ-2026-005",
                "tenant": tenant_id,
                "company": company_id,
                "customer_party": customer_id,
                "project_manager": manager_user_id,
                "project_code": "PROJ-2026-005",
                "project_name": "Mobile Field Operation",
                "planned_start_date": "2026-02-15",
                "planned_end_date": "2026-07-31",
                "actual_start_date": "2026-02-17",
                "budget_amount": "640000000.00",
                "progress_percent": "55.00",
                "status": "DELAYED",
            },
            {
                "_key": "PROJ-2026-006",
                "tenant": tenant_id,
                "company": company_id,
                "customer_party": customer_id,
                "project_manager": manager_user_id,
                "project_code": "PROJ-2026-006",
                "project_name": "Data Warehouse dan Executive BI",
                "planned_start_date": "2026-04-01",
                "planned_end_date": "2026-12-15",
                "actual_start_date": "2026-04-01",
                "budget_amount": "980000000.00",
                "progress_percent": "46.00",
                "status": "IN_PROGRESS",
            },
            {
                "_key": "PROJ-2026-007",
                "tenant": tenant_id,
                "company": company_id,
                "customer_party": customer_id,
                "project_manager": manager_user_id,
                "project_code": "PROJ-2026-007",
                "project_name": "Government Media Management 2026",
                "planned_start_date": "2026-01-01",
                "planned_end_date": "2026-12-31",
                "actual_start_date": "2026-01-02",
                "budget_amount": "510000000.00",
                "progress_percent": "61.00",
                "status": "AT_RISK",
            },
            {
                "_key": "PROJ-2026-008",
                "tenant": tenant_id,
                "company": company_id,
                "customer_party": customer_id,
                "project_manager": manager_user_id,
                "project_code": "PROJ-2026-008",
                "project_name": "Survey Data Collection Q1",
                "planned_start_date": "2026-01-10",
                "planned_end_date": "2026-03-31",
                "actual_start_date": "2026-01-10",
                "actual_end_date": "2026-03-28",
                "budget_amount": "390000000.00",
                "progress_percent": "100.00",
                "status": "COMPLETED",
            },
            {
                "_key": "PROJ-COMPLETED",
                "tenant": tenant_id,
                "company": company_id,
                "customer_party": customer_id,
                "project_manager": manager_user_id,
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
                "project_manager": manager_user_id,
                "project_code": "PROJ-DEL",
                "project_name": "Project Delete Test",
                "planned_start_date": "2030-12-01",
                "planned_end_date": "2030-12-31",
                "budget_amount": "1000.00",
                "progress_percent": "0.00",
                "status": "PLANNED",
            },
        ]
        seed(
            name="projects",
            state_key="projects",
            endpoint="/api/v1/projects/projects/",
            items=projects,
            match_fields=("project_code", "tenant", "company"),
            patch_payload={"progress_percent": "64.00"},
            delete_key="PROJ-DEL",
            search_term="ERP",
        )

        p1 = sid("projects", "PROJ-2026-001")
        p2 = sid("projects", "PROJ-2026-002")
        p3 = sid("projects", "PROJ-2026-003")
        p4 = sid("projects", "PROJ-2026-004")
        p5 = sid("projects", "PROJ-2026-005")
        p6 = sid("projects", "PROJ-2026-006")
        p7 = sid("projects", "PROJ-2026-007")
        p8 = sid("projects", "PROJ-2026-008")

        # ====================================================================
        # 2/27 — PROJECT MEMBERS
        # ====================================================================
        members = [
            {"_key": "MEM-P1-MGR", "project": p1, "user": manager_user_id, "project_role": "PROJECT_MANAGER", "joined_at": "2026-01-05"},
            {"_key": "MEM-P1-ADMIN", "project": p1, "user": admin_user_id, "project_role": "SPONSOR", "joined_at": "2026-01-05"},
            {"_key": "MEM-P1-STAFF", "project": p1, "user": staff_user_id, "project_role": "PROJECT_MEMBER", "joined_at": "2026-01-06"},
            {"_key": "MEM-P3-MGR", "project": p3, "user": manager_user_id, "project_role": "PROJECT_MANAGER", "joined_at": "2026-02-01"},
            {"_key": "MEM-P3-STAFF", "project": p3, "user": staff_user_id, "project_role": "SITE_COORDINATOR", "joined_at": "2026-02-03"},
            {"_key": "MEM-P4-MGR", "project": p4, "user": manager_user_id, "project_role": "PROJECT_MANAGER", "joined_at": "2026-03-01"},
            {"_key": "MEM-P4-STAFF", "project": p4, "user": staff_user_id, "project_role": "DEVELOPER", "joined_at": "2026-03-02"},
            {"_key": "MEM-P6-MGR", "project": p6, "user": manager_user_id, "project_role": "PROJECT_MANAGER", "joined_at": "2026-04-01"},
            {"_key": "MEM-P7-STAFF", "project": p7, "user": staff_user_id, "project_role": "CONTENT_OPERATION", "joined_at": "2026-01-02"},
            {"_key": "MEM-DEL", "project": p2, "user": admin_user_id, "project_role": "DELETE_TEST", "joined_at": "2030-01-01"},
        ]
        seed(
            name="project_members",
            state_key="project_members",
            endpoint="/api/v1/projects/members/",
            items=members,
            match_fields=("project", "user", "project_role"),
            patch_payload={"project_role": "PROJECT_MANAGER"},
            delete_key="MEM-DEL",
            search_term="PROJECT",
        )

        # ====================================================================
        # 3/27 — TASKS
        # ====================================================================
        tasks = [
            {
                "_key": "TASK-001",
                "project": p1,
                "task_code": "TASK-001",
                "task_name": "Analisis Kebutuhan Sistem",
                "planned_start_at": "2026-01-05T08:00:00+07:00",
                "planned_end_at": "2026-01-23T17:00:00+07:00",
                "actual_start_at": "2026-01-05T08:30:00+07:00",
                "actual_end_at": "2026-01-21T16:00:00+07:00",
                "planned_hours": "120.00",
                "actual_hours": "112.00",
                "progress_percent": "100.00",
                "status": "DONE",
            },
            {
                "_key": "TASK-002",
                "project": p1,
                "task_code": "TASK-002",
                "task_name": "Arsitektur Database dan API",
                "planned_start_at": "2026-01-26T08:00:00+07:00",
                "planned_end_at": "2026-02-27T17:00:00+07:00",
                "actual_start_at": "2026-01-26T08:00:00+07:00",
                "actual_end_at": "2026-02-26T17:00:00+07:00",
                "planned_hours": "240.00",
                "actual_hours": "228.00",
                "progress_percent": "100.00",
                "status": "DONE",
            },
            {
                "_key": "TASK-003",
                "project": p1,
                "task_code": "TASK-003",
                "task_name": "Implementasi Core dan IAM",
                "planned_start_at": "2026-03-02T08:00:00+07:00",
                "planned_end_at": "2026-03-31T17:00:00+07:00",
                "actual_start_at": "2026-03-02T08:00:00+07:00",
                "actual_end_at": "2026-04-03T17:00:00+07:00",
                "planned_hours": "220.00",
                "actual_hours": "238.00",
                "progress_percent": "100.00",
                "status": "DONE",
            },
            {
                "_key": "TASK-004",
                "project": p1,
                "task_code": "TASK-004",
                "task_name": "Implementasi Finance Module",
                "planned_start_at": "2026-04-01T08:00:00+07:00",
                "planned_end_at": "2026-06-30T17:00:00+07:00",
                "actual_start_at": "2026-04-06T08:00:00+07:00",
                "planned_hours": "520.00",
                "actual_hours": "460.00",
                "progress_percent": "88.00",
                "status": "IN_PROGRESS",
            },
            {
                "_key": "TASK-005",
                "project": p1,
                "task_code": "TASK-005",
                "task_name": "Implementasi Project Management Module",
                "planned_start_at": "2026-07-01T08:00:00+07:00",
                "planned_end_at": "2026-08-31T17:00:00+07:00",
                "actual_start_at": "2026-07-01T08:00:00+07:00",
                "planned_hours": "360.00",
                "actual_hours": "215.00",
                "progress_percent": "62.00",
                "status": "IN_PROGRESS",
            },
            {
                "_key": "TASK-006",
                "project": p1,
                "task_code": "TASK-006",
                "task_name": "Kanban Gantt dan Project Health Dashboard",
                "planned_start_at": "2026-08-01T08:00:00+07:00",
                "planned_end_at": "2026-09-15T17:00:00+07:00",
                "actual_start_at": "2026-08-03T08:00:00+07:00",
                "planned_hours": "240.00",
                "actual_hours": "48.00",
                "progress_percent": "25.00",
                "status": "IN_PROGRESS",
            },
            {
                "_key": "TASK-BLOCKED",
                "project": p1,
                "task_code": "TASK-BLOCKED",
                "task_name": "Integrasi Payment Gateway",
                "planned_start_at": "2026-07-15T08:00:00+07:00",
                "planned_end_at": "2026-08-05T17:00:00+07:00",
                "actual_start_at": "2026-07-15T08:00:00+07:00",
                "planned_hours": "80.00",
                "actual_hours": "18.00",
                "progress_percent": "20.00",
                "status": "BLOCKED",
            },
            {
                "_key": "TASK-UAT",
                "project": p1,
                "task_code": "TASK-UAT",
                "task_name": "User Acceptance Testing",
                "planned_start_at": "2026-10-01T08:00:00+07:00",
                "planned_end_at": "2026-10-31T17:00:00+07:00",
                "planned_hours": "180.00",
                "actual_hours": "0.00",
                "progress_percent": "0.00",
                "status": "TODO",
            },
            {
                "_key": "TASK-GOLIVE",
                "project": p1,
                "task_code": "TASK-GOLIVE",
                "task_name": "Production Go Live",
                "planned_start_at": "2026-11-16T08:00:00+07:00",
                "planned_end_at": "2026-11-30T17:00:00+07:00",
                "planned_hours": "96.00",
                "actual_hours": "0.00",
                "progress_percent": "0.00",
                "status": "TODO",
            },
            {
                "_key": "P3-TASK-001",
                "project": p3,
                "task_code": "P3-TASK-001",
                "task_name": "Survey Kondisi Gedung",
                "planned_start_at": "2026-02-01T08:00:00+07:00",
                "planned_end_at": "2026-02-14T17:00:00+07:00",
                "actual_start_at": "2026-02-01T08:00:00+07:00",
                "actual_end_at": "2026-02-13T17:00:00+07:00",
                "planned_hours": "80.00",
                "actual_hours": "76.00",
                "progress_percent": "100.00",
                "status": "DONE",
            },
            {
                "_key": "P3-TASK-002",
                "project": p3,
                "task_code": "P3-TASK-002",
                "task_name": "Pelaksanaan Renovasi Tahap Utama",
                "planned_start_at": "2026-04-01T08:00:00+07:00",
                "planned_end_at": "2026-08-31T17:00:00+07:00",
                "actual_start_at": "2026-04-01T08:00:00+07:00",
                "planned_hours": "960.00",
                "actual_hours": "395.00",
                "progress_percent": "41.00",
                "status": "BLOCKED",
            },
            {
                "_key": "P4-TASK-001",
                "project": p4,
                "task_code": "P4-TASK-001",
                "task_name": "Portal UX dan Design System",
                "planned_start_at": "2026-03-01T08:00:00+07:00",
                "planned_end_at": "2026-04-15T17:00:00+07:00",
                "actual_start_at": "2026-03-02T08:00:00+07:00",
                "actual_end_at": "2026-04-12T17:00:00+07:00",
                "planned_hours": "220.00",
                "actual_hours": "214.00",
                "progress_percent": "100.00",
                "status": "DONE",
            },
            {
                "_key": "P4-TASK-002",
                "project": p4,
                "task_code": "P4-TASK-002",
                "task_name": "Frontend Customer Portal",
                "planned_start_at": "2026-04-16T08:00:00+07:00",
                "planned_end_at": "2026-08-31T17:00:00+07:00",
                "actual_start_at": "2026-04-16T08:00:00+07:00",
                "planned_hours": "520.00",
                "actual_hours": "386.00",
                "progress_percent": "78.00",
                "status": "IN_PROGRESS",
            },
            {
                "_key": "P5-TASK-001",
                "project": p5,
                "task_code": "P5-TASK-001",
                "task_name": "Offline Sync Field Application",
                "planned_start_at": "2026-03-01T08:00:00+07:00",
                "planned_end_at": "2026-06-30T17:00:00+07:00",
                "actual_start_at": "2026-03-01T08:00:00+07:00",
                "planned_hours": "480.00",
                "actual_hours": "420.00",
                "progress_percent": "70.00",
                "status": "IN_PROGRESS",
            },
            {
                "_key": "P6-TASK-001",
                "project": p6,
                "task_code": "P6-TASK-001",
                "task_name": "Data Pipeline dan ETL",
                "planned_start_at": "2026-04-01T08:00:00+07:00",
                "planned_end_at": "2026-08-15T17:00:00+07:00",
                "actual_start_at": "2026-04-01T08:00:00+07:00",
                "planned_hours": "480.00",
                "actual_hours": "310.00",
                "progress_percent": "68.00",
                "status": "IN_PROGRESS",
            },
            {
                "_key": "P7-TASK-001",
                "project": p7,
                "task_code": "P7-TASK-001",
                "task_name": "Produksi dan Distribusi Konten Agustus",
                "planned_start_at": "2026-08-01T08:00:00+07:00",
                "planned_end_at": "2026-08-31T17:00:00+07:00",
                "actual_start_at": "2026-08-01T08:00:00+07:00",
                "planned_hours": "320.00",
                "actual_hours": "98.00",
                "progress_percent": "35.00",
                "status": "IN_PROGRESS",
            },
            {
                "_key": "P8-TASK-001",
                "project": p8,
                "task_code": "P8-TASK-001",
                "task_name": "Finalisasi Data Survey Q1",
                "planned_start_at": "2026-03-10T08:00:00+07:00",
                "planned_end_at": "2026-03-28T17:00:00+07:00",
                "actual_start_at": "2026-03-10T08:00:00+07:00",
                "actual_end_at": "2026-03-27T17:00:00+07:00",
                "planned_hours": "120.00",
                "actual_hours": "116.00",
                "progress_percent": "100.00",
                "status": "DONE",
            },
            {
                "_key": "TASK-DEL",
                "project": p1,
                "task_code": "TASK-DEL",
                "task_name": "Task Delete Test",
                "planned_start_at": "2030-12-20T08:00:00+07:00",
                "planned_end_at": "2030-12-21T17:00:00+07:00",
                "planned_hours": "8.00",
                "actual_hours": "0.00",
                "progress_percent": "0.00",
                "status": "TODO",
            },
        ]
        seed(
            name="project_tasks",
            state_key="project_tasks",
            endpoint="/api/v1/projects/tasks/",
            items=tasks,
            match_fields=("task_code", "project"),
            patch_payload={"task_name": "Analisis Kebutuhan Sistem"},
            delete_key="TASK-DEL",
            search_term="Project",
        )

        t1 = sid("project_tasks", "TASK-001")
        t2 = sid("project_tasks", "TASK-002")
        t3 = sid("project_tasks", "TASK-003")
        t4 = sid("project_tasks", "TASK-004")
        t5 = sid("project_tasks", "TASK-005")
        t6 = sid("project_tasks", "TASK-006")
        t_blocked = sid("project_tasks", "TASK-BLOCKED")
        t_uat = sid("project_tasks", "TASK-UAT")
        t_golive = sid("project_tasks", "TASK-GOLIVE")
        p3_t2 = sid("project_tasks", "P3-TASK-002")
        p4_t2 = sid("project_tasks", "P4-TASK-002")
        p6_t1 = sid("project_tasks", "P6-TASK-001")
        p7_t1 = sid("project_tasks", "P7-TASK-001")

        # ====================================================================
        # 4/27 — TASK DEPENDENCIES
        # ====================================================================
        dependencies = [
            {"_key": "DEP-001-002", "predecessor_task": t1, "successor_task": t2, "dependency_type": "FS", "lag_minutes": 0},
            {"_key": "DEP-002-003", "predecessor_task": t2, "successor_task": t3, "dependency_type": "FS", "lag_minutes": 0},
            {"_key": "DEP-003-004", "predecessor_task": t3, "successor_task": t4, "dependency_type": "FS", "lag_minutes": 0},
            {"_key": "DEP-004-005", "predecessor_task": t4, "successor_task": t5, "dependency_type": "SS", "lag_minutes": 0},
            {"_key": "DEP-005-006", "predecessor_task": t5, "successor_task": t6, "dependency_type": "SS", "lag_minutes": 0},
            {"_key": "DEP-006-UAT", "predecessor_task": t6, "successor_task": t_uat, "dependency_type": "FS", "lag_minutes": 0},
            {"_key": "DEP-UAT-GOLIVE", "predecessor_task": t_uat, "successor_task": t_golive, "dependency_type": "FS", "lag_minutes": 1440},
            {"_key": "DEP-DEL", "predecessor_task": t1, "successor_task": t_blocked, "dependency_type": "SS", "lag_minutes": 999},
        ]
        seed(
            name="task_dependencies",
            state_key="task_dependencies",
            endpoint="/api/v1/projects/task-dependencies/",
            items=dependencies,
            match_fields=("predecessor_task", "successor_task", "dependency_type"),
            patch_payload={"lag_minutes": 0},
            delete_key="DEP-DEL",
            search_term="FS",
        )

        # ====================================================================
        # 5/27 — MILESTONES
        # ====================================================================
        milestones = [
            {"_key": "MS-P1-REQ", "project": p1, "milestone_name": "Requirements Approved", "planned_date": "2026-01-23", "actual_date": "2026-01-21", "weight_percent": "10.00", "status": "COMPLETED"},
            {"_key": "MS-P1-ARCH", "project": p1, "milestone_name": "Architecture Baseline", "planned_date": "2026-02-28", "actual_date": "2026-02-26", "weight_percent": "10.00", "status": "COMPLETED"},
            {"_key": "MS-P1-CORE", "project": p1, "milestone_name": "Core Modules Ready", "planned_date": "2026-04-15", "actual_date": "2026-04-18", "weight_percent": "20.00", "status": "COMPLETED"},
            {"_key": "MS-P1-PM", "project": p1, "milestone_name": "Project Management MVP", "planned_date": "2026-08-31", "weight_percent": "20.00", "status": "IN_PROGRESS"},
            {"_key": "MS-P1-UAT", "project": p1, "milestone_name": "UAT Sign Off", "planned_date": "2026-10-31", "weight_percent": "20.00", "status": "PLANNED"},
            {"_key": "MS-P1-LIVE", "project": p1, "milestone_name": "Go Live", "planned_date": "2026-11-30", "weight_percent": "20.00", "status": "PLANNED"},
            {"_key": "MS-P3-HOLD", "project": p3, "milestone_name": "Renovation Structure Complete", "planned_date": "2026-08-15", "weight_percent": "50.00", "status": "AT_RISK"},
            {"_key": "MS-P4-BETA", "project": p4, "milestone_name": "Customer Portal Beta", "planned_date": "2026-08-31", "weight_percent": "60.00", "status": "IN_PROGRESS"},
            {"_key": "MS-P8-CLOSE", "project": p8, "milestone_name": "Survey Final Report", "planned_date": "2026-03-31", "actual_date": "2026-03-28", "weight_percent": "100.00", "status": "COMPLETED"},
            {"_key": "MS-DEL", "project": p2, "milestone_name": "Delete Test Milestone", "planned_date": "2030-12-31", "weight_percent": "1.00", "status": "PLANNED"},
        ]
        seed(
            name="milestones",
            state_key="milestones",
            endpoint="/api/v1/projects/milestones/",
            items=milestones,
            match_fields=("project", "milestone_name", "planned_date"),
            patch_payload={"status": "COMPLETED"},
            delete_key="MS-DEL",
            search_term="Project",
        )

        # ====================================================================
        # 6/27 — MATERIAL REQUIREMENTS
        # Warehouse sengaja nullable agar Stage 6 tidak bergantung pada master
        # warehouse tambahan.
        # ====================================================================
        material_requirements = [
            {"_key": "MAT-P3-001", "project": p3, "task": p3_t2, "product": product_id, "required_quantity": "120.00", "reserved_quantity": "80.00", "issued_quantity": "45.00", "required_date": "2026-05-01", "status": "PARTIAL"},
            {"_key": "MAT-P4-001", "project": p4, "task": p4_t2, "product": product_id, "required_quantity": "20.00", "reserved_quantity": "20.00", "issued_quantity": "20.00", "required_date": "2026-04-20", "status": "ISSUED"},
            {"_key": "MAT-P6-001", "project": p6, "task": p6_t1, "product": product_id, "required_quantity": "8.00", "reserved_quantity": "8.00", "issued_quantity": "6.00", "required_date": "2026-04-10", "status": "PARTIAL"},
            {"_key": "MAT-DEL", "project": p2, "product": product_id, "required_quantity": "1.00", "reserved_quantity": "0.00", "issued_quantity": "0.00", "required_date": "2030-12-31", "status": "PLANNED"},
        ]
        seed(
            name="material_requirements",
            state_key="material_requirements",
            endpoint="/api/v1/projects/material-requirements/",
            items=material_requirements,
            match_fields=("project", "product", "required_date"),
            patch_payload={"status": "PARTIAL"},
            delete_key="MAT-DEL",
            search_term="PARTIAL",
        )

        # ====================================================================
        # 7/27 — PROJECT BUDGET LINES
        # Account / cost center nullable; Finance dapat menautkannya kemudian.
        # ====================================================================
        budget_lines = [
            {"_key": "P1-BUD-LABOR", "project": p1, "cost_element": "LABOR", "budget_quantity": "9200.00", "budget_rate": "85000.00", "budget_amount": "782000000.00"},
            {"_key": "P1-BUD-SOFTWARE", "project": p1, "cost_element": "SOFTWARE", "budget_quantity": "1.00", "budget_rate": "260000000.00", "budget_amount": "260000000.00"},
            {"_key": "P1-BUD-INFRA", "project": p1, "cost_element": "INFRASTRUCTURE", "budget_quantity": "1.00", "budget_rate": "280000000.00", "budget_amount": "280000000.00"},
            {"_key": "P1-BUD-CONTINGENCY", "project": p1, "cost_element": "CONTINGENCY", "budget_quantity": "1.00", "budget_rate": "178000000.00", "budget_amount": "178000000.00"},
            {"_key": "P3-BUD-CONSTRUCTION", "project": p3, "cost_element": "CONSTRUCTION", "budget_quantity": "1.00", "budget_rate": "1800000000.00", "budget_amount": "1800000000.00"},
            {"_key": "P4-BUD-LABOR", "project": p4, "cost_element": "LABOR", "budget_quantity": "4100.00", "budget_rate": "100000.00", "budget_amount": "410000000.00"},
            {"_key": "BUD-DEL", "project": p2, "cost_element": "DELETE_TEST", "budget_quantity": "1.00", "budget_rate": "1.00", "budget_amount": "1.00"},
        ]
        seed(
            name="budget_lines",
            state_key="budget_lines",
            endpoint="/api/v1/projects/budget-lines/",
            items=budget_lines,
            match_fields=("project", "cost_element"),
            patch_payload={"budget_amount": "782000000.00"},
            delete_key="BUD-DEL",
            search_term="LABOR",
        )

        # ====================================================================
        # 8/27 — TIMESHEETS
        # employee sengaja belum diisi. OpenAPI mengizinkan nullable dan ini
        # akan dibackfill ke HR Employee pada fase HR.
        # ====================================================================
        timesheets = [
            {"_key": "TS-P1-001", "project": p1, "task": t5, "work_date": "2026-08-03", "hours": "8.00", "hourly_rate": "85000.00", "amount": "680000.00", "approval_status": "APPROVED"},
            {"_key": "TS-P1-002", "project": p1, "task": t5, "work_date": "2026-08-04", "hours": "7.50", "hourly_rate": "85000.00", "amount": "637500.00", "approval_status": "APPROVED"},
            {"_key": "TS-P1-003", "project": p1, "task": t6, "work_date": "2026-08-05", "hours": "8.00", "hourly_rate": "90000.00", "amount": "720000.00", "approval_status": "APPROVED"},
            {"_key": "TS-P1-004", "project": p1, "task": t6, "work_date": "2026-08-06", "hours": "6.50", "hourly_rate": "90000.00", "amount": "585000.00", "approval_status": "SUBMITTED"},
            {"_key": "TS-P3-001", "project": p3, "task": p3_t2, "work_date": "2026-08-03", "hours": "8.00", "hourly_rate": "75000.00", "amount": "600000.00", "approval_status": "APPROVED"},
            {"_key": "TS-P4-001", "project": p4, "task": p4_t2, "work_date": "2026-08-07", "hours": "7.00", "hourly_rate": "100000.00", "amount": "700000.00", "approval_status": "APPROVED"},
            {"_key": "TS-P6-001", "project": p6, "task": p6_t1, "work_date": "2026-08-08", "hours": "5.00", "hourly_rate": "110000.00", "amount": "550000.00", "approval_status": "DRAFT"},
            {"_key": "TS-DEL", "project": p2, "work_date": "2030-12-31", "hours": "1.00", "hourly_rate": "1.00", "amount": "1.00", "approval_status": "DRAFT"},
        ]
        seed(
            name="timesheets",
            state_key="timesheets",
            endpoint="/api/v1/projects/timesheets/",
            items=timesheets,
            match_fields=("project", "task", "work_date", "hours"),
            patch_payload={"approval_status": "APPROVED"},
            delete_key="TS-DEL",
            search_term="APPROVED",
        )

        # ====================================================================
        # 9/27 — CHANGE REQUESTS
        # ====================================================================
        change_requests = [
            {"_key": "CR-P1-001", "project": p1, "change_type": "SCOPE", "description": "Tambahan dashboard resource allocation dan project health.", "schedule_impact_days": "7.00", "cost_impact": "45000000.00", "approval_status": "APPROVED"},
            {"_key": "CR-P1-002", "project": p1, "change_type": "SCHEDULE", "description": "Penyesuaian jadwal UAT untuk integrasi lintas modul.", "schedule_impact_days": "5.00", "cost_impact": "0.00", "approval_status": "PENDING"},
            {"_key": "CR-P3-001", "project": p3, "change_type": "COST", "description": "Kenaikan biaya material renovasi.", "schedule_impact_days": "14.00", "cost_impact": "175000000.00", "approval_status": "IN_REVIEW"},
            {"_key": "CR-DEL", "project": p2, "change_type": "DELETE_TEST", "description": "Delete test.", "schedule_impact_days": "0.00", "cost_impact": "0.00", "approval_status": "DRAFT"},
        ]
        seed(
            name="change_requests",
            state_key="change_requests",
            endpoint="/api/v1/projects/change-requests/",
            items=change_requests,
            match_fields=("project", "change_type", "description"),
            patch_payload={"approval_status": "APPROVED"},
            delete_key="CR-DEL",
            search_term="dashboard",
        )

        # ====================================================================
        # 10/27 — BOARDS
        # ====================================================================
        boards = [
            {"_key": "BOARD-P1", "project": p1, "board_name": "ERP Delivery Board", "board_type": "KANBAN", "default_board": True, "status": "ACTIVE"},
            {"_key": "BOARD-P4", "project": p4, "board_name": "Customer Portal Board", "board_type": "KANBAN", "default_board": True, "status": "ACTIVE"},
            {"_key": "BOARD-DEL", "project": p2, "board_name": "Delete Test Board", "board_type": "KANBAN", "default_board": False, "status": "INACTIVE"},
        ]
        seed(
            name="boards",
            state_key="boards",
            endpoint="/api/v1/projects/boards/",
            items=boards,
            match_fields=("project", "board_name"),
            patch_payload={"default_board": True},
            delete_key="BOARD-DEL",
            search_term="ERP",
        )

        board_p1 = sid("boards", "BOARD-P1")

        # ====================================================================
        # 11/27 — BOARD COLUMNS
        # ====================================================================
        board_columns = [
            {"_key": "COL-P1-TODO", "board": board_p1, "column_name": "To Do", "mapped_task_status": "TODO", "position_order": 10, "wip_limit": 20},
            {"_key": "COL-P1-PROGRESS", "board": board_p1, "column_name": "In Progress", "mapped_task_status": "IN_PROGRESS", "position_order": 20, "wip_limit": 8},
            {"_key": "COL-P1-REVIEW", "board": board_p1, "column_name": "Review", "mapped_task_status": "REVIEW", "position_order": 30, "wip_limit": 5},
            {"_key": "COL-P1-BLOCKED", "board": board_p1, "column_name": "Blocked", "mapped_task_status": "BLOCKED", "position_order": 40, "wip_limit": 5},
            {"_key": "COL-P1-DONE", "board": board_p1, "column_name": "Done", "mapped_task_status": "DONE", "position_order": 50, "wip_limit": 999},
            {"_key": "COL-DEL", "board": board_p1, "column_name": "Delete Test", "mapped_task_status": "TODO", "position_order": 999, "wip_limit": 1},
        ]
        seed(
            name="board_columns",
            state_key="board_columns",
            endpoint="/api/v1/projects/board-columns/",
            items=board_columns,
            match_fields=("board", "column_name"),
            patch_payload={"wip_limit": 20},
            delete_key="COL-DEL",
            search_term="Progress",
        )

        col_todo = sid("board_columns", "COL-P1-TODO")
        col_progress = sid("board_columns", "COL-P1-PROGRESS")
        col_blocked = sid("board_columns", "COL-P1-BLOCKED")
        col_done = sid("board_columns", "COL-P1-DONE")

        # ====================================================================
        # 12/27 — TASK BOARD POSITIONS
        # ====================================================================
        board_positions = [
            {"_key": "POS-T1", "task": t1, "board_column": col_done, "position_order": "1.00", "moved_at": "2026-01-21T16:00:00+07:00", "moved_by": manager_user_id},
            {"_key": "POS-T2", "task": t2, "board_column": col_done, "position_order": "2.00", "moved_at": "2026-02-26T17:00:00+07:00", "moved_by": manager_user_id},
            {"_key": "POS-T4", "task": t4, "board_column": col_progress, "position_order": "1.00", "moved_at": "2026-08-08T10:00:00+07:00", "moved_by": manager_user_id},
            {"_key": "POS-T5", "task": t5, "board_column": col_progress, "position_order": "2.00", "moved_at": "2026-08-08T10:05:00+07:00", "moved_by": manager_user_id},
            {"_key": "POS-T6", "task": t6, "board_column": col_progress, "position_order": "3.00", "moved_at": "2026-08-08T10:10:00+07:00", "moved_by": staff_user_id},
            {"_key": "POS-BLOCKED", "task": t_blocked, "board_column": col_blocked, "position_order": "1.00", "moved_at": "2026-08-05T12:00:00+07:00", "moved_by": manager_user_id},
            {"_key": "POS-UAT", "task": t_uat, "board_column": col_todo, "position_order": "1.00", "moved_at": "2026-08-01T08:00:00+07:00", "moved_by": manager_user_id},
            {"_key": "POS-DEL", "task": t_golive, "board_column": col_todo, "position_order": "999.00", "moved_at": "2030-12-31T08:00:00+07:00", "moved_by": admin_user_id},
        ]
        seed(
            name="task_board_positions",
            state_key="task_board_positions",
            endpoint="/api/v1/projects/task-board-positions/",
            items=board_positions,
            match_fields=("task", "board_column"),
            patch_payload={"position_order": "1.00"},
            delete_key="POS-DEL",
            search_term="",
        )

        # ====================================================================
        # 13/27 — HEALTH RULES
        # ====================================================================
        health_rules = [
            {"_key": "HR-SCHEDULE", "company": company_id, "rule_code": "PRJ-SCHEDULE-DELAY", "health_dimension": "SCHEDULE", "operator": ">", "warning_threshold": "10.00", "critical_threshold": "25.00", "weight_percent": "30.00", "active": True},
            {"_key": "HR-COST", "company": company_id, "rule_code": "PRJ-COST-VARIANCE", "health_dimension": "COST", "operator": ">", "warning_threshold": "10.00", "critical_threshold": "20.00", "weight_percent": "25.00", "active": True},
            {"_key": "HR-RISK", "company": company_id, "rule_code": "PRJ-RISK-SCORE", "health_dimension": "RISK", "operator": ">", "warning_threshold": "10.00", "critical_threshold": "16.00", "weight_percent": "20.00", "active": True},
            {"_key": "HR-RESOURCE", "company": company_id, "rule_code": "PRJ-RESOURCE-LOAD", "health_dimension": "RESOURCE", "operator": ">", "warning_threshold": "90.00", "critical_threshold": "110.00", "weight_percent": "15.00", "active": True},
            {"_key": "HR-QUALITY", "company": company_id, "rule_code": "PRJ-QUALITY-FAILURE", "health_dimension": "QUALITY", "operator": ">", "warning_threshold": "5.00", "critical_threshold": "10.00", "weight_percent": "10.00", "active": True},
            {"_key": "HR-DEL", "company": company_id, "rule_code": "PRJ-DELETE-TEST", "health_dimension": "TEST", "operator": ">", "warning_threshold": "1.00", "critical_threshold": "2.00", "weight_percent": "0.00", "active": False},
        ]
        seed(
            name="health_rules",
            state_key="health_rules",
            endpoint="/api/v1/projects/health-rules/",
            items=health_rules,
            match_fields=("company", "rule_code"),
            patch_payload={"active": True},
            delete_key="HR-DEL",
            search_term="SCHEDULE",
        )

        # ====================================================================
        # 14/27 — HEALTH SNAPSHOTS
        # ====================================================================
        health_snapshots = [
            {"_key": "HS-P1-20260801", "project": p1, "snapshot_at": "2026-08-01T18:00:00+07:00", "schedule_score": "82.00", "cost_score": "88.00", "quality_score": "90.00", "resource_score": "78.00", "risk_score": "80.00", "overall_score": "83.60", "health_status": "HEALTHY", "explanation_json": {"summary": "Project masih on track dengan tekanan resource moderat.", "overdue_tasks": 1}},
            {"_key": "HS-P1-20260811", "project": p1, "snapshot_at": "2026-08-11T10:00:00+07:00", "schedule_score": "76.00", "cost_score": "86.00", "quality_score": "91.00", "resource_score": "72.00", "risk_score": "74.00", "overall_score": "79.80", "health_status": "AT_RISK", "explanation_json": {"summary": "Payment gateway blocked dan kapasitas team mulai tinggi.", "blocked_tasks": 1}},
            {"_key": "HS-P3-20260811", "project": p3, "snapshot_at": "2026-08-11T10:05:00+07:00", "schedule_score": "45.00", "cost_score": "62.00", "quality_score": "82.00", "resource_score": "70.00", "risk_score": "40.00", "overall_score": "57.80", "health_status": "CRITICAL", "explanation_json": {"summary": "Project on hold karena material dan approval perubahan biaya."}},
            {"_key": "HS-P4-20260811", "project": p4, "snapshot_at": "2026-08-11T10:10:00+07:00", "schedule_score": "89.00", "cost_score": "92.00", "quality_score": "91.00", "resource_score": "84.00", "risk_score": "88.00", "overall_score": "89.00", "health_status": "HEALTHY", "explanation_json": {"summary": "Portal berada pada jalur delivery yang baik."}},
            {"_key": "HS-DEL", "project": p2, "snapshot_at": "2030-12-31T23:00:00+07:00", "schedule_score": "100.00", "cost_score": "100.00", "quality_score": "100.00", "resource_score": "100.00", "risk_score": "100.00", "overall_score": "100.00", "health_status": "TEST", "explanation_json": {"delete": True}},
        ]
        seed(
            name="health_snapshots",
            state_key="health_snapshots",
            endpoint="/api/v1/projects/health-snapshots/",
            items=health_snapshots,
            match_fields=("project", "snapshot_at"),
            patch_payload={"health_status": "HEALTHY"},
            delete_key="HS-DEL",
            search_term="HEALTHY",
        )

        # ====================================================================
        # 15/27 — RISKS
        # ====================================================================
        risks = [
            {"_key": "RISK-P1-001", "project": p1, "owner_user": manager_user_id, "risk_code": "RISK-P1-001", "risk_category": "INTEGRATION", "description": "Integrasi payment gateway terlambat karena dependency vendor.", "probability_score": 4, "impact_score": 4, "risk_score": 16, "mitigation_plan": "Siapkan fallback manual dan mock service untuk UAT.", "due_date": "2026-08-20", "status": "OPEN"},
            {"_key": "RISK-P1-002", "project": p1, "owner_user": manager_user_id, "risk_code": "RISK-P1-002", "risk_category": "RESOURCE", "description": "Resource backend teralokasi pada beberapa module secara bersamaan.", "probability_score": 4, "impact_score": 3, "risk_score": 12, "mitigation_plan": "Prioritaskan critical path dan batasi WIP.", "due_date": "2026-08-31", "status": "MITIGATING"},
            {"_key": "RISK-P3-001", "project": p3, "owner_user": manager_user_id, "risk_code": "RISK-P3-001", "risk_category": "COST", "description": "Harga material renovasi meningkat.", "probability_score": 5, "impact_score": 4, "risk_score": 20, "mitigation_plan": "Rebaseline budget dan negosiasi supplier.", "due_date": "2026-08-18", "status": "OPEN"},
            {"_key": "RISK-P7-001", "project": p7, "owner_user": staff_user_id, "risk_code": "RISK-P7-001", "risk_category": "SCHEDULE", "description": "Approval konten berpotensi menunda kalender publikasi.", "probability_score": 3, "impact_score": 3, "risk_score": 9, "mitigation_plan": "Gunakan batch approval dua kali sehari.", "due_date": "2026-08-15", "status": "MONITORING"},
            {"_key": "RISK-DEL", "project": p2, "owner_user": admin_user_id, "risk_code": "RISK-DEL", "risk_category": "TEST", "description": "Delete test risk.", "probability_score": 1, "impact_score": 1, "risk_score": 1, "mitigation_plan": "Delete.", "due_date": "2030-12-31", "status": "OPEN"},
        ]
        seed(
            name="risks",
            state_key="risks",
            endpoint="/api/v1/projects/risks/",
            items=risks,
            match_fields=("project", "risk_code"),
            patch_payload={"status": "OPEN"},
            delete_key="RISK-DEL",
            search_term="payment",
        )

        # ====================================================================
        # 16/27 — ISSUES
        # ====================================================================
        issues = [
            {"_key": "ISS-P1-001", "project": p1, "task": t_blocked, "assigned_user": staff_user_id, "issue_type": "BLOCKER", "severity": "HIGH", "description": "Sandbox vendor payment belum stabil untuk integration test.", "due_date": "2026-08-18", "status": "OPEN"},
            {"_key": "ISS-P1-002", "project": p1, "task": t5, "assigned_user": manager_user_id, "issue_type": "DATA", "severity": "MEDIUM", "description": "Beberapa dependency UUID pada seeding state perlu recovery otomatis.", "due_date": "2026-08-12", "status": "IN_PROGRESS"},
            {"_key": "ISS-P3-001", "project": p3, "task": p3_t2, "assigned_user": manager_user_id, "issue_type": "APPROVAL", "severity": "CRITICAL", "description": "Perubahan biaya renovasi belum disetujui.", "due_date": "2026-08-14", "status": "OPEN"},
            {"_key": "ISS-P4-001", "project": p4, "task": p4_t2, "assigned_user": staff_user_id, "issue_type": "BUG", "severity": "LOW", "description": "Responsive table perlu optimasi pada layar kecil.", "due_date": "2026-08-22", "status": "OPEN"},
            {"_key": "ISS-DEL", "project": p2, "assigned_user": admin_user_id, "issue_type": "TEST", "severity": "LOW", "description": "Delete test issue.", "due_date": "2030-12-31", "status": "OPEN"},
        ]
        seed(
            name="issues",
            state_key="issues",
            endpoint="/api/v1/projects/issues/",
            items=issues,
            match_fields=("project", "issue_type", "description"),
            patch_payload={"severity": "HIGH"},
            delete_key="ISS-DEL",
            search_term="payment",
        )

        # ====================================================================
        # 17/27 — TECHNICAL BRIEFS
        # ====================================================================
        technical_briefs = [
            {"_key": "TB-P1-001", "project": p1, "sales_order": sales_order_id, "brief_number": "TB-P1-001", "brief_title": "ERP Internal Phase 1 Technical Brief", "objective": "Membangun ERP modular untuk finance, project, sales, procurement, inventory dan assets.", "scope_summary": "Core/IAM, master data, CRM/Sales, procurement/inventory, project, manufacturing, finance dan assets.", "owner_user": manager_user_id, "approval_status": "APPROVED", "status": "ACTIVE"},
            {"_key": "TB-P4-001", "project": p4, "brief_number": "TB-P4-001", "brief_title": "Customer Portal Technical Brief", "objective": "Menyediakan portal mandiri untuk customer.", "scope_summary": "Authentication, profile, order visibility, ticket dan document download.", "owner_user": manager_user_id, "approval_status": "APPROVED", "status": "ACTIVE"},
            {"_key": "TB-DEL", "project": p2, "brief_number": "TB-DEL", "brief_title": "Delete Test Brief", "objective": "Delete test.", "scope_summary": "Delete test.", "owner_user": admin_user_id, "approval_status": "DRAFT", "status": "DRAFT"},
        ]
        seed(
            name="technical_briefs",
            state_key="technical_briefs",
            endpoint="/api/v1/projects/technical-briefs/",
            items=technical_briefs,
            match_fields=("project", "brief_number"),
            patch_payload={"approval_status": "APPROVED"},
            delete_key="TB-DEL",
            search_term="ERP",
        )

        tb_p1 = sid("technical_briefs", "TB-P1-001")
        tb_p4 = sid("technical_briefs", "TB-P4-001")

        # ====================================================================
        # 18/27 — TECHNICAL BRIEF VERSIONS
        # ====================================================================
        technical_brief_versions = [
        ]
        seed(
            name="technical_brief_versions",
            state_key="technical_brief_versions",
            endpoint="/api/v1/projects/technical-brief-versions/",
            items=technical_brief_versions,
            match_fields=("technical_brief", "version_number"),
            patch_payload={"status": "SUPERSEDED"},
            delete_key="TBV-DEL",
            search_term="CURRENT",
        )

        # ====================================================================
        # 19/27 — REQUIREMENTS
        # ====================================================================
        requirements = [
            {"_key": "REQ-P1-001", "technical_brief": tb_p1, "requirement_code": "REQ-P1-001", "requirement_type": "FUNCTIONAL", "requirement_text": "Sistem harus mendukung multi-company scoped access.", "priority": "MUST", "verification_method": "UAT", "status": "APPROVED"},
            {"_key": "REQ-P1-002", "technical_brief": tb_p1, "requirement_code": "REQ-P1-002", "requirement_type": "FUNCTIONAL", "requirement_text": "Project harus memiliki task, milestone, health, cost dan progress tracking.", "priority": "MUST", "verification_method": "UAT", "status": "APPROVED"},
            {"_key": "REQ-P1-003", "technical_brief": tb_p1, "requirement_code": "REQ-P1-003", "requirement_type": "NON_FUNCTIONAL", "requirement_text": "Seeder harus idempotent dan tervalidasi OpenAPI.", "priority": "MUST", "verification_method": "AUTOMATED_TEST", "status": "APPROVED"},
            {"_key": "REQ-P1-004", "technical_brief": tb_p1, "requirement_code": "REQ-P1-004", "requirement_type": "FUNCTIONAL", "requirement_text": "Project dashboard harus menampilkan progress, health dan overdue tasks.", "priority": "SHOULD", "verification_method": "UAT", "status": "IN_PROGRESS"},
            {"_key": "REQ-P4-001", "technical_brief": tb_p4, "requirement_code": "REQ-P4-001", "requirement_type": "FUNCTIONAL", "requirement_text": "Customer dapat melihat status order dan dokumen yang diizinkan.", "priority": "MUST", "verification_method": "UAT", "status": "APPROVED"},
            {"_key": "REQ-DEL", "technical_brief": tb_p4, "requirement_code": "REQ-DEL", "requirement_type": "TEST", "requirement_text": "Delete test.", "priority": "COULD", "verification_method": "MANUAL", "status": "DRAFT"},
        ]
        seed(
            name="requirements",
            state_key="requirements",
            endpoint="/api/v1/projects/requirements/",
            items=requirements,
            match_fields=("technical_brief", "requirement_code"),
            patch_payload={"status": "APPROVED"},
            delete_key="REQ-DEL",
            search_term="Project",
        )

        req1 = sid("requirements", "REQ-P1-001")
        req2 = sid("requirements", "REQ-P1-002")
        req3 = sid("requirements", "REQ-P1-003")
        req4 = sid("requirements", "REQ-P1-004")

        # ====================================================================
        # 20/27 — ACCEPTANCE CRITERIA
        # ====================================================================
        acceptance_criteria = [
            {"_key": "AC-REQ1-01", "requirement": req1, "criteria_text": "User hanya dapat membaca data company yang berada dalam scope.", "expected_result": "Cross-company access ditolak.", "actual_result": "Tenant/company scoped validation aktif.", "passed": True, "verified_by": manager_user_id, "verified_at": "2026-07-31T15:00:00+07:00"},
            {"_key": "AC-REQ2-01", "requirement": req2, "criteria_text": "Project memiliki task dan milestone yang dapat diretrieve via API.", "expected_result": "CRUD dan relasi tersedia.", "actual_result": "CRUD tersedia.", "passed": True, "verified_by": manager_user_id, "verified_at": "2026-08-05T15:00:00+07:00"},
            {"_key": "AC-REQ3-01", "requirement": req3, "criteria_text": "Rerun seeder tidak menggandakan record.", "expected_result": "Record di-update/reuse berdasarkan state atau exact match.", "actual_result": "SeederClient menggunakan idempotent upsert.", "passed": True, "verified_by": admin_user_id, "verified_at": "2026-08-10T15:00:00+07:00"},
            {"_key": "AC-REQ4-01", "requirement": req4, "criteria_text": "Dashboard dapat membaca latest health dan progress snapshot.", "expected_result": "Latest snapshot tampil.", "actual_result": "Belum final UAT.", "passed": False},
            {"_key": "AC-DEL", "requirement": req4, "criteria_text": "Delete test criteria.", "expected_result": "Deleted.", "actual_result": "", "passed": False},
        ]
        seed(
            name="acceptance_criterias",
            state_key="acceptance_criterias",
            endpoint="/api/v1/projects/acceptance-criterias/",
            items=acceptance_criteria,
            match_fields=("requirement", "criteria_text"),
            patch_payload={"passed": True},
            delete_key="AC-DEL",
            search_term="Project",
        )

        # ====================================================================
        # 21/27 — RESOURCE REQUESTS
        # ====================================================================
        resource_requests = [
            {"_key": "RR-P1-001", "project": p1, "task": t6, "requested_by": manager_user_id, "request_date": "2026-08-03", "required_date": "2026-08-10", "request_type": "LABOR", "priority": "HIGH", "approval_status": "APPROVED", "status": "OPEN"},
            {"_key": "RR-P3-001", "project": p3, "task": p3_t2, "requested_by": manager_user_id, "request_date": "2026-07-20", "required_date": "2026-08-01", "request_type": "MATERIAL", "priority": "CRITICAL", "approval_status": "PENDING", "status": "OPEN"},
            {"_key": "RR-P4-001", "project": p4, "task": p4_t2, "requested_by": manager_user_id, "request_date": "2026-08-01", "required_date": "2026-08-15", "request_type": "LABOR", "priority": "MEDIUM", "approval_status": "APPROVED", "status": "ALLOCATED"},
            {"_key": "RR-DEL", "project": p2, "requested_by": admin_user_id, "request_date": "2030-12-30", "required_date": "2030-12-31", "request_type": "TEST", "priority": "LOW", "approval_status": "DRAFT", "status": "DRAFT"},
        ]
        seed(
            name="resource_requests",
            state_key="resource_requests",
            endpoint="/api/v1/projects/resource-requests/",
            items=resource_requests,
            match_fields=("project", "request_date", "request_type"),
            patch_payload={"priority": "HIGH"},
            delete_key="RR-DEL",
            search_term="LABOR",
        )

        rr_p1 = sid("resource_requests", "RR-P1-001")
        rr_p3 = sid("resource_requests", "RR-P3-001")
        rr_p4 = sid("resource_requests", "RR-P4-001")

        # ====================================================================
        # 22/27 — RESOURCE REQUEST LINES
        # Employee/Machine nullable karena HR/asset resource assignment belum
        # menjadi dependency Stage 6.
        # ====================================================================
        resource_request_lines = [
            {"_key": "RRL-P1-001", "resource_request": rr_p1, "resource_type": "LABOR", "requested_hours": "80.00", "requested_quantity": "1.00", "specification": "Backend engineer untuk project dashboard dan integration."},
            {"_key": "RRL-P3-001", "resource_request": rr_p3, "product": product_id, "uom": uom_id, "resource_type": "MATERIAL", "requested_quantity": "40.00", "requested_hours": "0.00", "specification": "Material tambahan renovasi."},
            {"_key": "RRL-P4-001", "resource_request": rr_p4, "resource_type": "LABOR", "requested_hours": "120.00", "requested_quantity": "1.00", "specification": "Frontend engineer untuk portal delivery."},
            {"_key": "RRL-DEL", "resource_request": rr_p1, "resource_type": "TEST", "requested_hours": "1.00", "requested_quantity": "1.00", "specification": "Delete test."},
        ]
        seed(
            name="resource_request_lines",
            state_key="resource_request_lines",
            endpoint="/api/v1/projects/resource-request-lines/",
            items=resource_request_lines,
            match_fields=("resource_request", "resource_type", "specification"),
            patch_payload={"requested_hours": "80.00"},
            delete_key="RRL-DEL",
            search_term="Backend",
        )

        rrl_p1 = sid("resource_request_lines", "RRL-P1-001")
        rrl_p3 = sid("resource_request_lines", "RRL-P3-001")
        rrl_p4 = sid("resource_request_lines", "RRL-P4-001")

        # ====================================================================
        # 23/27 — RESOURCE ALLOCATIONS
        # Employee/Machine nullable; allocation tetap berguna untuk baseline
        # cost/capacity sementara.
        # ====================================================================
        resource_allocations = [
            {"_key": "RA-P1-001", "resource_request_line": rrl_p1, "allocation_start_at": "2026-08-03T08:00:00+07:00", "allocation_end_at": "2026-08-31T17:00:00+07:00", "allocated_quantity": "1.00", "allocated_hours": "80.00", "estimated_cost": "7200000.00", "actual_cost": "4320000.00", "status": "ACTIVE"},
            {"_key": "RA-P3-001", "resource_request_line": rrl_p3, "allocation_start_at": "2026-08-01T08:00:00+07:00", "allocation_end_at": "2026-08-15T17:00:00+07:00", "allocated_quantity": "25.00", "allocated_hours": "0.00", "estimated_cost": "125000000.00", "actual_cost": "0.00", "status": "PARTIAL"},
            {"_key": "RA-P4-001", "resource_request_line": rrl_p4, "allocation_start_at": "2026-08-01T08:00:00+07:00", "allocation_end_at": "2026-09-15T17:00:00+07:00", "allocated_quantity": "1.00", "allocated_hours": "120.00", "estimated_cost": "12000000.00", "actual_cost": "6800000.00", "status": "ACTIVE"},
            {"_key": "RA-DEL", "resource_request_line": rrl_p1, "allocation_start_at": "2030-12-30T08:00:00+07:00", "allocation_end_at": "2030-12-31T17:00:00+07:00", "allocated_quantity": "1.00", "allocated_hours": "1.00", "estimated_cost": "1.00", "actual_cost": "0.00", "status": "TEST"},
        ]
        seed(
            name="resource_allocations",
            state_key="resource_allocations",
            endpoint="/api/v1/projects/resource-allocations/",
            items=resource_allocations,
            match_fields=("resource_request_line", "allocation_start_at"),
            patch_payload={"status": "ACTIVE"},
            delete_key="RA-DEL",
            search_term="ACTIVE",
        )

        # ====================================================================
        # 24/27 — PROGRESS SNAPSHOTS
        # ====================================================================
        progress_snapshots = [
            {"_key": "PS-P1-20260731", "project": p1, "snapshot_at": "2026-07-31T18:00:00+07:00", "planned_progress_percent": "68.00", "actual_progress_percent": "60.00", "earned_value": "900000000.00", "planned_value": "1020000000.00", "actual_cost": "830000000.00", "progress_status": "BEHIND"},
            {"_key": "PS-P1-20260811", "project": p1, "snapshot_at": "2026-08-11T10:00:00+07:00", "planned_progress_percent": "70.00", "actual_progress_percent": "64.00", "earned_value": "960000000.00", "planned_value": "1050000000.00", "actual_cost": "872000000.00", "progress_status": "BEHIND"},
            {"_key": "PS-P3-20260811", "project": p3, "snapshot_at": "2026-08-11T10:05:00+07:00", "planned_progress_percent": "65.00", "actual_progress_percent": "40.00", "earned_value": "900000000.00", "planned_value": "1462500000.00", "actual_cost": "980000000.00", "progress_status": "ON_HOLD"},
            {"_key": "PS-P4-20260811", "project": p4, "snapshot_at": "2026-08-11T10:10:00+07:00", "planned_progress_percent": "70.00", "actual_progress_percent": "72.00", "earned_value": "518400000.00", "planned_value": "504000000.00", "actual_cost": "450000000.00", "progress_status": "ON_TRACK"},
            {"_key": "PS-P7-20260811", "project": p7, "snapshot_at": "2026-08-11T10:15:00+07:00", "planned_progress_percent": "65.00", "actual_progress_percent": "61.00", "earned_value": "311100000.00", "planned_value": "331500000.00", "actual_cost": "300000000.00", "progress_status": "AT_RISK"},
            {"_key": "PS-DEL", "project": p2, "snapshot_at": "2030-12-31T23:00:00+07:00", "planned_progress_percent": "0.00", "actual_progress_percent": "0.00", "earned_value": "0.00", "planned_value": "0.00", "actual_cost": "0.00", "progress_status": "TEST"},
        ]
        seed(
            name="progress_snapshots",
            state_key="progress_snapshots",
            endpoint="/api/v1/projects/progress-snapshots/",
            items=progress_snapshots,
            match_fields=("project", "snapshot_at"),
            patch_payload={"progress_status": "BEHIND"},
            delete_key="PS-DEL",
            search_term="BEHIND",
        )

        # ====================================================================
        # 25/27 — EQUIPMENT USAGES
        # machine/asset/employee nullable; biaya penggunaan tetap dapat
        # dimanfaatkan oleh project cost command.
        # ====================================================================
        equipment_usages = [
            {"_key": "EU-P1-001", "project": p1, "task": t5, "start_at": "2026-08-03T08:00:00+07:00", "end_at": "2026-08-03T17:00:00+07:00", "usage_hours": "8.00", "hourly_rate": "25000.00", "total_cost": "200000.00", "status": "COMPLETED"},
            {"_key": "EU-P3-001", "project": p3, "task": p3_t2, "start_at": "2026-08-04T08:00:00+07:00", "end_at": "2026-08-04T16:00:00+07:00", "usage_hours": "7.00", "hourly_rate": "350000.00", "total_cost": "2450000.00", "status": "COMPLETED"},
            {"_key": "EU-P4-001", "project": p4, "task": p4_t2, "start_at": "2026-08-05T08:00:00+07:00", "end_at": "2026-08-05T17:00:00+07:00", "usage_hours": "8.00", "hourly_rate": "30000.00", "total_cost": "240000.00", "status": "COMPLETED"},
            {"_key": "EU-DEL", "project": p2, "start_at": "2030-12-31T08:00:00+07:00", "end_at": "2030-12-31T09:00:00+07:00", "usage_hours": "1.00", "hourly_rate": "1.00", "total_cost": "1.00", "status": "TEST"},
        ]
        seed(
            name="equipment_usages",
            state_key="equipment_usages",
            endpoint="/api/v1/projects/equipment-usages/",
            items=equipment_usages,
            match_fields=("project", "start_at", "usage_hours"),
            patch_payload={"status": "COMPLETED"},
            delete_key="EU-DEL",
            search_term="COMPLETED",
        )

        # ====================================================================
        # 26/27 — WEIGHT INDICATORS
        # ====================================================================
        weight_indicators = [
            {"_key": "WI-P1", "project": p1, "sales_order": sales_order_id, "currency": currency_id, "base_project_value": "1500000000.00", "weight_percent": "85.00", "weighted_project_value": "1275000000.00", "calculated_at": "2026-08-11T09:00:00+07:00", "status": "ACTIVE"},
            {"_key": "WI-P4", "project": p4, "currency": currency_id, "base_project_value": "720000000.00", "weight_percent": "90.00", "weighted_project_value": "648000000.00", "calculated_at": "2026-08-11T09:05:00+07:00", "status": "ACTIVE"},
            {"_key": "WI-P7", "project": p7, "currency": currency_id, "base_project_value": "510000000.00", "weight_percent": "70.00", "weighted_project_value": "357000000.00", "calculated_at": "2026-08-11T09:10:00+07:00", "status": "AT_RISK"},
            {"_key": "WI-DEL", "project": p2, "currency": currency_id, "base_project_value": "1.00", "weight_percent": "1.00", "weighted_project_value": "0.01", "calculated_at": "2030-12-31T09:00:00+07:00", "status": "TEST"},
        ]
        seed(
            name="weight_indicators",
            state_key="weight_indicators",
            endpoint="/api/v1/projects/weight-indicators/",
            items=weight_indicators,
            match_fields=("project", "calculated_at"),
            patch_payload={"status": "ACTIVE"},
            delete_key="WI-DEL",
            search_term="ACTIVE",
        )

        wi_p1 = sid("weight_indicators", "WI-P1")
        wi_p4 = sid("weight_indicators", "WI-P4")

        # ====================================================================
        # 27/27 — WEIGHT COMPONENTS
        # ====================================================================
        weight_components = [
            {"_key": "WC-P1-SCHEDULE", "project_weight_indicator": wi_p1, "component_code": "SCHEDULE", "component_name": "Schedule Confidence", "raw_value": "76.00", "normalized_score": "0.76", "component_weight": "0.30", "weighted_score": "0.228"},
            {"_key": "WC-P1-COST", "project_weight_indicator": wi_p1, "component_code": "COST", "component_name": "Cost Confidence", "raw_value": "86.00", "normalized_score": "0.86", "component_weight": "0.25", "weighted_score": "0.215"},
            {"_key": "WC-P1-QUALITY", "project_weight_indicator": wi_p1, "component_code": "QUALITY", "component_name": "Quality Confidence", "raw_value": "91.00", "normalized_score": "0.91", "component_weight": "0.20", "weighted_score": "0.182"},
            {"_key": "WC-P1-RESOURCE", "project_weight_indicator": wi_p1, "component_code": "RESOURCE", "component_name": "Resource Confidence", "raw_value": "72.00", "normalized_score": "0.72", "component_weight": "0.15", "weighted_score": "0.108"},
            {"_key": "WC-P1-RISK", "project_weight_indicator": wi_p1, "component_code": "RISK", "component_name": "Risk Confidence", "raw_value": "74.00", "normalized_score": "0.74", "component_weight": "0.10", "weighted_score": "0.074"},
            {"_key": "WC-P4-SCHEDULE", "project_weight_indicator": wi_p4, "component_code": "SCHEDULE", "component_name": "Schedule Confidence", "raw_value": "90.00", "normalized_score": "0.90", "component_weight": "1.00", "weighted_score": "0.90"},
            {"_key": "WC-DEL", "project_weight_indicator": wi_p4, "component_code": "DELETE", "component_name": "Delete Test", "raw_value": "1.00", "normalized_score": "0.01", "component_weight": "0.01", "weighted_score": "0.0001"},
        ]
        seed(
            name="weight_components",
            state_key="weight_components",
            endpoint="/api/v1/projects/weight-components/",
            items=weight_components,
            match_fields=("project_weight_indicator", "component_code"),
            patch_payload={"component_name": "Schedule Confidence"},
            delete_key="WC-DEL",
            search_term="Schedule",
        )

        # ====================================================================
        # PROJECT CRUD COVERAGE ASSERTION
        # ====================================================================
        covered_project_endpoints = {
            str(report.get("endpoint"))
            for report in reports
            if str(report.get("endpoint", "")).startswith("/api/v1/projects/")
        }
        missing_project_endpoints = sorted(
            EXPECTED_PROJECT_ENDPOINTS - covered_project_endpoints
        )
        if missing_project_endpoints:
            raise SeederError(
                "Project CRUD coverage belum lengkap: "
                + ", ".join(missing_project_endpoints)
            )

        # ====================================================================
        # MANUFACTURING — EXISTING STAGE 6 BEHAVIOUR PRESERVED
        # ====================================================================
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
                "planned_start_at": "2030-12-30T08:00:00+07:00",
                "planned_end_at": "2030-12-31T17:00:00+07:00",
                "material_status": "PLANNED",
                "quality_status": "PENDING",
                "status": "DRAFT",
            },
        ]
        seed(
            name="production_orders",
            state_key="production_orders",
            endpoint="/api/v1/manufacturing/production-orders/",
            items=production_orders,
            match_fields=("planned_start_at", "planned_quantity", "product", "company"),
            patch_payload={"status": "RELEASED"},
            delete_key="PO-MFG-DEL",
            search_term="RELEASED",
        )

        released_production_id = sid(
            "production_orders",
            "PO-MFG-2026-001",
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
                "actual_end_at": "2026-09-15T16:00:00+07:00",
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
                "planned_start_at": "2030-12-30T08:00:00+07:00",
                "planned_end_at": "2030-12-31T17:00:00+07:00",
                "planned_quantity": "1.00",
                "completed_quantity": "0.00",
                "rejected_quantity": "0.00",
                "status": "READY",
            },
        ]
        seed(
            name="work_orders",
            state_key="work_orders",
            endpoint="/api/v1/manufacturing/work-orders/",
            items=work_orders,
            match_fields=("sequence_number", "production_order"),
            patch_payload={"status": "READY"},
            delete_key="WO-DEL",
            search_term="READY",
        )

        # ====================================================================
        # FINAL SUMMARY
        # ====================================================================
        success = stage_is_successful(reports)

        client.state_mapping(("reports",))["stage_6.summary"] = {
            "scope": "Project Management & Manufacturing",
            "project_crud_coverage": f"{len(covered_project_endpoints)}/{len(EXPECTED_PROJECT_ENDPOINTS)}",
            "project_records": {
                "projects": len([x for x in projects if x["_key"] != "PROJ-DEL"]),
                "members": len([x for x in members if x["_key"] != "MEM-DEL"]),
                "tasks": len([x for x in tasks if x["_key"] != "TASK-DEL"]),
                "milestones": len([x for x in milestones if x["_key"] != "MS-DEL"]),
                "timesheets": len([x for x in timesheets if x["_key"] != "TS-DEL"]),
                "risks": len([x for x in risks if x["_key"] != "RISK-DEL"]),
                "issues": len([x for x in issues if x["_key"] != "ISS-DEL"]),
                "resource_allocations": len([x for x in resource_allocations if x["_key"] != "RA-DEL"]),
            },
            "manufacturing_records": {
                "production_orders": len([x for x in production_orders if x["_key"] != "PO-MFG-DEL"]),
                "work_orders": len([x for x in work_orders if x["_key"] != "WO-DEL"]),
            },
            "hr_bridge": {
                "project_members_use_user": True,
                "timesheet_employee_nullable": True,
                "resource_employee_nullable": True,
                "future_action": "Backfill employee FK setelah HR Employee tersedia.",
            },
            "success": bool(success),
        }
        client.save_state()

        print("\n" + "=" * 84)
        print("HASIL SEEDING TAHAP 6 — PROJECT MANAGEMENT & MANUFACTURING")
        print("=" * 84)
        print(
            json.dumps(
                {
                    "success": success,
                    "coverage": {
                        "project_crud_resources": f"{len(covered_project_endpoints)}/{len(EXPECTED_PROJECT_ENDPOINTS)}",
                        "manufacturing_crud_resources": "2/2",
                    },
                    "records": {
                        "projects": len([x for x in projects if x["_key"] != "PROJ-DEL"]),
                        "project_members": len([x for x in members if x["_key"] != "MEM-DEL"]),
                        "tasks": len([x for x in tasks if x["_key"] != "TASK-DEL"]),
                        "task_dependencies": len([x for x in dependencies if x["_key"] != "DEP-DEL"]),
                        "milestones": len([x for x in milestones if x["_key"] != "MS-DEL"]),
                        "timesheets": len([x for x in timesheets if x["_key"] != "TS-DEL"]),
                        "risks": len([x for x in risks if x["_key"] != "RISK-DEL"]),
                        "issues": len([x for x in issues if x["_key"] != "ISS-DEL"]),
                        "production_orders": len([x for x in production_orders if x["_key"] != "PO-MFG-DEL"]),
                        "work_orders": len([x for x in work_orders if x["_key"] != "WO-DEL"]),
                    },
                    "compatibility": {
                        "finance_project_key_preserved": "PROJ-2026-003",
                        "project_manager_source": "stage_2.users",
                        "employee_dependency_required": False,
                    },
                    "reports": [_report_view(report) for report in reports],
                },
                ensure_ascii=False,
                indent=2,
            )
        )

        return bool(success)

    except SeederError as exc:
        print(f"\n[STAGE 6 FAILED] {exc}")
        return False


if __name__ == "__main__":
    raise SystemExit(0 if run_stage() else 1)