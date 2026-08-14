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


DUMMY_PASSWORD = "DummyPass123!"


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

        reports = []

        companies = [
            {
                "_key": "COMP-HOLDING",
                "tenant": tenant_id,
                "company_code": "COMP-HOLDING",
                "legal_name": "PT Holding Utama Indonesia",
                "tax_number": "01.000.000.0-001.000",
                "fiscal_year_start": "2026-01-01",
                "status": "ACTIVE",
            },
            {
                "_key": "COMP-MFG",
                "tenant": tenant_id,
                "company_code": "COMP-MFG",
                "legal_name": "PT Manufacturing Sub-Group",
                "tax_number": "01.000.000.0-002.000",
                "fiscal_year_start": "2026-01-01",
                "status": "ACTIVE",
            },
            {
                "_key": "COMP-SVC",
                "tenant": tenant_id,
                "company_code": "COMP-SVC",
                "legal_name": "PT Services Indonesia",
                "tax_number": "01.000.000.0-003.000",
                "fiscal_year_start": "2026-01-01",
                "status": "ACTIVE",
            },
            {
                "_key": "COMP-INACTIVE",
                "tenant": tenant_id,
                "company_code": "COMP-INACTIVE",
                "legal_name": "PT Inactive Subsidiary",
                "status": "INACTIVE",
            },
            {
                "_key": "COMP-DELETE",
                "tenant": tenant_id,
                "company_code": "COMP-DELETE",
                "legal_name": "PT Company Delete Test",
                "status": "ACTIVE",
            },
        ]
        company_report = client.seed_resource(
            stage_name="stage_2.companies",
            state_path=("stage_2", "companies"),
            endpoint="/api/v1/core/companies/",
            items=companies,
            match_fields=("company_code",),
            patch_payload={
                "legal_name": "PT Holding Utama Indonesia Updated"
            },
            delete_key="COMP-DELETE",
            search_term="Manufacturing",
        )
        reports.append(company_report)

        company_id = client.require_state_id(
            ("stage_2", "companies", "COMP-HOLDING"),
            "COMP-HOLDING company",
        )

        organizations = [
            {
                "_key": "ORG-HQ",
                "tenant": tenant_id,
                "company": company_id,
                "organization_code": "ORG-HQ",
                "organization_name": "Headquarter Division",
                "organization_type": "DIVISION",
                "status": "ACTIVE",
            },
            {
                "_key": "ORG-FINANCE",
                "tenant": tenant_id,
                "company": company_id,
                "organization_code": "ORG-FINANCE",
                "organization_name": "Finance & Accounting",
                "organization_type": "DEPARTMENT",
                "status": "ACTIVE",
            },
            {
                "_key": "ORG-OPERATIONAL",
                "tenant": tenant_id,
                "company": company_id,
                "organization_code": "ORG-OPERATIONAL",
                "organization_name": "Operations Department",
                "organization_type": "DEPARTMENT",
                "status": "ACTIVE",
            },
            {
                "_key": "ORG-INACTIVE",
                "tenant": tenant_id,
                "company": company_id,
                "organization_code": "ORG-INACTIVE",
                "organization_name": "Archived Division",
                "organization_type": "DIVISION",
                "status": "INACTIVE",
            },
            {
                "_key": "ORG-DELETE",
                "tenant": tenant_id,
                "company": company_id,
                "organization_code": "ORG-DELETE",
                "organization_name": "Organization Delete Test",
                "organization_type": "DIVISION",
                "status": "ACTIVE",
            },
        ]
        organization_report = client.seed_resource(
            stage_name="stage_2.organizations",
            state_path=("stage_2", "organizations"),
            endpoint="/api/v1/core/organizations/",
            items=organizations,
            match_fields=("organization_code", "company"),
            patch_payload={
                "organization_name": "Headquarter Division Updated"
            },
            delete_key="ORG-DELETE",
            search_term="Finance",
            company_id=company_id,
        )
        reports.append(organization_report)

        organization_id = client.require_state_id(
            ("stage_2", "organizations", "ORG-HQ"),
            "ORG-HQ organization",
        )

        roles = [
            {
                "_key": "ROLE-ADMIN",
                "tenant": tenant_id,
                "role_code": "ROLE-ADMIN",
                "role_name": "System Administrator",
                "description": "Full access for dummy ERP testing.",
            },
            {
                "_key": "ROLE-MANAGER",
                "tenant": tenant_id,
                "role_code": "ROLE-MANAGER",
                "role_name": "Operational Manager",
                "description": "Managerial scope for dummy testing.",
            },
            {
                "_key": "ROLE-STAFF",
                "tenant": tenant_id,
                "role_code": "ROLE-STAFF",
                "role_name": "Operational Staff",
                "description": "Standard operational scope.",
            },
            {
                "_key": "ROLE-INACTIVE",
                "tenant": tenant_id,
                "role_code": "ROLE-INACTIVE",
                "role_name": "Deprecated Role",
                "description": "Inactive role test record.",
            },
            {
                "_key": "ROLE-DELETE",
                "tenant": tenant_id,
                "role_code": "ROLE-DELETE",
                "role_name": "Role Delete Test",
                "description": "Role created only for DELETE test.",
            },
        ]
        role_report = client.seed_resource(
            stage_name="stage_2.roles",
            state_path=("stage_2", "roles"),
            endpoint="/api/v1/accounts/roles/",
            items=roles,
            match_fields=("role_code", "tenant"),
            patch_payload={
                "description": "Updated through idempotent IAM seeder."
            },
            delete_key="ROLE-DELETE",
            search_term="Manager",
        )
        reports.append(role_report)

        users = [
            {
                "_key": "dummy.admin@example.com",
                "tenant": tenant_id,
                "username": "dummy.admin",
                "email": "dummy.admin@example.com",
                "password": DUMMY_PASSWORD,
                "full_name": "Dummy Administrator",
                "status": "ACTIVE",
                "is_staff": False,
                "is_superuser": False,
                "is_active": True,

            },
            {
                "_key": "dummy.manager@example.com",
                "tenant": tenant_id,
                "username": "dummy.manager",
                "email": "dummy.manager@example.com",
                "password": DUMMY_PASSWORD,
                "full_name": "Dummy Operational Manager",
                "status": "ACTIVE",
                "is_staff": False,
                "is_superuser": False,
                "is_active": True,
                "groups": [],
                "user_permissions": [],
            },
            {
                "_key": "dummy.staff@example.com",
                "tenant": tenant_id,
                "username": "dummy.staff",
                "email": "dummy.staff@example.com",
                "password": DUMMY_PASSWORD,
                "full_name": "Dummy Operational Staff",
                "status": "ACTIVE",
                "is_staff": False,
                "is_superuser": False,
                "is_active": True,
                "groups": [],
                "user_permissions": [],
            },
            {
                "_key": "dummy.inactive@example.com",
                "tenant": tenant_id,
                "username": "dummy.inactive",
                "email": "dummy.inactive@example.com",
                "password": DUMMY_PASSWORD,
                "full_name": "Dummy Inactive User",
                "status": "INACTIVE",
                "is_staff": False,
                "is_superuser": False,
                "is_active": False,
                "groups": [],
                "user_permissions": [],
            },
            {
                "_key": "dummy.delete@example.com",
                "tenant": tenant_id,
                "username": "dummy.delete",
                "email": "dummy.delete@example.com",
                "password": DUMMY_PASSWORD,
                "full_name": "Dummy Delete Test",
                "status": "ACTIVE",
                "is_staff": False,
                "is_superuser": False,
                "is_active": True,
                "groups": [],
                "user_permissions": [],
            },
        ]
        user_report = client.seed_resource(
            stage_name="stage_2.users",
            state_path=("stage_2", "users"),
            endpoint="/api/v1/accounts/users/",
            items=users,
            match_fields=("email",),
            patch_payload={"full_name": "Dummy Administrator Updated"},
            delete_key="dummy.delete@example.com",
            search_term="dummy.manager",
        )
        reports.append(user_report)

        user_admin_id = client.require_state_id(
            ("stage_2", "users", "dummy.admin@example.com"),
            "dummy admin user",
        )
        user_manager_id = client.require_state_id(
            ("stage_2", "users", "dummy.manager@example.com"),
            "dummy manager user",
        )
        user_staff_id = client.require_state_id(
            ("stage_2", "users", "dummy.staff@example.com"),
            "dummy staff user",
        )
        role_admin_id = client.require_state_id(
            ("stage_2", "roles", "ROLE-ADMIN"),
            "ROLE-ADMIN",
        )
        role_manager_id = client.require_state_id(
            ("stage_2", "roles", "ROLE-MANAGER"),
            "ROLE-MANAGER",
        )
        role_staff_id = client.require_state_id(
            ("stage_2", "roles", "ROLE-STAFF"),
            "ROLE-STAFF",
        )

        user_roles = [
            {
                "_key": "UR-ADMIN",
                "user": user_admin_id,
                "role": role_admin_id,
                "company": company_id,
                "organization": organization_id,
            },
            {
                "_key": "UR-MANAGER",
                "user": user_manager_id,
                "role": role_manager_id,
                "company": company_id,
                "organization": organization_id,
            },
            {
                "_key": "UR-STAFF",
                "user": user_staff_id,
                "role": role_staff_id,
                "company": company_id,
                "organization": organization_id,
            },
            {
                "_key": "UR-DELETE",
                "user": user_admin_id,
                "role": role_manager_id,
                "company": company_id,
                "organization": organization_id,
            },
        ]
        user_role_report = client.seed_resource(
            stage_name="stage_2.user_roles",
            state_path=("stage_2", "user_roles"),
            endpoint="/api/v1/accounts/user-roles/",
            items=user_roles,
            match_fields=("user", "role", "company", "organization"),
            patch_payload={"organization": organization_id},
            delete_key="UR-DELETE",
            search_term="ROLE-ADMIN",
            company_id=company_id,
        )
        reports.append(user_role_report)

        active_login_ok = client.verify_user_login(
            email="dummy.admin@example.com",
            password=DUMMY_PASSWORD,
            should_succeed=True,
        )
        inactive_login_ok = client.verify_user_login(
            email="dummy.inactive@example.com",
            password=DUMMY_PASSWORD,
            should_succeed=False,
        )

        login_report = {
            "active_user_login": "PASS" if active_login_ok else "FAIL",
            "inactive_user_login": "PASS" if inactive_login_ok else "FAIL",
            "success": active_login_ok and inactive_login_ok,
        }
        client.state_mapping(("reports",))["stage_2.login_checks"] = login_report
        client.save_state()

        success = stage_is_successful(reports) and login_report["success"]

        print("\n" + "=" * 68)
        print("HASIL SEEDING TAHAP 2 — CORE & IAM")
        print("=" * 68)
        print(
            json.dumps(
                {
                    "success": success,
                    "company_id": company_id,
                    "organization_id": organization_id,
                    "reports": [
                        {
                            "endpoint": report["endpoint"],
                            "success": report["success"],
                            "tests": report["tests"],
                            "errors": report["errors"],
                        }
                        for report in reports
                    ],
                    "login_checks": login_report,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return bool(success)

    except SeederError as exc:
        print(f"\n[STAGE 2 FAILED] {exc}")
        return False


if __name__ == "__main__":
    raise SystemExit(0 if run_stage() else 1)
