from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.finance.models import BillingDocument, InvoiceVarianceCase, TaxTransaction
from apps.finance.workflow_services import collect_project_operational_costs, ensure_completion_billing_proposal
from apps.procurement.models import ThreeWayMatch
from apps.projects.models import Project


class Command(BaseCommand):
    help = "Idempotently align existing Supabase data with Finance/PM workflows."

    @transaction.atomic
    def handle(self, *args, **options):
        counts = {"variance_cases": 0, "tax_transactions": 0, "cost_entries": 0, "completion_proposals": 0}
        for match in ThreeWayMatch.objects.select_related("supplier_invoice__company").filter(match_status="VARIANCE", supplier_invoice__isnull=False):
            kinds = [name for name, value in (("QUANTITY", match.quantity_variance), ("PRICE", match.price_variance), ("TAX", match.tax_variance)) if (value or 0) != 0]
            _, created = InvoiceVarianceCase.objects.get_or_create(
                three_way_match=match,
                defaults={"company": match.supplier_invoice.company, "billing_document": match.supplier_invoice, "variance_type": kinds[0] if len(kinds) == 1 else "MIXED", "total_variance": sum(abs(value or Decimal("0")) for value in (match.quantity_variance, match.price_variance, match.tax_variance)), "status": "OPEN"},
            )
            counts["variance_cases"] += int(created)
        for billing in BillingDocument.objects.filter(status="POSTED", tax_amount__gt=0):
            tax_transaction, created = TaxTransaction.objects.get_or_create(
                billing_document=billing, billing_document_line=None,
                defaults={"company": billing.company, "taxable_amount": billing.subtotal or 0, "tax_amount": billing.tax_amount, "tax_direction": "INPUT" if billing.billing_type in {"SUPPLIER_BILL", "VENDOR_INVOICE"} else "OUTPUT", "tax_date": billing.posting_date or billing.invoice_date, "status": "DRAFT"},
            )
            if not tax_transaction.company_id and billing.company_id:
                tax_transaction.company = billing.company
                tax_transaction.save(update_fields=["company"])
            counts["tax_transactions"] += int(created)
        for project in Project.objects.all():
            counts["cost_entries"] += len(collect_project_operational_costs(project, project.project_manager))
            if (project.lifecycle_status or project.status) in {"COMPLETED", "CLOSED"} and project.project_manager_id:
                _, created = ensure_completion_billing_proposal(project, project.project_manager)
                counts["completion_proposals"] += int(created)
        self.stdout.write(self.style.SUCCESS("Finance workflow backfill complete: " + ", ".join(f"{key}={value}" for key, value in counts.items())))
