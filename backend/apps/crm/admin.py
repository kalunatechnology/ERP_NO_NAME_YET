from django.contrib import admin

from . import models

admin.site.register(models.Lead)
admin.site.register(models.Opportunity)
admin.site.register(models.OpportunityProduct)
admin.site.register(models.Activity)
admin.site.register(models.Pipeline)
admin.site.register(models.PipelineStage)
admin.site.register(models.OpportunityStageHistory)
admin.site.register(models.ExecutiveApproval)
admin.site.register(models.CreditStatusSnapshot)
admin.site.register(models.ChannelAccount)
admin.site.register(models.Conversation)
admin.site.register(models.ConversationParticipant)
admin.site.register(models.Message)
admin.site.register(models.MessageAttachment)
admin.site.register(models.MessageDeliveryStatus)
admin.site.register(models.Feedback)
admin.site.register(models.Survey)
admin.site.register(models.SurveyQuestion)
admin.site.register(models.SurveyResponse)
admin.site.register(models.SurveyAnswer)
