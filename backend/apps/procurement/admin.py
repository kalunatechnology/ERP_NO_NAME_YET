from django.contrib import admin

from . import models

admin.site.register(models.PurchaseRequisition)
admin.site.register(models.PurchaseRequisitionLine)
admin.site.register(models.RFQ)
admin.site.register(models.SupplierQuotation)
admin.site.register(models.PurchaseOrder)
admin.site.register(models.PurchaseOrderLine)
admin.site.register(models.GoodsReceipt)
admin.site.register(models.GoodsReceiptLine)
admin.site.register(models.ThreeWayMatch)
