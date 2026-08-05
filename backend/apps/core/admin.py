from django.contrib import admin

from . import models

admin.site.register(models.Tenant)
admin.site.register(models.Company)
admin.site.register(models.Organization)
admin.site.register(models.BusinessDocument)
admin.site.register(models.DocumentLink)
admin.site.register(models.WorkflowInstance)
admin.site.register(models.WorkflowApproval)
admin.site.register(models.AuditEvent)
admin.site.register(models.Notification)
admin.site.register(models.NotificationRecipient)
admin.site.register(models.QuickAction)
admin.site.register(models.File)
admin.site.register(models.DocumentAttachment)
admin.site.register(models.DocumentTemplate)
admin.site.register(models.DocumentTemplateVersion)
admin.site.register(models.DocumentTemplateField)
admin.site.register(models.GeneratedDocument)
admin.site.register(models.DocumentSignature)
