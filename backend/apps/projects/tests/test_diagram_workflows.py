from datetime import date
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import Role, User, UserRole
from apps.core.models import Company, Notification, Tenant
from apps.finance.models import BillingProposal, ProjectCostEntry
from apps.manufacturing.models import ProductionOrder, WorkOrder
from apps.master_data.models import Currency, Machine, Product, Warehouse, WorkCenter
from apps.procurement.models import PurchaseRequisition
from apps.projects.models import ChangeRequest, EquipmentUsage, Issue, IssueAction, MaterialRequirement, Member, Project, ResourceRequest


class DiagramWorkflowTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(code="DIAGRAM", name="Diagram", status="ACTIVE")
        self.currency = Currency.objects.create(currency_code="IDR", currency_name="Rupiah")
        self.company = Company.objects.create(tenant=self.tenant, company_code="DIAGRAM", legal_name="Diagram Co", base_currency=self.currency, status="ACTIVE")
        self.pm = self.make_user("diagram-pm", "PROJECT_MANAGEMENT")
        self.member = self.make_user("diagram-member", "PROJECT_ASSIGNEE")
        self.project = Project.objects.create(tenant=self.tenant, company=self.company, project_code="DG-1", project_name="Diagram Project", project_manager=self.pm, planned_end_date=date(2026, 8, 31), budget_amount=Decimal("100000000"), status="IN_PROGRESS")
        self.product = Product.objects.create(product_code="DG-MAT", product_name="Additional Material", status="ACTIVE")
        self.warehouse = Warehouse.objects.create(company=self.company, warehouse_code="DG-WH", warehouse_name="Diagram Warehouse", status="ACTIVE")
        self.work_center = WorkCenter.objects.create(company=self.company, work_center_code="WC-B", work_center_name="Backup", status="ACTIVE")
        self.machine = Machine.objects.create(company=self.company, work_center=self.work_center, machine_code="MACHINE-B", machine_name="Backup Machine", status="ACTIVE")
        self.production = ProductionOrder.objects.create(company=self.company, project=self.project, product=self.product, status="RELEASED")
        self.work_order = WorkOrder.objects.create(production_order=self.production, status="RELEASED")
        Member.objects.create(project=self.project, user=self.member, status="ACTIVE")
        self.headers = {"HTTP_X_COMPANY_ID": str(self.company.id)}

    def make_user(self, username, code):
        user = User.objects.create_user(username=username, email=f"{username}@example.com", password="secret123", tenant=self.tenant)
        role = Role.objects.create(tenant=self.tenant, role_code=code, role_name=code)
        UserRole.objects.create(user=user, role=role, company=self.company)
        return user

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def test_change_request_requires_analysis_and_client_approval_before_applying(self):
        client = self.client_for(self.pm)
        created = client.post("/api/v1/projects/change-requests/", {"project": str(self.project.id), "change_type": "SCOPE", "description": "Additional client scope"}, format="json", **self.headers)
        self.assertEqual(created.status_code, 201, created.data)
        pk = created.data["id"]
        material = client.post("/api/v1/projects/change-request-materials/", {"change_request": pk, "product": str(self.product.id), "warehouse": str(self.warehouse.id), "quantity_delta": "3", "unit_cost": "1000000", "reason": "Additional scope"}, format="json", **self.headers)
        self.assertEqual(material.status_code, 201, material.data)
        self.assertEqual(client.post(f"/api/v1/projects/change-requests/{pk}/analyze/", {"schedule_impact_days": 7, "cost_impact": "15000000", "billing_adjustment": "20000000"}, format="json", **self.headers).status_code, 200)
        self.assertEqual(client.post(f"/api/v1/projects/change-requests/{pk}/submit-client/", {}, format="json", **self.headers).status_code, 200)
        decided = client.post(f"/api/v1/projects/change-requests/{pk}/client-decision/", {"approved": True, "note": "Approved by client"}, format="json", **self.headers)
        self.assertEqual(decided.status_code, 200, decided.data)
        self.project.refresh_from_db()
        self.assertEqual(self.project.planned_end_date, date(2026, 9, 7))
        self.assertEqual(self.project.budget_amount, Decimal("115000000"))
        self.assertTrue(BillingProposal.objects.filter(project=self.project, trigger_type="CHANGE_REQUEST_APPROVED", subtotal=Decimal("20000000")).exists())
        self.assertEqual(MaterialRequirement.objects.get(project=self.project, product=self.product).required_quantity, Decimal("3"))
        self.assertEqual(ChangeRequest.objects.get(pk=pk).status, "APPLIED")
        self.assertTrue(PurchaseRequisition.objects.filter(project=self.project, status="PENDING_APPROVAL").exists())

    def test_operational_issue_creates_alert_and_resolves_after_actions(self):
        reported = self.client_for(self.member).post("/api/v1/projects/issues/", {"project": str(self.project.id), "issue_type": "MACHINE_FAILURE", "severity": "HIGH", "description": "Machine stopped"}, format="json", **self.headers)
        self.assertEqual(reported.status_code, 201, reported.data)
        issue_id = reported.data["id"]
        pm = self.client_for(self.pm)
        analyzed = pm.post(f"/api/v1/projects/issues/{issue_id}/analyze/", {"root_cause": "Bearing failure", "milestone_impact": "Delay two days", "severity": "CRITICAL"}, format="json", **self.headers)
        self.assertEqual(analyzed.status_code, 200, analyzed.data)
        self.assertTrue(Notification.objects.filter(notification_type="PROJECT_OPERATIONAL_ISSUE").exists())
        action = pm.post("/api/v1/projects/issue-actions/", {"issue": issue_id, "action_type": "REALLOCATE_MACHINE", "equipment_reference": "MACHINE-B", "description": "Move work to backup"}, format="json", **self.headers)
        self.assertEqual(action.status_code, 201, action.data)
        labor = pm.post("/api/v1/projects/issue-actions/", {"issue": issue_id, "action_type": "ADD_LABOR", "additional_labor_hours": "8", "description": "Add recovery shift"}, format="json", **self.headers)
        self.assertEqual(labor.status_code, 201, labor.data)
        self.assertEqual(pm.post(f"/api/v1/projects/issue-actions/{action.data['id']}/complete/", {}, format="json", **self.headers).status_code, 200)
        self.assertEqual(pm.post(f"/api/v1/projects/issue-actions/{labor.data['id']}/complete/", {}, format="json", **self.headers).status_code, 200)
        issue = Issue.objects.get(pk=issue_id)
        self.assertEqual(issue.status, "RESOLVED")
        self.assertEqual(issue.alert_status, "RESOLVED")
        self.assertEqual(IssueAction.objects.get(pk=action.data["id"]).status, "COMPLETED")
        self.work_order.refresh_from_db()
        self.assertEqual(self.work_order.machine, self.machine)
        self.assertTrue(EquipmentUsage.objects.filter(project=self.project, machine=self.machine, status="ALLOCATED").exists())
        self.assertTrue(ResourceRequest.objects.filter(project=self.project, request_type="LABOR", status="PENDING_ALLOCATION").exists())
        self.assertTrue(ProjectCostEntry.objects.filter(project=self.project, source_type="OPERATIONAL_ISSUE", cost_element="LABOR", status="CAPTURED").exists())
