"""
Earned Value Management (EVM) & S-Curve Schedule Variance Services.

Mathematical formulas:
- Planned Value (PV) = Budget At Completion (BAC) * Planned Progress %
- Earned Value (EV) = Budget At Completion (BAC) * Actual Progress %
- Actual Cost (AC) = Total Recorded Cost Entries (Expenses, Timesheets, Materials)
- Schedule Variance (SV) = EV - PV
- Cost Variance (CV) = EV - AC
- Schedule Performance Index (SPI) = EV / PV (SPI > 1: Ahead of Schedule, SPI < 1: Behind Schedule)
- Cost Performance Index (CPI) = EV / AC (CPI > 1: Under Budget, CPI < 1: Over Budget)
"""

from decimal import Decimal
from django.db.models import Sum
from django.utils import timezone

from apps.projects.models import Project, ProjectEVMRecord
from apps.finance.models import ProjectCostEntry



ZERO = Decimal("0.00")
ONE = Decimal("1.0000")


def calculate_project_evm(project, as_of_date=None):
    """
    Calculates EVM metrics for a given project as of a specific date.
    """
    if not as_of_date:
        as_of_date = timezone.localdate()

    bac = Decimal(str(project.budget_amount or 0))  # Budget at Completion

    # Planned vs Actual Progress
    raw_prog = getattr(project, "progress_percent", None) or getattr(project, "progress_percentage", None) or 0
    actual_progress = Decimal(str(raw_prog)) / Decimal("100.00")


    # Planned progress estimation from project duration
    start = getattr(project, "planned_start_date", None) or getattr(project, "start_date", None)
    end = getattr(project, "planned_end_date", None) or getattr(project, "end_date", None)
    if start and end and end > start:
        total_days = max(1, (end - start).days)
        elapsed_days = max(0, min(total_days, (as_of_date - start).days))
        planned_progress = Decimal(str(elapsed_days)) / Decimal(str(total_days))
    else:
        planned_progress = actual_progress


    pv = (bac * planned_progress).quantize(Decimal("0.01"))
    ev = (bac * actual_progress).quantize(Decimal("0.01"))

    # Actual cost from captured ProjectCostEntry and ProjectExpense
    from apps.projects.models import ProjectExpense
    ac_cost_entry = ProjectCostEntry.objects.filter(
        project=project,
        transaction_date__lte=as_of_date
    ).aggregate(total=Sum("total_cost"))["total"] or ZERO

    ac_expense = ProjectExpense.objects.filter(
        project=project,
        expense_date__lte=as_of_date
    ).aggregate(total=Sum("amount"))["total"] or ZERO

    ac_total = max(ac_cost_entry, ac_expense)
    if ac_total == ZERO and getattr(project, "actual_cost", None):
        ac_total = Decimal(str(project.actual_cost))

    ac = (Decimal(str(ac_total or 0))).quantize(Decimal("0.01"))


    # Variances
    cv = ev - ac
    sv = ev - pv

    # Indices
    cpi = (ev / ac).quantize(Decimal("0.0001")) if ac > ZERO else ONE
    spi = (ev / pv).quantize(Decimal("0.0001")) if pv > ZERO else ONE

    # Estimate At Completion (EAC) = BAC / CPI
    eac = (bac / cpi).quantize(Decimal("0.01")) if cpi > ZERO else bac
    vac = bac - eac  # Variance at Completion

    return {
        "as_of_date": str(as_of_date),
        "budget_at_completion": float(bac),
        "planned_progress_pct": float(planned_progress * 100),
        "actual_progress_pct": float(actual_progress * 100),
        "planned_value": float(pv),
        "earned_value": float(ev),
        "actual_cost": float(ac),
        "cost_variance": float(cv),
        "schedule_variance": float(sv),
        "cost_performance_index": float(cpi),
        "schedule_performance_index": float(spi),
        "estimate_at_completion": float(eac),
        "variance_at_completion": float(vac),
        "health_status": (
            "GOOD" if (cpi >= Decimal("0.95") and spi >= Decimal("0.95"))
            else "WARNING" if (cpi >= Decimal("0.85") or spi >= Decimal("0.85"))
            else "CRITICAL"
        )
    }


def record_weekly_evm_snapshot(project, week_number=1, as_of_date=None):
    """
    Creates or updates an EVM snapshot in the database for tracking curves over time.
    """
    if not as_of_date:
        as_of_date = timezone.localdate()

    evm = calculate_project_evm(project, as_of_date)

    record, _ = ProjectEVMRecord.objects.update_or_create(
        project=project,
        as_of_date=as_of_date,
        defaults={
            "week_number": week_number,
            "planned_value": Decimal(str(evm["planned_value"])),
            "earned_value": Decimal(str(evm["earned_value"])),
            "actual_cost": Decimal(str(evm["actual_cost"])),
            "cost_variance": Decimal(str(evm["cost_variance"])),
            "schedule_variance": Decimal(str(evm["schedule_variance"])),
            "cost_performance_index": Decimal(str(evm["cost_performance_index"])),
            "schedule_performance_index": Decimal(str(evm["schedule_performance_index"])),
        }
    )
    return record
