from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

from apps.crm.models import (
    CRMWorkflowEvent,
    CostEstimate,
    CostEstimateLine,
    CreditStatusSnapshot,
    CustomerInquiry,
    ExecutiveApproval,
    Opportunity,
    OpportunityProduct,
    OpportunityStageHistory,
    QuotationVersion,
)


ZERO = Decimal("0")


def workflow_event(*, inquiry=None, opportunity=None, event_type, from_status="", to_status="", actor=None, payload=None):
    return CRMWorkflowEvent.objects.create(
        company=(inquiry.company if inquiry else opportunity.company if opportunity else None),
        inquiry=inquiry,
        opportunity=opportunity,
        event_type=event_type,
        from_status=from_status,
        to_status=to_status,
        actor=actor,
        payload_json=payload or {},
    )


def qualify_inquiry(inquiry: CustomerInquiry, user):
    if inquiry.status not in {"NEW", "REOPENED"}:
        raise ValueError("Inquiry hanya dapat dikualifikasi dari status NEW/REOPENED.")
    if not inquiry.requirements.exists():
        from apps.crm.models import InquiryRequirement
        from apps.master_data.models import Product
        first_product = (
            Product.objects.filter(tenant=inquiry.tenant).first()
            if inquiry.tenant
            else Product.objects.first()
        )
        InquiryRequirement.objects.create(
            inquiry=inquiry,
            product=first_product,
            uom=getattr(first_product, "base_uom", None) if first_product else None,
            requirement_type="PRODUCT",
            description=inquiry.subject or "Spesifikasi Kebutuhan Prospek",
            quantity=Decimal("1"),
            target_unit_price=Decimal("0"),
            status="QUALIFIED",
        )
    opportunity = inquiry.opportunity
    if not opportunity:
        opportunity = Opportunity.objects.create(
            tenant=inquiry.tenant,
            company=inquiry.company,
            customer_party=inquiry.customer_party,
            owner_user=inquiry.owner_user or user,
            opportunity_name=inquiry.subject,
            pipeline_stage="PROSPECT",
            probability_percent=Decimal("10"),
            expected_close_date=inquiry.expected_delivery_date,
            status="OPEN",
            opened_at=timezone.now(),
        )
        for requirement in inquiry.requirements.select_related("product", "uom"):
            if requirement.product_id:
                OpportunityProduct.objects.create(
                    opportunity=opportunity,
                    product=requirement.product,
                    quantity=requirement.quantity,
                    uom=requirement.uom,
                    estimated_unit_price=requirement.target_unit_price,
                    estimated_cost=ZERO,
                )
        inquiry.opportunity = opportunity
    previous = inquiry.status
    inquiry.status = "QUALIFIED"
    inquiry.qualified_at = timezone.now()
    inquiry.save(update_fields=["opportunity", "status", "qualified_at", "updated_at"])
    workflow_event(inquiry=inquiry, opportunity=opportunity, event_type="QUALIFY", from_status=previous, to_status="QUALIFIED", actor=user)
    return opportunity


def move_opportunity(opportunity, stage, user, reason=""):
    previous_stage = opportunity.stage
    opportunity.stage = stage
    opportunity.pipeline_stage = stage.stage_code or stage.stage_name
    opportunity.probability_percent = stage.default_probability_percent or opportunity.probability_percent
    if stage.closed_won:
        opportunity.status, opportunity.closed_at = "WON", timezone.now()
    elif stage.closed_lost:
        opportunity.status, opportunity.closed_at, opportunity.lost_reason = "LOST", timezone.now(), reason
    else:
        opportunity.status = "OPEN"
    opportunity.save()
    OpportunityStageHistory.objects.create(opportunity=opportunity, from_stage=previous_stage, to_stage=stage, changed_by=user, changed_at=timezone.now(), change_reason=reason)
    workflow_event(opportunity=opportunity, event_type="STAGE_CHANGE", from_status=previous_stage.stage_code if previous_stage else "", to_status=stage.stage_code, actor=user, payload={"reason": reason})
    return opportunity


def calculate_estimate(estimate: CostEstimate, user):
    lines = estimate.lines.all()
    if not lines.exists():
        from apps.crm.models import CostEstimateLine
        direct_amt = estimate.direct_cost if (estimate.direct_cost and estimate.direct_cost > 0) else Decimal("100000000")
        CostEstimateLine.objects.create(
            estimate=estimate,
            cost_element="MATERIAL",
            description="Biaya Langsung Material / Pekerjaan",
            quantity=Decimal("1"),
            unit_cost=direct_amt,
            amount=direct_amt,
        )
        if estimate.overhead_cost and estimate.overhead_cost > 0:
            CostEstimateLine.objects.create(
                estimate=estimate,
                cost_element="OVERHEAD",
                description="Biaya Overhead & Operasional",
                quantity=Decimal("1"),
                unit_cost=estimate.overhead_cost,
                amount=estimate.overhead_cost,
            )
        lines = estimate.lines.all()

    direct = lines.exclude(cost_element="OVERHEAD").aggregate(total=Sum("amount"))["total"] or ZERO
    overhead = lines.filter(cost_element="OVERHEAD").aggregate(total=Sum("amount"))["total"] or ZERO
    total_cost = direct + overhead + (estimate.contingency_amount or ZERO)
    offered = total_cost * (Decimal("1") + (estimate.markup_percent or ZERO) / Decimal("100"))
    margin = offered - total_cost
    margin_percent = ZERO if offered == 0 else margin / offered * Decimal("100")
    estimate.direct_cost, estimate.overhead_cost, estimate.total_cost = direct, overhead, total_cost
    estimate.offered_amount, estimate.margin_amount, estimate.margin_percent = offered, margin, margin_percent
    estimate.status, estimate.calculated_at, estimate.calculated_by = "CALCULATED", timezone.now(), user
    estimate.save()
    if estimate.opportunity_id:
        estimate.opportunity.expected_amount = offered
        estimate.opportunity.expected_margin = margin_percent
        estimate.opportunity.save(update_fields=["expected_amount", "expected_margin"])
    workflow_event(inquiry=estimate.inquiry, opportunity=estimate.opportunity, event_type="ESTIMATE_CALCULATED", from_status="DRAFT", to_status="CALCULATED", actor=user, payload={"total_cost": str(total_cost), "offered_amount": str(offered), "margin_percent": str(margin_percent)})
    return estimate


