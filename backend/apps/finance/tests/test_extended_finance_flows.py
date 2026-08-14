from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.assets.models import Asset, Maintenance
from apps.core.models import Company, Tenant
from apps.finance.models import (
    Account, BankAccount, CreditFacility, FiscalPeriod, FiscalYear, Journal, JournalEntry, JournalLine, OverheadRule,
    ProjectFunding, RecurringPaymentRule, RecurringPaymentRun,
)
from apps.master_data.models import Currency, Party
from apps.projects.models import Project


class ExtendedFinanceFlowTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(code="FIN-FLOW", name="Finance Flow", status="ACTIVE")
        self.currency = Currency.objects.create(currency_code="IDR", currency_name="Rupiah")
        self.company = Company.objects.create(tenant=self.tenant, company_code="FIN", legal_name="Finance Co", base_currency=self.currency, status="ACTIVE")
        self.user = User.objects.create_user(username="finance.flow", email="finance.flow@example.com", password="secret", tenant=self.tenant)
        self.party = Party.objects.create(tenant=self.tenant, party_code="BANK", display_name="Bank")
        self.account = Account.objects.create(company=self.company, account_code="1000", account_name="Cash", status="ACTIVE")
        self.bank = BankAccount.objects.create(company=self.company, party=self.party, ledger_account=self.account, currency=self.currency, bank_name="Bank")
        self.year = FiscalYear.objects.create(company=self.company, fiscal_year_name="2026", status="OPEN")
        self.period = FiscalPeriod.objects.create(fiscal_year=self.year, period_number=8, start_date="2026-08-01", end_date="2026-08-31", status="OPEN")
        self.project = Project.objects.create(tenant=self.tenant, company=self.company, project_code="P-1", project_name="Project", budget_amount=Decimal("1000"), progress_percent=Decimal("50"))
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.headers = {"HTTP_X_COMPANY_ID": str(self.company.id)}

    def post(self, path, data=None):
        return self.client.post(path, data or {}, format="json", **self.headers)

    def test_recurring_payment_is_idempotent_per_date(self):
        rule = RecurringPaymentRule.objects.create(company=self.company, party=self.party, bank_account=self.bank, expense_account=self.account, currency=self.currency, rule_code="RENT", amount=Decimal("100"), recurrence_rule="MONTHLY", next_run_date="2026-08-12", status="ACTIVE")
        response = self.post(f"/api/v1/commands/finance/recurring-payment-rules/{rule.id}/run/")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(RecurringPaymentRun.objects.count(), 1)
        response = self.post(f"/api/v1/commands/finance/recurring-payment-rules/{rule.id}/run/", {"scheduled_date": "2026-08-12"})
        self.assertEqual(response.status_code, 400, response.data)

    def test_credit_wip_funding_overhead_and_maintenance_commands(self):
        facility = CreditFacility.objects.create(company=self.company, party=self.party, currency=self.currency, credit_limit=Decimal("500"), utilized_amount=Decimal("100"), status="ACTIVE")
        response = self.post(f"/api/v1/commands/finance/credit-facilities/{facility.id}/check/", {"requested_amount": "350"})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["data"]["approved"])

        response = self.post(f"/api/v1/commands/finance/projects/{self.project.id}/calculate-wip/", {"fiscal_period_id": str(self.period.id)})
        self.assertEqual(response.status_code, 200, response.data)

        funding = ProjectFunding.objects.create(project=self.project, funding_source_party=self.party, currency=self.currency, approved_limit=Decimal("1000"), status="ACTIVE")
        response = self.post(f"/api/v1/commands/finance/project-fundings/{funding.id}/draw/", {"amount": "600"})
        self.assertEqual(response.status_code, 201, response.data)
        response = self.post(f"/api/v1/commands/finance/project-fundings/{funding.id}/draw/", {"amount": "500"})
        self.assertEqual(response.status_code, 400, response.data)

        rule = OverheadRule.objects.create(company=self.company, source_account=self.account, rule_code="OH", allocation_basis="ACTUAL_COST", rate_percent=Decimal("10"), status="ACTIVE")
        payload = {"project_id": str(self.project.id), "fiscal_period_id": str(self.period.id), "basis_quantity": "200"}
        response = self.post(f"/api/v1/commands/finance/overhead-rules/{rule.id}/allocate/", payload)
        self.assertEqual(response.status_code, 201, response.data)
        response = self.post(f"/api/v1/commands/finance/overhead-rules/{rule.id}/allocate/", payload)
        self.assertEqual(response.status_code, 400, response.data)

        asset = Asset.objects.create(company=self.company, asset_code="A-1", asset_name="Machine", status="ACTIVE")
        maintenance = Maintenance.objects.create(asset=asset, maintenance_type="PREVENTIVE", status="SCHEDULED")
        response = self.post(f"/api/v1/commands/assets/maintenances/{maintenance.id}/complete/", {"maintenance_cost": "75"})
        self.assertEqual(response.status_code, 200, response.data)
        response = self.post(f"/api/v1/commands/assets/maintenances/{maintenance.id}/complete/", {"maintenance_cost": "75"})
        self.assertEqual(response.status_code, 400, response.data)

    def test_flow_status_reports_company_readiness(self):
        response = self.client.get("/api/v1/commands/finance/flow-status/", **self.headers)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("readiness", response.data["data"])
        self.assertIn("counts", response.data["data"])

    def test_financial_snapshot_uses_posted_ledger_lines(self):
        revenue = Account.objects.create(company=self.company, account_code="4000", account_name="Revenue", account_type="REVENUE", status="ACTIVE")
        expense = Account.objects.create(company=self.company, account_code="5000", account_name="Expense", account_type="EXPENSE", status="ACTIVE")
        journal = Journal.objects.create(company=self.company, journal_code="GL", journal_name="General", status="ACTIVE")
        entry = JournalEntry.objects.create(journal=journal, fiscal_period=self.period, currency=self.currency, posting_date="2026-08-12", status="POSTED")
        JournalLine.objects.create(journal_entry=entry, account=revenue, credit_base=Decimal("1000"), debit_base=Decimal("0"))
        JournalLine.objects.create(journal_entry=entry, account=expense, debit_base=Decimal("300"), credit_base=Decimal("0"))
        response = self.post("/api/v1/commands/finance/financial-snapshots/calculate/", {"fiscal_period_id": str(self.period.id)})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Decimal(response.data["data"]["profit_loss_amount"]), Decimal("700"))
