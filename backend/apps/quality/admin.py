from django.contrib import admin

from . import models

admin.site.register(models.QualityPlan)
admin.site.register(models.QualityPlanPoint)
admin.site.register(models.Inspection)
admin.site.register(models.InspectionResult)
admin.site.register(models.Nonconformance)
admin.site.register(models.CorrectiveAction)
