from django.contrib import admin

from . import models

admin.site.register(models.BOM)
admin.site.register(models.BOMVersion)
admin.site.register(models.BOMLine)
admin.site.register(models.Routing)
admin.site.register(models.RoutingOperation)
admin.site.register(models.ProductionOrder)
admin.site.register(models.ProductionMaterial)
admin.site.register(models.WorkOrder)
admin.site.register(models.LaborLog)
admin.site.register(models.MachineLog)
admin.site.register(models.ProductionOutput)
admin.site.register(models.Scrap)
admin.site.register(models.CostLedgerEntry)
