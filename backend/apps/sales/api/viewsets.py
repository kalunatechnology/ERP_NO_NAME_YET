from apps.sales.models import Quotation, QuotationLine, QuotationCost, Contract, ContractLine, Order, OrderLine, Delivery, DeliveryLine, DemandSupplyLink, OrderChangeRequest, RecurringOrderRule, RecurringOrderRun
from apps.api_common.viewsets import BaseERPModelViewSet, ReadOnlyERPModelViewSet
from django.db import transaction
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from apps.projects.access import is_crm, is_executive
from .serializers import QuotationSerializer, QuotationLineSerializer, QuotationCostSerializer, ContractSerializer, ContractLineSerializer, OrderSerializer, OrderLineSerializer, DeliverySerializer, DeliveryLineSerializer, DemandSupplyLinkSerializer, OrderChangeRequestSerializer, RecurringOrderRuleSerializer, RecurringOrderRunSerializer

class QuotationViewSet(BaseERPModelViewSet):
    queryset = Quotation.objects.all()
    serializer_class = QuotationSerializer

    @action(detail=True, methods=["post"], url_path="submit-approval")
    def submit_approval(self, request, pk=None):
        if not is_crm(request.user): raise PermissionDenied("Hanya CRM yang dapat mengajukan quotation.")
        from apps.crm.models import ExecutiveApproval
        quotation = self.get_object()
        if quotation.status != "DRAFT": raise ValidationError({"status": "Quotation harus DRAFT."})
        approval, _ = ExecutiveApproval.objects.get_or_create(
            quotation=quotation,
            approval_type="QUOTATION",
            defaults={"company": quotation.document.company if quotation.document_id else None, "opportunity": quotation.opportunity, "requested_by": request.user, "requested_amount": quotation.total_amount, "decision": "PENDING", "requested_at": timezone.now()},
        )
        quotation.status = "PENDING_APPROVAL"; quotation.save(update_fields=["status"])
        return Response({"approval_id": str(approval.id), "quotation_status": quotation.status})

    @action(detail=True, methods=["post"])
    def send(self, request, pk=None):
        if not is_crm(request.user): raise PermissionDenied("Hanya CRM yang dapat mengirim quotation.")
        from apps.crm.models import QuotationDelivery
        quotation = self.get_object()
        if quotation.status != "APPROVED": raise ValidationError({"status": "Quotation harus APPROVED."})
        version = quotation.versions.order_by("-version_number").first()
        delivery = QuotationDelivery.objects.create(quotation=quotation, version=version, channel=request.data.get("channel", "EMAIL"), recipient=request.data.get("recipient", ""), external_reference=request.data.get("external_reference", ""), status="SENT", sent_at=timezone.now())
        quotation.status = "SENT"; quotation.save(update_fields=["status"])
        return Response({"delivery_id": str(delivery.id), "status": "SENT"})

    @action(detail=True, methods=["post"], url_path="customer-decision")
    @transaction.atomic
    def customer_decision(self, request, pk=None):
        if not is_crm(request.user): raise PermissionDenied("Hanya CRM yang dapat mencatat keputusan customer.")
        quotation = self.get_object()
        if quotation.status != "SENT": raise ValidationError({"status": "Quotation belum dikirim."})
        accepted = request.data.get("accepted") is True or str(request.data.get("accepted", "")).lower() in {"true", "1", "yes"}
        quotation.status = "ACCEPTED" if accepted else "REJECTED"
        quotation.save(update_fields=["status"])
        if quotation.opportunity_id:
            quotation.opportunity.status = "WON" if accepted else "LOST"
            quotation.opportunity.closed_at = timezone.now()
            quotation.opportunity.lost_reason = "" if accepted else request.data.get("reason", "Customer rejected quotation")
            quotation.opportunity.save(update_fields=["status", "closed_at", "lost_reason"])
        return Response(self.get_serializer(quotation).data)


class QuotationLineViewSet(BaseERPModelViewSet):
    queryset = QuotationLine.objects.all()
    serializer_class = QuotationLineSerializer


class QuotationCostViewSet(BaseERPModelViewSet):
    queryset = QuotationCost.objects.all()
    serializer_class = QuotationCostSerializer


