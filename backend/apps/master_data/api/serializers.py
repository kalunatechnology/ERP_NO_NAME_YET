from rest_framework import serializers
from apps.api_common.serializers import ERPModelSerializer
from apps.master_data.models import Party, PartyRole, Contact, Address, CustomerProfile, SupplierProfile, ProductCategory, UOM, Product, Currency, ExchangeRate, PaymentTerm, TaxCode, CostCenter, Department, Employee, Warehouse, WarehouseLocation, WorkCenter, Machine

class PartySerializer(ERPModelSerializer):
    class Meta:
        model = Party
        fields = "__all__"


class PartyRoleSerializer(ERPModelSerializer):
    class Meta:
        model = PartyRole
        fields = "__all__"


class ContactSerializer(ERPModelSerializer):
    class Meta:
        model = Contact
        fields = "__all__"


class AddressSerializer(ERPModelSerializer):
    class Meta:
        model = Address
        fields = "__all__"


class CustomerProfileSerializer(ERPModelSerializer):
    class Meta:
        model = CustomerProfile
        fields = "__all__"


class SupplierProfileSerializer(ERPModelSerializer):
    class Meta:
        model = SupplierProfile
        fields = "__all__"


class ProductCategorySerializer(ERPModelSerializer):
    class Meta:
        model = ProductCategory
        fields = "__all__"


class UOMSerializer(ERPModelSerializer):
    class Meta:
        model = UOM
        fields = "__all__"


class ProductSerializer(ERPModelSerializer):
    class Meta:
        model = Product
        fields = "__all__"


class CurrencySerializer(ERPModelSerializer):
    class Meta:
        model = Currency
        fields = "__all__"


class ExchangeRateSerializer(ERPModelSerializer):
    class Meta:
        model = ExchangeRate
        fields = "__all__"


class PaymentTermSerializer(ERPModelSerializer):
    class Meta:
        model = PaymentTerm
        fields = "__all__"


class TaxCodeSerializer(ERPModelSerializer):
    class Meta:
        model = TaxCode
        fields = "__all__"


class CostCenterSerializer(ERPModelSerializer):
    class Meta:
        model = CostCenter
        fields = "__all__"


class DepartmentSerializer(ERPModelSerializer):
    class Meta:
        model = Department
        fields = "__all__"


class EmployeeSerializer(ERPModelSerializer):
    class Meta:
        model = Employee
        fields = "__all__"


class WarehouseSerializer(ERPModelSerializer):
    class Meta:
        model = Warehouse
        fields = "__all__"


class WarehouseLocationSerializer(ERPModelSerializer):
    class Meta:
        model = WarehouseLocation
        fields = "__all__"


class WorkCenterSerializer(ERPModelSerializer):
    class Meta:
        model = WorkCenter
        fields = "__all__"


class MachineSerializer(ERPModelSerializer):
    class Meta:
        model = Machine
        fields = "__all__"


