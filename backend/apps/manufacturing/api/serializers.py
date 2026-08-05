from rest_framework import serializers
from apps.api_common.serializers import ERPModelSerializer
from apps.manufacturing.models import BOM, BOMVersion, BOMLine, Routing, RoutingOperation, ProductionOrder, ProductionMaterial, WorkOrder, LaborLog, MachineLog, ProductionOutput, Scrap, CostLedgerEntry

class BOMSerializer(ERPModelSerializer):
    class Meta:
        model = BOM
        fields = "__all__"


class BOMVersionSerializer(ERPModelSerializer):
    class Meta:
        model = BOMVersion
        fields = "__all__"


class BOMLineSerializer(ERPModelSerializer):
    class Meta:
        model = BOMLine
        fields = "__all__"


class RoutingSerializer(ERPModelSerializer):
    class Meta:
        model = Routing
        fields = "__all__"


class RoutingOperationSerializer(ERPModelSerializer):
    class Meta:
        model = RoutingOperation
        fields = "__all__"


class ProductionOrderSerializer(ERPModelSerializer):
    class Meta:
        model = ProductionOrder
        fields = "__all__"


class ProductionMaterialSerializer(ERPModelSerializer):
    class Meta:
        model = ProductionMaterial
        fields = "__all__"


class WorkOrderSerializer(ERPModelSerializer):
    class Meta:
        model = WorkOrder
        fields = "__all__"


class LaborLogSerializer(ERPModelSerializer):
    class Meta:
        model = LaborLog
        fields = "__all__"


class MachineLogSerializer(ERPModelSerializer):
    class Meta:
        model = MachineLog
        fields = "__all__"


class ProductionOutputSerializer(ERPModelSerializer):
    class Meta:
        model = ProductionOutput
        fields = "__all__"


class ScrapSerializer(ERPModelSerializer):
    class Meta:
        model = Scrap
        fields = "__all__"


class CostLedgerEntrySerializer(ERPModelSerializer):
    class Meta:
        model = CostLedgerEntry
        fields = "__all__"


