from apps.logistics.models import Shipment, ShipmentLine, TrackingEvent, ProofOfDelivery
from apps.api_common.viewsets import BaseERPModelViewSet, ReadOnlyERPModelViewSet
from .serializers import ShipmentSerializer, ShipmentLineSerializer, TrackingEventSerializer, ProofOfDeliverySerializer

class ShipmentViewSet(BaseERPModelViewSet):
    queryset = Shipment.objects.all()
    serializer_class = ShipmentSerializer


class ShipmentLineViewSet(BaseERPModelViewSet):
    queryset = ShipmentLine.objects.all()
    serializer_class = ShipmentLineSerializer


class TrackingEventViewSet(BaseERPModelViewSet):
    queryset = TrackingEvent.objects.all()
    serializer_class = TrackingEventSerializer


class ProofOfDeliveryViewSet(BaseERPModelViewSet):
    queryset = ProofOfDelivery.objects.all()
    serializer_class = ProofOfDeliverySerializer


