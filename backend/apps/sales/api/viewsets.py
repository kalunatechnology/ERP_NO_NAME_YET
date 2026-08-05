from apps.sales.models import Quotation, QuotationLine, QuotationCost, Contract, ContractLine, Order, OrderLine, Delivery, DeliveryLine, DemandSupplyLink, OrderChangeRequest, RecurringOrderRule, RecurringOrderRun
from apps.api_common.viewsets import BaseERPModelViewSet, ReadOnlyERPModelViewSet
from .serializers import QuotationSerializer, QuotationLineSerializer, QuotationCostSerializer, ContractSerializer, ContractLineSerializer, OrderSerializer, OrderLineSerializer, DeliverySerializer, DeliveryLineSerializer, DemandSupplyLinkSerializer, OrderChangeRequestSerializer, RecurringOrderRuleSerializer, RecurringOrderRunSerializer

class QuotationViewSet(BaseERPModelViewSet):
    queryset = Quotation.objects.all()
    serializer_class = QuotationSerializer


class QuotationLineViewSet(BaseERPModelViewSet):
    queryset = QuotationLine.objects.all()
    serializer_class = QuotationLineSerializer


class QuotationCostViewSet(BaseERPModelViewSet):
    queryset = QuotationCost.objects.all()
    serializer_class = QuotationCostSerializer


class ContractViewSet(BaseERPModelViewSet):
    queryset = Contract.objects.all()
    serializer_class = ContractSerializer


class ContractLineViewSet(BaseERPModelViewSet):
    queryset = ContractLine.objects.all()
    serializer_class = ContractLineSerializer


class OrderViewSet(BaseERPModelViewSet):
    queryset = Order.objects.all()
    serializer_class = OrderSerializer


class OrderLineViewSet(BaseERPModelViewSet):
    queryset = OrderLine.objects.all()
    serializer_class = OrderLineSerializer


class DeliveryViewSet(BaseERPModelViewSet):
    queryset = Delivery.objects.all()
    serializer_class = DeliverySerializer


class DeliveryLineViewSet(BaseERPModelViewSet):
    queryset = DeliveryLine.objects.all()
    serializer_class = DeliveryLineSerializer


class DemandSupplyLinkViewSet(BaseERPModelViewSet):
    queryset = DemandSupplyLink.objects.all()
    serializer_class = DemandSupplyLinkSerializer


class OrderChangeRequestViewSet(BaseERPModelViewSet):
    queryset = OrderChangeRequest.objects.all()
    serializer_class = OrderChangeRequestSerializer


class RecurringOrderRuleViewSet(BaseERPModelViewSet):
    queryset = RecurringOrderRule.objects.all()
    serializer_class = RecurringOrderRuleSerializer


class RecurringOrderRunViewSet(BaseERPModelViewSet):
    queryset = RecurringOrderRun.objects.all()
    serializer_class = RecurringOrderRunSerializer


