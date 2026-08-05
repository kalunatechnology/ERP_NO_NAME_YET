from rest_framework.routers import DefaultRouter
from .viewsets import QuotationViewSet, QuotationLineViewSet, QuotationCostViewSet, ContractViewSet, ContractLineViewSet, OrderViewSet, OrderLineViewSet, DeliveryViewSet, DeliveryLineViewSet, DemandSupplyLinkViewSet, OrderChangeRequestViewSet, RecurringOrderRuleViewSet, RecurringOrderRunViewSet

app_name = "sales"
router = DefaultRouter()
router.register(r"quotations", QuotationViewSet, basename="quotation")
router.register(r"quotation-lines", QuotationLineViewSet, basename="quotation-line")
router.register(r"quotation-costs", QuotationCostViewSet, basename="quotation-cost")
router.register(r"contracts", ContractViewSet, basename="contract")
router.register(r"contract-lines", ContractLineViewSet, basename="contract-line")
router.register(r"orders", OrderViewSet, basename="order")
router.register(r"order-lines", OrderLineViewSet, basename="order-line")
router.register(r"deliveries", DeliveryViewSet, basename="delivery")
router.register(r"delivery-lines", DeliveryLineViewSet, basename="delivery-line")
router.register(r"demand-supply-links", DemandSupplyLinkViewSet, basename="demand-supply-link")
router.register(r"order-change-requests", OrderChangeRequestViewSet, basename="order-change-request")
router.register(r"recurring-order-rules", RecurringOrderRuleViewSet, basename="recurring-order-rule")
router.register(r"recurring-order-runs", RecurringOrderRunViewSet, basename="recurring-order-run")

urlpatterns = router.urls
