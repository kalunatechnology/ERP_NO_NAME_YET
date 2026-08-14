from django.db import transaction
from django.db.models import Avg, Count, Sum
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.crm.models import Lead, Opportunity, OpportunityProduct, Activity, Pipeline, PipelineStage, OpportunityStageHistory, ExecutiveApproval, CreditStatusSnapshot, ChannelAccount, Conversation, ConversationParticipant, Message, MessageAttachment, MessageDeliveryStatus, Feedback, Survey, SurveyQuestion, SurveyResponse, SurveyAnswer, CustomerInquiry, InquiryRequirement, CostEstimate, CostEstimateLine, QuotationVersion, QuotationDelivery, CRMWorkflowEvent
from apps.api_common.viewsets import BaseERPModelViewSet, ReadOnlyERPModelViewSet
from apps.projects.access import is_crm, is_executive, is_finance
from .serializers import LeadSerializer, OpportunitySerializer, OpportunityProductSerializer, ActivitySerializer, PipelineSerializer, PipelineStageSerializer, OpportunityStageHistorySerializer, ExecutiveApprovalSerializer, CreditStatusSnapshotSerializer, ChannelAccountSerializer, ConversationSerializer, ConversationParticipantSerializer, MessageSerializer, MessageAttachmentSerializer, MessageDeliveryStatusSerializer, FeedbackSerializer, SurveySerializer, SurveyQuestionSerializer, SurveyResponseSerializer, SurveyAnswerSerializer, CustomerInquirySerializer, InquiryRequirementSerializer, CostEstimateSerializer, CostEstimateLineSerializer, QuotationVersionSerializer, QuotationDeliverySerializer, CRMWorkflowEventSerializer

class LeadViewSet(BaseERPModelViewSet):
    queryset = Lead.objects.all()
    serializer_class = LeadSerializer


class OpportunityViewSet(BaseERPModelViewSet):
    queryset = Opportunity.objects.all()
    serializer_class = OpportunitySerializer

    def perform_create(self, serializer):
        if not is_crm(self.request.user): raise PermissionDenied("Hanya CRM yang dapat membuat opportunity.")
        serializer.validated_data.setdefault("owner_user", self.request.user)
        serializer.validated_data.setdefault("status", "OPEN")
        serializer.validated_data.setdefault("opened_at", timezone.now())
        super().perform_create(serializer)

    @action(detail=True, methods=["post"], url_path="move-stage")
    def move_stage(self, request, pk=None):
        if not is_crm(request.user): raise PermissionDenied("Hanya CRM yang dapat memindahkan pipeline stage.")
        stage = PipelineStage.objects.get(pk=request.data.get("stage"))
        from apps.crm.workflow_services import move_opportunity
        return Response(self.get_serializer(move_opportunity(self.get_object(), stage, request.user, request.data.get("reason", ""))).data)

    @action(detail=True, methods=["get"], url_path="customer-360")
    def customer_360(self, request, pk=None):
        opportunity = self.get_object()
        customer = opportunity.customer_party
        from apps.finance.models import BillingDocument
        from apps.projects.models import Project
        from apps.sales.models import Contract, Delivery, Order, Quotation
        return Response({
            "customer": {"id": str(customer.id), "name": customer.display_name or customer.legal_name} if customer else None,
            "opportunity_id": str(opportunity.id),
            "quotations": Quotation.objects.filter(customer_party=customer).count(),
            "contracts": Contract.objects.filter(customer_party=customer).count(),
            "orders": Order.objects.filter(customer_party=customer).count(),
            "projects": Project.objects.filter(customer_party=customer).count(),
            "deliveries": Delivery.objects.filter(customer_party=customer).count(),
            "outstanding_ar": str(BillingDocument.objects.filter(party=customer, billing_type="CUSTOMER_INVOICE", status="POSTED").aggregate(total=Sum("outstanding_amount"))["total"] or 0),
            "feedback_count": Feedback.objects.filter(customer_party=customer).count(),
        })


class OpportunityProductViewSet(BaseERPModelViewSet):
    queryset = OpportunityProduct.objects.all()
    serializer_class = OpportunityProductSerializer


class ActivityViewSet(BaseERPModelViewSet):
    queryset = Activity.objects.all()
    serializer_class = ActivitySerializer


class PipelineViewSet(BaseERPModelViewSet):
    queryset = Pipeline.objects.all()
    serializer_class = PipelineSerializer


