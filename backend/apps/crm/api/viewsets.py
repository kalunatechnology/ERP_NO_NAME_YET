from apps.crm.models import Lead, Opportunity, OpportunityProduct, Activity, Pipeline, PipelineStage, OpportunityStageHistory, ExecutiveApproval, CreditStatusSnapshot, ChannelAccount, Conversation, ConversationParticipant, Message, MessageAttachment, MessageDeliveryStatus, Feedback, Survey, SurveyQuestion, SurveyResponse, SurveyAnswer
from apps.api_common.viewsets import BaseERPModelViewSet, ReadOnlyERPModelViewSet
from .serializers import LeadSerializer, OpportunitySerializer, OpportunityProductSerializer, ActivitySerializer, PipelineSerializer, PipelineStageSerializer, OpportunityStageHistorySerializer, ExecutiveApprovalSerializer, CreditStatusSnapshotSerializer, ChannelAccountSerializer, ConversationSerializer, ConversationParticipantSerializer, MessageSerializer, MessageAttachmentSerializer, MessageDeliveryStatusSerializer, FeedbackSerializer, SurveySerializer, SurveyQuestionSerializer, SurveyResponseSerializer, SurveyAnswerSerializer

class LeadViewSet(BaseERPModelViewSet):
    queryset = Lead.objects.all()
    serializer_class = LeadSerializer


class OpportunityViewSet(BaseERPModelViewSet):
    queryset = Opportunity.objects.all()
    serializer_class = OpportunitySerializer


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


class CreditStatusSnapshotViewSet(BaseERPModelViewSet):
    queryset = CreditStatusSnapshot.objects.all()
    serializer_class = CreditStatusSnapshotSerializer


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


