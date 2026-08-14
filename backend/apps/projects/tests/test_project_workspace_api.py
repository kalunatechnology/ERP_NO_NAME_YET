from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import Company, Tenant
from apps.finance.models import BillingDocument
from apps.master_data.models import Currency, Party
from apps.projects.models import Project, ProjectControlItem, ProjectExpense


class ProjectWorkspaceAPITests(TestCase):
    def setUp(self):
        tenant = Tenant.objects.create(code="PM-API", name="PM API", status="ACTIVE")
        currency = Currency.objects.create(currency_code="IDR", currency_name="Rupiah")
        self.company = Company.objects.create(
            tenant=tenant, company_code="PM", legal_name="PM Company", base_currency=currency, status="ACTIVE"
        )
        self.user = User.objects.create_user(
            username="pm.api", email="pm.api@example.com", password="secret", tenant=tenant
        )
        self.party = Party.objects.create(tenant=tenant, party_code="VENDOR", display_name="Vendor")
        self.project = Project.objects.create(
            tenant=tenant, company=self.company, project_code="PRJ-API", project_name="API Project"
        )
        self.billing = BillingDocument.objects.create(
            company=self.company, party=self.party, currency=currency, invoice_number="INV-PM-1",
            total_amount=Decimal("125000"), paid_amount=Decimal("25000"),
            outstanding_amount=Decimal("100000"), payment_status="PARTIALLY_PAID", status="POSTED",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.headers = {"HTTP_X_COMPANY_ID": str(self.company.id)}

    def test_control_item_crud_is_project_scoped(self):
        response = self.client.post(
            "/api/v1/projects/control-items/",
            {"project": str(self.project.id), "item_type": "QUALITY", "title": "Final inspection", "status": "PLANNED"},
            format="json", **self.headers,
        )
        self.assertEqual(response.status_code, 201, response.data)
        item = ProjectControlItem.objects.get(pk=response.data["id"])
        self.assertEqual(item.created_by, self.user)

        response = self.client.patch(
            f"/api/v1/projects/control-items/{item.id}/", {"status": "DONE"}, format="json", **self.headers
        )
        self.assertEqual(response.status_code, 200, response.data)
        item.refresh_from_db()
        self.assertEqual(item.updated_by, self.user)

    def test_expense_links_billing_and_exposes_payment_tracking(self):
        response = self.client.post(
            "/api/v1/projects/expenses/",
            {
                "project": str(self.project.id), "billing_document": str(self.billing.id),
                "title": "Vendor invoice", "category": "SERVICE", "amount": "125000",
            },
            format="json", **self.headers,
        )
        self.assertEqual(response.status_code, 201, response.data)
        expense = ProjectExpense.objects.get(pk=response.data["id"])
        self.billing.refresh_from_db()
        self.assertEqual(self.billing.project, self.project)
        self.assertEqual(expense.created_by, self.user)
        self.assertEqual(response.data["billing_invoice_number"], "INV-PM-1")
        self.assertEqual(response.data["payment_status"], "PARTIALLY_PAID")
        self.assertEqual(Decimal(response.data["outstanding_amount"]), Decimal("100000"))