class PipelineStageViewSet(BaseERPModelViewSet):
    queryset = PipelineStage.objects.all()
    serializer_class = PipelineStageSerializer


class OpportunityStageHistoryViewSet(BaseERPModelViewSet):
    queryset = OpportunityStageHistory.objects.all()
    serializer_class = OpportunityStageHistorySerializer


class ExecutiveApprovalViewSet(BaseERPModelViewSet):
    queryset = ExecutiveApproval.objects.all()
    serializer_class = ExecutiveApprovalSerializer

    @action(detail=True, methods=["post"])
    def decide(self, request, pk=None):
        if not is_executive(request.user): raise PermissionDenied("Hanya Executive yang dapat memberi keputusan.")
        item = self.get_object()
        if item.decision not in {"", "PENDING"}: raise ValidationError({"decision": "Approval sudah diputuskan."})
        decision = str(request.data.get("decision", "")).upper()
        if decision not in {"APPROVED", "REJECTED"}: raise ValidationError({"decision": "Gunakan APPROVED atau REJECTED."})
        item.decision, item.remarks, item.approver_user, item.decided_at = decision, request.data.get("remarks", ""), request.user, timezone.now()
        item.save()
        if item.quotation_id:
            item.quotation.status = decision
            item.quotation.save(update_fields=["status"])
        if item.contract_id:
            item.contract.status = decision
            item.contract.save(update_fields=["status"])
        return Response(self.get_serializer(item).data)


class CreditStatusSnapshotViewSet(BaseERPModelViewSet):
    queryset = CreditStatusSnapshot.objects.all()
    serializer_class = CreditStatusSnapshotSerializer

    @action(detail=False, methods=["post"], url_path="calculate")
    def calculate(self, request):
        if not (is_crm(request.user) or is_finance(request.user)): raise PermissionDenied("Hanya CRM/Finance yang dapat menghitung credit status.")
        from apps.core.models import Company
        from apps.master_data.models import Party
        from apps.crm.workflow_services import calculate_credit_snapshot
        customer = Party.objects.get(pk=request.data.get("customer_party"))
        company = Company.objects.get(pk=request.headers.get("X-Company-ID") or request.data.get("company"))
        snapshot = calculate_credit_snapshot(customer, company)
        return Response(self.get_serializer(snapshot).data, status=201)


class ChannelAccountViewSet(BaseERPModelViewSet):
    queryset = ChannelAccount.objects.all()
    serializer_class = ChannelAccountSerializer


class ConversationViewSet(BaseERPModelViewSet):
    queryset = Conversation.objects.all()
    serializer_class = ConversationSerializer


class ConversationParticipantViewSet(BaseERPModelViewSet):
    queryset = ConversationParticipant.objects.all()
    serializer_class = ConversationParticipantSerializer


class MessageViewSet(BaseERPModelViewSet):
    queryset = Message.objects.all()
    serializer_class = MessageSerializer


class MessageAttachmentViewSet(BaseERPModelViewSet):
    queryset = MessageAttachment.objects.all()
    serializer_class = MessageAttachmentSerializer


class MessageDeliveryStatusViewSet(BaseERPModelViewSet):
    queryset = MessageDeliveryStatus.objects.all()
    serializer_class = MessageDeliveryStatusSerializer


class FeedbackViewSet(BaseERPModelViewSet):
    queryset = Feedback.objects.all()
    serializer_class = FeedbackSerializer


class SurveyViewSet(BaseERPModelViewSet):
    queryset = Survey.objects.all()
    serializer_class = SurveySerializer


class SurveyQuestionViewSet(BaseERPModelViewSet):
    queryset = SurveyQuestion.objects.all()
    serializer_class = SurveyQuestionSerializer


class SurveyResponseViewSet(BaseERPModelViewSet):
    queryset = SurveyResponse.objects.all()
    serializer_class = SurveyResponseSerializer


class SurveyAnswerViewSet(BaseERPModelViewSet):
    queryset = SurveyAnswer.objects.all()
    serializer_class = SurveyAnswerSerializer


