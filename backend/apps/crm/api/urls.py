from rest_framework.routers import DefaultRouter
from .viewsets import LeadViewSet, OpportunityViewSet, OpportunityProductViewSet, ActivityViewSet, PipelineViewSet, PipelineStageViewSet, OpportunityStageHistoryViewSet, ExecutiveApprovalViewSet, CreditStatusSnapshotViewSet, ChannelAccountViewSet, ConversationViewSet, ConversationParticipantViewSet, MessageViewSet, MessageAttachmentViewSet, MessageDeliveryStatusViewSet, FeedbackViewSet, SurveyViewSet, SurveyQuestionViewSet, SurveyResponseViewSet, SurveyAnswerViewSet, CustomerInquiryViewSet, InquiryRequirementViewSet, CostEstimateViewSet, CostEstimateLineViewSet, QuotationVersionViewSet, QuotationDeliveryViewSet, CRMWorkflowEventViewSet, CustomerFeedbackViewSet

app_name = "crm"
router = DefaultRouter()
router.register(r"leads", LeadViewSet, basename="lead")
router.register(r"opportunities", OpportunityViewSet, basename="opportunity")
router.register(r"opportunity-products", OpportunityProductViewSet, basename="opportunity-product")
router.register(r"activities", ActivityViewSet, basename="activity")
router.register(r"pipelines", PipelineViewSet, basename="pipeline")
router.register(r"pipeline-stages", PipelineStageViewSet, basename="pipeline-stage")
router.register(r"opportunity-stage-histories", OpportunityStageHistoryViewSet, basename="opportunity-stage-history")
router.register(r"executive-approvals", ExecutiveApprovalViewSet, basename="executive-approval")
router.register(r"credit-status-snapshots", CreditStatusSnapshotViewSet, basename="credit-status-snapshot")
router.register(r"channel-accounts", ChannelAccountViewSet, basename="channel-account")
router.register(r"conversations", ConversationViewSet, basename="conversation")
router.register(r"conversation-participants", ConversationParticipantViewSet, basename="conversation-participant")
router.register(r"messages", MessageViewSet, basename="message")
router.register(r"message-attachments", MessageAttachmentViewSet, basename="message-attachment")
router.register(r"message-delivery-statuses", MessageDeliveryStatusViewSet, basename="message-delivery-status")
router.register(r"feedbacks", FeedbackViewSet, basename="feedback")
router.register(r"customer-feedbacks", CustomerFeedbackViewSet, basename="customer-feedback")
router.register(r"surveys", SurveyViewSet, basename="survey")
router.register(r"survey-questions", SurveyQuestionViewSet, basename="survey-question")
router.register(r"survey-responses", SurveyResponseViewSet, basename="survey-response")
router.register(r"survey-answers", SurveyAnswerViewSet, basename="survey-answer")
router.register(r"customer-inquiries", CustomerInquiryViewSet, basename="customer-inquiry")
router.register(r"inquiry-requirements", InquiryRequirementViewSet, basename="inquiry-requirement")
router.register(r"cost-estimates", CostEstimateViewSet, basename="cost-estimate")
router.register(r"cost-estimate-lines", CostEstimateLineViewSet, basename="cost-estimate-line")
router.register(r"quotation-versions", QuotationVersionViewSet, basename="quotation-version")
router.register(r"quotation-deliveries", QuotationDeliveryViewSet, basename="quotation-delivery")
router.register(r"workflow-events", CRMWorkflowEventViewSet, basename="crm-workflow-event")

urlpatterns = router.urls

