from rest_framework import serializers
from apps.api_common.serializers import ERPModelSerializer
from apps.sales.models import Quotation, QuotationLine, QuotationCost, Contract, ContractLine, Order, OrderLine, Delivery, DeliveryLine, DemandSupplyLink, OrderChangeRequest, RecurringOrderRule, RecurringOrderRun

class QuotationSerializer(ERPModelSerializer):
    class Meta:
        model = Quotation
        fields = "__all__"


class QuotationLineSerializer(ERPModelSerializer):
    class Meta:
        model = QuotationLine
        fields = "__all__"


class QuotationCostSerializer(ERPModelSerializer):
    class Meta:
        model = QuotationCost
        fields = "__all__"


class ContractSerializer(ERPModelSerializer):
    class Meta:
        model = Contract
        fields = "__all__"


class ContractLineSerializer(ERPModelSerializer):
    class Meta:
        model = ContractLine
        fields = "__all__"


class OrderSerializer(ERPModelSerializer):
    class Meta:
        model = Order
        fields = "__all__"


class OrderLineSerializer(ERPModelSerializer):
    class Meta:
        model = OrderLine
        fields = "__all__"


class DeliverySerializer(ERPModelSerializer):
    class Meta:
        model = Delivery
        fields = "__all__"


class DeliveryLineSerializer(ERPModelSerializer):
    class Meta:
        model = DeliveryLine
        fields = "__all__"


class DemandSupplyLinkSerializer(ERPModelSerializer):
    class Meta:
        model = DemandSupplyLink
        fields = "__all__"


class OrderChangeRequestSerializer(ERPModelSerializer):
    class Meta:
        model = OrderChangeRequest
        fields = "__all__"


class RecurringOrderRuleSerializer(ERPModelSerializer):
    class Meta:
        model = RecurringOrderRule
        fields = "__all__"


class RecurringOrderRunSerializer(ERPModelSerializer):
    class Meta:
        model = RecurringOrderRun
        fields = "__all__"


