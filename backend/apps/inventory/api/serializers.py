from rest_framework import serializers
from apps.api_common.serializers import ERPModelSerializer
from apps.inventory.models import Lot, SerialNumber, StockMove, StockMoveLine, StockReservation, StockLedgerEntry, StockBalance, ValuationLayer, StockCount, StockCountLine

class LotSerializer(ERPModelSerializer):
    class Meta:
        model = Lot
        fields = "__all__"


class SerialNumberSerializer(ERPModelSerializer):
    class Meta:
        model = SerialNumber
        fields = "__all__"


class StockMoveSerializer(ERPModelSerializer):
    class Meta:
        model = StockMove
        fields = "__all__"


class StockMoveLineSerializer(ERPModelSerializer):
    class Meta:
        model = StockMoveLine
        fields = "__all__"


class StockReservationSerializer(ERPModelSerializer):
    class Meta:
        model = StockReservation
        fields = "__all__"


class StockLedgerEntrySerializer(ERPModelSerializer):
    class Meta:
        model = StockLedgerEntry
        fields = "__all__"


class StockBalanceSerializer(ERPModelSerializer):
    class Meta:
        model = StockBalance
        fields = "__all__"


class ValuationLayerSerializer(ERPModelSerializer):
    class Meta:
        model = ValuationLayer
        fields = "__all__"


class StockCountSerializer(ERPModelSerializer):
    class Meta:
        model = StockCount
        fields = "__all__"


class StockCountLineSerializer(ERPModelSerializer):
    class Meta:
        model = StockCountLine
        fields = "__all__"


