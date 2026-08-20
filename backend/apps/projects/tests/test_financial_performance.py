from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate
from apps.accounts.models import User, Role, UserRole
from apps.core.models import Company, Tenant
from apps.finance.models import BillingDocument
from apps.projects.models import Project, ProjectExpense, Timesheet, ProjectFinancialSnapshot
from apps.projects.financial_services import (
    calculate_project_financials,
    record_project_financial_snapshot,
    get_portfolio_financial_performance,
)
from config.commands import ProjectFinancialSummaryView, ProjectFinancialTargetView, PortfolioFinancialPerformanceView


class FinancialPerformanceTestCase(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Universal Corp", code="universal")
        self.company = Company.objects.create(
            tenant=self.tenant,
            legal_name="PT Universal Solusi",
            company_code="CMP-UNI",
        )
        self.pm_user = User.objects.create_user(
            username="pm@universal.id",
            email="pm@universal.id",
            password="password123",
            first_name="Universal",
            last_name="PM",
        )
        self.pm_role = Role.objects.create(role_code="PROJECT_MANAGER", role_name="Project Manager")
        UserRole.objects.create(user=self.pm_user, role=self.pm_role)

        today = timezone.localdate()
        self.project = Project.objects.create(
            tenant=self.tenant,
            company=self.company,
            project_code="PRJ-FIN-001",
            project_name="Core Financial System Implementation",
            project_manager=self.pm_user,
            planned_start_date=today,
            planned_end_date=today,
            budget_amount=Decimal("350000000.00"),
            contract_amount=Decimal("500000000.00"),
            target_margin_percent=Decimal("25.00"),
            status="IN_PROGRESS",
        )

    def test_profitable_project_calculations(self):
        """Test standard profitable project: Revenue 500M, Cost 200M -> Profit 300M, Margin 60%."""
        # Create labor timesheets (50M) and expenses (150M) -> Total Cost = 200M
        ProjectExpense.objects.create(
            project=self.project,
            title="Vendor Implementation Service",
            amount=Decimal("200000000.00"),
            expense_date=timezone.localdate(),
        )

        # Create Customer Invoice (Invoiced = 500M, Paid = 300M)
        BillingDocument.objects.create(
            project=self.project,
            company=self.company,
            billing_type="CUSTOMER_INVOICE",
            invoice_number="INV-2026-001",
            total_amount=Decimal("500000000.00"),
            paid_amount=Decimal("300000000.00"),
            status="APPROVED",
            payment_status="PARTIALLY_PAID",
        )

        fin = calculate_project_financials(self.project)

        self.assertEqual(Decimal(fin["expected_revenue"]), Decimal("500000000.00"))
        self.assertEqual(Decimal(fin["actual_revenue"]), Decimal("500000000.00"))
        self.assertEqual(Decimal(fin["invoiced_revenue"]), Decimal("500000000.00"))
        self.assertEqual(Decimal(fin["realized_revenue"]), Decimal("300000000.00"))
        self.assertEqual(Decimal(fin["uncollected_revenue"]), Decimal("200000000.00"))
        self.assertEqual(Decimal(fin["actual_cost"]), Decimal("200000000.00"))
        self.assertEqual(Decimal(fin["actual_gross_profit"]), Decimal("300000000.00"))
        self.assertEqual(Decimal(fin["actual_margin_percent"]), Decimal("60.00"))
        self.assertEqual(Decimal(fin["budget_variance"]), Decimal("150000000.00")) # 350M - 200M
        self.assertEqual(fin["financial_health_status"], "PROFITABLE")
        self.assertTrue(fin["is_profitable"])

    def test_loss_making_project(self):
        """Test cost overrun exceeding revenue: Revenue 100M, Cost 150M -> Profit -50M, Margin -50%."""
        p_loss = Project.objects.create(
            tenant=self.tenant,
            company=self.company,
            project_code="PRJ-LOSS",
            project_name="Troubled Project",
            contract_amount=Decimal("100000000.00"),
            budget_amount=Decimal("90000000.00"),
        )
        ProjectExpense.objects.create(
            project=p_loss,
            title="Emergency Hardware Replacement",
            amount=Decimal("150000000.00"),
        )
        BillingDocument.objects.create(
            project=p_loss,
            company=self.company,
            billing_type="CUSTOMER_INVOICE",
            invoice_number="INV-LOSS-001",
            total_amount=Decimal("100000000.00"),
            paid_amount=Decimal("100000000.00"),
            status="POSTED",
        )

        fin = calculate_project_financials(p_loss)
        self.assertEqual(Decimal(fin["actual_gross_profit"]), Decimal("-50000000.00"))
        self.assertEqual(Decimal(fin["actual_margin_percent"]), Decimal("-50.00"))
        self.assertEqual(fin["financial_health_status"], "LOSS_MAKING")
        self.assertFalse(fin["is_profitable"])

    def test_zero_revenue_division_by_zero_safety(self):
        """Test project with zero revenue produces 0% margin safely without division-by-zero crash."""
        p_internal = Project.objects.create(
            tenant=self.tenant,
            company=self.company,
            project_code="PRJ-INT-RND",
            project_name="Internal R&D Project",
            contract_amount=Decimal("0.00"),
            budget_amount=Decimal("50000000.00"),
        )
        ProjectExpense.objects.create(
            project=p_internal,
            title="Server hosting",
            amount=Decimal("10000000.00"),
        )

        fin = calculate_project_financials(p_internal)
        self.assertEqual(Decimal(fin["expected_revenue"]), Decimal("0.00"))
        self.assertEqual(Decimal(fin["actual_revenue"]), Decimal("0.00"))
        self.assertEqual(Decimal(fin["actual_margin_percent"]), Decimal("0.00"))
        self.assertEqual(Decimal(fin["expected_margin_percent"]), Decimal("0.00"))
        self.assertEqual(Decimal(fin["budget_utilization_percent"]), Decimal("20.00"))

    def test_financial_snapshot_and_rest_endpoints(self):
        """Test recording financial snapshot and REST endpoints."""
        snapshot = record_project_financial_snapshot(self.project, note="Monthly evaluation")
        self.assertIsNotNone(snapshot.id)
        self.assertEqual(ProjectFinancialSnapshot.objects.filter(project=self.project).count(), 1)

        rf = APIRequestFactory()

        # 1. GET financial-summary
        req = rf.get(f"/api/v1/commands/projects/projects/{self.project.id}/financial-summary/")
        force_authenticate(req, user=self.pm_user)
        view = ProjectFinancialSummaryView.as_view()
        res = view(req, pk=str(self.project.id))
        self.assertEqual(res.status_code, 200)
        self.assertIn("planned_budget", res.data["data"])
        self.assertIn("expected_revenue", res.data["data"])
        self.assertIn("actual_gross_profit", res.data["data"])
        self.assertIn("snapshots", res.data["data"])

        # 2. POST financial-target
        req_post = rf.post(
            f"/api/v1/commands/projects/projects/{self.project.id}/financial-target/",
            data={"contract_amount": "600000000.00", "target_margin_percent": "35.00"},
            format="json",
        )
        force_authenticate(req_post, user=self.pm_user)
        view_target = ProjectFinancialTargetView.as_view()
        res_target = view_target(req_post, pk=str(self.project.id))
        self.assertEqual(res_target.status_code, 200)
        self.project.refresh_from_db()
        self.assertEqual(self.project.contract_amount, Decimal("600000000.00"))
        self.assertEqual(self.project.target_margin_percent, Decimal("35.00"))

        # 3. GET portfolio-financial-performance
        req_port = rf.get("/api/v1/commands/reporting/portfolio-financial-performance/")
        force_authenticate(req_port, user=self.pm_user)
        view_port = PortfolioFinancialPerformanceView.as_view()
        res_port = view_port(req_port)
        self.assertEqual(res_port.status_code, 200)
        self.assertIn("total_projects", res_port.data["data"])
        self.assertIn("total_actual_gross_profit", res_port.data["data"])