class CustomerInquiryViewSet(BaseERPModelViewSet):
    queryset = CustomerInquiry.objects.all()
    serializer_class = CustomerInquirySerializer

    def perform_create(self, serializer):
        if not is_crm(self.request.user): raise PermissionDenied("Hanya CRM yang dapat mencatat inquiry.")
        serializer.validated_data.setdefault("owner_user", self.request.user)
        serializer.validated_data.setdefault("status", "NEW")
        instance = serializer.save(
            tenant_id=getattr(self.request.user, "tenant_id", None),
            company_id=self.request.headers.get("X-Company-ID"),
            inquiry_number=f"INQ-{timezone.now():%Y%m%d%H%M%S}",
        )
        CRMWorkflowEvent.objects.create(company=instance.company, inquiry=instance, event_type="INQUIRY_CREATED", to_status="NEW", actor=self.request.user)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def qualify(self, request, pk=None):
        if not is_crm(request.user): raise PermissionDenied("Hanya CRM yang dapat mengkualifikasi inquiry.")
        from apps.crm.workflow_services import qualify_inquiry
        try: opportunity = qualify_inquiry(self.get_object(), request.user)
        except ValueError as error: raise ValidationError({"inquiry": str(error)}) from error
        return Response({"inquiry": self.get_serializer(self.get_object()).data, "opportunity_id": str(opportunity.id)})

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        if not is_crm(request.user): raise PermissionDenied("Hanya CRM yang dapat menutup inquiry.")
        item = self.get_object(); previous = item.status
        item.status, item.closed_at = "CLOSED_LOST", timezone.now(); item.save(update_fields=["status", "closed_at", "updated_at"])
        CRMWorkflowEvent.objects.create(company=item.company, inquiry=item, event_type="INQUIRY_CLOSED", from_status=previous, to_status=item.status, actor=request.user, payload_json={"reason": request.data.get("reason", "")})
        return Response(self.get_serializer(item).data)


class InquiryRequirementViewSet(BaseERPModelViewSet):
    queryset = InquiryRequirement.objects.all()
    serializer_class = InquiryRequirementSerializer


class CostEstimateViewSet(BaseERPModelViewSet):
    queryset = CostEstimate.objects.all()
    serializer_class = CostEstimateSerializer

    def perform_create(self, serializer):
        if not is_crm(self.request.user): raise PermissionDenied("Hanya CRM yang dapat membuat estimate.")
        inquiry = serializer.validated_data.get("inquiry")
        version = CostEstimate.objects.filter(inquiry=inquiry).count() + 1 if inquiry else 1
        serializer.validated_data.setdefault("opportunity", inquiry.opportunity if inquiry else None)
        serializer.validated_data.setdefault("version_number", version)
        instance = serializer.save(tenant_id=getattr(self.request.user, "tenant_id", None), company_id=self.request.headers.get("X-Company-ID"), estimate_number=f"EST-{timezone.now():%Y%m%d%H%M%S}", status="DRAFT")
        if inquiry and inquiry.status == "QUALIFIED":
            inquiry.status = "SPECIFICATION_READY"; inquiry.save(update_fields=["status", "updated_at"])

    @action(detail=True, methods=["post"])
    def calculate(self, request, pk=None):
        if not is_crm(request.user): raise PermissionDenied("Hanya CRM yang dapat menghitung estimate.")
        from apps.crm.workflow_services import calculate_estimate
        try: item = calculate_estimate(self.get_object(), request.user)
        except ValueError as error: raise ValidationError({"estimate": str(error)}) from error
        return Response(self.get_serializer(item).data)

    @action(detail=True, methods=["post"], url_path="create-quotation")
    @transaction.atomic
    def create_quotation(self, request, pk=None):
        if not is_crm(request.user): raise PermissionDenied("Hanya CRM yang dapat membuat quotation.")
        from apps.crm.workflow_services import create_quotation_from_estimate
        try: quotation, created = create_quotation_from_estimate(self.get_object(), request.user)
        except ValueError as error: raise ValidationError({"estimate": str(error)}) from error
        return Response({"quotation_id": str(quotation.id), "status": quotation.status, "created": created}, status=201 if created else 200)


class CostEstimateLineViewSet(BaseERPModelViewSet):
    queryset = CostEstimateLine.objects.all()
    serializer_class = CostEstimateLineSerializer


class QuotationVersionViewSet(ReadOnlyERPModelViewSet):
    queryset = QuotationVersion.objects.all()
    serializer_class = QuotationVersionSerializer


class QuotationDeliveryViewSet(ReadOnlyERPModelViewSet):
    queryset = QuotationDelivery.objects.all()
    serializer_class = QuotationDeliverySerializer


class CRMWorkflowEventViewSet(ReadOnlyERPModelViewSet):
    queryset = CRMWorkflowEvent.objects.all()
    serializer_class = CRMWorkflowEventSerializer
