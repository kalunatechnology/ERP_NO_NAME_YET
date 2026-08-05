from django.contrib import admin

from . import models

admin.site.register(models.Lot)
admin.site.register(models.SerialNumber)
admin.site.register(models.StockMove)
admin.site.register(models.StockMoveLine)
admin.site.register(models.StockReservation)
admin.site.register(models.StockLedgerEntry)
admin.site.register(models.StockBalance)
admin.site.register(models.ValuationLayer)
admin.site.register(models.StockCount)
admin.site.register(models.StockCountLine)
