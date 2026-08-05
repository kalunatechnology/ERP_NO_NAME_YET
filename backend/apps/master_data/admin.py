from django.contrib import admin

from . import models

admin.site.register(models.Party)
admin.site.register(models.PartyRole)
admin.site.register(models.Contact)
admin.site.register(models.Address)
admin.site.register(models.CustomerProfile)
admin.site.register(models.SupplierProfile)
admin.site.register(models.ProductCategory)
admin.site.register(models.UOM)
admin.site.register(models.Product)
admin.site.register(models.Currency)
admin.site.register(models.ExchangeRate)
admin.site.register(models.PaymentTerm)
admin.site.register(models.TaxCode)
admin.site.register(models.CostCenter)
admin.site.register(models.Department)
admin.site.register(models.Employee)
admin.site.register(models.Warehouse)
admin.site.register(models.WarehouseLocation)
admin.site.register(models.WorkCenter)
admin.site.register(models.Machine)
