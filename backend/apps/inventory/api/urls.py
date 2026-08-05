from rest_framework.routers import DefaultRouter
from .viewsets import LotViewSet, SerialNumberViewSet, StockMoveViewSet, StockMoveLineViewSet, StockReservationViewSet, StockLedgerEntryViewSet, StockBalanceViewSet, ValuationLayerViewSet, StockCountViewSet, StockCountLineViewSet

app_name = "inventory"
router = DefaultRouter()
router.register(r"lots", LotViewSet, basename="lot")
router.register(r"serial-numbers", SerialNumberViewSet, basename="serial-number")
router.register(r"stock-moves", StockMoveViewSet, basename="stock-move")
router.register(r"stock-move-lines", StockMoveLineViewSet, basename="stock-move-line")
router.register(r"stock-reservations", StockReservationViewSet, basename="stock-reservation")
router.register(r"stock-ledger-entries", StockLedgerEntryViewSet, basename="stock-ledger-entry")
router.register(r"stock-balances", StockBalanceViewSet, basename="stock-balance")
router.register(r"valuation-layers", ValuationLayerViewSet, basename="valuation-layer")
router.register(r"stock-counts", StockCountViewSet, basename="stock-count")
router.register(r"stock-count-lines", StockCountLineViewSet, basename="stock-count-line")

urlpatterns = router.urls
