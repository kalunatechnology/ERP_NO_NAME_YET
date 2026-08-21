from decimal import Decimal
from datetime import date
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.core.models import Company
from apps.master_data.models import Party
from apps.finance.models import Account, BillingDocument, CustomerCreditLimit, JournalEntry, JournalLine
from apps.finance.accounting_services import (
    ensure_standard_coa,
    get_trial_balance_summary,
    post_invoice_journal,
    post_payment_journal,
    post_project_expense_journal,
)
from apps.projects.models import Project, ProjectExpense
from apps.projects.evm_services import calculate_project_evm, record_weekly_evm_snapshot
from apps.crm.models import CustomerFeedback, Lead, Opportunity
from apps.crm.analytics_services import calculate_sales_pipeline_analytics, validate_customer_credit


class DoubleEntryAndCrossModuleTestCase(TestCase):
    def setUp(self):
        self.company = Company.objects.create(legal_name="PT Test Company", company_code="TEST-CO")
        self.user = User.objects.create(username="fin_user", email="fin@test.com")

        self.customer = Party.objects.create(legal_name="Client Test", display_name="Client Test", party_code="CUST-001", party_type="CUSTOMER")

        self.project = Project.objects.create(
            company=self.company,
            project_name="EVM Test Project",
            project_code="PRJ-TEST-EVM",
            budget_amount=Decimal("100000000.00"),
            progress_percent=Decimal("50.00"),
            planned_start_date=date(2026, 8, 1),
            planned_end_date=date(2026, 8, 31),
        )


    def test_ensure_coa_and_invoice_double_entry(self):
        coa = ensure_standard_coa(self.company)
        self.assertIn("1101", coa)
        self.assertIn("1103", coa)
        self.assertIn("4101", coa)

        # Create Billing Document
        invoice = BillingDocument.objects.create(
            company=self.company,
            party=self.customer,
            project=self.project,
            invoice_number="INV-2026-001",
            subtotal=Decimal("10000000.00"),
            tax_amount=Decimal("1100000.00"),
            total_amount=Decimal("11100000.00"),
            status="POSTED",
        )

        entry = post_invoice_journal(invoice, self.user)
        self.assertIsNotNone(entry)

        lines = JournalLine.objects.filter(journal_entry=entry)
        self.assertEqual(lines.count(), 3)

        total_dr = sum(l.debit_base for l in lines)
        total_cr = sum(l.credit_base for l in lines)
        self.assertEqual(total_dr, Decimal("11100000.00"))
        self.assertEqual(total_cr, Decimal("11100000.00"))
        self.assertEqual(total_dr, total_cr)

        # Test Payment Receipt
        pay_entry = post_payment_journal(invoice, Decimal("11100000.00"), "RECEIPT", self.user)
        self.assertIsNotNone(pay_entry)

        # Test Trial Balance
        tb = get_trial_balance_summary(self.company)
        self.assertTrue(tb["is_balanced"])
        self.assertEqual(tb["total_debit"], tb["total_credit"])

    def test_project_evm_calculation(self):
        expense = ProjectExpense.objects.create(
            project=self.project,
            title="Biaya Server & Cloud",
            amount=Decimal("40000000.00"),
            expense_date=date(2026, 8, 15),
        )

        post_project_expense_journal(expense, self.user)

        evm = calculate_project_evm(self.project, as_of_date=date(2026, 8, 15))
        self.assertEqual(evm["budget_at_completion"], 100000000.00)
        self.assertEqual(evm["earned_value"], 50000000.00)  # 50% of 100M
        self.assertGreater(evm["cost_performance_index"], 1.0)  # EV 50M / AC 40M = 1.25 (Under Budget)

        snapshot = record_weekly_evm_snapshot(self.project, week_number=2, as_of_date=date(2026, 8, 15))
        self.assertIsNotNone(snapshot)
        self.assertEqual(snapshot.week_number, 2)

    def test_crm_sales_analytics_and_credit_validation(self):
        Lead.objects.create(company=self.company, lead_status="QUALIFIED")
        Opportunity.objects.create(company=self.company, pipeline_stage="WON")
        CustomerFeedback.objects.create(company=self.company, customer=self.customer, rating=5, feedback_type="PROJECT_COMPLETION")


        analytics = calculate_sales_pipeline_analytics(self.company)
        self.assertEqual(analytics["total_leads"], 1)
        self.assertEqual(analytics["won_opportunities"], 1)
        self.assertEqual(analytics["win_rate_pct"], 100.0)

        # Credit Limit test
        credit = CustomerCreditLimit.objects.create(
            company=self.company,
            customer=self.customer,
            credit_limit=Decimal("50000000.00"),
            used_credit=Decimal("10000000.00"),
            status="APPROVED",
        )
        # Order 20M <= Available 40M -> Allowed
        res_ok = validate_customer_credit(self.customer, Decimal("20000000.00"))
        self.assertTrue(res_ok["allowed"])

        # Order 60M > Available 40M -> Rejected
        res_exceeded = validate_customer_credit(self.customer, Decimal("60000000.00"))
        self.assertFalse(res_exceeded["allowed"])
