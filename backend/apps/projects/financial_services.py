"""
Core Financial Performance Service.
Universal financial calculation engine for Projects:
- Budget vs Direct Cost (Realized)
- Expected Revenue vs Actual Invoiced Revenue vs Realized Cash Revenue
- Gross Profit (Expected & Actual)
- Profit Margin % (Expected & Actual)
- Budget, Cost, and Revenue Variances
- Financial Health KPIs

Reusable across any company / tenant / product without hardcoded assumptions.
"""

from decimal import Decimal
from django.db.models import Sum, Q
from django.db.models.functions import Coalesce
from django.utils import timezone

ZERO = Decimal("0.00")
HUNDRED = Decimal("100.00")


def calculate_project_financials(project):
    """
    Compute real-time financial metrics for a single project.
    Safe with zero values (avoids ZeroDivisionError).
    """
    from apps.finance.models import BillingDocument, ProjectCostEntry
    from apps.manufacturing.models import ProductionMaterial
    from apps.projects.models import EquipmentUsage, ProjectExpense, Timesheet

    # 1. Planned Budget Baseline
    planned_budget = project.budget_amount or ZERO

    # 2. Expected Revenue (Target / Contract Value)
    # Priority: project.contract_amount -> sales_order.total_amount -> 0
    expected_revenue = project.contract_amount or ZERO
    if expected_revenue == ZERO and project.sales_order:
        expected_revenue = project.sales_order.total_amount or ZERO

    # 3. Direct Cost Realization Sources
    # 3a. Approved Labor Timesheets
    labor_cost = Timesheet.objects.filter(
        project=project, approval_status="APPROVED"
    ).aggregate(v=Coalesce(Sum("amount"), ZERO))["v"]

    # 3b. Direct Production Material
    material_cost = ProductionMaterial.objects.filter(
        production_order__project=project
    ).aggregate(v=Coalesce(Sum("actual_cost"), ZERO))["v"]

    # 3c. Direct Equipment Usage
    equipment_cost = EquipmentUsage.objects.filter(
        project=project
    ).aggregate(v=Coalesce(Sum("total_cost"), ZERO))["v"]

    # 3d. Registered Project Expenses (AP & Disbursed)
    registered_expenses = ProjectExpense.objects.filter(
        project=project
    ).aggregate(v=Coalesce(Sum("amount"), ZERO))["v"]

    # 3e. Validated / Posted Project Cost Entries (Finance Cost Inbox)
    posted_cost_entries = ProjectCostEntry.objects.filter(
        project=project, status__in=["VALIDATED", "POSTED"]
    ).aggregate(v=Coalesce(Sum("total_cost"), ZERO))["v"]

    # Total Operational Direct Cost Realized
    direct_operational_cost = labor_cost + material_cost + equipment_cost
    # Total actual cost considers registered expenses or operational items
    actual_cost = registered_expenses if registered_expenses > ZERO else (posted_cost_entries if posted_cost_entries > ZERO else direct_operational_cost)

    # 4. Revenue Realization (Billing Documents - Customer Invoices)
    customer_invoices = BillingDocument.objects.filter(
        project=project,
        billing_type__in=["CUSTOMER_INVOICE", "OUTGOING_INVOICE", "AR_INVOICE"],
    ).exclude(status__in=["DRAFT", "CANCELLED", "REJECTED"])

    invoiced_revenue = customer_invoices.aggregate(
        v=Coalesce(Sum("total_amount"), ZERO)
    )["v"]
    realized_revenue = customer_invoices.aggregate(
        v=Coalesce(Sum("paid_amount"), ZERO)
    )["v"]

    # If no customer invoices exist yet but billing proposals are approved
    if invoiced_revenue == ZERO:
        from apps.finance.models import BillingProposal
        invoiced_revenue = BillingProposal.objects.filter(
            project=project, status__in=["APPROVED", "INVOICED"]
        ).aggregate(v=Coalesce(Sum("total_amount"), ZERO))["v"]

    actual_revenue = invoiced_revenue

    # 5. Profitability & Margins
    expected_gross_profit = expected_revenue - planned_budget
    actual_gross_profit = actual_revenue - actual_cost

    expected_margin_percent = (
        (expected_gross_profit / expected_revenue * HUNDRED)
        if expected_revenue > ZERO else ZERO
    )
    actual_margin_percent = (
        (actual_gross_profit / actual_revenue * HUNDRED)
        if actual_revenue > ZERO else ZERO
    )

    # 6. Variances & Balances
    budget_variance = planned_budget - actual_cost  # Positive = budget remaining, Negative = overrun
    revenue_variance = actual_revenue - expected_revenue  # Negative = target not yet fully invoiced
    cost_variance = planned_budget - actual_cost
    outstanding_revenue = max(ZERO, expected_revenue - actual_revenue)
    uncollected_revenue = max(ZERO, invoiced_revenue - realized_revenue)

    # 7. KPI Utilizations & Progress
    budget_utilization_percent = (
        (actual_cost / planned_budget * HUNDRED)
        if planned_budget > ZERO else ZERO
    )
    revenue_achievement_percent = (
        (actual_revenue / expected_revenue * HUNDRED)
        if expected_revenue > ZERO else ZERO
    )

    # 8. Financial Health Status Evaluation
    target_margin = project.target_margin_percent or Decimal("15.00")
    if actual_revenue > ZERO and actual_gross_profit < ZERO:
        financial_health = "LOSS_MAKING"
    elif actual_cost > planned_budget and planned_budget > ZERO:
        financial_health = "BUDGET_OVERRUN"
    elif actual_revenue > ZERO and actual_margin_percent < target_margin:
        financial_health = "AT_RISK"
    elif actual_revenue == ZERO and actual_cost > ZERO:
        financial_health = "AT_RISK"
    else:
        financial_health = "PROFITABLE"

    return {
        "project_id": str(project.id),
        "project_code": project.project_code,
        "project_name": project.project_name,
        "planned_budget": str(round(planned_budget, 2)),
        "actual_cost": str(round(actual_cost, 2)),
        "labor_cost": str(round(labor_cost, 2)),
        "material_cost": str(round(material_cost, 2)),
        "equipment_cost": str(round(equipment_cost, 2)),
        "registered_expenses": str(round(registered_expenses, 2)),
        "posted_cost_entries": str(round(posted_cost_entries, 2)),
        "expected_revenue": str(round(expected_revenue, 2)),
        "invoiced_revenue": str(round(invoiced_revenue, 2)),
        "realized_revenue": str(round(realized_revenue, 2)),
        "actual_revenue": str(round(actual_revenue, 2)),
        "outstanding_revenue": str(round(outstanding_revenue, 2)),
        "uncollected_revenue": str(round(uncollected_revenue, 2)),
        "expected_gross_profit": str(round(expected_gross_profit, 2)),
        "actual_gross_profit": str(round(actual_gross_profit, 2)),
        "expected_margin_percent": str(round(expected_margin_percent, 2)),
        "actual_margin_percent": str(round(actual_margin_percent, 2)),
        "target_margin_percent": str(round(target_margin, 2)),
        "budget_variance": str(round(budget_variance, 2)),
        "revenue_variance": str(round(revenue_variance, 2)),
        "cost_variance": str(round(cost_variance, 2)),
        "budget_utilization_percent": str(round(budget_utilization_percent, 2)),
        "revenue_achievement_percent": str(round(revenue_achievement_percent, 2)),
        "financial_health_status": financial_health,
        "is_profitable": actual_gross_profit >= ZERO,
    }


