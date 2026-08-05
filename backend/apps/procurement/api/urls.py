from rest_framework.routers import DefaultRouter
from .viewsets import PurchaseRequisitionViewSet, PurchaseRequisitionLineViewSet, RFQViewSet, SupplierQuotationViewSet, PurchaseOrderViewSet, PurchaseOrderLineViewSet, GoodsReceiptViewSet, GoodsReceiptLineViewSet, ThreeWayMatchViewSet

app_name = "procurement"
router = DefaultRouter()
router.register(r"purchase-requisitions", PurchaseRequisitionViewSet, basename="purchase-requisition")
router.register(r"purchase-requisition-lines", PurchaseRequisitionLineViewSet, basename="purchase-requisition-line")
router.register(r"rfqs", RFQViewSet, basename="rfq")
router.register(r"supplier-quotations", SupplierQuotationViewSet, basename="supplier-quotation")
router.register(r"purchase-orders", PurchaseOrderViewSet, basename="purchase-order")
router.register(r"purchase-order-lines", PurchaseOrderLineViewSet, basename="purchase-order-line")
router.register(r"goods-receipts", GoodsReceiptViewSet, basename="goods-receipt")
router.register(r"goods-receipt-lines", GoodsReceiptLineViewSet, basename="goods-receipt-line")
router.register(r"three-way-matches", ThreeWayMatchViewSet, basename="three-way-match")

urlpatterns = router.urls
