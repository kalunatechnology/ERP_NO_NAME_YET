from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import Role, User, UserRole
from apps.core.models import Company, Tenant
from apps.finance.models import ProjectFunding
from apps.master_data.models import Currency
from apps.projects.models import Member, Project, Task


class FundingMembershipPermissionTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(code="ACCESS", name="Access", status="ACTIVE")
        self.currency = Currency.objects.create(currency_code="IDR", currency_name="Rupiah")
        self.company = Company.objects.create(
            tenant=self.tenant, company_code="ACCESS", legal_name="Access Company",
            base_currency=self.currency, status="ACTIVE",
        )
        self.pm = self.make_user("pm", "PROJECT_MANAGEMENT")
        self.finance = self.make_user("finance", "ACCOUNTING_FINANCE")
        self.member = self.make_user("member", "PROJECT_MEMBER")
        self.outsider = self.make_user("outsider", "PROJECT_MEMBER")
        self.headers = {"HTTP_X_COMPANY_ID": str(self.company.id)}

    def make_user(self, username, role_code):
        user = User.objects.create_user(
            username=username, email=f"{username}@example.com", password="secret123", tenant=self.tenant
        )
        role, _ = Role.objects.get_or_create(
            tenant=self.tenant, role_code=role_code, defaults={"role_name": role_code}
        )
        UserRole.objects.create(user=user, role=role, company=self.company)
        return user

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def create_approved_funding(self):
        pm_client = self.client_for(self.pm)
        response = pm_client.post(
            "/api/v1/finance/project-fundings/",
            {"purpose": "Project Alpha", "requested_amount": "100000000", "currency": str(self.currency.id)},
            format="json", **self.headers,
        )
        self.assertEqual(response.status_code, 201, response.data)
        funding_id = response.data["id"]
        self.assertEqual(pm_client.post(f"/api/v1/finance/project-fundings/{funding_id}/submit/", {}, format="json", **self.headers).status_code, 200)
        finance_client = self.client_for(self.finance)
        self.assertEqual(finance_client.post(f"/api/v1/finance/project-fundings/{funding_id}/verify/", {}, format="json", **self.headers).status_code, 200)
        self.assertEqual(finance_client.post(f"/api/v1/finance/project-fundings/{funding_id}/approve/", {"approved_limit": "90000000"}, format="json", **self.headers).status_code, 200)
        return ProjectFunding.objects.get(pk=funding_id)

    def test_funding_approval_creates_project_for_requester(self):
        funding = self.create_approved_funding()
        response = self.client_for(self.pm).post(
            f"/api/v1/finance/project-fundings/{funding.id}/create-project/",
            {"project_code": "ALPHA", "project_name": "Project Alpha"}, format="json", **self.headers,
        )
        self.assertEqual(response.status_code, 201, response.data)
        funding.refresh_from_db()
        self.assertEqual(funding.status, "ACTIVE")
        self.assertEqual(funding.project.budget_amount, Decimal("90000000"))
        self.assertEqual(funding.project.project_manager, self.pm)
        self.assertTrue(Member.objects.filter(project=funding.project, user=self.pm, project_role="PROJECT_MANAGER").exists())

    def test_funding_project_can_verify_reserve_and_start_without_sales_order_materials(self):
        funding = self.create_approved_funding()
        pm_client = self.client_for(self.pm)
        created = pm_client.post(
            f"/api/v1/finance/project-fundings/{funding.id}/create-project/",
            {"project_code": "SERVICE", "project_name": "Service Project"}, format="json", **self.headers,
        )
        self.assertEqual(created.status_code, 201, created.data)
        project = Project.objects.get(pk=created.data["project_id"])

        verified = pm_client.post(
            f"/api/v1/commands/projects/projects/{project.id}/verify/", {}, format="json", **self.headers,
        )
        self.assertEqual(verified.status_code, 200, verified.data)
        self.assertTrue(verified.data["data"]["checks"]["incoming_order"])
        self.assertTrue(verified.data["data"]["checks"]["technical_scope"])
        self.assertTrue(verified.data["data"]["checks"]["material_requirements"])

        reserved = pm_client.post(
            f"/api/v1/commands/projects/projects/{project.id}/reserve-materials/", {}, format="json", **self.headers,
        )
        self.assertEqual(reserved.status_code, 200, reserved.data)
        self.assertTrue(reserved.data["data"]["checks"]["material_reserved"])

        started = pm_client.post(
            f"/api/v1/commands/projects/projects/{project.id}/start/", {}, format="json", **self.headers,
        )
        self.assertEqual(started.status_code, 200, started.data)
        project.refresh_from_db()
        self.assertEqual(project.status, "IN_PROGRESS")

    def test_only_finance_can_verify_and_approve(self):
        funding = ProjectFunding.objects.create(
            tenant=self.tenant, company=self.company, requested_by=self.pm, purpose="Secure",
            requested_amount=Decimal("100"), status="SUBMITTED",
        )
        response = self.client_for(self.pm).post(
            f"/api/v1/finance/project-fundings/{funding.id}/verify/", {}, format="json", **self.headers
        )
        self.assertEqual(response.status_code, 403)

    def test_project_and_task_are_isolated_by_membership(self):
        project = Project.objects.create(
            tenant=self.tenant, company=self.company, project_code="PRIVATE", project_name="Private",
            project_manager=self.pm, budget_amount=Decimal("100"), status="PLANNED",
        )
        Member.objects.create(project=project, user=self.member, project_role="MEMBER", status="ACTIVE")
        task = Task.objects.create(project=project, task_code="T-1", task_name="Assigned", assigned_to=self.member, created_by=self.pm, status="TODO")

        member_client = self.client_for(self.member)
        visible = member_client.get("/api/v1/projects/projects/", **self.headers)
        self.assertEqual(visible.status_code, 200)
        self.assertEqual(visible.data["count"], 1)
        update = member_client.patch(
            f"/api/v1/projects/tasks/{task.id}/", {"status": "IN_PROGRESS", "progress_percent": "25"},
            format="json", **self.headers,
        )
        self.assertEqual(update.status_code, 200, update.data)
        forbidden_edit = member_client.patch(
            f"/api/v1/projects/tasks/{task.id}/", {"task_name": "Hijacked"}, format="json", **self.headers
        )
        self.assertEqual(forbidden_edit.status_code, 403)

        outsider_client = self.client_for(self.outsider)
        hidden = outsider_client.get(f"/api/v1/projects/tasks/{task.id}/", **self.headers)
        self.assertEqual(hidden.status_code, 404)
        self.assertEqual(outsider_client.get("/api/v1/projects/projects/", **self.headers).data["count"], 0)

    def test_member_cannot_assign_task_and_finance_cannot_manage_task(self):
        project = Project.objects.create(
            tenant=self.tenant, company=self.company, project_code="AUTH", project_name="Auth", project_manager=self.pm
        )
        Member.objects.create(project=project, user=self.member, project_role="MEMBER", status="ACTIVE")
        payload = {"project": str(project.id), "task_code": "T-2", "task_name": "Denied", "assigned_to": str(self.member.id)}
        self.assertEqual(self.client_for(self.member).post("/api/v1/projects/tasks/", payload, format="json", **self.headers).status_code, 403)
        self.assertEqual(self.client_for(self.finance).post("/api/v1/projects/tasks/", payload, format="json", **self.headers).status_code, 403)
