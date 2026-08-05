from apps.procurement.models import PurchaseRequisition, PurchaseRequisitionLine, RFQ, SupplierQuotation, PurchaseOrder, PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine, ThreeWayMatch
from apps.api_common.viewsets import BaseERPModelViewSet, ReadOnlyERPModelViewSet
from .serializers import PurchaseRequisitionSerializer, PurchaseRequisitionLineSerializer, RFQSerializer, SupplierQuotationSerializer, PurchaseOrderSerializer, PurchaseOrderLineSerializer, GoodsReceiptSerializer, GoodsReceiptLineSerializer, ThreeWayMatchSerializer

class PurchaseRequisitionViewSet(BaseERPModelViewSet):
    queryset = PurchaseRequisition.objects.all()
    serializer_class = PurchaseRequisitionSerializer


class PurchaseRequisitionLineViewSet(BaseERPModelViewSet):
    queryset = PurchaseRequisitionLine.objects.all()
    serializer_class = PurchaseRequisitionLineSerializer


class RFQViewSet(BaseERPModelViewSet):
    queryset = RFQ.objects.all()
    serializer_class = RFQSerializer


class SupplierQuotationViewSet(BaseERPModelViewSet):
    queryset = SupplierQuotation.objects.all()
    serializer_class = SupplierQuotationSerializer


class PurchaseOrderViewSet(BaseERPModelViewSet):
    queryset = PurchaseOrder.objects.all()
    serializer_class = PurchaseOrderSerializer


class PurchaseOrderLineViewSet(BaseERPModelViewSet):
    queryset = PurchaseOrderLine.objects.all()
    serializer_class = PurchaseOrderLineSerializer


class GoodsReceiptViewSet(BaseERPModelViewSet):
    queryset = GoodsReceipt.objects.all()
    serializer_class = GoodsReceiptSerializer


class GoodsReceiptLineViewSet(BaseERPModelViewSet):
    queryset = GoodsReceiptLine.objects.all()
    serializer_class = GoodsReceiptLineSerializer


class ThreeWayMatchViewSet(BaseERPModelViewSet):
    queryset = ThreeWayMatch.objects.all()
    serializer_class = ThreeWayMatchSerializer


