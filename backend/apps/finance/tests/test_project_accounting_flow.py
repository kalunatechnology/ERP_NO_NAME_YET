from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import Role, User, UserRole
from apps.core.models import Company, Tenant
from apps.finance.models import ARAPSchedule, BillingProposal, JournalLine, ProjectCostEntry, ProjectWIPSnapshot, TaxTransaction
from apps.master_data.models import Currency
from apps.projects.models import Project


class ProjectAccountingFlowTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(code="FLOW", name="Flow", status="ACTIVE")
        self.currency = Currency.objects.create(currency_code="IDR", currency_name="Rupiah")
        self.company = Company.objects.create(tenant=self.tenant, company_code="FLOW", legal_name="Flow Company", base_currency=self.currency, status="ACTIVE")
        self.pm = self.make_user("pm-flow", "PROJECT_MANAGEMENT")
        self.finance = self.make_user("finance-flow", "ACCOUNTING_FINANCE")
        self.project = Project.objects.create(tenant=self.tenant, company=self.company, project_code="FLOW-1", project_name="Flow Project", project_manager=self.pm, progress_percent=50)
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

    def test_cost_requires_finance_validation_before_wip(self):
        response = self.client_for(self.pm).post("/api/v1/finance/project-cost-entries/", {"project": str(self.project.id), "description": "Material issue", "source_type": "WAREHOUSE", "cost_element": "MATERIAL", "transaction_date": "2026-08-13", "total_cost": "25000000"}, format="json", **self.headers)
        self.assertEqual(response.status_code, 201, response.data)
        cost_id = response.data["id"]
        self.assertEqual(self.client_for(self.pm).post(f"/api/v1/finance/project-cost-entries/{cost_id}/validate/", {}, format="json", **self.headers).status_code, 403)
        finance = self.client_for(self.finance)
        self.assertEqual(finance.post(f"/api/v1/finance/project-cost-entries/{cost_id}/validate/", {}, format="json", **self.headers).status_code, 200)
        self.assertEqual(finance.post(f"/api/v1/finance/project-cost-entries/{cost_id}/post/", {}, format="json", **self.headers).status_code, 200)
        result = finance.post("/api/v1/finance/project-cost-entries/calculate-wip/", {"project": str(self.project.id)}, format="json", **self.headers)
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(ProjectCostEntry.objects.get(pk=cost_id).status, "POSTED")
        journal = ProjectCostEntry.objects.get(pk=cost_id).journal_entry
        self.assertEqual(JournalLine.objects.filter(journal_entry=journal).count(), 2)
        self.assertEqual(sum((line.debit_base or 0) for line in JournalLine.objects.filter(journal_entry=journal)), Decimal("25000000"))
        self.assertEqual(sum((line.credit_base or 0) for line in JournalLine.objects.filter(journal_entry=journal)), Decimal("25000000"))
        self.assertEqual(ProjectWIPSnapshot.objects.get(pk=result.data["id"]).wip_asset_amount, Decimal("25000000"))

    def test_tax_compliance_reaches_reported_only_after_ntpn(self):
        finance = self.client_for(self.finance)
        created = finance.post("/api/v1/finance/tax-transactions/", {"taxable_amount": "1000000", "tax_rate": "11", "tax_amount": "110000", "tax_direction": "OUTPUT", "tax_date": "2026-08-14"}, format="json", **self.headers)
        self.assertEqual(created.status_code, 201, created.data)
        tax_id = created.data["id"]
        self.assertEqual(finance.post(f"/api/v1/finance/tax-transactions/{tax_id}/validate/", {}, format="json", **self.headers).status_code, 200)
        self.assertEqual(finance.post(f"/api/v1/finance/tax-transactions/{tax_id}/create-billing-code/", {}, format="json", **self.headers).status_code, 200)
        self.assertEqual(finance.post(f"/api/v1/finance/tax-transactions/{tax_id}/pay/", {"payment_reference": "PAY-TAX-01", "ntpn": "NTPN-UAT-01"}, format="json", **self.headers).status_code, 200)
        self.assertEqual(finance.post(f"/api/v1/finance/tax-transactions/{tax_id}/report/", {}, format="json", **self.headers).status_code, 200)
        self.assertEqual(TaxTransaction.objects.get(pk=tax_id).status, "REPORTED")

    def test_billing_proposal_creates_invoice_and_ar_only_after_finance_approval(self):
        pm = self.client_for(self.pm)
        response = pm.post("/api/v1/finance/billing-proposals/", {"project": str(self.project.id), "description": "Project milestone 50%", "trigger_type": "MILESTONE_APPROVED", "subtotal": "50000000", "tax_rate": "11"}, format="json", **self.headers)
        self.assertEqual(response.status_code, 201, response.data)
        proposal_id = response.data["id"]
        self.assertEqual(pm.post(f"/api/v1/finance/billing-proposals/{proposal_id}/submit/", {}, format="json", **self.headers).status_code, 200)
        approved = self.client_for(self.finance).post(f"/api/v1/finance/billing-proposals/{proposal_id}/approve/", {}, format="json", **self.headers)
        self.assertEqual(approved.status_code, 200, approved.data)
        proposal = BillingProposal.objects.get(pk=proposal_id)
        self.assertEqual(proposal.status, "INVOICED")
        self.assertEqual(proposal.billing_document.outstanding_amount, Decimal("55500000"))
        self.assertTrue(ARAPSchedule.objects.filter(billing_document=proposal.billing_document, status="OPEN").exists())
