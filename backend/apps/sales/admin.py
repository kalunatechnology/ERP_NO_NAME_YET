from django.contrib import admin

from . import models

admin.site.register(models.Quotation)
admin.site.register(models.QuotationLine)
admin.site.register(models.QuotationCost)
admin.site.register(models.Contract)
admin.site.register(models.ContractLine)
admin.site.register(models.Order)
admin.site.register(models.OrderLine)
admin.site.register(models.Delivery)
admin.site.register(models.DeliveryLine)
admin.site.register(models.DemandSupplyLink)
admin.site.register(models.OrderChangeRequest)
admin.site.register(models.RecurringOrderRule)
admin.site.register(models.RecurringOrderRun)
