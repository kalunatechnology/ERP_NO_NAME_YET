from rest_framework.routers import DefaultRouter
from .viewsets import PartyViewSet, PartyRoleViewSet, ContactViewSet, AddressViewSet, CustomerProfileViewSet, SupplierProfileViewSet, ProductCategoryViewSet, UOMViewSet, ProductViewSet, CurrencyViewSet, ExchangeRateViewSet, PaymentTermViewSet, TaxCodeViewSet, CostCenterViewSet, DepartmentViewSet, EmployeeViewSet, WarehouseViewSet, WarehouseLocationViewSet, WorkCenterViewSet, MachineViewSet

app_name = "master_data"
router = DefaultRouter()
router.register(r"parties", PartyViewSet, basename="party")
router.register(r"party-roles", PartyRoleViewSet, basename="party-role")
router.register(r"contacts", ContactViewSet, basename="contact")
router.register(r"addresses", AddressViewSet, basename="address")
router.register(r"customer-profiles", CustomerProfileViewSet, basename="customer-profile")
router.register(r"supplier-profiles", SupplierProfileViewSet, basename="supplier-profile")
router.register(r"product-categories", ProductCategoryViewSet, basename="product-category")
router.register(r"uoms", UOMViewSet, basename="uom")
router.register(r"products", ProductViewSet, basename="product")
router.register(r"currencies", CurrencyViewSet, basename="currency")
router.register(r"exchange-rates", ExchangeRateViewSet, basename="exchange-rate")
router.register(r"payment-terms", PaymentTermViewSet, basename="payment-term")
router.register(r"tax-codes", TaxCodeViewSet, basename="tax-code")
router.register(r"cost-centers", CostCenterViewSet, basename="cost-center")
router.register(r"departments", DepartmentViewSet, basename="department")
router.register(r"employees", EmployeeViewSet, basename="employee")
router.register(r"warehouses", WarehouseViewSet, basename="warehouse")
router.register(r"warehouse-locations", WarehouseLocationViewSet, basename="warehouse-location")
router.register(r"work-centers", WorkCenterViewSet, basename="work-center")
router.register(r"machines", MachineViewSet, basename="machine")

urlpatterns = router.urls
