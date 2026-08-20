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
        if "company" not in serializer.validated_data or not serializer.validated_data["company"]:
            from apps.core.models import Company
            comp = getattr(self.request, "company", None)
            if not comp and hasattr(self.request.user, "userrole_set") and self.request.user.userrole_set.exists():
                comp = self.request.user.userrole_set.first().company
            serializer.validated_data["company"] = comp or Company.objects.first()
        if "tenant" not in serializer.validated_data or not serializer.validated_data["tenant"]:
            serializer.validated_data["tenant"] = getattr(serializer.validated_data.get("company"), "tenant", None) or getattr(self.request.user, "tenant", None)
        super().perform_create(serializer)

    def perform_destroy(self, instance):
        from apps.crm.models import OpportunityProduct, OpportunityStageHistory, ExecutiveApproval, CostEstimate, CRMWorkflowEvent
        from apps.sales.models import Quotation, Contract, Order
        OpportunityProduct.objects.filter(opportunity=instance).delete()
        OpportunityStageHistory.objects.filter(opportunity=instance).delete()
        ExecutiveApproval.objects.filter(opportunity=instance).delete()
        CRMWorkflowEvent.objects.filter(opportunity=instance).delete()
        CostEstimate.objects.filter(opportunity=instance).delete()
        Quotation.objects.filter(opportunity=instance).delete()
        Contract.objects.filter(opportunity=instance).delete()
        Order.objects.filter(opportunity=instance).delete()
        super().perform_destroy(instance)

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
        from apps.sales.models import Quotation, Contract, Order, Delivery
        from apps.projects.models import Project
        from apps.crm.models import Feedback
        return Response({
            "customer": {
                "id": customer.id if customer else None,
                "name": (customer.display_name or customer.legal_name) if customer else "No Customer",
                "party_code": customer.party_code if customer else "-"
            },
            "quotations": Quotation.objects.filter(customer_party=customer).count(),
            "contracts": Contract.objects.filter(customer_party=customer).count(),
            "orders": Order.objects.filter(customer_party=customer).count(),
            "projects": Project.objects.filter(customer_party=customer).count(),
            "deliveries": Delivery.objects.filter(customer_party=customer).count(),
            "outstanding_ar": str(BillingDocument.objects.filter(party=customer, billing_type="CUSTOMER_INVOICE", status="POSTED").aggregate(total=Sum("outstanding_amount"))["total"] or 0),
            "feedback_count": Feedback.objects.filter(customer_party=customer).count(),
        })

    @action(detail=True, methods=["post"], url_path="process-deal-won")
    def process_deal_won(self, request, pk=None):
        if not is_crm(request.user):
            raise PermissionDenied("Hanya CRM yang dapat memproses Deal Won.")
        opportunity = self.get_object()
        customer = opportunity.customer_party
        if not customer:
            from apps.master_data.models import Party
            customer = (
                Party.objects.filter(tenant=opportunity.tenant, status="ACTIVE").first()
                or Party.objects.filter(status="ACTIVE").first()
                or Party.objects.first()
            )
            if customer:
                opportunity.customer_party = customer
                opportunity.save(update_fields=["customer_party"])
        if not customer:
            raise ValidationError("Opportunity harus memiliki customer party.")

        company = opportunity.company
        if not company and hasattr(request.user, "userrole_set") and request.user.userrole_set.exists():
            company = request.user.userrole_set.first().company
        if not company:
            from apps.core.models import Company
            company = Company.objects.filter(tenant=opportunity.tenant).first() or Company.objects.first()
            if company:
                opportunity.company = company
                opportunity.save(update_fields=["company"])

        # 1. Update opportunity to WON
        opportunity.status = "WON"
        opportunity.pipeline_stage = "WON"
        opportunity.probability_percent = 100
        opportunity.closed_at = timezone.now()
        opportunity.save(update_fields=["status", "pipeline_stage", "probability_percent", "closed_at"])

        # 2. Calculate Credit Snapshot
        from apps.crm.workflow_services import calculate_credit_snapshot
        snapshot = calculate_credit_snapshot(customer, company)
        deal_amount = opportunity.expected_amount or 0

        from apps.sales.models import Order, Quotation
        from apps.projects.models import Project
        from apps.finance.models import BillingDocument

        # Decision rule: Safe if status != HOLD and available_credit >= deal_amount and overdue <= 0
        is_safe = (snapshot.credit_status != "HOLD") and (snapshot.available_credit >= deal_amount) and (snapshot.overdue_amount <= 0)

        created_order = None
        created_project = None
        proforma_billing = None

        if is_safe:
            quotation = Quotation.objects.filter(customer_party=customer).first()
            created_order = Order.objects.create(
                customer_party=customer,
                quotation=quotation,
                currency=customer.default_currency,
                order_date=timezone.localdate(),
                total_amount=deal_amount,
                status="CONFIRMED"
            )
            from apps.accounts.models import User
            from apps.projects.models import Member
            pm_user = User.objects.filter(username="demo.project_manager").first() or User.objects.filter(email="project.manager.demo@erp.local").first() or request.user
            created_project = Project.objects.create(
                tenant=opportunity.tenant,
                company=company,
                customer_party=customer,
                sales_order=created_order,
                project_manager=pm_user,
                manager_name=getattr(pm_user, "full_name", "") or getattr(pm_user, "username", "") if pm_user else "",
                project_code=f"PRJ-CRM-{str(opportunity.id)[:6].upper()}",
                project_name=opportunity.opportunity_name or f"Project {customer.display_name or customer.legal_name}",
                budget_amount=deal_amount,
                status="PLANNED"
            )
            if pm_user:
                Member.objects.get_or_create(project=created_project, user=pm_user, defaults={"project_role": "PROJECT_MANAGER", "status": "ACTIVE"})
            from apps.projects.workflow_services import ensure_project_readiness_prerequisites
            ensure_project_readiness_prerequisites(created_project, user=request.user)
        else:
            proforma_billing = BillingDocument.objects.create(
                company=company,
                party=customer,
                billing_type="PROFORMA_INVOICE",
                status="DRAFT",
                total_amount=deal_amount,
                invoice_number=f"PROFORMA-{str(opportunity.id)[:6].upper()}"
            )

        return Response({
            "opportunity_id": str(opportunity.id),
            "opportunity_name": opportunity.opportunity_name,
            "stage": opportunity.status,
            "deal_amount": str(deal_amount),
            "credit_evaluation": {
                "snapshot_id": str(snapshot.id),
                "credit_limit": str(snapshot.credit_limit),
                "outstanding_receivable": str(snapshot.outstanding_receivable),
                "overdue_amount": str(snapshot.overdue_amount),
                "available_credit": str(snapshot.available_credit),
                "credit_status": snapshot.credit_status,
                "risk_category": snapshot.risk_category,
                "is_safe": is_safe,
            },
            "decision": "SEND_TO_PROJECT_MANAGEMENT" if is_safe else "SEND_BILL_TO_CLIENT_MANUALLY",
            "handoff": {
                "sales_order_id": str(created_order.id) if created_order else None,
                "project_id": str(created_project.id) if created_project else None,
                "proforma_invoice_id": str(proforma_billing.id) if proforma_billing else None,
                "note": "Proyek siap dijalankan di Project Management Workspace." if is_safe else "Batas kredit terlampaui. Kirim tagihan DP secara manual ke klien atau minta Executive Override."
            }
        })

    @action(detail=True, methods=["post"], url_path="executive-override")
    def executive_override(self, request, pk=None):
        if not is_executive(request.user):
            raise PermissionDenied("Hanya Executive yang berhak memberikan credit override.")
        opportunity = self.get_object()
        customer = opportunity.customer_party
        company = opportunity.company
        if not company and hasattr(request.user, "userrole_set") and request.user.userrole_set.exists():
            company = request.user.userrole_set.first().company
        deal_amount = opportunity.expected_amount or 0

        from apps.sales.models import Order
        from apps.projects.models import Project, Member
        from apps.accounts.models import User
        from apps.projects.workflow_services import ensure_project_readiness_prerequisites

        created_order = Order.objects.create(
            customer_party=customer,
            currency=customer.default_currency if customer else None,
            order_date=timezone.localdate(),
            total_amount=deal_amount,
            status="CONFIRMED"
        )
        pm_user = User.objects.filter(username="demo.project_manager").first() or User.objects.filter(email="project.manager.demo@erp.local").first() or request.user
        created_project = Project.objects.create(
            tenant=opportunity.tenant,
            company=company,
            customer_party=customer,
            sales_order=created_order,
            project_manager=pm_user,
            manager_name=getattr(pm_user, "full_name", "") or getattr(pm_user, "username", "") if pm_user else "",
            project_code=f"PRJ-CRM-OVR-{str(opportunity.id)[:6].upper()}",
            project_name=f"[OVERRIDE] {opportunity.opportunity_name or 'Project'}",
            budget_amount=deal_amount,
            status="PLANNED"
        )
        if pm_user:
            Member.objects.get_or_create(project=created_project, user=pm_user, defaults={"project_role": "PROJECT_MANAGER", "status": "ACTIVE"})
        ensure_project_readiness_prerequisites(created_project, user=request.user)

        return Response({
            "success": True,
            "message": "Executive override disetujui. Project berhasil diteruskan ke Project Management.",
            "sales_order_id": str(created_order.id),
            "project_id": str(created_project.id),
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

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        if "decision" not in request.data:
            request.data["decision"] = "APPROVED"
        return self.decide(request, pk)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        if "decision" not in request.data:
            request.data["decision"] = "REJECTED"
        return self.decide(request, pk)


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
        if not is_crm(self.request.user):
            raise PermissionDenied("Hanya CRM yang dapat mencatat inquiry.")
        serializer.validated_data.setdefault("owner_user", self.request.user)
        serializer.validated_data.setdefault("status", "NEW")
        if not serializer.validated_data.get("inquiry_number"):
            serializer.validated_data["inquiry_number"] = f"INQ-{timezone.now():%Y%m%d%H%M%S}"

        # Resolve company
        if "company" not in serializer.validated_data or not serializer.validated_data["company"]:
            from apps.core.models import Company
            comp_id = self.request.headers.get("X-Company-ID")
            comp = Company.objects.filter(pk=comp_id).first() if comp_id else None
            if not comp and hasattr(self.request.user, "userrole_set") and self.request.user.userrole_set.exists():
                comp = self.request.user.userrole_set.first().company
            serializer.validated_data["company"] = comp or Company.objects.first()

        # Resolve tenant
        if "tenant" not in serializer.validated_data or not serializer.validated_data["tenant"]:
            serializer.validated_data["tenant"] = (
                getattr(serializer.validated_data.get("company"), "tenant", None)
                or getattr(self.request.user, "tenant", None)
            )

        super().perform_create(serializer)
        instance = serializer.instance
        CRMWorkflowEvent.objects.create(
            company=instance.company,
            inquiry=instance,
            event_type="INQUIRY_CREATED",
            to_status="NEW",
            actor=self.request.user,
        )

    def perform_destroy(self, instance):
        from apps.crm.models import InquiryRequirement, CostEstimate, CRMWorkflowEvent
        InquiryRequirement.objects.filter(inquiry=instance).delete()
        CostEstimate.objects.filter(inquiry=instance).delete()
        CRMWorkflowEvent.objects.filter(inquiry=instance).delete()
        super().perform_destroy(instance)

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
        if not is_crm(self.request.user):
            raise PermissionDenied("Hanya CRM yang dapat membuat estimate.")
        inquiry = serializer.validated_data.get("inquiry")
        version = CostEstimate.objects.filter(inquiry=inquiry).count() + 1 if inquiry else 1
        serializer.validated_data.setdefault("opportunity", inquiry.opportunity if inquiry else None)
        serializer.validated_data.setdefault("version_number", version)
        if not serializer.validated_data.get("estimate_number"):
            serializer.validated_data["estimate_number"] = f"EST-{timezone.now():%Y%m%d%H%M%S}"
        serializer.validated_data.setdefault("status", "DRAFT")

        # Inherit company directly from inquiry if available
        if inquiry and inquiry.company and ("company" not in serializer.validated_data or not serializer.validated_data["company"]):
            serializer.validated_data["company"] = inquiry.company
        if "company" not in serializer.validated_data or not serializer.validated_data["company"]:
            from apps.core.models import Company
            comp_id = self.request.headers.get("X-Company-ID")
            comp = Company.objects.filter(pk=comp_id).first() if comp_id else None
            if not comp and hasattr(self.request.user, "userrole_set") and self.request.user.userrole_set.exists():
                comp = self.request.user.userrole_set.first().company
            serializer.validated_data["company"] = comp or Company.objects.first()

        # Inherit tenant
        if not serializer.validated_data.get("tenant"):
            serializer.validated_data["tenant"] = (
                getattr(serializer.validated_data.get("company"), "tenant", None)
                or (inquiry.tenant if inquiry else None)
                or getattr(self.request.user, "tenant", None)
            )

        super().perform_create(serializer)
        if inquiry and inquiry.status == "QUALIFIED":
            inquiry.status = "SPECIFICATION_READY"
            inquiry.save(update_fields=["status", "updated_at"])

    def perform_destroy(self, instance):
        from apps.crm.models import CostEstimateLine, QuotationVersion
        CostEstimateLine.objects.filter(estimate=instance).delete()
        QuotationVersion.objects.filter(estimate=instance).delete()
        super().perform_destroy(instance)

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


class QuotationDeliveryViewSet(BaseERPModelViewSet):
    queryset = QuotationDelivery.objects.all().order_by("-id")
    serializer_class = QuotationDeliverySerializer


class CRMWorkflowEventViewSet(ReadOnlyERPModelViewSet):
    queryset = CRMWorkflowEvent.objects.all().order_by("-id")
    serializer_class = CRMWorkflowEventSerializer
