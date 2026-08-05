from django.contrib import admin

from . import models

admin.site.register(models.Category)
admin.site.register(models.Asset)
admin.site.register(models.Book)
admin.site.register(models.DepreciationLine)
admin.site.register(models.Maintenance)
admin.site.register(models.Disposal)
