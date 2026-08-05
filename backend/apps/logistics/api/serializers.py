from rest_framework import serializers
from apps.api_common.serializers import ERPModelSerializer
from apps.logistics.models import Shipment, ShipmentLine, TrackingEvent, ProofOfDelivery

class ShipmentSerializer(ERPModelSerializer):
    class Meta:
        model = Shipment
        fields = "__all__"


class ShipmentLineSerializer(ERPModelSerializer):
    class Meta:
        model = ShipmentLine
        fields = "__all__"


class TrackingEventSerializer(ERPModelSerializer):
    class Meta:
        model = TrackingEvent
        fields = "__all__"


class ProofOfDeliverySerializer(ERPModelSerializer):
    class Meta:
        model = ProofOfDelivery
        fields = "__all__"


