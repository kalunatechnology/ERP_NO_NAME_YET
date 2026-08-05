from django.contrib import admin

from . import models

admin.site.register(models.Case)
admin.site.register(models.CaseMessage)
admin.site.register(models.CaseApproval)
admin.site.register(models.Resolution)
