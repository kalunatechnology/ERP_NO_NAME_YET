from apps.manufacturing.models import BOM, BOMVersion, BOMLine, Routing, RoutingOperation, ProductionOrder, ProductionMaterial, WorkOrder, LaborLog, MachineLog, ProductionOutput, Scrap, CostLedgerEntry
from apps.api_common.viewsets import BaseERPModelViewSet, ReadOnlyERPModelViewSet
from .serializers import BOMSerializer, BOMVersionSerializer, BOMLineSerializer, RoutingSerializer, RoutingOperationSerializer, ProductionOrderSerializer, ProductionMaterialSerializer, WorkOrderSerializer, LaborLogSerializer, MachineLogSerializer, ProductionOutputSerializer, ScrapSerializer, CostLedgerEntrySerializer

class BOMViewSet(BaseERPModelViewSet):
    queryset = BOM.objects.all()
    serializer_class = BOMSerializer


class BOMVersionViewSet(BaseERPModelViewSet):
    queryset = BOMVersion.objects.all()
    serializer_class = BOMVersionSerializer


class BOMLineViewSet(BaseERPModelViewSet):
    queryset = BOMLine.objects.all()
    serializer_class = BOMLineSerializer


class RoutingViewSet(BaseERPModelViewSet):
    queryset = Routing.objects.all()
    serializer_class = RoutingSerializer


class RoutingOperationViewSet(BaseERPModelViewSet):
    queryset = RoutingOperation.objects.all()
    serializer_class = RoutingOperationSerializer


class ProductionOrderViewSet(BaseERPModelViewSet):
    queryset = ProductionOrder.objects.all()
    serializer_class = ProductionOrderSerializer


class ProductionMaterialViewSet(BaseERPModelViewSet):
    queryset = ProductionMaterial.objects.all()
    serializer_class = ProductionMaterialSerializer


class WorkOrderViewSet(BaseERPModelViewSet):
    queryset = WorkOrder.objects.all()
    serializer_class = WorkOrderSerializer


class LaborLogViewSet(BaseERPModelViewSet):
    queryset = LaborLog.objects.all()
    serializer_class = LaborLogSerializer


class MachineLogViewSet(BaseERPModelViewSet):
    queryset = MachineLog.objects.all()
    serializer_class = MachineLogSerializer


class ProductionOutputViewSet(BaseERPModelViewSet):
    queryset = ProductionOutput.objects.all()
    serializer_class = ProductionOutputSerializer


class ScrapViewSet(BaseERPModelViewSet):
    queryset = Scrap.objects.all()
    serializer_class = ScrapSerializer


class CostLedgerEntryViewSet(BaseERPModelViewSet):
    queryset = CostLedgerEntry.objects.all()
    serializer_class = CostLedgerEntrySerializer


