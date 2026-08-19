from datetime import timedelta
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.service.models import Case, CaseMessage, CaseApproval, Resolution
from apps.api_common.viewsets import BaseERPModelViewSet, ReadOnlyERPModelViewSet
from .serializers import CaseSerializer, CaseMessageSerializer, CaseApprovalSerializer, ResolutionSerializer
from apps.sales.models import Order, Delivery
from apps.finance.models import BillingDocument

class CaseViewSet(BaseERPModelViewSet):
    queryset = Case.objects.all()
    serializer_class = CaseSerializer

    def perform_create(self, serializer):
        if not serializer.validated_data.get("status"):
            serializer.validated_data["status"] = "OPEN"
        if not serializer.validated_data.get("sla_due_at"):
            serializer.validated_data["sla_due_at"] = timezone.now() + timedelta(hours=48)

        company_id = self.request.headers.get("X-Company-ID")
        tenant_id = getattr(self.request.user, "tenant_id", None)
        if company_id and not serializer.validated_data.get("document"):
            from apps.core.models import BusinessDocument, Company
            comp = Company.objects.filter(pk=company_id).first()
            if comp:
                doc = BusinessDocument.objects.create(
                    tenant_id=tenant_id or comp.tenant_id,
                    company=comp,
                    document_type="SERVICE_CASE",
                    document_number=f"CASE-{timezone.now().strftime('%Y%m%d%H%M%S')}",
                    status="OPEN",
                    created_by=self.request.user if self.request.user.is_authenticated else None
                )
                serializer.validated_data["document"] = doc
        super().perform_create(serializer)

    @action(detail=True, methods=["post"], url_path="check-status")
    def check_status(self, request, pk=None):
        case = self.get_object()
        now = timezone.now()
        
        # 1. Product History & Delivery
        delivery = None
        sales_order = case.sales_order
        if case.product:
            if not sales_order and case.customer_party:
                sales_order = Order.objects.filter(customer_party=case.customer_party).first()
            if sales_order:
                delivery = Delivery.objects.filter(sales_order=sales_order).first()
        
        # Past cases count
        past_cases = Case.objects.filter(customer_party=case.customer_party, product=case.product).exclude(pk=case.pk) if case.customer_party and case.product else Case.objects.none()
        
        # 2. Guarantee / Warranty Date check
        reference_date = now - timedelta(days=60)
        if delivery and delivery.delivery_date:
            from datetime import datetime, time
            reference_date = timezone.make_aware(datetime.combine(delivery.delivery_date, time.min))
        elif sales_order and sales_order.order_date:
            from datetime import datetime, time
            reference_date = timezone.make_aware(datetime.combine(sales_order.order_date, time.min))
            
        guarantee_end_date = reference_date + timedelta(days=365)
        is_warranty_active = guarantee_end_date >= now

        if case.status in ["", "OPEN", "NEW"]:
            case.status = "IN_PROGRESS"
            case.save(update_fields=["status"])

        return Response({
            "case_id": str(case.id),
            "case_subject": case.subject,
            "current_status": case.status,
            "customer": {"id": str(case.customer_party.id), "name": case.customer_party.display_name or case.customer_party.legal_name} if case.customer_party else None,
            "product": {"id": str(case.product.id), "name": case.product.product_name, "code": case.product.product_code} if case.product else None,
            "serial_number": str(case.serial_number.id) if case.serial_number else None,
            "product_history": {
                "sales_order_id": str(sales_order.id) if sales_order else None,
                "delivery_id": str(delivery.id) if delivery else None,
                "past_cases_count": past_cases.count(),
                "past_case_subjects": list(past_cases.values_list("subject", flat=True)[:5]),
            },
            "warranty_check": {
                "guarantee_end_date": guarantee_end_date.strftime("%Y-%m-%d"),
                "is_warranty_active": is_warranty_active,
                "status_label": "WARRANTY_ACTIVE" if is_warranty_active else "WARRANTY_EXPIRED",
                "recommended_action": "DELIVER_REPLACEMENT_OR_REPAIR" if is_warranty_active else "PAID_SERVICE_QUOTATION"
            }
        })

    @action(detail=True, methods=["post"], url_path="deliver-solution")
    def deliver_solution(self, request, pk=None):
        case = self.get_object()
        resolution_type = request.data.get("resolution_type", "REPLACEMENT")
        notes = request.data.get("resolution_notes", f"Solusi diberikan via service case: {case.subject}")
        
        replacement_delivery = None
        credit_note = None

        company = None
        if case.document and case.document.company:
            company = case.document.company

        if resolution_type == "REPLACEMENT":
            replacement_delivery = Delivery.objects.create(
                customer_party=case.customer_party,
                sales_order=case.sales_order,
                delivery_date=timezone.localdate(),
                delivery_status="DELIVERED"
            )
        elif resolution_type == "CREDIT_NOTE":
            credit_note = BillingDocument.objects.create(
                company=company,
                party=case.customer_party,
                billing_type="CREDIT_NOTE",
                status="POSTED",
                invoice_number=f"CN-{timezone.now().strftime('%Y%m%d%H%M%S')}"
            )

        resolution = Resolution.objects.create(
            service_case=case,
            resolution_type=resolution_type,
            resolution_notes=notes,
            replacement_delivery=replacement_delivery,
            credit_note=credit_note,
            resolved_at=timezone.now()
        )

        case.status = "RESOLVED"
        case.resolved_at = timezone.now()
        case.save(update_fields=["status", "resolved_at"])

        return Response({
            "success": True,
            "message": f"Solusi {resolution_type} berhasil diterapkan.",
            "case_status": case.status,
            "resolution": {
                "id": str(resolution.id),
                "resolution_type": resolution.resolution_type,
                "resolution_notes": resolution.resolution_notes,
                "replacement_delivery_id": str(replacement_delivery.id) if replacement_delivery else None,
                "credit_note_id": str(credit_note.id) if credit_note else None,
                "resolved_at": resolution.resolved_at.isoformat(),
            }
        })


class CaseMessageViewSet(BaseERPModelViewSet):
    queryset = CaseMessage.objects.all()
    serializer_class = CaseMessageSerializer


class CaseApprovalViewSet(BaseERPModelViewSet):
    queryset = CaseApproval.objects.all()
    serializer_class = CaseApprovalSerializer


class ResolutionViewSet(BaseERPModelViewSet):
    queryset = Resolution.objects.all()
    serializer_class = ResolutionSerializer