def record_project_financial_snapshot(project, note=""):
    """
    Persist current financial calculations to ProjectFinancialSnapshot model.
    """
    from apps.projects.models import ProjectFinancialSnapshot

    fin = calculate_project_financials(project)
    today = timezone.localdate()

    snapshot = ProjectFinancialSnapshot.objects.create(
        project=project,
        snapshot_date=today,
        planned_budget=Decimal(fin["planned_budget"]),
        actual_cost=Decimal(fin["actual_cost"]),
        expected_revenue=Decimal(fin["expected_revenue"]),
        invoiced_revenue=Decimal(fin["invoiced_revenue"]),
        realized_revenue=Decimal(fin["realized_revenue"]),
        expected_gross_profit=Decimal(fin["expected_gross_profit"]),
        actual_gross_profit=Decimal(fin["actual_gross_profit"]),
        expected_margin_percent=Decimal(fin["expected_margin_percent"]),
        actual_margin_percent=Decimal(fin["actual_margin_percent"]),
        budget_variance=Decimal(fin["budget_variance"]),
        revenue_variance=Decimal(fin["revenue_variance"]),
        cost_variance=Decimal(fin["cost_variance"]),
        budget_utilization_percent=Decimal(fin["budget_utilization_percent"]),
        revenue_achievement_percent=Decimal(fin["revenue_achievement_percent"]),
        financial_health_status=fin["financial_health_status"],
        note=note,
    )
    return snapshot


