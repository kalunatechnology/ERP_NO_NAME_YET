from django.contrib import admin

from . import models

admin.site.register(models.Dashboard)
admin.site.register(models.DashboardRole)
admin.site.register(models.Widget)
admin.site.register(models.KPIDefinition)
admin.site.register(models.KPITarget)
admin.site.register(models.KPIResult)
admin.site.register(models.AlertRule)
admin.site.register(models.AlertEvent)
