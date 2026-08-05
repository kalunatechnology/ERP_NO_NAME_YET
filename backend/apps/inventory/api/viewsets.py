from apps.inventory.models import Lot, SerialNumber, StockMove, StockMoveLine, StockReservation, StockLedgerEntry, StockBalance, ValuationLayer, StockCount, StockCountLine
from apps.api_common.viewsets import BaseERPModelViewSet, ReadOnlyERPModelViewSet
from .serializers import LotSerializer, SerialNumberSerializer, StockMoveSerializer, StockMoveLineSerializer, StockReservationSerializer, StockLedgerEntrySerializer, StockBalanceSerializer, ValuationLayerSerializer, StockCountSerializer, StockCountLineSerializer

class LotViewSet(BaseERPModelViewSet):
    queryset = Lot.objects.all()
    serializer_class = LotSerializer


class SerialNumberViewSet(BaseERPModelViewSet):
    queryset = SerialNumber.objects.all()
    serializer_class = SerialNumberSerializer


class StockMoveViewSet(BaseERPModelViewSet):
    queryset = StockMove.objects.all()
    serializer_class = StockMoveSerializer


class StockMoveLineViewSet(BaseERPModelViewSet):
    queryset = StockMoveLine.objects.all()
    serializer_class = StockMoveLineSerializer


class StockReservationViewSet(BaseERPModelViewSet):
    queryset = StockReservation.objects.all()
    serializer_class = StockReservationSerializer


class StockLedgerEntryViewSet(BaseERPModelViewSet):
    queryset = StockLedgerEntry.objects.all()
    serializer_class = StockLedgerEntrySerializer


class StockBalanceViewSet(BaseERPModelViewSet):
    queryset = StockBalance.objects.all()
    serializer_class = StockBalanceSerializer


class ValuationLayerViewSet(BaseERPModelViewSet):
    queryset = ValuationLayer.objects.all()
    serializer_class = ValuationLayerSerializer


class StockCountViewSet(BaseERPModelViewSet):
    queryset = StockCount.objects.all()
    serializer_class = StockCountSerializer


class StockCountLineViewSet(BaseERPModelViewSet):
    queryset = StockCountLine.objects.all()
    serializer_class = StockCountLineSerializer