def create_quotation_from_estimate(estimate: CostEstimate, user):
    from apps.core.models import BusinessDocument
    from apps.master_data.models import CustomerProfile
    from apps.sales.models import Quotation, QuotationCost, QuotationLine

    if estimate.status not in {"CALCULATED", "QUOTED"}:
        calculate_estimate(estimate, user)

    existing = estimate.quotation_versions.select_related("quotation").first()
    if existing:
        return existing.quotation, False
    inquiry, opportunity = estimate.inquiry, estimate.opportunity
    customer = opportunity.customer_party if opportunity else inquiry.customer_party
    profile = CustomerProfile.objects.filter(party=customer).first() if customer else None
    company = estimate.company
    document = BusinessDocument.objects.create(
        tenant=estimate.tenant,
        company=company,
        document_type="SALES_QUOTATION",
        document_number=f"QUO-{str(estimate.id)[:8].upper()}",
        status="DRAFT",
        document_date=timezone.localdate(),
        version=1,
        created_by=user,
        created_at=timezone.now(),
        updated_at=timezone.now(),
    )
    quotation = Quotation.objects.create(
        document=document,
        opportunity=opportunity,
        customer_party=customer,
        currency=(customer.default_currency if customer and customer.default_currency_id else company.base_currency if company else None),
        payment_term=profile.payment_term if profile else None,
        subtotal=estimate.offered_amount,
        tax_amount=ZERO,
        total_amount=estimate.offered_amount,
        estimated_total_cost=estimate.total_cost,
        estimated_margin=estimate.margin_percent,
        status="DRAFT",
    )
    estimate_lines = list(estimate.lines.select_related("product", "requirement__uom"))
    for line in estimate_lines:
        qline = QuotationLine.objects.create(
            quotation=quotation,
            product=line.product,
            description=line.description,
            quantity=line.quantity,
            uom=line.requirement.uom if line.requirement_id else (line.product.base_uom if line.product_id else None),
            unit_price=(line.amount * (Decimal("1") + estimate.markup_percent / Decimal("100")) / line.quantity) if line.quantity else ZERO,
            discount_amount=ZERO,
            line_total=line.amount * (Decimal("1") + estimate.markup_percent / Decimal("100")),
        )
        QuotationCost.objects.create(quotation_line=qline, cost_element=line.cost_element, quantity=line.quantity, rate=line.unit_cost, amount=line.amount, calculation_source=line.calculation_source)
    version = QuotationVersion.objects.create(
        quotation=quotation, estimate=estimate, version_number=1, subtotal=quotation.subtotal, tax_amount=ZERO,
        total_amount=quotation.total_amount, estimated_cost=estimate.total_cost, margin_percent=estimate.margin_percent,
        payload_json={"estimate": str(estimate.id), "line_count": len(estimate_lines)}, created_by=user,
    )
    estimate.status = "QUOTED"
    estimate.save(update_fields=["status", "updated_at"])
    if inquiry:
        inquiry.status, inquiry.quoted_at = "QUOTED", timezone.now()
        inquiry.save(update_fields=["status", "quoted_at", "updated_at"])
    workflow_event(inquiry=inquiry, opportunity=opportunity, event_type="QUOTATION_CREATED", from_status="CALCULATED", to_status="DRAFT", actor=user, payload={"quotation_id": str(quotation.id), "version_id": str(version.id)})
    return quotation, True


def calculate_credit_snapshot(customer, company):
    from apps.finance.models import BillingDocument
    from apps.master_data.models import CustomerProfile

    profile = CustomerProfile.objects.filter(party=customer).first()
    credit_limit = profile.credit_limit or ZERO if profile else ZERO
    bills = BillingDocument.objects.filter(company=company, party=customer, billing_type="CUSTOMER_INVOICE", status="POSTED")
    outstanding = bills.aggregate(total=Sum("outstanding_amount"))["total"] or ZERO
    overdue = bills.filter(due_date__lt=timezone.localdate(), outstanding_amount__gt=0).aggregate(total=Sum("outstanding_amount"))["total"] or ZERO
    available = credit_limit - outstanding
    status = "HOLD" if (profile and profile.credit_hold) or available < 0 else "AVAILABLE"
    risk = profile.risk_category if profile and profile.risk_category else ("HIGH" if overdue > 0 else "LOW")
    return CreditStatusSnapshot.objects.create(customer_party=customer, company=company, snapshot_at=timezone.now(), credit_limit=credit_limit, outstanding_receivable=outstanding, overdue_amount=overdue, available_credit=available, risk_category=risk, credit_status=status)
