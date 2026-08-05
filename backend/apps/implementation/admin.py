from django.contrib import admin

from . import models

admin.site.register(models.Release)
admin.site.register(models.Phase)
admin.site.register(models.PhaseItem)
admin.site.register(models.Workflow)
admin.site.register(models.WorkflowStage)
admin.site.register(models.WorkItem)
admin.site.register(models.TestCycle)
admin.site.register(models.GTMMilestone)