def get_portfolio_financial_performance(company_id=None, tenant_id=None):
    """
    Aggregate financial performance across all active projects for Executive Portfolio Reporting.
    """
    from apps.projects.models import Project

    qs = Project.objects.all()
    if company_id:
        qs = qs.filter(company_id=company_id)
    elif tenant_id:
        qs = qs.filter(tenant_id=tenant_id)

    total_projects = qs.count()
    if total_projects == 0:
        return {
            "total_projects": 0,
            "total_budget": "0.00",
            "total_actual_cost": "0.00",
            "total_expected_revenue": "0.00",
            "total_actual_revenue": "0.00",
            "total_expected_profit": "0.00",
            "total_actual_gross_profit": "0.00",
            "average_expected_margin_percent": "0.00",
            "average_actual_margin_percent": "0.00",
            "portfolio_budget_utilization_percent": "0.00",
            "portfolio_revenue_achievement_percent": "0.00",
            "projects": [],
        }

    project_summaries = []
    total_budget = Decimal("0.00")
    total_cost = Decimal("0.00")
    total_exp_rev = Decimal("0.00")
    total_act_rev = Decimal("0.00")
    total_exp_profit = Decimal("0.00")
    total_act_profit = Decimal("0.00")

    for p in qs:
        fin = calculate_project_financials(p)
        project_summaries.append(fin)
        total_budget += Decimal(fin["planned_budget"])
        total_cost += Decimal(fin["actual_cost"])
        total_exp_rev += Decimal(fin["expected_revenue"])
        total_act_rev += Decimal(fin["actual_revenue"])
        total_exp_profit += Decimal(fin["expected_gross_profit"])
        total_act_profit += Decimal(fin["actual_gross_profit"])

    avg_exp_margin = (
        (total_exp_profit / total_exp_rev * HUNDRED) if total_exp_rev > ZERO else ZERO
    )
    avg_act_margin = (
        (total_act_profit / total_act_rev * HUNDRED) if total_act_rev > ZERO else ZERO
    )
    port_budget_util = (
        (total_cost / total_budget * HUNDRED) if total_budget > ZERO else ZERO
    )
    port_rev_achieve = (
        (total_act_rev / total_exp_rev * HUNDRED) if total_exp_rev > ZERO else ZERO
    )

    return {
        "total_projects": total_projects,
        "total_budget": str(round(total_budget, 2)),
        "total_actual_cost": str(round(total_cost, 2)),
        "total_expected_revenue": str(round(total_exp_rev, 2)),
        "total_actual_revenue": str(round(total_act_rev, 2)),
        "total_expected_profit": str(round(total_exp_profit, 2)),
        "total_actual_gross_profit": str(round(total_act_profit, 2)),
        "average_expected_margin_percent": str(round(avg_exp_margin, 2)),
        "average_actual_margin_percent": str(round(avg_act_margin, 2)),
        "portfolio_budget_utilization_percent": str(round(port_budget_util, 2)),
        "portfolio_revenue_achievement_percent": str(round(port_rev_achieve, 2)),
        "projects": project_summaries,
    }
