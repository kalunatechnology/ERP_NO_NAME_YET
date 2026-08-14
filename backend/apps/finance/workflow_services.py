from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

from apps.finance.models import Account, BillingProposal, Journal, ProjectCostEntry


ZERO = Decimal("0")


def ensure_account(company, code, name, account_type, normal_balance):
    account, _ = Account.objects.get_or_create(
        company=company,
        account_code=code,
        defaults={"account_name": name, "account_type": account_type, "normal_balance": normal_balance, "status": "ACTIVE"},
    )
    return account


def ensure_journal(company, code, name):
    journal, _ = Journal.objects.get_or_create(
        company=company,
        journal_code=code,
        defaults={"journal_name": name, "journal_type": "PROJECT", "status": "ACTIVE"},
    )
    return journal


def collect_project_operational_costs(project, user=None):
    """Idempotently collect approved labor, project expenses and stock issues."""
    from apps.inventory.models import StockLedgerEntry
    from apps.projects.models import ProjectExpense, Timesheet

    created = []
    for row in Timesheet.objects.filter(project=project, approval_status__in=["APPROVED", "POSTED"]):
        amount = row.amount if row.amount is not None else (row.hours or ZERO) * (row.hourly_rate or ZERO)
        item, was_created = ProjectCostEntry.objects.get_or_create(
            project=project, source_type="TIMESHEET", source_reference=str(row.id),
            defaults={"tenant": project.tenant, "company": project.company, "description": f"Approved labor {row.work_date}", "cost_element": "LABOR", "transaction_date": row.work_date or timezone.localdate(), "quantity": row.hours or 1, "unit_cost": row.hourly_rate or 0, "total_cost": amount, "status": "CAPTURED", "created_by": user},
        )
        if was_created: created.append(item)
    for row in ProjectExpense.objects.filter(project=project):
        item, was_created = ProjectCostEntry.objects.get_or_create(
            project=project, source_type="PROJECT_EXPENSE", source_reference=str(row.id),
            defaults={"tenant": project.tenant, "company": project.company, "description": row.title or row.description or "Project expense", "cost_element": row.category or "OTHER", "transaction_date": row.expense_date or timezone.localdate(), "quantity": 1, "unit_cost": row.amount or 0, "total_cost": row.amount or 0, "status": "CAPTURED", "created_by": user},
        )
        if was_created: created.append(item)
    for row in StockLedgerEntry.objects.filter(project=project, value_delta__lt=0):
        amount = abs(row.value_delta or ZERO)
        item, was_created = ProjectCostEntry.objects.get_or_create(
            project=project, source_type="WAREHOUSE", source_reference=str(row.id),
            defaults={"tenant": project.tenant, "company": project.company, "description": f"Material issue {row.product_id}", "cost_element": "MATERIAL", "transaction_date": (row.posting_at or timezone.now()).date(), "quantity": abs(row.quantity_delta or ZERO), "unit_cost": row.unit_cost or 0, "total_cost": amount, "status": "CAPTURED", "created_by": user},
        )
        if was_created: created.append(item)
    return created


def ensure_completion_billing_proposal(project, user):
    """PM close event sends a final billing proposal to Finance exactly once."""
    existing = BillingProposal.objects.filter(project=project, trigger_type="PROJECT_COMPLETED").first()
    if existing:
        return existing, False
    prior = BillingProposal.objects.filter(project=project, status="INVOICED").aggregate(total=Sum("subtotal"))["total"] or ZERO
    contract_value = project.budget_amount or ZERO
    subtotal = max(ZERO, contract_value - prior)
    proposal = BillingProposal.objects.create(
        tenant=project.tenant, company=project.company, project=project, customer=project.customer_party,
        trigger_type="PROJECT_COMPLETED", description=f"Final billing for {project.project_code}",
        subtotal=subtotal, tax_rate=0, tax_amount=0, total_amount=subtotal,
        status="SUBMITTED", requested_by=user, submitted_at=timezone.now(),
    )
    return proposal, True
