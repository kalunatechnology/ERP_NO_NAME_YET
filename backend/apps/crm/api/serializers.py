from rest_framework import serializers
from apps.api_common.serializers import ERPModelSerializer
from apps.crm.models import Lead, Opportunity, OpportunityProduct, Activity, Pipeline, PipelineStage, OpportunityStageHistory, ExecutiveApproval, CreditStatusSnapshot, ChannelAccount, Conversation, ConversationParticipant, Message, MessageAttachment, MessageDeliveryStatus, Feedback, Survey, SurveyQuestion, SurveyResponse, SurveyAnswer

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


