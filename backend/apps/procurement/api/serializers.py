from rest_framework import serializers
from apps.api_common.serializers import ERPModelSerializer
from apps.procurement.models import PurchaseRequisition, PurchaseRequisitionLine, RFQ, SupplierQuotation, PurchaseOrder, PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine, ThreeWayMatch

class PurchaseRequisitionSerializer(ERPModelSerializer):
    class Meta:
        model = PurchaseRequisition
        fields = "__all__"


class PurchaseRequisitionLineSerializer(ERPModelSerializer):
    class Meta:
        model = PurchaseRequisitionLine
        fields = "__all__"


class RFQSerializer(ERPModelSerializer):
    class Meta:
        model = RFQ
        fields = "__all__"


class SupplierQuotationSerializer(ERPModelSerializer):
    class Meta:
        model = SupplierQuotation
        fields = "__all__"


class PurchaseOrderSerializer(ERPModelSerializer):
    class Meta:
        model = PurchaseOrder
        fields = "__all__"


class PurchaseOrderLineSerializer(ERPModelSerializer):
    class Meta:
        model = PurchaseOrderLine
        fields = "__all__"


class GoodsReceiptSerializer(ERPModelSerializer):
    class Meta:
        model = GoodsReceipt
        fields = "__all__"


class GoodsReceiptLineSerializer(ERPModelSerializer):
    class Meta:
        model = GoodsReceiptLine
        fields = "__all__"


class ThreeWayMatchSerializer(ERPModelSerializer):
    class Meta:
        model = ThreeWayMatch
        fields = "__all__"


