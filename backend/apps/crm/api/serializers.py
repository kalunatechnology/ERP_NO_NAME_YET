from rest_framework import serializers
from rest_framework import serializers

from apps.api_common.serializers import ERPModelSerializer
from apps.crm.models import Lead, Opportunity, OpportunityProduct, Activity, Pipeline, PipelineStage, OpportunityStageHistory, ExecutiveApproval, CreditStatusSnapshot, ChannelAccount, Conversation, ConversationParticipant, Message, MessageAttachment, MessageDeliveryStatus, Feedback, Survey, SurveyQuestion, SurveyResponse, SurveyAnswer, CustomerInquiry, InquiryRequirement, CostEstimate, CostEstimateLine, QuotationVersion, QuotationDelivery, CRMWorkflowEvent

class LeadSerializer(ERPModelSerializer):
    class Meta:
        model = Lead
        fields = "__all__"


class OpportunitySerializer(ERPModelSerializer):
    class Meta:
        model = Opportunity
        fields = "__all__"


class OpportunityProductSerializer(ERPModelSerializer):
    class Meta:
        model = OpportunityProduct
        fields = "__all__"


class ActivitySerializer(ERPModelSerializer):
    class Meta:
        model = Activity
        fields = "__all__"


class PipelineSerializer(ERPModelSerializer):
    class Meta:
        model = Pipeline
        fields = "__all__"


class PipelineStageSerializer(ERPModelSerializer):
    class Meta:
        model = PipelineStage
        fields = "__all__"


class OpportunityStageHistorySerializer(ERPModelSerializer):
    class Meta:
        model = OpportunityStageHistory
        fields = "__all__"


class ExecutiveApprovalSerializer(ERPModelSerializer):
    class Meta:
        model = ExecutiveApproval
        fields = "__all__"


class CreditStatusSnapshotSerializer(ERPModelSerializer):
    class Meta:
        model = CreditStatusSnapshot
        fields = "__all__"


class ChannelAccountSerializer(ERPModelSerializer):
    class Meta:
        model = ChannelAccount
        fields = "__all__"


class ConversationSerializer(ERPModelSerializer):
    class Meta:
        model = Conversation
        fields = "__all__"


class ConversationParticipantSerializer(ERPModelSerializer):
    class Meta:
        model = ConversationParticipant
        fields = "__all__"


class MessageSerializer(ERPModelSerializer):
    class Meta:
        model = Message
        fields = "__all__"


class MessageAttachmentSerializer(ERPModelSerializer):
    class Meta:
        model = MessageAttachment
        fields = "__all__"


class MessageDeliveryStatusSerializer(ERPModelSerializer):
    class Meta:
        model = MessageDeliveryStatus
        fields = "__all__"


class FeedbackSerializer(ERPModelSerializer):
    class Meta:
        model = Feedback
        fields = "__all__"


class SurveySerializer(ERPModelSerializer):
    class Meta:
        model = Survey
        fields = "__all__"


class SurveyQuestionSerializer(ERPModelSerializer):
    class Meta:
        model = SurveyQuestion
        fields = "__all__"


class SurveyResponseSerializer(ERPModelSerializer):
    class Meta:
        model = SurveyResponse
        fields = "__all__"


class SurveyAnswerSerializer(ERPModelSerializer):
    class Meta:
        model = SurveyAnswer
        fields = "__all__"


class CustomerInquirySerializer(ERPModelSerializer):
    customer_display = serializers.SerializerMethodField()

    def get_customer_display(self, obj):
        if obj.customer_party:
            return obj.customer_party.display_name or obj.customer_party.legal_name or obj.customer_name
        return obj.customer_name

    class Meta:
        model = CustomerInquiry
        fields = "__all__"
        read_only_fields = ("inquiry_number", "status", "opportunity", "qualified_at", "quoted_at", "closed_at")


class InquiryRequirementSerializer(ERPModelSerializer):
    class Meta:
        model = InquiryRequirement
        fields = "__all__"


class CostEstimateSerializer(ERPModelSerializer):
    class Meta:
        model = CostEstimate
        fields = "__all__"
        read_only_fields = ("estimate_number", "direct_cost", "overhead_cost", "total_cost", "offered_amount", "margin_amount", "margin_percent", "status", "calculated_at", "calculated_by")


class CostEstimateLineSerializer(ERPModelSerializer):
    class Meta:
        model = CostEstimateLine
        fields = "__all__"

    def validate(self, attrs):
        attrs = super().validate(attrs)
        quantity = attrs.get("quantity", 1)
        unit_cost = attrs.get("unit_cost", 0)
        if quantity <= 0 or unit_cost < 0:
            raise serializers.ValidationError("Quantity harus positif dan unit cost tidak boleh negatif.")
        attrs["amount"] = quantity * unit_cost
        return attrs


class QuotationVersionSerializer(ERPModelSerializer):
    class Meta:
        model = QuotationVersion
        fields = "__all__"


class QuotationDeliverySerializer(ERPModelSerializer):
    class Meta:
        model = QuotationDelivery
        fields = "__all__"


class CRMWorkflowEventSerializer(ERPModelSerializer):
    class Meta:
        model = CRMWorkflowEvent
        fields = "__all__"