class ContractViewSet(BaseERPModelViewSet):
    queryset = Contract.objects.all()
    serializer_class = ContractSerializer

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        if not is_crm(request.user): raise PermissionDenied("Hanya CRM yang dapat submit contract.")
        item=self.get_object()
        if item.status not in {"", "DRAFT"}: raise ValidationError({"status":"Contract harus DRAFT."})
        item.status="PENDING_APPROVAL"; item.save(update_fields=["status"])
        from apps.crm.models import ExecutiveApproval
        approval,_=ExecutiveApproval.objects.get_or_create(contract=item,approval_type="CONTRACT",defaults={"company":item.document.company if item.document_id else None,"requested_by":request.user,"decision":"PENDING","requested_at":timezone.now()})
        return Response({"approval_id":str(approval.id),"status":item.status})

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        if not is_executive(request.user): raise PermissionDenied("Hanya Executive yang dapat mengaktifkan contract.")
        item=self.get_object()
        approval=item.crm_executiveapproval_contract_set.filter(decision="APPROVED").first()
        if not approval: raise ValidationError({"approval":"Contract belum disetujui."})
        item.status="ACTIVE"; item.save(update_fields=["status"])
        return Response(self.get_serializer(item).data)


class ContractLineViewSet(BaseERPModelViewSet):
    queryset = ContractLine.objects.all()
    serializer_class = ContractLineSerializer


class OrderViewSet(BaseERPModelViewSet):
    queryset = Order.objects.all()
    serializer_class = OrderSerializer


class OrderLineViewSet(BaseERPModelViewSet):
    queryset = OrderLine.objects.all()
    serializer_class = OrderLineSerializer


class DeliveryViewSet(BaseERPModelViewSet):
    queryset = Delivery.objects.all()
    serializer_class = DeliverySerializer


class DeliveryLineViewSet(BaseERPModelViewSet):
    queryset = DeliveryLine.objects.all()
    serializer_class = DeliveryLineSerializer


class DemandSupplyLinkViewSet(BaseERPModelViewSet):
    queryset = DemandSupplyLink.objects.all()
    serializer_class = DemandSupplyLinkSerializer


class OrderChangeRequestViewSet(BaseERPModelViewSet):
    queryset = OrderChangeRequest.objects.all()
    serializer_class = OrderChangeRequestSerializer


class RecurringOrderRuleViewSet(BaseERPModelViewSet):
    queryset = RecurringOrderRule.objects.all()
    serializer_class = RecurringOrderRuleSerializer

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def run(self, request, pk=None):
        if not is_crm(request.user): raise PermissionDenied("Hanya CRM yang dapat menjalankan repeat order.")
        from apps.sales.models import ContractLine, Order, OrderLine, RecurringOrderRun
        rule=self.get_object(); scheduled=request.data.get("scheduled_date") or timezone.localdate()
        existing=RecurringOrderRun.objects.filter(recurring_order_rule=rule,scheduled_date=scheduled).first()
        if existing:return Response({"run_id":str(existing.id),"order_id":str(existing.generated_sales_order_id),"created":False})
        if rule.status!="ACTIVE" or not rule.auto_create: raise ValidationError({"status":"Rule harus ACTIVE dan auto_create."})
        if not rule.contract_id or rule.contract.status!="ACTIVE": raise ValidationError({"contract":"Contract harus ACTIVE."})
        order=Order.objects.create(contract=rule.contract,customer_party=rule.customer_party or rule.contract.customer_party,order_date=scheduled,status="DRAFT")
        for line in ContractLine.objects.filter(contract=rule.contract):
            OrderLine.objects.create(sales_order=order,product=line.product,ordered_quantity=line.contracted_quantity,delivered_quantity=0,invoiced_quantity=0,unit_price=line.unit_price,tax_code=line.tax_code,fulfillment_method="PROJECT")
        run=RecurringOrderRun.objects.create(recurring_order_rule=rule,generated_sales_order=order,scheduled_date=scheduled,generated_at=timezone.now(),run_status="GENERATED")
        return Response({"run_id":str(run.id),"order_id":str(order.id),"created":True},status=201)


class RecurringOrderRunViewSet(BaseERPModelViewSet):
    queryset = RecurringOrderRun.objects.all()
    serializer_class = RecurringOrderRunSerializer
