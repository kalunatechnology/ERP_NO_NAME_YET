from rest_framework.routers import DefaultRouter
from .viewsets import ShipmentViewSet, ShipmentLineViewSet, TrackingEventViewSet, ProofOfDeliveryViewSet

app_name = "logistics"
router = DefaultRouter()
router.register(r"shipments", ShipmentViewSet, basename="shipment")
router.register(r"shipment-lines", ShipmentLineViewSet, basename="shipment-line")
router.register(r"tracking-events", TrackingEventViewSet, basename="tracking-event")
router.register(r"proof-of-deliveries", ProofOfDeliveryViewSet, basename="proof-of-delivery")

urlpatterns = router.urls
