from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.crm.models import (
    CRMWorkflowEvent,
    CustomerInquiry,
    ExecutiveApproval,
    Lead,
    Opportunity,
    QuotationVersion,
)
from apps.sales.models import Quotation


class Command(BaseCommand):
    help = "Backfill legacy CRM/Sales records into the governed CRM workflow. Safe to run repeatedly."

    @transaction.atomic
    def handle(self, *args, **options):
        counters = {"opportunities": 0, "inquiries": 0, "versions": 0, "approvals": 0}

        for opportunity in Opportunity.objects.select_related("document", "lead", "customer_party"):
            company = opportunity.company or getattr(opportunity.document, "company", None) or getattr(opportunity.lead, "company", None)
            tenant = opportunity.tenant or getattr(company, "tenant", None) or getattr(opportunity.lead, "tenant", None)
            fields = []
            if company and not opportunity.company_id:
                opportunity.company = company; fields.append("company")
            if tenant and not opportunity.tenant_id:
                opportunity.tenant = tenant; fields.append("tenant")
            if not opportunity.opportunity_name:
                opportunity.opportunity_name = f"Opportunity {str(opportunity.id)[:8]}"; fields.append("opportunity_name")
            if not opportunity.opened_at:
                opportunity.opened_at = timezone.now(); fields.append("opened_at")
            if fields:
                opportunity.save(update_fields=fields); counters["opportunities"] += 1

        for lead in Lead.objects.select_related("company", "tenant", "party", "owner_user"):
            inquiry, created = CustomerInquiry.objects.get_or_create(
                company=lead.company,
                subject=f"Legacy lead {str(lead.id)[:8]}",
                defaults={
                    "tenant": lead.tenant,
                    "customer_party": lead.party,
                    "owner_user": lead.owner_user,
                    "inquiry_number": f"INQ-LEGACY-{str(lead.id)[:8].upper()}",
                    "source_channel": lead.lead_source or "LEGACY",
                    "description": "Migrated from legacy CRM lead.",
                    "customer_name": getattr(lead.party, "display_name", "") if lead.party else "",
                    "status": "NEW",
                },
            )
            if created:
                CRMWorkflowEvent.objects.create(company=lead.company, inquiry=inquiry, event_type="LEGACY_LEAD_IMPORTED", to_status="NEW", actor=lead.owner_user)
                counters["inquiries"] += 1

        for quotation in Quotation.objects.select_related("document", "opportunity"):
            legacy_margin = quotation.estimated_margin or Decimal("0")
            # Legacy rows stored margin as an amount, while the governed snapshot stores a percentage.
            if abs(legacy_margin) >= Decimal("1000"):
                legacy_margin = (legacy_margin / quotation.subtotal * Decimal("100")) if quotation.subtotal else Decimal("0")
            legacy_margin = max(Decimal("-999.999999"), min(Decimal("999.999999"), legacy_margin))
            version, created = QuotationVersion.objects.get_or_create(
                quotation=quotation,
                version_number=1,
                defaults={
                    "subtotal": quotation.subtotal or Decimal("0"),
                    "tax_amount": quotation.tax_amount or Decimal("0"),
                    "total_amount": quotation.total_amount or Decimal("0"),
                    "estimated_cost": quotation.estimated_total_cost or Decimal("0"),
                    "margin_percent": legacy_margin,
                    "payload_json": {"source": "LEGACY_BACKFILL", "status": quotation.status},
                },
            )
            counters["versions"] += int(created)
            if quotation.opportunity_id and not quotation.opportunity.company_id and quotation.document_id:
                quotation.opportunity.company = quotation.document.company
                quotation.opportunity.tenant = getattr(quotation.document.company, "tenant", None)
                quotation.opportunity.save(update_fields=["company", "tenant"])

        for approval in ExecutiveApproval.objects.select_related("document", "quotation__document", "contract__document"):
            if approval.company_id:
                continue
            document = approval.document or getattr(approval.quotation, "document", None) or getattr(approval.contract, "document", None)
            if document and document.company_id:
                approval.company = document.company
                approval.save(update_fields=["company"])
                counters["approvals"] += 1

        self.stdout.write(self.style.SUCCESS("CRM backfill complete: " + ", ".join(f"{key}={value}" for key, value in counters.items())))
