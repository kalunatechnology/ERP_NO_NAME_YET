from django.contrib import admin

from . import models

admin.site.register(models.Shipment)
admin.site.register(models.ShipmentLine)
admin.site.register(models.TrackingEvent)
admin.site.register(models.ProofOfDelivery)
