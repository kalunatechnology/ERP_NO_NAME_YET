from apps.master_data.models import Party, PartyRole, Contact, Address, CustomerProfile, SupplierProfile, ProductCategory, UOM, Product, Currency, ExchangeRate, PaymentTerm, TaxCode, CostCenter, Department, Employee, Warehouse, WarehouseLocation, WorkCenter, Machine
from apps.api_common.viewsets import BaseERPModelViewSet, ReadOnlyERPModelViewSet
from .serializers import PartySerializer, PartyRoleSerializer, ContactSerializer, AddressSerializer, CustomerProfileSerializer, SupplierProfileSerializer, ProductCategorySerializer, UOMSerializer, ProductSerializer, CurrencySerializer, ExchangeRateSerializer, PaymentTermSerializer, TaxCodeSerializer, CostCenterSerializer, DepartmentSerializer, EmployeeSerializer, WarehouseSerializer, WarehouseLocationSerializer, WorkCenterSerializer, MachineSerializer

class PartyViewSet(BaseERPModelViewSet):
    queryset = Party.objects.all()
    serializer_class = PartySerializer


class PartyRoleViewSet(BaseERPModelViewSet):
    queryset = PartyRole.objects.all()
    serializer_class = PartyRoleSerializer


class ContactViewSet(BaseERPModelViewSet):
    queryset = Contact.objects.all()
    serializer_class = ContactSerializer


class AddressViewSet(BaseERPModelViewSet):
    queryset = Address.objects.all()
    serializer_class = AddressSerializer


class CustomerProfileViewSet(BaseERPModelViewSet):
    queryset = CustomerProfile.objects.all()
    serializer_class = CustomerProfileSerializer


class SupplierProfileViewSet(BaseERPModelViewSet):
    queryset = SupplierProfile.objects.all()
    serializer_class = SupplierProfileSerializer


class ProductCategoryViewSet(BaseERPModelViewSet):
    queryset = ProductCategory.objects.all()
    serializer_class = ProductCategorySerializer


class UOMViewSet(BaseERPModelViewSet):
    queryset = UOM.objects.all()
    serializer_class = UOMSerializer


class ProductViewSet(BaseERPModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer


class CurrencyViewSet(BaseERPModelViewSet):
    queryset = Currency.objects.all()
    serializer_class = CurrencySerializer


class ExchangeRateViewSet(BaseERPModelViewSet):
    queryset = ExchangeRate.objects.all()
    serializer_class = ExchangeRateSerializer


class PaymentTermViewSet(BaseERPModelViewSet):
    queryset = PaymentTerm.objects.all()
    serializer_class = PaymentTermSerializer


class TaxCodeViewSet(BaseERPModelViewSet):
    queryset = TaxCode.objects.all()
    serializer_class = TaxCodeSerializer


class CostCenterViewSet(BaseERPModelViewSet):
    queryset = CostCenter.objects.all()
    serializer_class = CostCenterSerializer


class DepartmentViewSet(BaseERPModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer


class EmployeeViewSet(BaseERPModelViewSet):
    queryset = Employee.objects.all()
    serializer_class = EmployeeSerializer


class WarehouseViewSet(BaseERPModelViewSet):
    queryset = Warehouse.objects.all()
    serializer_class = WarehouseSerializer


class WarehouseLocationViewSet(BaseERPModelViewSet):
    queryset = WarehouseLocation.objects.all()
    serializer_class = WarehouseLocationSerializer


class WorkCenterViewSet(BaseERPModelViewSet):
    queryset = WorkCenter.objects.all()
    serializer_class = WorkCenterSerializer


class MachineViewSet(BaseERPModelViewSet):
    queryset = Machine.objects.all()
    serializer_class = MachineSerializer


